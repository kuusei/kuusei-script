import assert from "node:assert/strict";
import { test } from "node:test";
import { enableReactDecimals, exactSellBody, preserveReactSellPrice, reactBuyerTotal, reactFeeRule, readReactSale, setReactReceive } from "../react-dialog";

function fixture(currency = 24, amount = 5412) {
  const wallet = { wallet_currency: currency, wallet_market_minimum: "100", wallet_currency_increment: "100" };
  const item = { appid: 753, contextid: "6", assetid: "test-asset", description: { market_hash_name: "753-Sack of Gems" } };
  const ref = {};
  const prices = { currency, sellerPrice: amount, buyerPrice: 6400, sellerInputRef: ref, onSellerPriceChange: () => {} };
  const config = { eCurrency: currency, bWholeUnitsOnly: true };
  const fees = {
    steam_fee: { ecurrency: currency, fee_rate: 0.05, fee_cap: "0" },
    publisher_fee: { ecurrency: currency, fee_rate: 0.10000000149011612, fee_cap: "0" },
  };
  const root = { tagName: "DIV" };
  const provider = { memoizedProps: { client: { getQueryData(key: unknown[]) {
    assert.deepEqual(key, ["inventory", "sellfees", 753, true]);
    return fees;
  } } } };
  const parent = { memoizedProps: { item, walletInfo: wallet, newFeeRates: true }, return: provider };
  const pricingFiber = { memoizedProps: prices, child: { stateNode: root }, return: parent };
  const hostFiber = { stateNode: root, return: pricingFiber };
  const currencyFiber = { memoizedProps: { currency: config, inputRef: ref }, return: hostFiber };
  pricingFiber.child = hostFiber;
  const props = { value: String(Math.round(amount / 100)) };
  const fiber = { memoizedProps: props, return: currencyFiber };
  class Input extends EventTarget {
    value = props.value;
    inputMode = "";
    selectionStart: number | null = 5;
    selectionEnd: number | null = 5;
    ownerDocument: { activeElement: unknown } = { activeElement: null };
    __reactFiber$test = fiber;
    __reactProps$test = props;
    setSelectionRange(start: number | null, end: number | null) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  }
  const input = new Input();
  const sale = () => readReactSale(input as unknown as HTMLInputElement)!;
  return { wallet, item, prices, config, fees, input, sale };
}

const body = (price = "5500") => new URLSearchParams({
  sessionid: "test-session", appid: "753", contextid: "6", assetid: "test-asset", amount: "1", price,
});

test("reads current React prices and reuses the native fee cache without changing wallet precision", () => {
  const f = fixture();
  assert.equal(f.sale().prices.sellerPrice, 5412);
  assert.equal(reactBuyerTotal(f.sale(), 5412), 6400);
  const rule = reactFeeRule(f.sale())!;
  assert.equal(rule.minimum, 100);
  assert.equal(rule.increment, 100);
  f.fees.steam_fee.ecurrency = 18;
  assert.equal(reactFeeRule(f.sale()), undefined);
  assert.equal(readReactSale(fixture(23).input as unknown as HTMLInputElement), undefined);
});

test("uses the current alternate fiber after React changes a controlled input", () => {
  const old = fixture();
  const current = fixture(24, 6017);
  Object.assign(old.input.__reactFiber$test, { alternate: current.input.__reactFiber$test });
  old.input.__reactProps$test = current.input.__reactProps$test;
  assert.equal(old.sale().prices.sellerPrice, 6017);
});

test("reads committed prices when React reuses the unchanged integer input node", () => {
  type TestFiber = { return?: TestFiber; child?: TestFiber; alternate?: TestFiber; stateNode?: unknown; memoizedProps?: unknown };
  const chain = (input: TestFiber) => {
    const result: TestFiber[] = [];
    for (let node: TestFiber | undefined = input; node; node = node.return) result.push(node);
    for (let i = 1; i < result.length; i++) result[i].child = result[i - 1];
    return result;
  };
  const old = fixture(24, 700);
  const next = fixture(24, 692);
  const previousPath = chain(old.input.__reactFiber$test);
  const currentPath = chain(next.input.__reactFiber$test);
  for (let i = 1; i < previousPath.length; i++) {
    previousPath[i].alternate = currentPath[i];
    currentPath[i].alternate = previousPath[i];
  }
  const rootState: { current?: TestFiber } = {};
  const previousRoot: TestFiber = { stateNode: rootState, child: previousPath[previousPath.length - 1] };
  const currentRoot: TestFiber = { stateNode: rootState, child: currentPath[currentPath.length - 1] };
  previousPath[previousPath.length - 1].return = previousRoot;
  currentPath[currentPath.length - 1].return = currentRoot;
  rootState.current = currentRoot;
  // A bailout shares the DOM fiber; its return pointer and __reactProps still describe the older render.
  currentPath[1].child = previousPath[0];
  assert.equal(old.input.value, "7");
  assert.equal(old.prices.sellerPrice, 700);
  assert.equal(old.sale().prices.sellerPrice, 692);
  enableReactDecimals(old.sale());
  assert.equal(old.input.value, "6.92");
  assert.equal(exactSellBody(body("700"), old.sale())?.get("price"), "692");
});

