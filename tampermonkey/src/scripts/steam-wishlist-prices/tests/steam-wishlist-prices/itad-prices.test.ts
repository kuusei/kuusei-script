import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { loadItadApiKey, loadItadSteamLows, saveItadApiKey } from "../../pricing/itad-prices";
import { buildGameRows, historyLowFor } from "../../pricing/price-rows";
import { steamListHtml } from "../../ui/steam-list";
import { renderReportShell } from "../../ui/report-html";
import { mountReport } from "../../ui/report-client";
import { saveRegionSetup } from "../../ui/region-settings";
import type { ReportPayload } from "../../ui/report-html";
import { COUNTRIES } from "../../config";

const storage = new Map<string, unknown>();
const originalFetch = globalThis.fetch;
const originalGm = globalThis.GM_xmlhttpRequest;
const realNow = Date.now;
const id1 = "018d937f-012f-73b8-ab2c-898516969e6a";
const id2 = "018d937f-012f-73b8-ab2c-898516969e6b";
const calls: { url: string; body: string[]; headers: Record<string, string> }[] = [];
let respond: (url: string, body: string[]) => Response;
let pricesRespond: (url: string, body: string[]) => Response;
const low = (amount: number, currency: string, shop = 61) => ({
  shop: { id: shop, name: shop === 61 ? "Steam" : "Another shop" },
  price: { amount, currency }, timestamp: "2026-09-10T01:00:00Z",
});
const rates = { fetchedAt: "2026-10-07T00:00:00Z", usdTo: { CNY: 7 } };

const reportHarness = (absent: string[] = []) => {
  const local = new Map<string, string>();
  Object.assign(globalThis, { localStorage: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  } });
  const nodes = new Map<string, any>();
  const root = { querySelector: (id: string) => {
    if (absent.includes(id)) return null;
    if (!nodes.has(id)) nodes.set(id, {
      textContent: "", innerHTML: "", className: "", checked: false,
      classList: { add: () => {}, remove: () => {} },
      querySelectorAll: () => [],
      events: new Map(),
      addEventListener(name: string, fn: (event: any) => void) { this.events.set(name, fn); },
    });
    return nodes.get(id);
  }, addEventListener: () => {} } as unknown as ParentNode;
  return { root, nodes };
};

beforeEach(() => {
  storage.clear();
  calls.length = 0;
  pricesRespond = () => Response.json([]);
  Object.assign(globalThis, {
    GM_getValue: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    GM_setValue: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    GM_xmlhttpRequest: undefined,
  });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as string[];
    calls.push({ url: String(url), body, headers: init?.headers as Record<string, string> });
    return String(url).includes("/games/prices/v3") ? pricesRespond(String(url), body) : respond(String(url), body);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.GM_xmlhttpRequest = originalGm;
  Date.now = realNow;
});

test("missing API key disables ITAD without making requests; keys are trimmed", async () => {
  assert.equal((await loadItadSteamLows([220], "CN")).enabled, false);
  assert.equal(calls.length, 0);
  saveItadApiKey("  private-key  ");
  assert.equal(loadItadApiKey(), "private-key");
  saveItadApiKey("   ");
  assert.equal(loadItadApiKey(), "");
});

test("home Steam low wins over cheaper shops; missing games stay missing despite cached US data", async () => {
  storage.set("wishlist-itad-steam-low-v1:US", {
    [id2]: { savedAt: Date.now(), value: { amount: 3, currency: "USD", country: "US", recordedAt: null } },
  });
  respond = (url, body) => {
    if (url.includes("/lookup/")) {
      assert.deepEqual(body, ["app/220", "app/440"]);
      return Response.json({ "app/220": id1, "app/440": id2 });
    }
    assert.equal(new URL(url).searchParams.get("shops"), "61");
    assert.equal(new URL(url).searchParams.get("country"), "CN");
    return Response.json([
      { id: id1, lows: [low(1, "CNY", 35), low(20, "CNY")] },
      { id: id2, lows: [] },
    ]);
  };
  const result = await loadItadSteamLows([220, 440, 220], "CN", "secret");
  assert.equal(result.warning, null);
  assert.equal(result.lows.get(220)?.amount, 20);
  assert.equal(result.lows.get(220)?.country, "CN");
  assert.equal(result.lows.has(440), false);
  assert.equal(result.lows.get(220)?.recordedAt, "2026-09-10T01:00:00Z");
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.headers["ITAD-API-Key"], "secret");
    assert.ok(!call.url.includes("secret"));
  }
  await loadItadSteamLows([220, 440], "CN", "secret");
  assert.equal(calls.length, 3);
});

test("zero is a valid low when US is the selected home", async () => {
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: [low(0, "USD")] }]);
  const result = await loadItadSteamLows([220], "US", "key");
  assert.equal(result.lows.get(220)?.amount, 0);
  assert.equal(calls.length, 3);
});

