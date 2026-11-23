import assert from "node:assert/strict";
import { test } from "node:test";
import { findReceivePrice } from "../price";

const nativeFee = (receive: number, rate: number) => rate > 0
  ? Math.max(100, Math.round(Math.floor(receive * rate) / 100) * 100) : 0;
const steamTotal = (receive: number) => Math.round(receive / 100) * 100
  + nativeFee(receive, 0.1) + nativeFee(receive, 0.05);
const price = (target: number, rate: number) => findReceivePrice(target, rate, 100, 0, steamTotal, 0.1, 0.05);

test("converts CNY net receipts using the agreed Steam market rates without a buffer", () => {
  assert.equal(price(500, 13.801), 6017);
  assert.equal(price(550, 13.801), 6610);
  assert.equal(price(600, 13.801), 7204);
  assert.equal(price(163, 6.699), 951);
});

test("uses each CNY minimum fee and allows fees to increase by one fen", () => {
  assert.equal(price(84, 10), 700);
  assert.equal(price(95, 10), 800);
  assert.equal(price(106, 10), 900);
});

test("keeps CNY price gaps below the target before currency conversion", () => {
  assert.equal(price(549, 10), 4790);
  assert.equal(price(550, 10), 4790);
  assert.equal(price(551, 10), 4790);
  assert.equal(price(552, 10), 4800);
});

test("uses the item's fee rates and does not impose a fee when its rate is zero", () => {
  assert.equal(findReceivePrice(100, 10, 1, 0, (n) => n, 0, 0.05), 930);
  assert.equal(findReceivePrice(100, 10, 1, 0, (n) => n, 0, 0), 1000);
});

test("checks native wallet limits without subtracting native fees again", () => {
  assert.equal(price(20, 6.699), null);
  assert.equal(findReceivePrice(163, 6.699, 100, 0, () => 200, 0.1, 0.05), null);
  assert.throws(() => findReceivePrice(163, 6.699, 100, 1000, steamTotal, 0.1, 0.05), /上限/);
  assert.throws(() => findReceivePrice(163, 6.699, 100, 1100, () => 1200, 0.1, 0.05), /上限/);
  assert.throws(() => findReceivePrice(163, 6.699, 100, 0, () => NaN, 0.1, 0.05), /手续费计算失败/);
});

test("rejects invalid amount and fee parameters", () => {
  assert.throws(() => price(163, NaN), /金额参数/);
  assert.throws(() => price(163, -1), /金额参数/);
  assert.throws(() => price(163.5, 6.699), /金额参数/);
  assert.throws(() => findReceivePrice(163, 6.699, 0, 0, steamTotal, 0.1, 0.05), /金额参数/);
  assert.throws(() => findReceivePrice(163, 6.699, 100, 0, steamTotal, NaN, 0.05), /手续费参数/);
});
