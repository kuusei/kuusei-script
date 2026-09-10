import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { priceCacheKey } from "../../cache/cache";
import { formatDiscountEnd, gameDiscountEnd } from "../../pricing/discount-time";
import { buildGameRows } from "../../pricing/price-rows";
import { steamListHtml } from "../../ui/steam-list";
import {
  estimateCountryFillRequests,
  fetchAppIdPrices,
  loadSteamCountryPrices,
} from "../../pricing/steam-prices";

const storage = new Map<string, unknown>();
const originalFetch = globalThis.fetch;
const endsAt = 1790010000;
const item = {
  appid: 275850,
  best_purchase_option: {
    final_price_in_cents: "7000",
    original_price_in_cents: "17500",
    formatted_final_price: "¥70.00",
    discount_pct: 60,
    active_discounts: [{ discount_end_date: endsAt }],
  },
};
const options = {
  home: "CN", refreshed: false, addedAppids: [],
  homeItems: new Map(), usItems: new Map(),
};

beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    GM_getValue: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    GM_setValue: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    document: { getElementById: () => null },
  });
});
afterEach(() => { globalThis.fetch = originalFetch; });

const respondWith = (items: unknown[]) => {
  globalThis.fetch = (async () => Response.json({ response: { store_items: items } })) as typeof fetch;
};

test("Steam response keeps the earliest valid discount end in milliseconds", async () => {
  respondWith([{ ...item, best_purchase_option: {
    ...item.best_purchase_option,
    active_discounts: [
      { discount_end_date: endsAt + 3600 }, { discount_end_date: endsAt },
      { discount_end_date: 0 }, { discount_end_date: -1 },
      { discount_end_date: 1.5 }, { discount_end_date: 0x100000000 }, {},
    ],
  } }]);
  const deals = await fetchAppIdPrices("CN", [item.appid], "");
  assert.equal(deals.get(item.appid)?.discountEndsAt, endsAt * 1000);
  assert.equal(deals.get(item.appid)?.amount, 70);
});

test("missing end dates and regular-price items do not invent deadlines", async () => {
  for (const best of [
    { ...item.best_purchase_option, active_discounts: [] },
    { ...item.best_purchase_option, discount_pct: 0 },
  ]) {
    respondWith([{ ...item, best_purchase_option: best }]);
    assert.equal((await fetchAppIdPrices("CN", [item.appid], "")).get(item.appid)?.discountEndsAt, null);
  }
});

test("legacy and expired cached prices request refresh; known missing dates stay cached", () => {
  for (const [deadline, expected] of [[undefined, 1], [Date.now() - 1000, 1], [null, 0], [Date.now() + 3600000, 0]] as const) {
    storage.set(priceCacheKey("CN"), {
      [item.appid]: { regularAt: Date.now(), cutAt: Date.now(), deal: {
        amount: 70, regular: 175, currency: "CNY", cut: 60, discountEndsAt: deadline,
      } },
    });
    assert.equal(estimateCountryFillRequests(["CN"], [item.appid], options, "", 1), expected);
  }
});

test("cross-region discount changes clear regional deadlines without copying the source date", async () => {
  storage.set(priceCacheKey("JP"), {
    [item.appid]: { regularAt: Date.now(), cutAt: Date.now(), deal: {
      amount: 100, regular: 200, currency: "JPY", cut: 50, discountEndsAt: Date.now() + 3600000,
    } },
  });
  // The only HTTP request here reads the optional public Web API config.
  globalThis.fetch = (async () => Response.json({ data: { webapi_token: "" } })) as typeof fetch;
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], [item.appid], {
    ...options, refreshed: true, homeItems: new Map([[item.appid, item]]),
  });
  assert.equal(prices.get("CN")?.get(item.appid)?.discountEndsAt, endsAt * 1000);
  assert.equal(prices.get("JP")?.get(item.appid)?.discountEndsAt, null);
  assert.equal(prices.get("JP")?.get(item.appid)?.cut, 60);
});

