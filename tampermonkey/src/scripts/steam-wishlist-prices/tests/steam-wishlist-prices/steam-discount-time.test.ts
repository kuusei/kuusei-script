import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { priceCacheKey } from "../../cache/cache";
import { formatDiscountEnd, gameDiscountEnd } from "../../pricing/discount-time";
import { buildGameRows } from "../../pricing/price-rows";
import { steamListHtml, type SteamGameCard } from "../../ui/steam-list";
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
  refreshed: false, addedAppids: [],
  countryItems: new Map(),
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

test("personalized bundles never replace the standalone price or produce a false new low", async () => {
  const appid = 3636770;
  const standalone = {
    packageid: 1281884, final_price_in_cents: "29000", original_price_in_cents: "41500",
    formatted_final_price: "₹290.00", discount_pct: 30,
    active_discounts: [{ discount_end_date: endsAt }],
  };
  const bundle = {
    bundleid: 3669, final_price_in_cents: "24600", original_price_in_cents: "35275",
    formatted_final_price: "₹246.00", discount_pct: 30,
    active_discounts: [{ discount_end_date: endsAt - 3600 }],
  };
  const bundledItem = { appid, best_purchase_option: bundle, purchase_options: [bundle, standalone] };
  const expected = {
    amount: 290, regular: 415, currency: "INR", cut: 30, discountEndsAt: endsAt * 1000,
    bundle: { amount: 246, currency: "INR", name: "捆绑包" },
  };
  respondWith([bundledItem]);
  assert.deepEqual((await fetchAppIdPrices("IN", [appid], "")).get(appid), expected);
  // Reused wishlist data and a freshly fetched regional wishlist use the same rule.
  for (const refreshed of [true, false]) {
    storage.clear();
    storage.set("wl-price:v2:IN", { [appid]: { savedAt: Date.now(), deal: { ...expected, amount: 246 } } });
    let requests = 0;
    globalThis.fetch = (async (raw: string | URL | Request) => {
      const url = new URL(String(raw));
      if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
      assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
      requests += 1;
      return Response.json({ response: { items: [{ appid, store_item: bundledItem }] } });
    }) as typeof fetch;
    const prices = await loadSteamCountryPrices("1", ["IN"], [appid], {
      ...options, refreshed,
      countryItems: refreshed ? new Map([["IN", new Map([[appid, bundledItem]])]]) : new Map(),
    });
    assert.equal(requests, refreshed ? 0 : 1);
    assert.deepEqual(prices.get("IN")?.get(appid), expected);
    const rows = buildGameRows([{
      appid, title: "Servant of the Lake", capsule: "", releasedAt: null,
      free: false, comingSoon: false, delisted: false,
    }], prices, [{ code: "IN", label: "印度", group: "base" }], {
      fetchedAt: "", usdTo: { CNY: 7, INR: 84 },
    }, new Map([[appid, { amount: 290, currency: "INR", country: "IN", recordedAt: "2026-10-02" }]]));
    assert.equal(rows[0].itadNewLow, false);
  }
});

test("bundle minimum is exposed only when it is below the standalone price", async () => {
  const appid = item.appid;
  const standalone = { ...item.best_purchase_option, packageid: 1 };
  const cheaperBundle = { ...item.best_purchase_option, bundleid: 2,
    final_price_in_cents: "5000", formatted_final_price: "¥50.00", purchase_option_name: "合集" };
  respondWith([{ ...item, best_purchase_option: standalone,
    purchase_options: [standalone, cheaperBundle] }]);
  const deal = (await fetchAppIdPrices("CN", [appid], "")).get(appid);
  assert.deepEqual(deal?.bundle, { amount: 50, currency: "CNY", name: "合集" });
  respondWith([{ ...item, best_purchase_option: standalone,
    purchase_options: [standalone, { ...cheaperBundle, final_price_in_cents: "7000" }] }]);
  assert.equal((await fetchAppIdPrices("CN", [appid], "")).get(appid)?.bundle, undefined);
  const rows = buildGameRows([{
    appid, title: "Game", capsule: "", releasedAt: null,
    free: false, comingSoon: false, delisted: false,
  }], new Map([["CN", new Map([[appid, {
    ...deal!, bundle: { amount: 50, currency: "CNY", name: "合集" },
  }]])]]), [{ code: "CN", label: "中国", group: "base" }], {
    fetchedAt: "", usdTo: { CNY: 7 },
  });
  const card: SteamGameCard = {
    appid, title: "Game", capsule: "", released: "", status: "", vsHome: "",
    cheapestLabel: "最低", cheapest: "¥50", discountEnd: null,
    chips: [{ label: "中国", cny: "¥70", local: "70 CNY", cut: 60, band: "", gift: false,
      bundle: { cny: "¥50", local: "50 CNY", name: "合集" } }],
  };
  assert.match(steamListHtml([card]), /wl-disc-bundle/);
  assert.equal(rows[0].prices.CN.bundle?.cny, 50);
});

