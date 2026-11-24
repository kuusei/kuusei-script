import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { loadChinaOrderBook, loadCurrencyPerCny } from "../quotes";

function mockRequests(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "GM_xmlhttpRequest");
  const requests: Parameters<typeof GM_xmlhttpRequest>[0][] = [];
  Object.defineProperty(globalThis, "GM_xmlhttpRequest", {
    configurable: true,
    value: (options: Parameters<typeof GM_xmlhttpRequest>[0]) => requests.push(options),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "GM_xmlhttpRequest", previous);
    else Reflect.deleteProperty(globalThis, "GM_xmlhttpRequest");
  });
  return {
    requests,
    respond(body: unknown, status = 200, request = requests[requests.length - 1]) {
      const response = { status, responseText: typeof body === "string" ? body : JSON.stringify(body) } as Tampermonkey.Response<unknown>;
      request.onload?.call(response, response);
    },
  };
}

// MarketDB CNY response captured on 2026-11-23, restricted to the supported currencies.
const fixture = {
  timestamp: 1795381200000,
  last_checked: 1795414056360,
  base: "CNY",
  rates: [
    { currency_id: 18, market_id: 2018, code: "UAH", symbol: "₴", rate: 6.699 },
    { currency_id: 24, market_id: 2024, code: "INR", symbol: "₹", rate: 13.801 },
  ],
};

test("shares MarketDB requests, caches for one hour, rejects invalid responses and retries failures", async (t) => {
  let now = 1_800_000_000_000;
  const previousNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = previousNow; });
  const { requests, respond } = mockRequests(t);

  const pending = Promise.all([loadCurrencyPerCny("INR"), loadCurrencyPerCny("UAH")]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://marketdb.info/api/v1/exchange-rates?base=CNY");
  assert.equal(requests[0].anonymous, true);
  respond(fixture);
  assert.deepEqual(await pending, [13.801, 6.699]);
  now += 3_599_999;
  assert.equal(await loadCurrencyPerCny("UAH"), 6.699);
  assert.equal(requests.length, 1);
  now++;

  for (const body of [
    { ...fixture, base: "USD" },
    { ...fixture, rates: { INR: 13.801, UAH: 6.699 } },
    { ...fixture, rates: [{ code: "INR", rate: 13.801 }] },
    { ...fixture, rates: [{ code: "INR", rate: 13.801 }, { code: "UAH", rate: "6.699" }] },
  ]) {
    const failure = assert.rejects(loadCurrencyPerCny("INR"), /Steam 市场汇率/);
    respond(body);
    await failure;
  }
  const limited = assert.rejects(loadCurrencyPerCny("INR"), /频繁/);
  respond({}, 429);
  await limited;
  const maintained = assert.rejects(loadCurrencyPerCny("UAH"), /503/);
  respond({}, 503);
  await maintained;
  const retry = loadCurrencyPerCny("UAH");
  respond({ ...fixture, rates: fixture.rates.map((entry) => ({ ...entry, rate: entry.rate + 1 })) });
  assert.equal(await retry, 7.699);
});

// The authenticated batch page exposes these arrays even when the classic listing page is gone.
const batchPage = (names: string[], ids: string[], appid = 753) => `<script>
var g_unAppId = ${appid};
var g_rgItemNameIds = ${JSON.stringify(ids)};
var g_rgMarketHashNames = ${JSON.stringify(names)};
</script>`;
const book = {
  success: 1, price_prefix: "¥",
  buy_order_table: [{ price: "¥ 1.35", quantity: "1" }],
  sell_order_table: [
    { price: "¥ 1.62", quantity: "3" }, { price: "¥ 1.63", quantity: "3" },
    { price: "¥ 1.65", quantity: "6" }, { price: "¥ 1.67", quantity: "4" },
    { price: "¥ 1.68", quantity: "13" }, { price: "¥ 1.69 或更高", quantity: "245" },
  ],
};

test("resolves exact IDs through the authenticated batch page and requests only CNY histogram data", async (t) => {
  const { requests, respond } = mockRequests(t);
  const item = { appid: 753, contextid: "6", marketHashName: "2439760-happy shuyu" };
  const pending = Promise.all([loadChinaOrderBook(item), loadChinaOrderBook(item)]);
  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.pathname, "/market/multisell");
  assert.equal(url.searchParams.get("items[]"), item.marketHashName);
  assert.equal(url.searchParams.get("appid"), "753");
  assert.equal(url.searchParams.get("contextid"), "6");
  assert.equal(requests[0].anonymous, false);
  assert.equal(requests[0].cookie, undefined);
  respond(batchPage(["other item", item.marketHashName], ["1", "176402444"]));
  await new Promise(setImmediate);
  assert.equal(requests.length, 3);
  for (const request of requests.slice(1)) {
    const histogram = new URL(request.url);
    assert.equal(histogram.pathname, "/market/itemordershistogram");
    assert.equal(histogram.searchParams.get("item_nameid"), "176402444");
    assert.equal(histogram.searchParams.get("currency"), "23");
    assert.equal(histogram.searchParams.get("country"), "CN");
    assert.equal(request.anonymous, true);
    respond(book, 200, request);
  }
  const results = await pending;
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].sell.length, 5);
  assert.deepEqual(results[0].sell[0], { price: 162, quantity: 3 });

  const cached = loadChinaOrderBook(item);
  await new Promise(setImmediate);
  assert.equal(new URL(requests[3].url).pathname, "/market/itemordershistogram");
  respond(book);
  await cached;
  const direct = loadChinaOrderBook({ appid: 753, marketHashName: item.marketHashName, itemNameId: "176402444" });
  assert.equal(new URL(requests[4].url).pathname, "/market/itemordershistogram");
  respond({ ...book, price_prefix: "₹" });
  await assert.rejects(direct, /有效的国区盘口/);
});

test("rejects missing or mismatched batch identity and retries instead of caching a failure", async (t) => {
  const { requests, respond } = mockRequests(t);
  const item = { appid: 730, contextid: "2", marketHashName: 'Test & "quote" [case];' };
  const invalid = [
    "<html>Sign in</html>",
    batchPage([item.marketHashName], ["100"], 753),
    batchPage(["another item"], ["100"], 730),
    batchPage([item.marketHashName], ["bad-id"], 730),
  ];
  for (const html of invalid) {
    const failure = assert.rejects(loadChinaOrderBook(item), /未提供/);
    respond(html);
    await failure;
  }
  assert.equal(requests.length, invalid.length);
  const limited = assert.rejects(loadChinaOrderBook(item), /频繁/);
  respond({}, 429);
  await limited;
  const retry = loadChinaOrderBook(item);
  respond(batchPage([item.marketHashName], ["100"], 730));
  await new Promise(setImmediate);
  assert.equal(new URL(requests[requests.length - 1].url).searchParams.get("item_nameid"), "100");
  respond({ ...book, buy_order_table: [], sell_order_table: [] });
  assert.deepEqual(await retry, { buy: [], sell: [] });
});
