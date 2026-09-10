import { loadValue, saveValue } from "@/shared";

import { MISS_TTL_MS, priceCacheKey, REGULAR_TTL_MS } from "../cache/cache";
import { COUNTRIES, US_STORE_COUNTRY } from "../config";
import {
  buildGetItemsUrl,
  canFetchAppPricesInOneRequest,
  chunkGetItems,
  fillWishlistStoreItems,
  PRICE_DATA_REQUEST,
  readWebApiToken,
  steamGetJson,
  type SteamStoreItem,
} from "../steam/steam-http";

export type SteamDeal = {
  amount: number;
  currency: string;
  regular: number | null;
  cut: number;
  discountEndsAt: number | null;
};

type PriceHit = {
  regularAt: number;
  cutAt: number;
  deal: SteamDeal | null;
};

type PriceBucket = Record<string, PriceHit | { savedAt: number; deal: SteamDeal | null }>;

const fetchedThisRun = new Set<string>();

const fetchKey = (country: string, appid: number) => `${country}:${appid}`;

export const beginDiscountSync = () => {
  fetchedThisRun.clear();
};

const markFetched = (country: string, appids: Iterable<number>) => {
  for (const appid of appids) {
    fetchedThisRun.add(fetchKey(country, appid));
  }
};

const originalPrice = (deal: SteamDeal) => {
  if (deal.regular != null && deal.regular > 0) {
    return deal.regular;
  }
  if (deal.cut === 0 && deal.amount > 0) {
    return deal.amount;
  }
  return null;
};

const amountFromRegular = (regular: number, cut: number) => {
  const pct = Math.max(0, Math.min(100, cut));
  return Math.round(regular * (100 - pct)) / 100;
};

const withCut = (deal: SteamDeal, cut: number): SteamDeal | null => {
  const regular = originalPrice(deal);
  if (regular == null) {
    return null;
  }
  return {
    amount: amountFromRegular(regular, cut),
    currency: deal.currency,
    regular,
    cut,
    // Only retain an end time confirmed for this region and the same discount.
    discountEndsAt: deal.discountEndsAt == null || (cut > 0 && cut === deal.cut)
      ? deal.discountEndsAt
      : null,
  };
};

const asHit = (raw: PriceBucket[string] | undefined): PriceHit | null => {
  if (!raw) {
    return null;
  }
  if ("regularAt" in raw && "cutAt" in raw) {
    return raw;
  }
  if ("savedAt" in raw) {
    return { regularAt: raw.savedAt, cutAt: raw.savedAt, deal: raw.deal };
  }
  return null;
};

const loadBucket = (country: string) => loadValue<PriceBucket>(priceCacheKey(country), {});

const saveBucket = (country: string, bucket: PriceBucket) => saveValue(priceCacheKey(country), bucket);

const writeFetchedDeal = (bucket: PriceBucket, appid: number, deal: SteamDeal | null, now: number) => {
  if (deal) {
    bucket[String(appid)] = { regularAt: now, cutAt: now, deal };
    return;
  }
  const prev = asHit(bucket[String(appid)]);
  if (prev?.deal) {
    return;
  }
  bucket[String(appid)] = { regularAt: now, cutAt: prev?.cutAt ?? 0, deal: null };
};

