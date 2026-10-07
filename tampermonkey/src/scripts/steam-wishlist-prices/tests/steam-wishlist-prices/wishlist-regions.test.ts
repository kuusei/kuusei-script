import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cacheSet, fxCacheKey } from "../../cache/cache";
import { fetchWishlistAppIds, loadSteamWishlist } from "../../steam/steam-wishlist";
import { estimateCountryFillRequests, loadSteamCountryPrices } from "../../pricing/steam-prices";
import { estimateOpeningRequests } from "../../requests/estimate-opening";
import type { SteamStoreItem } from "../../steam/steam-http";

const storage = new Map<string, unknown>();
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalGm = globalThis.GM_xmlhttpRequest;
const requests: { kind: string; country?: string; ids?: number[] }[] = [];
let appids: number[];
let regional: Record<string, SteamStoreItem[]>;
let byId: Record<string, SteamStoreItem[]>;

const item = (appid: number, country: string): SteamStoreItem => ({
  appid, success: 1, visible: true, name: `Game ${appid}`,
  release: { steam_release_date: 1700000000, is_coming_soon: false },
  assets: { asset_url_format: `steam/apps/${appid}/abcdefabcdef/` + "${FILENAME}", small_capsule: "capsule.jpg" },
  best_purchase_option: {
    final_price_in_cents: country === "US" ? "999" : country === "JP" ? "12000" : "7000",
    original_price_in_cents: "20000", discount_pct: country === "US" ? 50 : 40,
    active_discounts: [],
  },
});

beforeEach(() => {
  storage.clear(); requests.length = 0; appids = [1]; regional = {}; byId = {};
  Object.assign(globalThis, {
    GM_getValue: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    GM_setValue: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    GM_xmlhttpRequest: undefined,
    document: { getElementById: () => ({ attributes: [
      { name: "data-config", value: JSON.stringify({ webapi_token: "eyJ-test" }) },
    ] }) },
  });
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("/GetWishlist/")) {
      requests.push({ kind: "ids" });
      return Response.json({ response: { items: appids.map(appid => ({ appid })) } });
    }
    const rawInput = url.searchParams.get("input_json");
    if (!rawInput) return new Response("Unexpected request");
    const input = JSON.parse(rawInput);
    const country = input.context.country_code;
    if (url.pathname.includes("GetWishlistSortedFiltered")) {
      requests.push({ kind: "wishlist", country });
      const items = regional[country] ?? [];
      return Response.json({ response: { items: appids.map(appid => ({
        appid, store_item: items.find(item => item.appid === appid || item.id === appid),
      })) } });
    }
    if (url.pathname.includes("/GetItems/")) {
      requests.push({ kind: "items", country, ids: input.ids.map((id: { appid: number }) => id.appid) });
      return Response.json({ response: { store_items: byId[country] ?? [] } });
    }
    return new Response("Unexpected request");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.GM_xmlhttpRequest = originalGm;
});

const pricedIds = (wishlist: Awaited<ReturnType<typeof loadSteamWishlist>>) => wishlist.games
  .filter(game => !game.delisted && !game.comingSoon && !game.free).map(game => game.appid);

test("count preflight only reads IDs and reuses them without another wishlist-ID request", async () => {
  appids = [1, 2];
  regional = { CN: [item(1, "CN"), item(2, "CN")] };
  const ids = await fetchWishlistAppIds("1", "eyJ-test");
  assert.deepEqual(requests, [{ kind: "ids" }]);
  assert.equal(ids.length, 2);
  cacheSet(fxCacheKey, { fetchedAt: "today", usdTo: { CNY: 7 } });
  assert.equal(estimateOpeningRequests("1", "CN", 2, true), 1);
  const wishlist = await loadSteamWishlist("1", "CN", ids.length, ["CN"], ids);
  assert.deepEqual(ids, [1, 2]);
  assert.deepEqual(wishlist.games.map(game => game.appid), ids);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "CN" }]);
});

test("unselected US is never requested when loading wishlist and selected regional prices", async () => {
  regional = { CN: [item(1, "CN")], JP: [item(1, "JP")] };
  const wishlist = await loadSteamWishlist("1", "CN", 1, ["CN", "JP"]);
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], pricedIds(wishlist), wishlist);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "CN" }, { kind: "wishlist", country: "JP" }]);
  assert.equal(prices.get("CN")?.get(1)?.amount, 70);
  assert.equal(prices.get("JP")?.get(1)?.amount, 120);
  assert.equal(prices.has("US"), false);
});

