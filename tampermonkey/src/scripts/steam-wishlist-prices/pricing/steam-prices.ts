import { loadValue, saveValue } from "@/shared";

import { priceCacheKey, PRICE_TTL_MS } from "../cache/cache";
import { WISHLIST_STORE_FILL_MAX } from "../config";
import {
  buildGetItemsUrl,
  chunkGetItems,
  fillWishlistStoreItems,
  PRICE_DATA_REQUEST,
  readWebApiToken,
  steamGetJson,
  type SteamPurchaseOption,
  type SteamStoreItem,
} from "../steam/steam-http";

export type SteamDeal = {
  amount: number;
  currency: string;
  regular: number | null;
  cut: number;
  discountEndsAt: number | null;
  bundle?: SteamBundlePrice;
};

export type SteamBundlePrice = {
  amount: number;
  currency: string;
  name: string;
};

type PriceHit = { savedAt: number; deal: SteamDeal | null };
type PriceBucket = Record<string, PriceHit>;

const loadBucket = (country: string) => loadValue<PriceBucket>(priceCacheKey(country), {});
const saveBucket = (country: string, bucket: PriceBucket) => saveValue(priceCacheKey(country), bucket);

const freshPrice = (hit: PriceHit | undefined, now: number): hit is PriceHit =>
  !!hit && Number.isFinite(hit.savedAt) && now - hit.savedAt >= 0 && now - hit.savedAt < PRICE_TTL_MS;

const usable = (hit: PriceHit | undefined, now: number) => {
  if (!freshPrice(hit, now)) return false;
  return !hit.deal || hit.deal.discountEndsAt === null ||
    (hit.deal.discountEndsAt !== undefined && hit.deal.discountEndsAt > now);
};

const COUNTRY_CURRENCY: Record<string, string> = {
  CN: "CNY",
  TW: "TWD",
  HK: "HKD",
  SG: "SGD",
  JP: "JPY",
  US: "USD",
  TR: "USD",
  UA: "UAH",
  IN: "INR",
  ID: "IDR",
  PH: "PHP",
  VN: "VND",
  KZ: "KZT",
  AZ: "USD",
  PK: "USD",
  RU: "RUB",
  AR: "USD",
};

const currencyOf = (country: string, formatted: string | undefined) => {
  const text = formatted ?? "";
  if (text.includes("NT$")) return "TWD";
  if (text.includes("HK$")) return "HKD";
  if (text.includes("S$")) return "SGD";
  if (text.includes("Rp")) return "IDR";
  if (text.includes("₱")) return "PHP";
  if (text.includes("₽") || text.toLowerCase().includes("руб")) return "RUB";
  if (text.includes("₴")) return "UAH";
  if (text.includes("₸")) return "KZT";
  if (text.includes("₫")) return "VND";
  if (text.includes("$")) return "USD";
  return COUNTRY_CURRENCY[country] ?? "USD";
};

const fromCents = (value: string | undefined) => {
  if (value == null || value === "") {
    return null;
  }
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents < 0) {
    return null;
  }
  return cents / 100;
};

const standaloneOption = (item: SteamStoreItem): SteamPurchaseOption | undefined => {
  const options = [...(item.purchase_options ?? []), item.best_purchase_option]
    .filter((option): option is SteamPurchaseOption =>
      !!option && (option.bundleid == null || Number(option.bundleid) <= 0) &&
      (option.packageid == null || Number(option.packageid) > 0) &&
      fromCents(option.final_price_in_cents) !== null,
    );
  const best = item.best_purchase_option;
  if (best && (best.bundleid == null || Number(best.bundleid) <= 0) &&
      (best.packageid == null || Number(best.packageid) > 0) &&
      fromCents(best.final_price_in_cents) !== null &&
      (best.included_game_count == null || best.included_game_count > 0)) {
    return best;
  }
  const gamePackages = options.filter((option) => option.included_game_count == null || option.included_game_count > 0);
  const candidates = gamePackages.length > 0 ? gamePackages : options;
  return candidates.reduce<SteamPurchaseOption | undefined>((selected, option) => {
    if (!selected) return option;
    return (fromCents(option.final_price_in_cents) ?? Infinity) <
      (fromCents(selected.final_price_in_cents) ?? Infinity) ? option : selected;
  }, undefined);
};

