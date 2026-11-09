import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseBatch } from "../model/batch";
import { formatMoney, numberForPrice, parseDisplayedPrice } from "../model/currencies";
import { getExchangeRate, parseExchangeRates } from "../exchange/rates";
import { receivedFromBuyer, totalWithFees, validPrice, validateRule, type FeeRule } from "../model/fees";
import { compactLevels } from "../model/order-book";
import { parseLiveBook, parseSsrSnapshot } from "../steam/snapshot";
import { feeRuleFromWallet, type WalletInfo } from "../steam/wallet";

const cs2: FeeRule = {
  steamRate: 0.05,
  publisherRate: 0.1,
  minimum: 1,
  increment: 1,
  base: 0,
  steamCap: 0,
  publisherCap: 0,
  enabled: true,
};

function bruteReceive(price: number, rule: FeeRule) {
  if (totalWithFees(rule.minimum, rule) > price) return 0;
  let best = 0;
  const high = Math.floor(price / rule.increment);
  for (let step = 0; step <= high; step += 1) {
    if (totalWithFees(step * rule.increment, rule) <= price) best = step * rule.increment;
  }
  return Math.max(rule.minimum, best);
}

describe("Steam market fees", () => {
  test("rejects rates and wallet steps outside Steam's integer rules", () => {
    assert.throws(() => validateRule({ ...cs2, steamRate: 1.01 }), /手续费参数无效/);
    assert.throws(() => validateRule({ ...cs2, increment: 0 }), /手续费参数无效/);
    assert.throws(() => validateRule({ ...cs2, base: 1.5 }), /手续费参数无效/);
    assert.throws(() => receivedFromBuyer(1.5, cs2), /正整数/);
  });

  test("snaps wallet amounts and applies the minimum fee unit", () => {
    assert.equal(validPrice(0, cs2, true), 1);
    assert.equal(validPrice(15, { ...cs2, minimum: 1, increment: 10 }, false), 20);
    assert.equal(validPrice(14, { ...cs2, minimum: 1, increment: 10 }, false), 10);
    assert.equal(totalWithFees(6, { ...cs2, enabled: false, minimum: 1, increment: 5 }), 10);
    assert.equal(totalWithFees(1000, { ...cs2, steamCap: 2, publisherCap: 3 }), 1005);
  });

  test("buyer price of 1.00 leaves the seller 0.88 after CS2 fees", () => {
    assert.equal(totalWithFees(88, cs2), 100);
    assert.equal(totalWithFees(89, cs2), 101);
    assert.equal(receivedFromBuyer(100, cs2), 88);
    assert.equal(receivedFromBuyer(2, cs2), 0);
  });

  test("the searched receive amount matches a full scan", () => {
    const capped = { ...cs2, steamCap: 5, publisherCap: 8, base: 1, increment: 3, minimum: 3 };
    for (const rule of [cs2, capped]) {
      for (let price = 1; price <= 400; price += 7) {
        assert.equal(receivedFromBuyer(price, rule), bruteReceive(price, rule));
      }
    }
  });
});

describe("purchase batch", () => {
  test("splits a yuan total into a per-item cost", () => {
    assert.deepEqual(parseBatch(" 10.50 ", " 4 "), { cost: 1050, count: 4, unitCost: 2.625 });
    assert.equal(parseBatch("10", "1000000").count, 1_000_000);
  });

  test("rejects incomplete or oversized input", () => {
    assert.throws(() => parseBatch("10.555", "1"), /两位小数/);
    assert.throws(() => parseBatch("0", "1"), /1–1,000,000/);
    assert.throws(() => parseBatch("10", "1000001"), /1–1,000,000/);
    assert.throws(() => parseBatch("10", "1.2"), /1–1,000,000/);
  });
});

describe("order book and displayed prices", () => {
  test("keeps the first ten strictly ordered levels", () => {
    const pairs = Array.from({ length: 12 }, (_, index) => [1000 - index, index + 1]).flat();
    assert.equal(compactLevels(pairs, "buy").length, 10);
    assert.deepEqual(compactLevels(["100", "2", 90, 3], "buy", Number.POSITIVE_INFINITY), [
      { price: 100, quantity: 2 },
      { price: 90, quantity: 3 },
    ]);
    assert.throws(() => compactLevels([100, 1, 100, 1], "buy"), /档位/);
    assert.throws(() => compactLevels([1, 1, 1], "sell"), /深度格式/);
  });

  test("parses Steam's currency symbols and minor units", () => {
    assert.equal(parseDisplayedPrice("$1,234.50", 1), 123450);
    assert.equal(parseDisplayedPrice("$1.--", 1), 100);
    assert.equal(parseDisplayedPrice("€1.234,50", 3), 123450);
    assert.equal(parseDisplayedPrice("€ 1,50", 3), 150);
    assert.equal(parseDisplayedPrice("0.00", 1), null);
    assert.equal(numberForPrice(100, 3), "1");
    assert.equal(numberForPrice(150, 3), "1,50");
    assert.equal(formatMoney(88, 1), "0.88 USD");
    assert.equal(formatMoney(88, 99), "0.88（币种 #99）");
  });
});