test("game misses and empty regional results are cached with their own expiry", async () => {
  let now = 1800000000000;
  Date.now = () => now;
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1, "app/440": null }) : Response.json([]);
  assert.equal((await loadItadSteamLows([220, 440], "CN", "key")).lows.size, 0);
  await loadItadSteamLows([220, 440], "CN", "key");
  assert.equal(calls.length, 3);
  now += 60 * 60 * 1000;
  await loadItadSteamLows([220, 440], "CN", "key");
  assert.equal(calls.length, 5);
  now += 24 * 60 * 60 * 1000;
  await loadItadSteamLows([220, 440], "CN", "key");
  assert.deepEqual(calls[5].body, ["app/440"]);
});

test("changing country loads a separate regional low instead of reusing home data", async () => {
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: [url.includes("country=CN") ? low(20, "CNY") : low(4, "USD")] }]);
  await loadItadSteamLows([220], "CN", "key");
  const result = await loadItadSteamLows([220], "US", "key");
  assert.equal(result.lows.get(220)?.amount, 4);
  assert.equal(result.lows.get(220)?.country, "US");
  assert.equal(calls.length, 5);
});

test("home request failure stays missing and is retried rather than cached as a miss", async () => {
  respond = (url) => {
    if (url.includes("/lookup/")) return Response.json({ "app/220": id1 });
    assert.equal(new URL(url).searchParams.get("country"), "CN");
    return new Response("error", { status: 500 });
  };
  const result = await loadItadSteamLows([220], "CN", "key");
  assert.match(result.warning ?? "", /HTTP 500/);
  assert.equal(result.lows.size, 0);
  assert.equal(calls.length, 3);
  await loadItadSteamLows([220], "CN", "key");
  assert.equal(calls.length, 4);
  assert.ok(calls[3].url.includes("country=CN"));
});

test("authentication and rate limit failures stop further requests and never expose a key", async () => {
  for (const status of [401, 403, 429]) {
    calls.length = 0;
    respond = () => new Response("private-key", { status });
    const result = await loadItadSteamLows([220], "CN", "private-key");
    assert.equal(calls.length, 1);
    assert.equal(result.lows.size, 0);
    assert.ok(result.warning);
    assert.ok(!result.warning.includes("private-key"));
  }
});

test("GM HTTP errors and timeouts are handled without rejecting the price report", async () => {
  Object.assign(globalThis, { GM_xmlhttpRequest: (options: any) => options.onload({ status: 403, responseText: "secret" }) });
  assert.match((await loadItadSteamLows([220], "CN", "secret")).warning ?? "", /API Key/);
  Object.assign(globalThis, { GM_xmlhttpRequest: (options: any) => options.ontimeout() });
  assert.match((await loadItadSteamLows([220], "CN", "secret")).warning ?? "", /超时/);
});

test("lookup, store-low and quote requests never exceed 200 IDs and successful batches survive a later failure", async () => {
  const ids = Array.from({ length: 201 }, (_, i) => i + 1);
  respond = (url, body) => {
    assert.ok(body.length <= 200);
    if (url.includes("/lookup/")) return Response.json(Object.fromEntries(body.map((shopId) => {
      const appid = Number(shopId.split("/")[1]);
      return [shopId, `${id1.slice(0, -12)}${appid.toString(16).padStart(12, "0")}`];
    })));
    if (body.length === 1) return new Response("error", { status: 500 });
    return Response.json(body.map((id) => ({ id, lows: [low(5, "USD")] })));
  };
  pricesRespond = (url, body) => {
    assert.equal(new URL(url).searchParams.get("country"), "US");
    assert.equal(new URL(url).searchParams.get("shops"), "61");
    assert.ok(body.length <= 200);
    if (body.length === 1) return new Response("error", { status: 500 });
    return Response.json(body.map((id) => ({ id, deals: [{ ...low(5, "USD"), flag: "N" }] })));
  };
  const result = await loadItadSteamLows(ids, "US", "key");
  assert.equal(result.lows.size, 200);
  assert.equal(result.deals.size, 200);
  assert.match(result.warning ?? "", /HTTP 500/);
  assert.deepEqual(calls.map((call) => call.body.length), [200, 1, 200, 1, 200, 1]);
});

test("quotes select Steam in the home country and cache flags independently from historical records", async () => {
  let now = 1800000000000;
  Date.now = () => now;
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1, "app/440": id2 }) : Response.json([]);
  pricesRespond = (url) => {
    assert.equal(new URL(url).searchParams.get("country"), "CN");
    assert.equal(new URL(url).searchParams.get("shops"), "61");
    return Response.json([
      { id: id1, deals: [{ ...low(1, "CNY", 35), flag: "N" }, { ...low(20, "CNY"), flag: "N" }] },
      { id: id2, deals: [{ ...low(2, "CNY", 35), flag: "N" }] },
    ]);
  };
  const result = await loadItadSteamLows([220, 440], "CN", "key");
  assert.equal(result.lows.size, 0);
  assert.deepEqual(result.deals.get(220), { amount: 20, currency: "CNY", country: "CN", flag: "N" });
  assert.equal(result.deals.has(440), false);
  assert.equal(result.warning, null);
  await loadItadSteamLows([220, 440], "CN", "key");
  assert.equal(calls.length, 3);
  now += 60 * 60 * 1000;
  pricesRespond = () => Response.json([{ id: id1, deals: [{ ...low(20, "CNY"), flag: "H" }] }]);
  assert.equal((await loadItadSteamLows([220, 440], "CN", "key")).deals.get(220)?.flag, "H");
  assert.equal(calls.length, 5);
});