test("DLC and coin packages cannot replace the Steam game's discounted base package", async () => {
  const appid = 418370;
  const base = {
    packageid: 131416, purchase_option_name: "RESIDENT EVIL 7", included_game_count: 1,
    final_price_in_cents: "43900", original_price_in_cents: "109900",
    formatted_final_price: "₹439.00", discount_pct: 60,
  };
  const dlc = {
    packageid: 1012983, purchase_option_name: "5-Coin Set & Madhouse Mode Unlock",
    included_game_count: 0, final_price_in_cents: "13200", formatted_final_price: "₹132.00",
  };
  respondWith([{ appid, best_purchase_option: base, purchase_options: [base, dlc] }]);
  assert.deepEqual((await fetchAppIdPrices("IN", [appid], "")).get(appid), {
    amount: 439, regular: 1099, currency: "INR", cut: 60, discountEndsAt: null,
  });
});

test("non-bundle purchase options choose the lowest valid offer; bundle-only games have no standalone price", async () => {
  const offer = { ...item.best_purchase_option, packageid: 1 };
  respondWith([{ ...item, best_purchase_option: { ...offer, bundleid: 10, final_price_in_cents: "100" },
    purchase_options: [
      { ...offer, final_price_in_cents: "9000" },
      { ...offer, final_price_in_cents: "invalid" },
      { ...offer, bundleid: 20, final_price_in_cents: "1000" },
      offer,
    ],
  }]);
  assert.equal((await fetchAppIdPrices("CN", [item.appid], "")).get(item.appid)?.amount, 70);
  respondWith([{ ...item, best_purchase_option: { ...offer, bundleid: 10 },
    purchase_options: [{ ...offer, bundleid: 10 }],
  }]);
  assert.equal((await fetchAppIdPrices("CN", [item.appid], "")).has(item.appid), false);
});

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

test("Kazakhstan, Vietnam and CIS keep their native amounts and currencies", async () => {
  for (const [country, cents, formatted, amount, currency] of [
    ["KZ", "549900", "5 499₸", 5499, "KZT"],
    ["VN", "12000000", "120.000₫", 120000, "VND"],
    ["AZ", "499", "$4.99", 4.99, "USD"],
  ] as const) {
    // Currency also remains correct if Steam omits its formatted price.
    for (const priceText of [formatted, undefined]) {
      respondWith([{ ...item, best_purchase_option: {
        ...item.best_purchase_option,
        final_price_in_cents: cents,
        formatted_final_price: priceText,
      } }]);
      const deal = (await fetchAppIdPrices(country, [item.appid], "")).get(item.appid);
      assert.equal(deal?.amount, amount);
      assert.equal(deal?.currency, currency);
    }
  }
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
      [item.appid]: { savedAt: Date.now(), deal: {
        amount: 70, regular: 175, currency: "CNY", cut: 60, discountEndsAt: deadline,
      } },
    });
    assert.equal(estimateCountryFillRequests(["CN"], [item.appid], options, "", 1), expected);
  }
});

