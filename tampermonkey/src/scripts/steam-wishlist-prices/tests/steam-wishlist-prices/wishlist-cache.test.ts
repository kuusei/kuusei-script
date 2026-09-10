import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheSet, wishlistCacheKey } from "../../cache/cache";
import { parseWishlistCount, readWishlistPageCount, wishlistAttemptKey, wishlistCacheState } from "../../cache/wishlist-cache";
import { loadSteamWishlist } from "../../steam/steam-wishlist";

test("page count accepts complete count labels and rejects unrelated content", () => {
  assert.equal(parseWishlistCount("210 个项目"), 210);
  assert.equal(parseWishlistCount("0 个项目"), 0);
  assert.equal(parseWishlistCount("1,234 items"), 1234);
  assert.equal(parseWishlistCount("210 個項目"), 210);
  assert.equal(parseWishlistCount("搜索 210 个项目 我的类别"), null);
  const root = (texts: string[]) => ({ querySelectorAll: () => texts.map(textContent => ({ textContent })) }) as unknown as ParentNode;
  assert.equal(readWishlistPageCount(root(["210 个项目", "210 个项目"])), 210);
  assert.equal(readWishlistPageCount(root(["210 个项目", "5 个项目"])), null);
});

test("count changes respect the five-minute boundary, hourly expiry, and failed attempts", async () => {
  const storage = new Map<string, any>();
  Object.assign(globalThis, {
    GM_getValue: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    GM_setValue: (key: string, value: unknown) => storage.set(key, value),
  });
  const realNow = Date.now;
  Date.now = () => 1800000000000;
  try {
    const key = wishlistCacheKey("1", "CN");
    cacheSet(key, [{ appid: 1 }]);
    const entry = storage.get(key);
    entry.timestamp = Date.now() - 299999;
    assert.equal(wishlistCacheState("1", "CN", 2).refresh, false);
    entry.timestamp = Date.now() - 300000;
    assert.equal(wishlistCacheState("1", "CN", 2).refresh, true);
    assert.equal(wishlistCacheState("1", "CN", 1).refresh, false);
    assert.equal(wishlistCacheState("1", "CN", null).refresh, false);
    entry.timestamp = Date.now() - 3600001;
    assert.equal(wishlistCacheState("1", "CN", 1).refresh, true);
    cacheSet(wishlistAttemptKey("1"), true);
    assert.equal(wishlistCacheState("1", "CN", 2).refresh, false);
    assert.equal(wishlistCacheState("1", "JP", 2).refresh, false);
    assert.equal((await loadSteamWishlist("1", "CN", 2)).refreshed, false);
    await assert.rejects(loadSteamWishlist("1", "JP", 2), /5 分钟/);
    storage.get(wishlistAttemptKey("1")).timestamp = Date.now() - 300000;
    assert.equal(wishlistCacheState("1", "CN", 2).refresh, true);
  } finally {
    Date.now = realNow;
  }
});
