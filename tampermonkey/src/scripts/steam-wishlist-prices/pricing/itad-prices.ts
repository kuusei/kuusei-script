import { loadValue, saveValue } from "@/shared";
import { noteRequest } from "../requests/request-meter";
import type { SteamDeal } from "./steam-prices";

const API = "https://api.isthereanydeal.com";
const STEAM_SHOP = 61;
const BATCH_SIZE = 200;
const HOUR = 60 * 60 * 1000;
const ID_CACHE_KEY = "wishlist-itad-ids-v1";
const LOW_CACHE_PREFIX = "wishlist-itad-steam-low-v1:";
const DEAL_CACHE_PREFIX = "wishlist-itad-steam-deal-v1:";
const API_KEY_STORAGE = "wishlist-itad-api-key-v1";
const HOME_STORAGE = "wishlist-itad-home-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ItadLow = {
  amount: number;
  currency: string;
  recordedAt: string | null;
  country: string;
};

export type ItadResult = {
  enabled: boolean;
  home: string;
  lows: Map<number, ItadLow>;
  deals: Map<number, ItadDeal>;
  warning: string | null;
};

export type ItadDeal = {
  amount: number;
  currency: string;
  country: string;
  flag: "N" | "H" | "S" | null;
};

type NativePrice = Pick<SteamDeal, "amount" | "currency"> & Partial<Pick<SteamDeal, "discountEndsAt">>;
type Hit<T> = { savedAt: number; value: T | null; checkedPrice?: NativePrice };
type Bucket<T> = Record<string, Hit<T>>;

export const loadItadApiKey = () => loadValue<string>(API_KEY_STORAGE, "").trim();
export const saveItadApiKey = (key: string) => saveValue(API_KEY_STORAGE, key.trim());

export const syncItadHome = (home: string) => {
  const previous = loadValue<string | null>(HOME_STORAGE, null);
  if (previous === home) return;
  if (previous !== null) {
    // Clear both sides so switching back cannot resurrect an old region's history.
    for (const country of [previous, home]) {
      saveValue(`${LOW_CACHE_PREFIX}${country}`, {});
      saveValue(`${DEAL_CACHE_PREFIX}${country}`, {});
    }
  }
  saveValue(HOME_STORAGE, home);
};

const fresh = <T>(hit: Hit<T> | undefined, ttl: number): hit is Hit<T> =>
  !!hit && Date.now() - hit.savedAt >= 0 && Date.now() - hit.savedAt < ttl;

const needsRefresh = <T>(hit: Hit<T> | undefined, current: NativePrice | undefined) =>
  !fresh(hit, HOUR) || !!current &&
    (hit.checkedPrice?.currency !== current.currency || hit.checkedPrice.amount !== current.amount);

const checkedPrice = (current: NativePrice | undefined) => current
  ? { amount: current.amount, currency: current.currency, discountEndsAt: current.discountEndsAt } : undefined;

const sameOffer = (previous: NativePrice, current: NativePrice) =>
  previous.currency === current.currency && previous.amount === current.amount &&
  (previous.discountEndsAt === undefined || current.discountEndsAt === undefined ||
    previous.discountEndsAt === current.discountEndsAt) &&
  (current.discountEndsAt == null || current.discountEndsAt > Date.now());

const clearChangedQuotes = (country: string, prices: Map<string, NativePrice>) => {
  const key = `${DEAL_CACHE_PREFIX}${country}`;
  const bucket = loadValue<Bucket<ItadDeal>>(key, {});
  let changed = false;
  for (const [id, current] of prices) {
    const hit = bucket[id];
    const previous = hit?.checkedPrice ?? hit?.value;
    if (previous && !sameOffer(previous, current)) {
      delete bucket[id];
      changed = true;
    }
  }
  if (changed) saveValue(key, bucket);
};

const chunks = <T>(items: T[]) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) result.push(items.slice(i, i + BATCH_SIZE));
  return result;
};

class ItadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const apiPost = async (path: string, body: string[], apiKey: string): Promise<unknown> => {
  noteRequest();
  const options = {
    method: "POST" as const,
    url: `${API}${path}`,
    headers: { "Content-Type": "application/json", "ITAD-API-Key": apiKey },
    data: JSON.stringify(body),
  };
  let response: { status: number; responseText: string };
  try {
    if (typeof GM_xmlhttpRequest === "function") {
      response = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          ...options,
          anonymous: true,
          timeout: 20000,
          onload: resolve,
          onerror: () => reject(new Error()),
          ontimeout: () => reject(new Error()),
          onabort: () => reject(new Error()),
        });
      });
    } else {
      const res = await fetch(options.url, {
        method: options.method, headers: options.headers, body: options.data,
        credentials: "omit", signal: AbortSignal.timeout(20000),
      });
      response = { status: res.status, responseText: await res.text() };
    }
  } catch {
    throw new ItadError(0, "ITAD 请求失败或超时");
  }
  if (response.status < 200 || response.status >= 300) {
    const message = response.status === 401 || response.status === 403
      ? "ITAD API Key 无效或无权访问，请检查设置"
      : response.status === 429
        ? "ITAD 请求已达限额，请稍后重试"
        : `ITAD 请求失败（HTTP ${response.status}）`;
    throw new ItadError(response.status, message);
  }
  try {
    return JSON.parse(response.responseText) as unknown;
  } catch {
    throw new ItadError(0, "ITAD 返回的数据格式异常");
  }
};

