import { cacheGet, cachePeek, LIST_TTL_MS, wishlistCacheKey } from "./cache";
import type { WishlistGame } from "../steam/steam-wishlist";

export const wishlistCacheMessages = {
  "zh-CN": { retryLater: "愿望单获取间隔至少 5 分钟，请稍后再试" },
  "en-US": { retryLater: "Wait at least 5 minutes between wishlist fetches. Please try again later." },
};

export const WISHLIST_MIN_REFRESH_MS = 5 * 60 * 1000;
export const wishlistAttemptKey = (steamId: string) => `wl-list-attempt:${steamId}`;

export const parseWishlistCount = (text: string): number | null => {
  const match = text.trim().match(/^([\d,，]+)\s*(?:个项目|個項目|items?)$/i);
  if (!match) return null;
  const count = Number(match[1].replace(/[,，]/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
};

export const readWishlistPageCount = (root: ParentNode = document): number | null => {
  const counts = new Set<number>();
  for (const element of Array.from(root.querySelectorAll("div, span, p, label"))) {
    const count = parseWishlistCount(element.textContent ?? "");
    if (count !== null) counts.add(count);
  }
  return counts.size === 1 ? [...counts][0] : null;
};

export const wishlistCacheState = (steamId: string, home: string, pageCount: number | null) => {
  const key = wishlistCacheKey(steamId, home);
  const games = cachePeek<WishlistGame[]>(key);
  const throttled = Boolean(
    cacheGet(wishlistAttemptKey(steamId), WISHLIST_MIN_REFRESH_MS - 1) ||
    cacheGet(key, WISHLIST_MIN_REFRESH_MS - 1),
  );
  const fresh = cacheGet<WishlistGame[]>(key, LIST_TTL_MS);
  const changed = pageCount !== null && games !== null && pageCount !== games.length;
  return { games, refresh: !throttled && (!fresh || changed) };
};