test("quote failures keep historical lows, are retried, and rate limits stop subsequent requests", async () => {
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 }) : Response.json([{ id: id1, lows: [low(20, "CNY")] }]);
  pricesRespond = () => new Response("error", { status: 500 });
  const result = await loadItadSteamLows([220], "CN", "key");
  assert.equal(result.lows.get(220)?.amount, 20);
  assert.equal(result.deals.size, 0);
  assert.match(result.warning ?? "", /HTTP 500/);
  pricesRespond = () => Response.json([{ id: id1, deals: [{ ...low(20, "CNY"), flag: "N" }] }]);
  assert.equal((await loadItadSteamLows([220], "CN", "key")).deals.get(220)?.flag, "N");
  assert.equal(calls.length, 4);
  storage.clear();
  calls.length = 0;
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 }) : new Response("error", { status: 429 });
  assert.match((await loadItadSteamLows([220], "CN", "key")).warning ?? "", /限额/);
  assert.equal(calls.length, 2);
});

test("persisted lows skip every ITAD endpoint for equal or higher prices even after mapping expiry", async () => {
  let now = 1800000000000;
  Date.now = () => now;
  let current = 20;
  let historical = 20;
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 }) : Response.json([{ id: id1, lows: [low(historical, "CNY")] }]);
  pricesRespond = () => Response.json([{ id: id1, deals: [{ ...low(current, "CNY"), flag: "N" }] }]);
  const load = () => loadItadSteamLows([220], "CN", "key", () => {}, new Map([[220, { amount: current, currency: "CNY" }]]));
  await load();
  assert.equal(calls.length, 3);
  now += 40 * 24 * 60 * 60 * 1000;
  current = 25;
  let result = await load();
  assert.equal(result.lows.get(220)?.amount, 20);
  assert.equal(result.deals.size, 0);
  assert.equal(result.warning, null);
  assert.equal(calls.length, 3);
  current = 20;
  await load();
  assert.equal(calls.length, 3);
  current = historical = 19;
  result = await load();
  assert.equal(result.lows.get(220)?.amount, 19);
  assert.equal(result.deals.get(220)?.flag, "N");
  assert.equal(calls.length, 6);
  await load();
  assert.equal(calls.length, 6);
  current = historical = 18;
  assert.equal((await load()).lows.get(220)?.amount, 18);
  assert.equal(calls.length, 8);
});

test("confirmed new lows survive hourly expiry without requests, and changed or ended offers clear the marker permanently", async () => {
  const hour = 60 * 60 * 1000;
  for (const change of ["price", "sale", "expired"] as const) {
    storage.clear();
    calls.length = 0;
    let now = 1800000000000;
    Date.now = () => now;
    const deadline = now + 24 * hour;
    let current = { amount: 20, currency: "CNY", discountEndsAt: deadline };
    respond = (url) => url.includes("/lookup/")
      ? Response.json({ "app/220": id1 }) : Response.json([{ id: id1, lows: [low(20, "CNY")] }]);
    pricesRespond = () => Response.json([{ id: id1, deals: [{ ...low(20, "CNY"), flag: "N" }] }]);
    const load = () => loadItadSteamLows([220], "CN", "key", () => {}, new Map([[220, current]]));
    await load();
    now += 2 * hour;
    let result = await load();
    assert.equal(result.deals.get(220)?.flag, "N");
    assert.equal(calls.length, 3);
    const rows = buildGameRows([{
      appid: 220, title: "Game", capsule: "", releasedAt: null,
      free: false, comingSoon: false, delisted: false,
    }], new Map([["CN", new Map([[220, { ...current, regular: 40, cut: 50 }]])]]),
    [{ code: "CN", label: "中国", group: "base" }], rates, result.lows, result.deals);
    assert.equal(rows[0].itadNewLow, true);
    assert.equal(rows[0].historyLow?.atLow, true);
    if (change === "price") current = { ...current, amount: 25 };
    if (change === "sale") current = { ...current, discountEndsAt: deadline + hour };
    if (change === "expired") now = deadline;
    result = await load();
    assert.equal(result.deals.size, 0);
    assert.equal(result.lows.get(220)?.amount, 20);
    assert.equal(calls.length, 3);
    // Returning to the original price must not resurrect a cleared N flag.
    current = { amount: 20, currency: "CNY", discountEndsAt: deadline };
    assert.equal((await load()).deals.size, 0);
    assert.equal(calls.length, 3);
  }
});

