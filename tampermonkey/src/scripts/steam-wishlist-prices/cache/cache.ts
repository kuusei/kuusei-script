import { loadTimedValue, loadValue, saveTimedValue } from "@/shared";

import { CACHE_TTL_MS, REGULAR_PRICE_TTL_MS, WISHLIST_CACHE_TTL_MS } from "../config";

type TimedValue<T> = {
  version: string;
  timestamp: number;
  value: T;
};

const VERSION = "v5";

export const cacheGet = <T>(key: string, ttlMs: number) =>
  loadTimedValue<T>(key, { version: VERSION, ttlMs });

export const cachePeek = <T>(key: string): T | null => {
  const cached = loadValue<TimedValue<T> | null>(key, null);
  if (!cached || cached.version !== VERSION) {
    return null;
  }
  return cached.value;
};

export const cacheSet = <T>(key: string, value: T) => saveTimedValue(key, value, VERSION);

export const wishlistCacheKey = (steamId: string, home: string) => `wl-list:v2:${steamId}:${home}`;
export const fxCacheKey = "wl-fx";
export const priceCacheKey = (country: string) => `wl-price:${country}`;

export const LIST_TTL_MS = WISHLIST_CACHE_TTL_MS;
export const REGULAR_TTL_MS = REGULAR_PRICE_TTL_MS;
export const MISS_TTL_MS = CACHE_TTL_MS;
export const FX_TTL_MS = CACHE_TTL_MS;