test("the first asynchronous fill shows cents without another click or DOM mutation", async () => {
  const f = fixture(24, 700);
  let calls = 0;
  f.prices.buyerPrice = 900;
  Object.assign(f.prices, { onSellerPriceChange(amount: number) {
    calls++;
    f.prices.sellerPrice = amount;
    f.input.value = String(Math.round(amount / 100));
  } });
  await Promise.resolve();
  setReactReceive(f.input as unknown as HTMLInputElement, 692);
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.input.value, "6.92");
  assert.equal(f.sale().prices.sellerPrice, 692);
  assert.equal(f.prices.buyerPrice, 900);
});

test("keeps decimal text through native rerenders and preserves partial keyboard input", () => {
  const f = fixture();
  enableReactDecimals(f.sale());
  assert.equal(f.input.value, "54.12");
  assert.equal(f.input.inputMode, "decimal");
  assert.equal(f.config.bWholeUnitsOnly, false);
  assert.equal(f.wallet.wallet_currency_increment, "100");
  f.input.ownerDocument.activeElement = f.input;
  f.input.value = "54.";
  f.input.selectionStart = f.input.selectionEnd = 3;
  f.input.dispatchEvent(new Event("input"));
  f.prices.sellerPrice = 5400;
  f.input.value = "54";
  enableReactDecimals(f.sale());
  assert.equal(f.input.value, "54.");
  assert.equal(f.input.selectionStart, 3);
  f.input.ownerDocument.activeElement = null;
  enableReactDecimals(f.sale());
  assert.equal(f.input.value, "54.00");
});

test("corrects only native rounding for the same asset in INR and UAH", () => {
  for (const [currency, receive, rounded] of [[24, 6017, 6100], [18, 951, 1000]]) {
    const f = fixture(currency, receive);
    const original = body(String(rounded));
    const corrected = exactSellBody(original, f.sale())!;
    assert.equal(corrected.get("price"), String(receive));
    assert.equal(original.get("price"), String(rounded));
    for (const name of ["sessionid", "appid", "contextid", "assetid", "amount"]) {
      assert.equal(corrected.get(name), original.get(name));
    }
  }
  const f = fixture();
  const other = body(); other.set("assetid", "other-asset");
  assert.equal(exactSellBody(other, f.sale()), undefined);
  assert.throws(() => exactSellBody(body("5400"), f.sale()), /金额参数/);
});

test("the fetch adapter retains exact receipt cents without sending any real request", async () => {
  const f = fixture();
  const requests: { input: unknown; init?: RequestInit }[] = [];
  const page = {
    location: { origin: "https://steamcommunity.com", href: "https://steamcommunity.com/my/inventory" },
    document: { querySelectorAll: () => [f.input] },
    fetch: async (input: unknown, init?: RequestInit) => { requests.push({ input, init }); return new Response("{}"); },
  } as unknown as Window & typeof globalThis;
  preserveReactSellPrice(page);
  const patched = page.fetch;
  preserveReactSellPrice(page);
  assert.equal(page.fetch, patched);
  await page.fetch("https://steamcommunity.com/market/sellitem/", { method: "POST", body: body() });
  assert.equal(String(requests[0].init?.body), String(body("5412")));
  await page.fetch("https://marketdb.info/api/v1/exchange-rates?base=CNY");
  assert.equal(requests[1].init, undefined);
  assert.throws(() => page.fetch("https://steamcommunity.com/market/sellitem/", { method: "POST", body: body("5400") }), /金额参数/);
  assert.equal(requests.length, 2);
});