// The lookup uses Steam app IDs, so games with identical names cannot be mixed up.
const lookupIds = async (appids: number[], apiKey: string, plan: (count: number) => void) => {
  const bucket = loadValue<Bucket<string>>(ID_CACHE_KEY, {});
  const pending = appids.filter((appid) => {
    const hit = bucket[appid];
    return !fresh(hit, hit?.value ? 30 * 24 * HOUR : 24 * HOUR);
  });
  const batches = chunks(pending);
  plan(batches.length);
  for (const batch of batches) {
    const raw = await apiPost(`/lookup/id/shop/${STEAM_SHOP}/v1`, batch.map((id) => `app/${id}`), apiKey);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ItadError(0, "ITAD 游戏映射格式异常");
    }
    const data = raw as Record<string, unknown>;
    for (const appid of batch) {
      const id = data[`app/${appid}`];
      if (id !== null && (typeof id !== "string" || !UUID.test(id))) {
        throw new ItadError(0, "ITAD 游戏映射缺失或格式异常");
      }
    }
    for (const appid of batch) {
      // Keep a known identifier if a later lookup temporarily omits the game.
      const value = data[`app/${appid}`] as string | null;
      bucket[appid] = { savedAt: Date.now(), value: value ?? bucket[appid]?.value ?? null };
    }
    saveValue(ID_CACHE_KEY, bucket);
  }
  return new Map(appids.map((appid) => [appid, bucket[appid]?.value ?? null]));
};

const parseLow = (raw: unknown, country: string): ItadLow | null => {
  if (!raw || typeof raw !== "object") return null;
  const low = raw as { shop?: { id?: number }; price?: { amount?: number; currency?: string }; timestamp?: string };
  if (low.shop?.id !== STEAM_SHOP || typeof low.price?.amount !== "number" ||
    !Number.isFinite(low.price.amount) || low.price.amount < 0 ||
    typeof low.price.currency !== "string" || !/^[A-Z]{3}$/.test(low.price.currency)) return null;
  return {
    amount: low.price.amount,
    currency: low.price.currency,
    recordedAt: typeof low.timestamp === "string" && Number.isFinite(Date.parse(low.timestamp)) ? low.timestamp : null,
    country,
  };
};

const readLows = (ids: string[], country: string) => {
  const bucket = loadValue<Bucket<ItadLow>>(`${LOW_CACHE_PREFIX}${country}`, {});
  return new Map(ids.map((id) => [id, bucket[id]?.value ?? null] as const));
};

const fetchLows = async (
  ids: string[], country: string, apiKey: string, plan: (count: number) => void,
  currentPrices: Map<string, NativePrice>,
) => {
  const key = `${LOW_CACHE_PREFIX}${country}`;
  const bucket = loadValue<Bucket<ItadLow>>(key, {});
  const batches = chunks(ids.filter((id) => needsRefresh(bucket[id], currentPrices.get(id))));
  plan(batches.length);
  for (const batch of batches) {
    const raw = await apiPost(`/games/storelow/v2?country=${encodeURIComponent(country)}&shops=${STEAM_SHOP}`, batch, apiKey);
    if (!Array.isArray(raw) || raw.some((item) => !item || typeof item.id !== "string" || !Array.isArray(item.lows))) {
      throw new ItadError(0, "ITAD 史低数据格式异常");
    }
    const data = new Map<string, unknown[]>(raw.map((item) => [item.id, item.lows]));
    for (const id of batch) {
      const value = (data.get(id) ?? []).map((low) => parseLow(low, country)).find((low) => low !== null) ?? null;
      const previous = bucket[id]?.value;
      // A temporarily missing or higher ITAD record must not erase a saved historical minimum.
      const minimum = previous && (!value || previous.currency === value.currency && previous.amount <= value.amount)
        ? previous : value;
      bucket[id] = { savedAt: Date.now(), value: minimum, checkedPrice: checkedPrice(currentPrices.get(id)) };
    }
    saveValue(key, bucket);
  }
};

const parseDeal = (raw: unknown, country: string): ItadDeal | null => {
  const price = parseLow(raw, country);
  if (!price) return null;
  const flag = (raw as { flag?: unknown }).flag;
  return {
    amount: price.amount, currency: price.currency, country,
    flag: flag === "N" || flag === "H" || flag === "S" ? flag : null,
  };
};