test("only games below their saved low or without data are included in ITAD batches", async () => {
  respond = (url, body) => {
    if (url.includes("/lookup/")) return Response.json({ "app/220": id1, "app/440": id2 });
    return Response.json(body.map((id) => ({ id, lows: [low(id === id1 ? 20 : 30, "CNY")] })));
  };
  const prices = new Map([[220, { amount: 20, currency: "CNY" }], [440, { amount: 30, currency: "CNY" }]]);
  await loadItadSteamLows([220, 440], "CN", "key", () => {}, prices);
  calls.length = 0;
  prices.set(220, { amount: 25, currency: "CNY" });
  prices.set(440, { amount: 29, currency: "CNY" });
  const result = await loadItadSteamLows([220, 440], "CN", "key", () => {}, prices);
  assert.equal(result.lows.size, 2);
  assert.deepEqual(calls.map((call) => call.body), [[id2], [id2]]);
  // ITAD has not yet recorded the lower price: repeated opens at that price use the hourly cache.
  await loadItadSteamLows([220, 440], "CN", "key", () => {}, prices);
  assert.equal(calls.length, 2);
});

test("switching the main region clears history immediately even with ITAD disabled and cannot restore it", async () => {
  Object.assign(globalThis, { localStorage: { setItem: () => {} } });
  respond = (url) => url.includes("/lookup/")
    ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: [url.includes("country=CN") ? low(20, "CNY") : low(4, "USD")] }]);
  const homePrices = new Map([[220, { amount: 20, currency: "CNY" }]]);
  await loadItadSteamLows([220], "CN", "key", () => {}, homePrices);
  saveRegionSetup({ home: "CN", shown: ["CN", "US"] });
  assert.ok(Object.keys(storage.get("wishlist-itad-steam-low-v1:CN") as object).length > 0);
  saveRegionSetup({ home: "US", shown: ["US"] });
  assert.deepEqual(storage.get("wishlist-itad-steam-low-v1:CN"), {});
  assert.deepEqual(storage.get("wishlist-itad-steam-deal-v1:CN"), {});
  assert.equal((await loadItadSteamLows([220], "US", "")).enabled, false);
  await loadItadSteamLows([220], "US", "key", () => {}, new Map([[220, { amount: 4, currency: "USD" }]]));
  saveRegionSetup({ home: "CN", shown: ["CN"] });
  assert.deepEqual(storage.get("wishlist-itad-steam-low-v1:US"), {});
  const before = calls.length;
  const result = await loadItadSteamLows([220], "CN", "key", () => {}, homePrices);
  assert.equal(result.lows.get(220)?.amount, 20);
  assert.equal(calls.length, before + 2);
});

test("currency changes query again and temporarily missing or higher records cannot erase a saved minimum", async () => {
  let historical: ReturnType<typeof low> | null = low(20, "CNY");
  respond = (url) => url.includes("/lookup/") ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: historical ? [historical] : [] }]);
  const load = (amount: number, currency = "CNY") => loadItadSteamLows(
    [220], "CN", "key", () => {}, new Map([[220, { amount, currency }]]),
  );
  await load(20);
  historical = null;
  assert.equal((await load(19)).lows.get(220)?.amount, 20);
  historical = low(25, "CNY");
  assert.equal((await load(18)).lows.get(220)?.amount, 20);
  historical = low(10, "USD");
  const result = await load(30, "USD");
  assert.equal(result.lows.get(220)?.currency, "USD");
  assert.equal(result.lows.get(220)?.amount, 10);
  assert.equal(calls.length, 9);
  await load(30, "USD");
  assert.equal(calls.length, 9);
});

test("historical records remain visible after failed updates and zero lows suppress requests", async () => {
  let now = 1800000000000;
  Date.now = () => now;
  respond = (url) => url.includes("/lookup/") ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: [low(0, "CNY")] }]);
  await loadItadSteamLows([220], "CN", "key", () => {}, new Map([[220, { amount: 20, currency: "CNY" }]]));
  now += 60 * 60 * 1000;
  await loadItadSteamLows([220], "CN", "key", () => {}, new Map([[220, { amount: 0, currency: "CNY" }]]));
  assert.equal(calls.length, 3);
  respond = () => new Response("error", { status: 500 });
  const result = await loadItadSteamLows([220], "CN", "key");
  assert.match(result.warning ?? "", /HTTP 500/);
  assert.equal(result.lows.get(220)?.amount, 0);
});

test("a temporary lookup miss after mapping expiry keeps the identifier and persistent historical record", async () => {
  let now = 1800000000000;
  Date.now = () => now;
  respond = (url) => url.includes("/lookup/") ? Response.json({ "app/220": id1 })
    : Response.json([{ id: id1, lows: [low(20, "CNY")] }]);
  const load = (amount: number) => loadItadSteamLows([220], "CN", "key", () => {}, new Map([[220, { amount, currency: "CNY" }]]));
  await load(20);
  now += 40 * 24 * 60 * 60 * 1000;
  respond = (url) => url.includes("/lookup/") ? Response.json({ "app/220": null }) : Response.json([]);
  assert.equal((await load(19)).lows.get(220)?.amount, 20);
  assert.equal(calls.length, 6);
  assert.equal((await load(20)).lows.get(220)?.amount, 20);
  assert.equal(calls.length, 6);
});