test("selected US uses the normal regional price flow once and cached reopening makes no requests", async () => {
  regional = { CN: [item(1, "CN")], US: [item(1, "US")] };
  const wishlist = await loadSteamWishlist("1", "CN", 1, ["CN", "US"]);
  const prices = await loadSteamCountryPrices("1", ["CN", "US"], pricedIds(wishlist), wishlist);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "CN" }, { kind: "wishlist", country: "US" }]);
  assert.equal(prices.get("US")?.get(1)?.amount, 9.99);
  assert.equal(prices.get("US")?.get(1)?.cut, 50);
  requests.length = 0;
  const cached = await loadSteamWishlist("1", "CN", 1, ["CN", "US"]);
  await loadSteamCountryPrices("1", ["CN", "US"], pricedIds(cached), cached);
  assert.equal(cached.refreshed, false);
  assert.deepEqual(requests, []);
});

test("selected region repairs missing metadata and delisted status and its prices are reused", async () => {
  regional = { CN: [{ appid: 1, success: 0, visible: false }], JP: [item(1, "JP")] };
  const wishlist = await loadSteamWishlist("1", "CN", 1, ["CN", "JP", "JP"]);
  assert.equal(wishlist.games[0].title, "Game 1");
  assert.equal(wishlist.games[0].delisted, false);
  assert.equal(wishlist.games[0].releasedAt, 1700000000);
  assert.match(wishlist.games[0].capsule, /capsule\.jpg$/);
  assert.equal(estimateCountryFillRequests(["CN", "JP"], [1], wishlist, "", 1), 0);
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], pricedIds(wishlist), wishlist);
  assert.equal(prices.get("JP")?.get(1)?.amount, 120);
  assert.equal(prices.get("CN")?.has(1), false);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "CN" }, { kind: "wishlist", country: "JP" }]);
});

test("selected region fills assets and release date without replacing the home localized title", async () => {
  regional = { CN: [{ ...item(1, "CN"), name: "中文名", release: undefined, assets: undefined }], JP: [item(1, "JP")] };
  const wishlist = await loadSteamWishlist("1", "CN", 1, ["CN", "JP"]);
  assert.equal(wishlist.games[0].title, "中文名");
  assert.equal(wishlist.games[0].releasedAt, 1700000000);
  assert.match(wishlist.games[0].capsule, /capsule\.jpg$/);
  assert.equal(requests.some(request => request.country === "US"), false);
});

test("when every selected wishlist lacks metadata no other country or catalog fallback is requested", async () => {
  const wishlist = await loadSteamWishlist("1", "CN", 1, ["CN", "JP"]);
  assert.equal(wishlist.games[0].title, "App 1");
  assert.equal(wishlist.games[0].delisted, true);
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], pricedIds(wishlist), wishlist);
  assert.equal(prices.get("CN")?.size, 0);
  assert.equal(prices.get("JP")?.size, 0);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "CN" }, { kind: "wishlist", country: "JP" }]);
});

test("US as the home country never triggers an implicit CN fallback", async () => {
  regional.JP = [item(1, "JP")];
  const wishlist = await loadSteamWishlist("1", "US", 1, ["US", "JP"]);
  assert.equal(wishlist.games[0].delisted, false);
  assert.deepEqual(requests, [{ kind: "ids" }, { kind: "wishlist", country: "US" }, { kind: "wishlist", country: "JP" }]);
});

test("missing prices in reused data are checked by ID only in that same selected country", async () => {
  byId.JP = [item(2, "JP")];
  const options = { refreshed: true, addedAppids: [], countryItems: new Map([
    ["JP", new Map([[1, item(1, "JP")]])],
  ]) };
  assert.equal(estimateCountryFillRequests(["JP"], [1, 2], options, "", 2), 1);
  const prices = await loadSteamCountryPrices("1", ["JP"], [1, 2], options);
  assert.equal(prices.get("JP")?.size, 2);
  assert.deepEqual(requests, [{ kind: "items", country: "JP", ids: [2] }]);
});

test("opening request estimates do not reserve a mandatory US wishlist or catalog fallback", () => {
  cacheSet(fxCacheKey, {});
  assert.equal(estimateOpeningRequests("1", "CN", 4001), 4);
  assert.equal(estimateOpeningRequests("1", "US", 4001), 4);
});