const fetchDeals = async (
  ids: string[], country: string, apiKey: string, plan: (count: number) => void,
  currentPrices: Map<string, NativePrice>,
) => {
  const key = `${DEAL_CACHE_PREFIX}${country}`;
  const bucket = loadValue<Bucket<ItadDeal>>(key, {});
  const batches = chunks(ids.filter((id) => needsRefresh(bucket[id], currentPrices.get(id))));
  plan(batches.length);
  for (const batch of batches) {
    const raw = await apiPost(`/games/prices/v3?country=${encodeURIComponent(country)}&shops=${STEAM_SHOP}`, batch, apiKey);
    if (!Array.isArray(raw) || raw.some((item) => !item || typeof item.id !== "string" || !Array.isArray(item.deals))) {
      throw new ItadError(0, "ITAD 报价标记格式异常");
    }
    const data = new Map<string, unknown[]>(raw.map((item) => [item.id, item.deals]));
    for (const id of batch) {
      const value = (data.get(id) ?? []).map((deal) => parseDeal(deal, country)).find((deal) => deal !== null) ?? null;
      bucket[id] = { savedAt: Date.now(), value, checkedPrice: checkedPrice(currentPrices.get(id)) };
    }
    saveValue(key, bucket);
  }
};

export const loadItadSteamLows = async (
  appids: number[], home: string, apiKey = loadItadApiKey(),
  plan: (count: number) => void = () => {},
  currentPrices: Map<number, NativePrice> = new Map(),
): Promise<ItadResult> => {
  syncItadHome(home);
  const result: ItadResult = { enabled: !!apiKey, home, lows: new Map(), deals: new Map(), warning: null };
  if (!apiKey || appids.length === 0) return result;
  const warnings = new Set<string>();
  let blocked = false;
  const handle = (error: unknown) => {
    warnings.add(error instanceof Error ? error.message : "ITAD 查询失败");
    if (error instanceof ItadError && [401, 403, 429].includes(error.status)) blocked = true;
  };
  const unique = [...new Set(appids)];
  const cachedMapping = loadValue<Bucket<string>>(ID_CACHE_KEY, {});
  const cachedLows = loadValue<Bucket<ItadLow>>(`${LOW_CACHE_PREFIX}${home}`, {});
  const pending = unique.filter((appid) => {
    const id = cachedMapping[appid]?.value;
    const low = id ? cachedLows[id]?.value : null;
    const current = currentPrices.get(appid);
    return !low || !current || current.currency !== low.currency || current.amount < low.amount;
  });
  let mapping: Map<number, string | null>;
  try {
    const queried = await lookupIds(pending, apiKey, plan);
    mapping = new Map(unique.map((appid) => [appid, queried.has(appid)
      ? queried.get(appid)! : cachedMapping[appid]?.value ?? null]));
  } catch (error) {
    handle(error);
    // Retain valid results from earlier batches without treating failed requests as misses.
    const cached = loadValue<Bucket<string>>(ID_CACHE_KEY, {});
    mapping = new Map(unique.map((appid) => [appid, cached[appid]?.value ?? null]));
  }
  const ids = [...new Set([...mapping.values()].filter((id): id is string => id !== null))];
  const pendingIds = [...new Set(pending.map((appid) => mapping.get(appid)).filter((id): id is string => !!id))];
  const pricesById = new Map<string, NativePrice>();
  for (const appid of unique) {
    const id = mapping.get(appid);
    const current = currentPrices.get(appid);
    if (id && current) pricesById.set(id, current);
  }
  clearChangedQuotes(home, pricesById);
  if (!blocked) {
    try { await fetchLows(pendingIds, home, apiKey, plan, pricesById); } catch (error) { handle(error); }
  }
  if (!blocked) {
    try { await fetchDeals(pendingIds, home, apiKey, plan, pricesById); } catch (error) { handle(error); }
  }
  const homeLows = readLows(ids, home);
  const homeDeals = loadValue<Bucket<ItadDeal>>(`${DEAL_CACHE_PREFIX}${home}`, {});
  for (const [appid, id] of mapping) {
    const low = id ? homeLows.get(id) : null;
    if (low) result.lows.set(appid, low);
    const hit = id ? homeDeals[id] : undefined;
    const current = currentPrices.get(appid);
    // The hour limits requests, not the lifetime of a confirmed N marker for this offer.
    const confirmedNewLow = hit?.value?.flag === "N" && current &&
      sameOffer(hit.value, current) && (!hit.checkedPrice || sameOffer(hit.checkedPrice, current));
    if (hit?.value && (fresh(hit, HOUR) || confirmedNewLow)) result.deals.set(appid, hit.value);
  }
  result.warning = warnings.size ? [...warnings].join("；") : null;
  return result;
};
