import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCurrencyPerCny } from "../quotes";

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
  const previous = Object.getOwnPropertyDescriptor(globalThis, "GM_xmlhttpRequest");
  const requests: Parameters<typeof GM_xmlhttpRequest>[0][] = [];
  Object.defineProperty(globalThis, "GM_xmlhttpRequest", {
    configurable: true,
    value: (options: Parameters<typeof GM_xmlhttpRequest>[0]) => requests.push(options),
  });
  t.after(() => {
    Date.now = previousNow;
    if (previous) Object.defineProperty(globalThis, "GM_xmlhttpRequest", previous);
    else Reflect.deleteProperty(globalThis, "GM_xmlhttpRequest");
  });
  const respond = (body: unknown, status = 200) => {
    const response = { status, responseText: JSON.stringify(body) } as Tampermonkey.Response<unknown>;
    requests[requests.length - 1].onload?.call(response, response);
  };

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