const bundleOption = (item: SteamStoreItem): SteamPurchaseOption | undefined => {
  let selected: SteamPurchaseOption | undefined;
  let lowest = Infinity;
  for (const option of [...(item.purchase_options ?? []), item.best_purchase_option]) {
    if (!option || option.bundleid == null || Number(option.bundleid) <= 0) continue;
    const amount = fromCents(option.final_price_in_cents);
    if (amount !== null && amount < lowest) {
      selected = option;
      lowest = amount;
    }
  }
  return selected;
};

const toDeal = (item: SteamStoreItem, country: string, appid?: number): SteamDeal | null => {
  const id = item.appid && item.appid > 0 ? item.appid : appid;
  if (!id || item.unvailable_for_country_restriction) {
    return null;
  }
  const best = standaloneOption(item);
  const amount = fromCents(best?.final_price_in_cents);
  if (amount == null) {
    return null;
  }
  const regular = fromCents(best?.original_price_in_cents) ?? amount;
  const cut =
    typeof best?.discount_pct === "number"
      ? best.discount_pct
      : regular > 0 && amount < regular
        ? Math.round((1 - amount / regular) * 100)
        : 0;
  const endDates = (best?.active_discounts ?? [])
    .map((discount) => discount.discount_end_date)
    .filter((end): end is number => Number.isInteger(end) && Number(end) > 0 && Number(end) <= 0xffffffff);
  const bundle = bundleOption(item);
  const bundleAmount = fromCents(bundle?.final_price_in_cents);
  return {
    amount,
    currency: currencyOf(country, best?.formatted_final_price),
    regular,
    cut,
    discountEndsAt: cut > 0 && endDates.length > 0 ? Math.min(...endDates) * 1000 : null,
    ...(bundle && bundleAmount !== null && bundleAmount < amount ? {
      bundle: {
        amount: bundleAmount,
        currency: currencyOf(country, bundle.formatted_final_price),
        name: bundle.purchase_option_name ?? "捆绑包",
      },
    } : {}),
  };
};

export const fetchAppIdPrices = async (country: string, appids: number[], token: string) => {
  const deals = new Map<number, SteamDeal>();
  if (appids.length === 0) {
    return deals;
  }
  const context = { language: "schinese", country_code: country };
  for (const group of chunkGetItems(appids, context, PRICE_DATA_REQUEST, token)) {
    const data = await steamGetJson<{ response?: { store_items?: SteamStoreItem[] } }>(
      buildGetItemsUrl(group, context, PRICE_DATA_REQUEST, token),
      `Steam GetItems prices ${country}`,
    );
    for (const item of data.response?.store_items ?? []) {
      const appid = item.appid && item.appid > 0 ? item.appid : item.id;
      const deal = toDeal(item, country, appid);
      if (appid && deal) {
        deals.set(appid, deal);
      }
    }
  }
  return deals;
};

export const fetchWishlistCountryPrices = async (
  steamId: string,
  token: string,
  country: string,
  appids: number[],
  listSize = 0,
) => {
  const deals = new Map<number, SteamDeal>();
  if (appids.length === 0) {
    return deals;
  }
  const needed = new Set(appids);
  const { appids: sortedIds, storeItems } = await fillWishlistStoreItems(
    steamId,
    token,
    country,
    PRICE_DATA_REQUEST,
    needed,
    Math.max(listSize, appids.length),
  );
  for (const appid of appids) {
    const item = storeItems.get(appid);
    if (!item) {
      continue;
    }
    const deal = toDeal(item, country, appid);
    if (deal) {
      deals.set(appid, deal);
    }
  }
  const sortedSet = new Set(sortedIds);
  const leftover = appids.filter((appid) => !sortedSet.has(appid));
  if (leftover.length > 0) {
    const extra = await fetchAppIdPrices(country, leftover, token);
    for (const [appid, deal] of extra) {
      deals.set(appid, deal);
    }
  }
  return deals;
};