describe("exchange rates", () => {
  const now = 1_700_000_000_000;

  test("keeps positive ISO rates and caps the cache window at one day", () => {
    const parsed = parseExchangeRates({
      result: "success",
      base_code: "CNY",
      time_last_update_unix: 1_700_000_000,
      time_next_update_unix: 1_700_000_000 + 48 * 3600,
      rates: { CNY: 1, USD: 0.14, usd: 9, BAD: -1, EUR: 0.13 },
    }, now);
    assert.equal(parsed.rates.USD, 0.14);
    assert.equal(parsed.rates.usd, undefined);
    assert.equal(parsed.rates.EUR, 0.13);
    assert.equal(parsed.updatedAt, now);
    assert.equal(parsed.expiresAt, now + 24 * 60 * 60 * 1000);
  });

  test("uses the next update when it arrives sooner, otherwise one hour", () => {
    const soon = parseExchangeRates({
      result: "success",
      base_code: "CNY",
      time_last_update_unix: 1_700_000_000,
      time_next_update_unix: 1_700_007_200,
      rates: { CNY: 1, USD: 0.14 },
    }, now);
    assert.equal(soon.expiresAt, now + 7_200_000);
    const stale = parseExchangeRates({
      result: "success",
      base_code: "CNY",
      time_last_update_unix: 1_700_000_000,
      time_next_update_unix: 1_699_999_000,
      rates: { CNY: 1 },
    }, now);
    assert.equal(stale.expiresAt, now + 60 * 60 * 1000);
    assert.throws(() => parseExchangeRates({ result: "success", base_code: "USD", rates: { CNY: 1 }, time_last_update_unix: 10 }), /无效/);
  });

  test("a CNY wallet does not need a network rate", async () => {
    const rate = await getExchangeRate(23);
    assert.equal(rate.rate, 1);
  });
});

describe("CS2 market snapshot", () => {
  const wallet: WalletInfo = {
    wallet_currency: 1,
    wallet_country: "US",
    wallet_market_minimum: 1,
    wallet_currency_increment: 1,
    wallet_fee_base: 0,
    wallet_fee: 1,
  };

  function payload(bucket = "case-1") {
    return {
      loaderData: [JSON.stringify({
        success: 1,
        appid: 730,
        buckets: { [bucket]: {} },
        initialSelectedBucketID: bucket,
      })],
      renderContext: {
        queryData: JSON.stringify({
          queries: [
            {
              queryKey: ["market", "orderbook", "730", bucket],
              state: { data: { eCurrency: 1, rgCompactBuyOrders: [100, 2, 90, 4], rgCompactSellOrders: [110, 1, 130, 3] } },
            },
            { queryKey: ["market", "description", 730, bucket], state: { data: { market_name: "Test Case" } } },
            { queryKey: ["market", "fees", 730], state: { data: { steam_fee: { fee_cap: 50 }, publisher_fee: {} } } },
          ],
        }),
      },
      UserConfig: { country_code: "DE" },
    };
  }

  test("reads the selected bucket, fee caps, and full depth", () => {
    const snapshot = parseSsrSnapshot(payload(), "/market/listings/730/Test%20Case", wallet);
    assert.equal(snapshot.key, "730/case-1");
    assert.equal(snapshot.name, "Test Case");
    assert.equal(snapshot.country, "US");
    assert.equal(snapshot.rule.steamCap, 50);
    assert.equal(snapshot.rule.publisherCap, 0);
    assert.deepEqual(snapshot.buy, [{ price: 100, quantity: 2 }, { price: 90, quantity: 4 }]);
    assert.equal(snapshot.sell.length, 2);
  });

  test("asks for an item selection and rejects a wallet currency mismatch", () => {
    const missing = payload();
    const loader = JSON.parse(missing.loaderData[0]!) as { initialSelectedBucketID?: string };
    delete loader.initialSelectedBucketID;
    missing.loaderData[0] = JSON.stringify(loader);
    assert.throws(() => parseSsrSnapshot(missing, "/market/listings/730/Test", wallet), /选择具体物品/);
    assert.throws(() => parseSsrSnapshot(payload(), "/market/listings/730/Test", { ...wallet, wallet_currency: 23 }), /币种不一致/);
    assert.equal(feeRuleFromWallet({ wallet_currency: 23, wallet_fee: "0" }).enabled, false);
    assert.equal(feeRuleFromWallet({ wallet_currency: 23 }).minimum, 1);
  });

  test("live order books must use the same currency", () => {
    const book = parseLiveBook({
      data: { success: 1, data: { eCurrency: 1, rgCompactBuyOrders: [80, 1], rgCompactSellOrders: [90, 2] } },
    }, 1);
    assert.equal(book.buy[0]?.price, 80);
    assert.throws(() => parseLiveBook({ data: { success: true, data: { eCurrency: 3 } } }, 1), /币种不一致/);
    assert.throws(() => parseLiveBook({ data: { success: false } }, 1), /读取失败/);
  });
});