const propagateDiscount = (sourceCountry: string, sourceDeals: Map<number, SteamDeal>, now: number) => {
  if (sourceDeals.size === 0) {
    return;
  }
  for (const country of COUNTRIES) {
    if (country.code === sourceCountry) {
      continue;
    }
    const bucket = loadBucket(country.code);
    let changed = false;
    for (const [appid, source] of sourceDeals) {
      if (fetchedThisRun.has(fetchKey(country.code, appid))) {
        continue;
      }
      const hit = asHit(bucket[String(appid)]);
      if (!hit?.deal) {
        continue;
      }
      const next = withCut(hit.deal, source.cut);
      if (!next) {
        continue;
      }
      if (
        hit.deal.amount === next.amount &&
        hit.deal.cut === next.cut &&
        hit.deal.regular === next.regular
      ) {
        continue;
      }
      bucket[String(appid)] = { regularAt: hit.regularAt, cutAt: now, deal: next };
      changed = true;
    }
    if (changed) {
      saveBucket(country.code, bucket);
    }
  }
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

const toDeal = (item: SteamStoreItem, country: string, appid?: number): SteamDeal | null => {
  const id = item.appid && item.appid > 0 ? item.appid : appid;
  if (!id || item.unvailable_for_country_restriction) {
    return null;
  }
  const best = item.best_purchase_option;
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
  return {
    amount,
    currency: currencyOf(country, best?.formatted_final_price),
    regular,
    cut,
    discountEndsAt: cut > 0 && endDates.length > 0 ? Math.min(...endDates) * 1000 : null,
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

const fillCountryAppPrices = async (
  steamId: string,
  token: string,
  country: string,
  appids: number[],
  listSize = 0,
) => {
  if (appids.length === 0) {
    return new Map<number, SteamDeal>();
  }
  if (canFetchAppPricesInOneRequest(appids, country, token)) {
    return fetchAppIdPrices(country, appids, token);
  }
  return fetchWishlistCountryPrices(steamId, token, country, appids, listSize);
};

const rememberStoreItems = (country: string, storeItems: Map<number, SteamStoreItem>, now: number) => {
  if (storeItems.size === 0) {
    return new Map<number, SteamDeal>();
  }
  const bucket = loadBucket(country);
  const deals = new Map<number, SteamDeal>();
  for (const [appid, item] of storeItems) {
    const deal = toDeal(item, country, appid);
    writeFetchedDeal(bucket, appid, deal, now);
    if (deal) {
      deals.set(appid, deal);
    }
  }
  saveBucket(country, bucket);
  markFetched(country, storeItems.keys());
  propagateDiscount(country, deals, now);
  return deals;
};

const rememberFetchedDeals = (
  country: string,
  appids: number[],
  fetched: Map<number, SteamDeal>,
  now: number,
) => {
  const bucket = loadBucket(country);
  for (const appid of appids) {
    writeFetchedDeal(bucket, appid, fetched.get(appid) ?? null, now);
  }
  saveBucket(country, bucket);
  markFetched(country, appids);
  propagateDiscount(country, fetched, now);
};

const regularTtlMs = (hit: PriceHit) => (hit.deal ? REGULAR_TTL_MS : MISS_TTL_MS);

const needsRegular = (hit: PriceHit | null, now: number) => {
  if (!hit || hit.regularAt <= 0) {
    return true;
  }
  if (hit.deal && (
    hit.deal.discountEndsAt === undefined ||
    (hit.deal.discountEndsAt !== null && hit.deal.discountEndsAt <= now)
  )) {
    return true;
  }
  return now - hit.regularAt > regularTtlMs(hit);
};

const exclusiveForCountry = (exclusive: number[], bucket: PriceBucket, now: number) =>
  exclusive.filter((appid) => needsRegular(asHit(bucket[String(appid)]), now));

const uniqueAppIds = (...lists: number[][]) => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const list of lists) {
    for (const appid of list) {
      if (!seen.has(appid)) {
        seen.add(appid);
        out.push(appid);
      }
    }
  }
  return out;
};

const dealsFromBucket = (country: string, appids: number[]) => {
  const bucket = loadBucket(country);
  const fresh = new Map<number, SteamDeal>();
  for (const appid of appids) {
    const deal = asHit(bucket[String(appid)])?.deal;
    if (deal) {
      fresh.set(appid, deal);
    }
  }
  return fresh;
};

const hasDeal = (country: string, appid: number) => Boolean(asHit(loadBucket(country)[String(appid)])?.deal);

const itemHasDeal = (items: Map<number, SteamStoreItem>, country: string, appid: number) => {
  const item = items.get(appid);
  return Boolean(item && toDeal(item, country, appid));
};

export const estimateCountryFillRequests = (
  countries: string[],
  appids: number[],
  options: CountryPriceLoad,
  token: string,
  _wishlistCount: number,
) => {
  const now = Date.now();
  const added = new Set(options.addedAppids);
  const exclusive = options.refreshed
    ? appids.filter(
        (appid) =>
          !itemHasDeal(options.homeItems, options.home, appid) &&
          !itemHasDeal(options.usItems, US_STORE_COUNTRY, appid),
      )
    : [];
  const targets = options.refreshed
    ? countries.filter((code) => code !== options.home && code !== US_STORE_COUNTRY)
    : countries;
  let n = 0;
  for (const country of targets) {
    const batch = missingBatchForCountry(country, appids, added, exclusive, now, options.refreshed);
    if (batch.length === 0) {
      continue;
    }
    n += canFetchAppPricesInOneRequest(batch, country, token) ? 1 : 1;
  }
  return n;
};

export type CountryPriceLoad = {
  home: string;
  refreshed: boolean;
  addedAppids: number[];
  homeItems: Map<number, SteamStoreItem>;
  usItems: Map<number, SteamStoreItem>;
};

const missingBatchForCountry = (
  country: string,
  appids: number[],
  added: Set<number>,
  exclusive: number[],
  now: number,
  refreshed: boolean,
) => {
  const bucket = loadBucket(country);
  const missingRegular = appids.filter((appid) => {
    const hit = asHit(bucket[String(appid)]);
    return needsRegular(hit, now) || (refreshed && added.has(appid) && !hit?.deal);
  });
  return uniqueAppIds(
    missingRegular,
    refreshed ? exclusiveForCountry(exclusive, bucket, now) : [],
  );
};

const fillSelectedCountryPrices = async (
  steamId: string,
  token: string,
  countries: string[],
  appids: number[],
  added: Set<number>,
  exclusiveStart: number[],
  now: number,
  refreshed: boolean,
  onCountry?: (country: string, index: number, total: number) => void,
) => {
  let exclusive = exclusiveStart;
  const jobs = countries.filter((code, index, list) => list.indexOf(code) === index);
  const work = jobs.filter(
    (country) => missingBatchForCountry(country, appids, added, exclusive, now, refreshed).length > 0,
  );
  let done = 0;
  for (const country of work) {
    const batch = missingBatchForCountry(country, appids, added, exclusive, now, refreshed);
    if (batch.length === 0) {
      continue;
    }
    done += 1;
    onCountry?.(country, done, work.length);
    const fetched = await fillCountryAppPrices(steamId, token, country, batch, appids.length);
    rememberFetchedDeals(country, batch, fetched, now);
    exclusive = exclusive.filter((appid) => !fetched.has(appid));
  }
};

export const loadSteamCountryPrices = async (
  steamId: string,
  countries: string[],
  appids: number[],
  options: CountryPriceLoad,
  onCountry?: (country: string, index: number, total: number) => void,
) => {
  const now = Date.now();
  const added = new Set(options.addedAppids);
  if (options.refreshed) {
    beginDiscountSync();
    const token = await readWebApiToken();
    rememberStoreItems(options.home, options.homeItems, now);
    if (options.home !== US_STORE_COUNTRY) {
      rememberStoreItems(US_STORE_COUNTRY, options.usItems, now);
    }
    const exclusive = appids.filter(
      (appid) => !hasDeal(options.home, appid) && !hasDeal(US_STORE_COUNTRY, appid),
    );
    const others = countries.filter(
      (code) => code !== options.home && code !== US_STORE_COUNTRY,
    );
    await fillSelectedCountryPrices(
      steamId,
      token,
      others,
      appids,
      added,
      exclusive,
      now,
      true,
      onCountry,
    );
  } else {
    const selected = countries.filter((code, index, list) => list.indexOf(code) === index);
    const hasWork = selected.some(
      (country) => missingBatchForCountry(country, appids, added, [], now, false).length > 0,
    );
    if (hasWork) {
      beginDiscountSync();
      const token = await readWebApiToken();
      await fillSelectedCountryPrices(
        steamId,
        token,
        selected,
        appids,
        added,
        [],
        now,
        false,
        onCountry,
      );
    }
  }
  const countryDeals = new Map<string, Map<number, SteamDeal>>();
  for (const country of countries) {
    countryDeals.set(country, dealsFromBucket(country, appids));
  }
  return countryDeals;
};