test("re-added games refresh expired regional original prices on the first open", async () => {
  for (const [age, expectedRequests] of [[6 * 86400000, 1], [4 * 86400000, 0]]) {
    storage.clear();
    storage.set(priceCacheKey("JP"), {
      [item.appid]: { regularAt: Date.now() - age, cutAt: Date.now(), deal: {
        amount: 80, regular: 200, currency: "JPY", cut: 60, discountEndsAt: null,
      } },
    });
    const priceOptions = {
      ...options, refreshed: true, addedAppids: [item.appid],
      homeItems: new Map([[item.appid, item]]), usItems: new Map([[item.appid, item]]),
    };
    assert.equal(estimateCountryFillRequests(["CN", "US", "JP"], [item.appid], priceOptions, "", 1), expectedRequests);
    const requests: string[] = [];
    globalThis.fetch = (async (raw: string | URL | Request) => {
      const url = new URL(String(raw));
      if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
      const input = JSON.parse(url.searchParams.get("input_json")!);
      assert.deepEqual(input.ids, [{ appid: item.appid }]);
      requests.push(input.context.country_code);
      return Response.json({ response: { store_items: [item] } });
    }) as typeof fetch;
    const prices = await loadSteamCountryPrices("1", ["CN", "US", "JP"], [item.appid], priceOptions);
    assert.deepEqual(requests, expectedRequests ? ["JP"] : []);
    assert.equal(prices.get("JP")?.get(item.appid)?.regular, expectedRequests ? 175 : 200);
  }
});

test("re-added games still retry a recent no-price cache", () => {
  storage.set(priceCacheKey("JP"), {
    [item.appid]: { regularAt: Date.now(), cutAt: 0, deal: null },
  });
  assert.equal(estimateCountryFillRequests(["JP"], [item.appid], {
    ...options, refreshed: true, addedAppids: [item.appid],
  }, "", 1), 1);
});

test("price rows and cards display the confirmed Beijing date and hide absent dates", async () => {
  respondWith([item]);
  const deals = await fetchAppIdPrices("CN", [item.appid], "");
  const rows = buildGameRows([{
    appid: item.appid, title: "No Man's Sky", capsule: "", releasedAt: null,
    free: false, comingSoon: false, delisted: false,
  }], new Map([["CN", deals]]), [{ code: "CN", label: "中国", group: "base" }], {
    fetchedAt: "", usdTo: { CNY: 7 },
  });
  const discountEnd = formatDiscountEnd(rows[0].prices.CN.discountEndsAt);
  assert.deepEqual(discountEnd, { label: "折扣截止", when: "2026/09/22 01:00", timeZone: "北京时间" });
  assert.equal(formatDiscountEnd(endsAt * 1000, "en-US")?.label, "Sale ends");
  assert.equal(formatDiscountEnd(null), null);
  assert.equal(formatDiscountEnd(NaN), null);
  const card = {
    appid: item.appid, title: "Game", capsule: "", meta: "", status: "",
    vsHome: "相对南亚 51.3%", cheapestLabel: "最低", cheapest: "印度 70", discountEnd, chips: [{
      label: "中国", cny: "¥70", local: "70 CNY", cut: 60,
      band: "" as const, gift: false,
    }],
  };
  card.chips.push({ ...card.chips[0], label: "南亚" });
  const html = steamListHtml([card]);
  assert.equal(html.match(/wl-row-discount-end/g)?.length, 1);
  assert.match(html, /相对南亚 51.3%<\/span><span class="wl-row-discount-end">/);
  const price = rows[0].prices.CN;
  assert.equal(gameDiscountEnd({ CN: price, PK: { ...price, discountEndsAt: endsAt * 1000 + 3600000 } }, "PK"), endsAt * 1000 + 3600000);
  assert.equal(gameDiscountEnd({ CN: price, PK: { ...price, discountEndsAt: null } }, "PK"), endsAt * 1000);
  assert.equal(gameDiscountEnd({ CN: { ...price, cut: 0 } }, "CN"), null);
  card.discountEnd = null;
  assert.doesNotMatch(steamListHtml([card]), /wl-row-discount-end/);
});