test("wishlist prices keep each country's actual price, discount and deadline independently", async () => {
  const jpEnd = Math.floor(Date.now() / 1000) + 7200;
  const jpItem = { ...item, best_purchase_option: {
    final_price_in_cents: "12300", original_price_in_cents: "20000", formatted_final_price: "¥123",
    discount_pct: 40, active_discounts: [{ discount_end_date: jpEnd }],
  } };
  storage.set(priceCacheKey("JP"), {
    [item.appid]: { savedAt: Date.now(), deal: {
      amount: 100, regular: 200, currency: "JPY", cut: 50, discountEndsAt: Date.now() + 3600000,
    } },
  });
  const unrelated = { [item.appid]: { savedAt: Date.now(), deal: { amount: 99, regular: 120, currency: "USD", cut: 17, discountEndsAt: null } } };
  storage.set(priceCacheKey("US"), unrelated);
  const requests: string[] = [];
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
    assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
    const input = JSON.parse(url.searchParams.get("input_json")!);
    requests.push(input.context.country_code);
    return Response.json({ response: { items: [{ appid: item.appid, store_item: jpItem }] } });
  }) as typeof fetch;
  const priceOptions = { ...options, refreshed: true, countryItems: new Map([["CN", new Map([[item.appid, item]])]]) };
  assert.equal(estimateCountryFillRequests(["CN", "JP"], [item.appid], priceOptions, "", 1), 1);
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], [item.appid], {
    ...priceOptions,
  });
  assert.deepEqual(requests, ["JP"]);
  assert.equal(prices.get("CN")?.get(item.appid)?.discountEndsAt, endsAt * 1000);
  assert.equal(prices.get("JP")?.get(item.appid)?.discountEndsAt, jpEnd * 1000);
  assert.equal(prices.get("JP")?.get(item.appid)?.cut, 40);
  assert.equal(prices.get("JP")?.get(item.appid)?.amount, 123);
  assert.deepEqual(storage.get(priceCacheKey("US")), unrelated);
});

test("regional actual prices are cached for one hour and then re-read from that region's wishlist", async () => {
  for (const [age, expectedRequests] of [[60 * 60000, 1], [59 * 60000, 0]]) {
    storage.clear();
    storage.set(priceCacheKey("JP"), {
      [item.appid]: { savedAt: Date.now() - age, deal: {
        amount: 80, regular: 200, currency: "JPY", cut: 60, discountEndsAt: null,
      } },
    });
    const priceOptions = {
      ...options,
    };
    assert.equal(estimateCountryFillRequests(["JP"], [item.appid], priceOptions, "", 1), expectedRequests);
    const requests: string[] = [];
    globalThis.fetch = (async (raw: string | URL | Request) => {
      const url = new URL(String(raw));
      if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
      const input = JSON.parse(url.searchParams.get("input_json")!);
      assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
      requests.push(input.context.country_code);
      return Response.json({ response: { items: [{ appid: item.appid, store_item: item }] } });
    }) as typeof fetch;
    const prices = await loadSteamCountryPrices("1", ["JP"], [item.appid], priceOptions);
    assert.deepEqual(requests, expectedRequests ? ["JP"] : []);
    assert.equal(prices.get("JP")?.get(item.appid)?.regular, expectedRequests ? 175 : 200);
  }
});

test("re-added games still retry a recent no-price cache", () => {
  storage.set(priceCacheKey("JP"), {
    [item.appid]: { savedAt: Date.now(), deal: null },
  });
  assert.equal(estimateCountryFillRequests(["JP"], [item.appid], {
    ...options, refreshed: true, addedAppids: [item.appid],
  }, "", 1), 1);
});