test("quote-based new lows require N and a matching native quote from the same country", () => {
  const game = { appid: 220, title: "Game", capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false };
  const current = (amount: number, currency: string) => ({ amount, currency, regular: 30, cut: 50, discountEndsAt: null });
  const quote = { amount: 20, currency: "CNY", country: "CN", flag: "N" as const };
  const build = (deal: ReturnType<typeof current> | undefined, itadDeal = quote) => buildGameRows(
    [game], new Map([
      ["CN", deal ? new Map([[220, deal]]) : new Map()],
      ["US", new Map([[220, current(20, "CNY")]])],
    ]), [{ code: "CN", label: "中国", group: "base" }], rates, new Map(), new Map([[220, itadDeal]]),
  )[0];
  assert.equal(build(current(20, "CNY")).itadNewLow, true);
  assert.equal(build(current(19, "CNY")).itadNewLow, false);
  assert.equal(build(current(21, "CNY")).itadNewLow, false);
  assert.equal(build(current(20, "USD")).itadNewLow, false);
  assert.equal(build(undefined).itadNewLow, false);
  for (const flag of ["H", "S", null] as const) {
    const rows = buildGameRows([game], new Map([["CN", new Map([[220, current(20, "CNY")]])]]),
      [{ code: "CN", label: "中国", group: "base" }], rates, new Map(), new Map([[220, { ...quote, flag }]]));
    assert.equal(rows[0].itadNewLow, false);
  }
  const html = steamListHtml([{
    appid: 220, title: "Game", capsule: "", released: "", status: "", vsHome: "", discountEnd: null,
    cheapestLabel: "最低", cheapest: "中国 20", chips: [
      { label: "中国", cny: "20.00", local: "20 CNY", cut: 50, band: "cheap", gift: false, atLow: true, newLow: true },
    ],
  }]);
  assert.match(html, /wl-disc-cny">20.00<\/span><span class="wl-disc-low is-new"[^>]*>新史低<\/span>/);
  assert.doesNotMatch(html, />史低<\/span>/);
});

test("a home price below recorded history is a new low even when ITAD quotes lag or lack N", () => {
  const game = { appid: 220, title: "Game", capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false };
  const history = { amount: 10, currency: "CNY", country: "CN", recordedAt: "2026-09-10T01:00:00Z" };
  const deal = (amount: number, currency = "CNY") => ({ amount, currency, regular: 30, cut: 50, discountEndsAt: null });
  const build = (current: ReturnType<typeof deal> | undefined, flag?: "N" | "H" | "S" | null) => buildGameRows(
    [game], new Map([
      ["CN", current ? new Map([[220, current]]) : new Map()],
      ["US", new Map([[220, deal(1, "USD")]])],
    ]), [{ code: "CN", label: "中国", group: "base" }], rates, new Map([[220, history]]),
    flag === undefined ? new Map() : new Map([[220, { amount: 10, currency: "CNY", country: "CN", flag }]]),
  )[0];
  for (const flag of [undefined, "N", "H", "S", null] as const) {
    const row = build(deal(9.99), flag);
    assert.equal(row.itadNewLow, true);
    assert.equal(row.historyLow?.atLow, true);
    assert.equal(row.historyLow?.amount, 10);
    assert.equal(row.historyLow?.recordedAt, history.recordedAt);
  }
  assert.equal(build(deal(0)).itadNewLow, true);
  assert.equal(build(deal(10)).itadNewLow, false);
  assert.equal(build(deal(10.01)).itadNewLow, false);
  assert.equal(build(deal(9, "USD")).itadNewLow, false);
  assert.equal(build(undefined).itadNewLow, false);
});

test("price-inferred new lows use the existing dark badge and are included in both low filters", () => {
  const history = { amount: 10, currency: "CNY", country: "CN", recordedAt: null };
  const countries = [{ code: "CN", label: "中国", group: "base" as const }];
  const games = ["Below", "Equal", "Above", "FullPrice"].map((title, index) => ({
    appid: index + 1, title, capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false,
  }));
  const rows = buildGameRows(games, new Map([["CN", new Map(games.map((game, index) => [game.appid, {
    amount: 9 + index, currency: "CNY", regular: index === 3 ? 12 : 20,
    cut: index === 3 ? 0 : 50, discountEndsAt: null,
  }]))]]), countries, rates, new Map(games.map(game => [game.appid, history])));
  const payload: ReportPayload = {
    steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
    countries, rows, itad: { enabled: true, home: "CN", warning: null },
  };
  const { root, nodes } = reportHarness();
  mountReport(root, payload);
  const titles = () => [...nodes.get("#list").innerHTML.matchAll(/class="wl-title"[^>]*>([^<]*)<\/a>/g)]
    .map((match: RegExpMatchArray) => match[1]).sort();
  nodes.get("#new-low").events.get("change")({ target: { checked: true } });
  assert.deepEqual(titles(), ["Below"]);
  assert.match(nodes.get("#list").innerHTML, /wl-disc-low is-new[^>]*>新史低/);
  assert.match(nodes.get("#list").innerHTML, /10\.00 CNY/);
  nodes.get("#history-low").events.get("change")({ target: { checked: true } });
  assert.deepEqual(titles(), ["Below", "Equal"]);
  assert.equal(nodes.get("#new-low").checked, false);
});

test("home judgement uses home current price; currency changes stay unknown", () => {
  const history = { amount: 10, currency: "CNY", country: "CN", recordedAt: null };
  const deal = (amount: number, currency: string) => ({ amount, currency, regular: 30, cut: 50, discountEndsAt: null });
  const rows = buildGameRows([{
    appid: 220, title: "Game", capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false,
  }], new Map([
    ["CN", new Map([[220, deal(15, "CNY")]])],
    ["US", new Map([[220, deal(1, "USD")]])],
  ]), [{ code: "CN", label: "中国", group: "base" }], rates, new Map([[220, history]]));
  assert.equal(rows[0].historyLow?.atLow, false);
  assert.equal(rows[0].historyLow?.cny, 10);
  assert.equal(rows[0].prices.US, undefined);
  assert.equal(historyLowFor(history, deal(10, "CNY"), rates)?.atLow, true);
  assert.equal(historyLowFor(history, deal(10, "ARS"), rates)?.atLow, null);
  assert.equal(historyLowFor(history, undefined, rates)?.atLow, null);
});

test("cards label home lows and HTML-escape historical text", () => {
  const html = steamListHtml([{
    appid: 220, title: "Game", capsule: "", released: "2021-11-03", status: "", vsHome: "", discountEnd: null,
    cheapestLabel: "最低", cheapest: "中国 20", chips: [
      { label: "中国", cny: "20.00", local: "20 CNY", cut: 50, band: "cheap", gift: false, atLow: true },
    ],
    history: { label: "中国史低", price: "20 CNY", date: "<script>" },
  }]);
  assert.match(html, /中国史低/);
  assert.match(html, />ITAD<\/a> 中国史低/);
  assert.doesNotMatch(html, />ITAD<\/a> Steam/);
  assert.match(html, /本区已达史低/);
  assert.match(html, /Game<\/a><span class="wl-release-date">2021-11-03<\/span>/);
  assert.match(html, /wl-disc-cny">20.00<\/span><span class="wl-disc-low"/);
  assert.ok(html.indexOf('class="wl-row-history"') < html.indexOf('class="wl-row-chips"'));
  assert.doesNotMatch(html, /wl-row-meta|>220</);
  assert.doesNotMatch(html, /美区参考/);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("report renders ITAD settings and switching home refetches history even with cached Steam columns", () => {
  const payload = {
    steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
    countries: [{ code: "CN", label: "中国", group: "base" as const }, { code: "US", label: "美国", group: "base" as const }],
    rows: [{ appid: 220, title: "Game", capsule: "", releasedAt: null, free: false, comingSoon: false,
      delisted: false, prices: {}, cheapestCode: null, cheapestCny: null, vsCn: null, historyLow: null }],
    itad: { enabled: true, home: "CN", warning: "<failed>" as string | null },
  };
  const html = renderReportShell(payload);
  assert.match(html, /id="itad-settings"/);
  assert.doesNotMatch(html, /美区参考/);
  const { root, nodes } = reportHarness();
  let refetched = 0;
  mountReport(root, payload, { onRefetch: () => { refetched += 1; } });
  assert.match(nodes.get("#list").innerHTML, /史低数据未获取/);
  payload.itad.warning = null;
  mountReport(root, payload, { onRefetch: () => { refetched += 1; } });
  assert.match(nodes.get("#list").innerHTML, /暂无史低数据/);
  assert.doesNotMatch(nodes.get("#list").innerHTML, /美区参考|已达史低/);
  nodes.get("#home-menu-panel").events.get("click")({
    stopPropagation: () => {}, target: { closest: () => ({ dataset: { home: "US" } }) },
  });
  assert.equal(refetched, 1);
});

test("cached report columns cannot bypass the cap when adding regions or switching home", () => {
  for (const [wishlistCount, cap] of [[4001, 5], [4000, 9]] as const) {
    for (const action of ["region", "home", "all"] as const) {
      const { root, nodes } = reportHarness();
      saveRegionSetup({ home: "CN", shown: COUNTRIES.slice(0, cap).map(country => country.code) });
      const payload: ReportPayload = {
        steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
        wishlistCount, countries: COUNTRIES.slice(0, cap + 1), rows: [],
      };
      let refetched = 0;
      mountReport(root, payload, { onRefetch: () => { refetched += 1; } });
      const next = COUNTRIES[cap].code;
      if (action === "all") nodes.get("#regions-all").events.get("click")();
      else if (action === "home") nodes.get("#home-menu-panel").events.get("click")({
        stopPropagation: () => {}, target: { closest: () => ({ dataset: { home: next } }) },
      });
      else nodes.get("#region-menu-list").events.get("change")({
        target: { closest: () => ({ dataset: { region: next }, checked: true, disabled: false }) },
      });
      assert.equal(refetched, 1, `${wishlistCount}: ${action}`);
    }
  }
});

test("default relative-home sorting is ascending, retains ties and compares unrounded values", () => {
  const game = (appid: number, title: string, home: number | null, cheapest: number): ReportPayload["rows"][number] => ({
    appid, title, capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false,
    prices: {
      CN: { amount: home, currency: "CNY", regular: home, cut: 0, discountEndsAt: null, cny: home },
      JP: { amount: cheapest, currency: "JPY", regular: cheapest, cut: 0, discountEndsAt: null, cny: cheapest },
    },
    cheapestCode: "JP", cheapestCny: cheapest, vsCn: null,
  });
  const payload: ReportPayload = {
    steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
    countries: [{ code: "CN", label: "中国", group: "base" }, { code: "JP", label: "日本", group: "base" }],
    rows: [
      game(10, "Twenty percent", 100, 80), game(99, "Zero B", 100, 100),
      game(20, "Tiny difference", 100, 99.96), game(30, "Five percent", 100, 95),
      game(1, "Zero A", 500, 500), game(40, "No home price", null, 10),
      { ...game(50, "Free", 100, 100), free: true },
    ],
  };
  const { root, nodes } = reportHarness();
  mountReport(root, payload);
  const titles = () => [...nodes.get("#list").innerHTML.matchAll(/class="wl-title"[^>]*>([^<]*)<\/a>/g)]
    .map((match: RegExpMatchArray) => match[1]);
  assert.equal(nodes.get("#sort-menu-label").textContent, "相对账户区");
  assert.equal(nodes.get("#sort-dir-label").textContent, "低→高");
  assert.deepEqual(titles(), ["Zero B", "Zero A", "Tiny difference", "Five percent", "Twenty percent", "No home price", "Free"]);
  assert.equal(nodes.get("#list").innerHTML.match(/相对中国 0\.0%/g)?.length, 3);
  nodes.get("#sort-dir-btn").events.get("click")({ stopPropagation: () => {} });
  assert.equal(nodes.get("#sort-dir-label").textContent, "高→低");
  assert.deepEqual(titles(), ["Twenty percent", "Five percent", "Tiny difference", "Zero B", "Zero A", "No home price", "Free"]);
});

test("discount sorting uses the home region and defaults to highest discount first", () => {
  const game = (appid: number, title: string, cut: number, amount: number | null = 100): ReportPayload["rows"][number] => ({
    appid, title, capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false,
    prices: {
      CN: { amount, currency: "CNY", regular: amount == null ? null : 200, cut, discountEndsAt: null, cny: amount },
    },
    cheapestCode: "CN", cheapestCny: amount, vsCn: 0,
  });
  const payload: ReportPayload = {
    steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
    countries: [{ code: "CN", label: "中国", group: "base" }],
    rows: [game(1, "五折", 50), game(2, "八折", 20), game(3, "九折", 10), game(4, "无折扣", 0), game(5, "无本区价格", 0, null)],
  };
  const { root, nodes } = reportHarness();
  mountReport(root, payload);
  const titles = () => [...nodes.get("#list").innerHTML.matchAll(/class="wl-title"[^>]*>([^<]*)<\/a>/g)]
    .map((match: RegExpMatchArray) => match[1]);
  nodes.get("#sort-menu-panel").events.get("click")({
    stopPropagation: () => {},
    target: { closest: () => ({ dataset: { sort: "discount" } }) },
  });
  assert.equal(nodes.get("#sort-menu-label").textContent, "折扣");
  assert.equal(nodes.get("#sort-dir-label").textContent, "高→低");
  assert.deepEqual(titles(), ["五折", "八折", "九折", "无折扣", "无本区价格"]);
  nodes.get("#sort-dir-btn").events.get("click")({ stopPropagation: () => {} });
  assert.equal(nodes.get("#sort-dir-label").textContent, "低→高");
  assert.deepEqual(titles(), ["无折扣", "九折", "八折", "五折", "无本区价格"]);
});

test("price filters are mutually exclusive, history lows require a sale, and search still intersects", () => {
  const game = (appid: number, title: string, cut: number): ReportPayload["rows"][number] => ({
    appid, title, capsule: "", releasedAt: null, free: false, comingSoon: false, delisted: false,
    prices: { CN: { amount: 10, currency: "CNY", regular: 20, cut, discountEndsAt: null, cny: 10 } },
    cheapestCode: "CN", cheapestCny: 10, vsCn: 0,
  });
  const history = { amount: 10, currency: "CNY", country: "CN", recordedAt: null, cny: 10, atLow: true };
  const payload: ReportPayload = {
    steamId: "1", steamName: "User", home: "CN", generatedAt: rates.fetchedAt, fxAt: rates.fetchedAt,
    countries: [{ code: "CN", label: "中国", group: "base" }],
    rows: [
      { ...game(1, "Above", 50), historyLow: { ...history, atLow: false } },
      { ...game(2, "Repeat Low", 0), historyLow: history },
      { ...game(3, "Fresh Low", 50), itadNewLow: true },
      { ...game(4, "Foreign Low", 0), historyLow: { ...history, country: "US" } },
      { ...game(5, "Unknown", 50), historyLow: { ...history, atLow: null } },
      { ...game(6, "Upcoming", 50), comingSoon: true, itadNewLow: true, historyLow: history },
    ],
    itad: { enabled: true, home: "CN", warning: null },
  };
  const shell = renderReportShell(payload);
  const group = shell.match(/<div class="wl-price-filters"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.match(group, /id="sale"[^>]*\/>[\s\S]*?<span>折扣<\/span>/);
  assert.match(group, /id="history-low"[^>]*\/>[\s\S]*?<span>史低<\/span>/);
  assert.match(group, /id="new-low"[^>]*\/>[\s\S]*?<span>新史低<\/span>/);
  assert.doesNotMatch(group, /有折扣/);
  const { root, nodes } = reportHarness();
  mountReport(root, payload);
  const setFilter = (id: string, checked: boolean) => nodes.get(`#${id}`).events.get("change")({ target: { checked } });
  const assertSelection = (selected: string | null) => {
    for (const id of ["sale", "history-low", "new-low"]) {
      assert.equal(nodes.get(`#${id}`).checked, id === selected, `${id} checked state`);
    }
  };
  const titles = () => [...nodes.get("#list").innerHTML.matchAll(/class="wl-title"[^>]*>([^<]*)<\/a>/g)].map((match: RegExpMatchArray) => match[1]).sort();
  assert.equal(titles().length, 6);
  assertSelection(null);
  setFilter("history-low", true);
  assertSelection("history-low");
  assert.deepEqual(titles(), ["Fresh Low"]);
  setFilter("new-low", true);
  assertSelection("new-low");
  assert.deepEqual(titles(), ["Fresh Low"]);
  assert.match(nodes.get("#list").innerHTML, /class="wl-disc-low is-new"/);
  setFilter("history-low", true);
  assertSelection("history-low");
  assert.deepEqual(titles(), ["Fresh Low"]);
  setFilter("sale", true);
  assertSelection("sale");
  assert.deepEqual(titles(), ["Above", "Fresh Low", "Unknown"]);
  setFilter("new-low", true);
  assertSelection("new-low");
  assert.deepEqual(titles(), ["Fresh Low"]);
  setFilter("sale", true);
  assertSelection("sale");
  assert.deepEqual(titles(), ["Above", "Fresh Low", "Unknown"]);
  setFilter("history-low", true);
  assertSelection("history-low");
  assert.deepEqual(titles(), ["Fresh Low"]);
  for (const id of ["sale", "history-low", "new-low"]) {
    setFilter(id, true);
    setFilter(id, false);
    assertSelection(null);
    assert.equal(titles().length, 6);
  }
  setFilter("sale", true);
  nodes.get("#q").events.get("input")({ target: { value: "Repeat" } });
  assert.deepEqual(titles(), []);
  setFilter("history-low", true);
  assertSelection("history-low");
  assert.deepEqual(titles(), []);
  assert.equal(nodes.get("#count").textContent, "显示 0 / 6");
  assert.doesNotMatch(nodes.get("#list").innerHTML, /aria-label="本区已达史低">史低/);
  for (const itad of [undefined, { enabled: false, home: "CN", warning: null }]) {
    const disabled = { ...payload, itad };
    const html = renderReportShell(disabled);
    assert.match(html, /id="sale"/);
    assert.match(html, /id="itad-settings"/);
    assert.doesNotMatch(html, /id="history-low"|id="new-low"/);
    const unconfigured = reportHarness(["#history-low", "#new-low"]);
    mountReport(unconfigured.root, disabled);
    assert.equal(unconfigured.nodes.get("#count").textContent, "显示 6 / 6");
    unconfigured.nodes.get("#sale").events.get("change")({ target: { checked: true } });
    assert.equal(unconfigured.nodes.get("#count").textContent, "显示 3 / 6");
    assert.equal(unconfigured.nodes.get("#sale").checked, true);
    unconfigured.nodes.get("#sale").events.get("change")({ target: { checked: false } });
    assert.equal(unconfigured.nodes.get("#count").textContent, "显示 6 / 6");
  }
  assert.match(renderReportShell({ ...payload, itad: { enabled: true, home: "CN", warning: "failed" } }), /id="history-low"/);
  assert.match(renderReportShell({ ...payload, itad: { enabled: true, home: "CN", warning: "failed" } }), /id="new-low"/);
});
