import { cacheGet, fxCacheKey, FX_TTL_MS } from "../cache/cache";
import { US_STORE_COUNTRY, WISHLIST_STORE_FILL_MAX } from "../config";
import { hasPageWebApiToken } from "../steam/steam-http";
import { wishlistCacheState } from "../cache/wishlist-cache";

const storePages = (count: number) => Math.max(1, Math.ceil(Math.max(count, 1) / WISHLIST_STORE_FILL_MAX));

export const fxRequestPending = () => !cacheGet(fxCacheKey, FX_TTL_MS);

export const estimateOpeningRequests = (steamId: string, home: string, pageCount: number | null = null) => {
  let n = 0;
  if (!hasPageWebApiToken()) {
    n += 1;
  }
  const state = wishlistCacheState(steamId, home, pageCount);
  if (state.refresh) {
    const size = pageCount ?? state.games?.length ?? 0;
    const pages = storePages(size);
    n += 1 + pages + (home === US_STORE_COUNTRY ? 0 : pages);
    n += 1;
  }
  if (fxRequestPending()) {
    n += 1;
  }
  return n;
};