export type CountryPriceLoad = {
  refreshed: boolean;
  addedAppids: number[];
  countryItems: Map<string, Map<number, SteamStoreItem>>;
};

const loadedItems = (country: string, options: CountryPriceLoad) => {
  if (!options.refreshed) return null;
  return options.countryItems.get(country) ?? null;
};

const pendingIds = (country: string, appids: number[], options: CountryPriceLoad, now: number) => {
  if (loadedItems(country, options)) return [];
  const bucket = loadBucket(country);
  const added = new Set(options.addedAppids);
  return appids.filter((appid) => options.refreshed || !usable(bucket[appid], now) ||
    (added.has(appid) && !bucket[appid]?.deal));
};

export const estimateCountryFillRequests = (
  countries: string[], appids: number[], options: CountryPriceLoad, token: string, wishlistCount: number,
) => {
  if (appids.length === 0) return 0;
  const pages = Math.max(1, Math.ceil(Math.max(wishlistCount, appids.length) / WISHLIST_STORE_FILL_MAX));
  return [...new Set(countries)].reduce((total, country) => {
    const items = loadedItems(country, options);
    if (items) {
      const missing = [...new Set(appids)].filter((appid) => !items.has(appid));
      return total + chunkGetItems(missing, { language: "schinese", country_code: country }, PRICE_DATA_REQUEST, token).length;
    }
    return total + (pendingIds(country, appids, options, Date.now()).length > 0 ? pages : 0);
  }, 0);
};

const rememberDeals = (country: string, appids: number[], deals: Map<number, SteamDeal>, now: number) => {
  const bucket = loadBucket(country);
  for (const appid of appids) {
    // A successful regional response without a price clears the previous offer.
    bucket[appid] = { savedAt: now, deal: deals.get(appid) ?? null };
  }
  saveBucket(country, bucket);
};

export const loadSteamCountryPrices = async (
  steamId: string,
  countries: string[],
  appids: number[],
  options: CountryPriceLoad,
  onCountry?: (country: string, index: number, total: number) => void,
  wishlistCount = appids.length,
) => {
  const now = Date.now();
  const selected = [...new Set(countries)];
  const uniqueAppids = [...new Set(appids)];
  let token: string | undefined;
  const getToken = async () => token ??= await readWebApiToken();
  for (const country of selected) {
    const items = loadedItems(country, options);
    if (!items) continue;
    const deals = new Map<number, SteamDeal>();
    for (const appid of uniqueAppids) {
      const item = items.get(appid);
      const deal = item ? toDeal(item, country, appid) : null;
      if (deal) deals.set(appid, deal);
    }
    const missing = uniqueAppids.filter((appid) => !items.has(appid));
    if (missing.length > 0) {
      for (const [appid, deal] of await fetchAppIdPrices(country, missing, await getToken())) {
        deals.set(appid, deal);
      }
    }
    rememberDeals(country, uniqueAppids, deals, now);
  }
  const work = selected.map((country) => ({ country, appids: pendingIds(country, uniqueAppids, options, now) }))
    .filter((job) => job.appids.length > 0);
  if (work.length > 0) {
    const token = await getToken();
    for (const [index, job] of work.entries()) {
      onCountry?.(job.country, index + 1, work.length);
      const deals = await fetchWishlistCountryPrices(steamId, token, job.country, job.appids, wishlistCount);
      rememberDeals(job.country, job.appids, deals, Date.now());
    }
  }
  const result = new Map<string, Map<number, SteamDeal>>();
  for (const country of selected) {
    const bucket = loadBucket(country);
    const deals = new Map<number, SteamDeal>();
    for (const appid of uniqueAppids) {
      const hit = bucket[appid];
      if (freshPrice(hit, Date.now()) && hit.deal) deals.set(appid, hit.deal);
    }
    result.set(country, deals);
  }
  return result;
};