test("old reconstructed caches are ignored and INR keeps Steam's final amount instead of applying the percentage", async () => {
  const appid = 2531310;
  storage.set("wl-price:IN", { [appid]: { regularAt: Date.now(), cutAt: Date.now(), deal: {
    amount: 2210.33, regular: 3299, currency: "INR", cut: 33, discountEndsAt: null,
  } } });
  const requests: string[] = [];
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
    assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
    const input = JSON.parse(url.searchParams.get("input_json")!);
    requests.push(input.context.country_code);
    return Response.json({ response: { items: [{ appid, store_item: {
      appid, best_purchase_option: {
        final_price_in_cents: "221000", original_price_in_cents: "329900",
        formatted_final_price: "₹ 2,210", discount_pct: 33,
      },
    } }] } });
  }) as typeof fetch;
  assert.equal(estimateCountryFillRequests(["IN"], [appid], options, "", 1), 1);
  const prices = await loadSteamCountryPrices("1", ["IN"], [appid], options);
  assert.deepEqual(requests, ["IN"]);
  assert.deepEqual(prices.get("IN")?.get(appid), {
    amount: 2210, regular: 3299, currency: "INR", cut: 33, discountEndsAt: null,
  });
});

test("a regional price disappearing clears cached offers without borrowing another region's price", async () => {
  const appid = item.appid;
  storage.set(priceCacheKey("JP"), { [appid]: { savedAt: Date.now(), deal: {
    amount: 100, regular: 200, currency: "JPY", cut: 50, discountEndsAt: null,
  } } });
  let wishlistRequests = 0;
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
    assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
    wishlistRequests += 1;
    return Response.json({ response: { items: [{ appid, store_item: {
      ...item, unvailable_for_country_restriction: true,
    } }] } });
  }) as typeof fetch;
  const prices = await loadSteamCountryPrices("1", ["CN", "JP"], [appid], {
    ...options, refreshed: true, countryItems: new Map([["CN", new Map([[appid, item]])]]),
  });
  assert.equal(prices.get("CN")?.get(appid)?.amount, 70);
  assert.equal(prices.get("JP")?.has(appid), false);
  assert.equal((storage.get(priceCacheKey("JP")) as any)[appid].deal, null);
  await loadSteamCountryPrices("1", ["JP"], [appid], options);
  assert.equal(wishlistRequests, 1);
});

test("large regional wishlists use all pages and the request estimate follows page count", async () => {
  const appids = Array.from({ length: 4001 }, (_, index) => index + 1);
  const pages: number[] = [];
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
    assert.ok(url.pathname.includes("GetWishlistSortedFiltered"));
    const input = JSON.parse(url.searchParams.get("input_json")!);
    assert.equal(input.context.country_code, "IN");
    pages.push(input.start_index);
    return Response.json({ response: { items: appids.map((appid, index) => ({
      appid,
      ...(index >= input.start_index && index < input.start_index + input.page_size
        ? { store_item: { ...item, appid, best_purchase_option: { ...item.best_purchase_option, active_discounts: [] } } }
        : {}),
    })) } });
  }) as typeof fetch;
  assert.equal(estimateCountryFillRequests(["IN", "IN"], appids, options, "", 4001), 3);
  const prices = await loadSteamCountryPrices("1", ["IN"], appids, options, undefined, 4001);
  assert.deepEqual(pages, [0, 2000, 4000]);
  assert.equal(prices.get("IN")?.size, 4001);
});

test("games absent from a regional wishlist are checked by ID in that same country", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (raw: string | URL | Request) => {
    const url = new URL(String(raw));
    if (url.pathname.includes("ajaxgetasyncconfig")) return Response.json({ data: {} });
    const input = JSON.parse(url.searchParams.get("input_json")!);
    assert.equal(input.context.country_code, "IN");
    if (url.pathname.includes("GetWishlistSortedFiltered")) {
      requests.push("wishlist");
      return Response.json({ response: { items: [] } });
    }
    requests.push("items");
    return Response.json({ response: { store_items: [item] } });
  }) as typeof fetch;
  const prices = await loadSteamCountryPrices("1", ["IN"], [item.appid], options);
  assert.deepEqual(requests, ["wishlist", "items"]);
  assert.equal(prices.get("IN")?.get(item.appid)?.currency, "INR");
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
  const card: SteamGameCard = {
    appid: item.appid, title: "Game", capsule: "", released: "", status: "",
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
