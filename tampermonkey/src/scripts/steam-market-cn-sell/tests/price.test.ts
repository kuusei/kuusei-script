import assert from "node:assert/strict";
import { test } from "node:test";
import { findReceivePrice } from "../price";

const rate = 14.075586;
const steamTotal = (receive: number) => Math.round(receive / 100) * 100 + 200;

test("keeps two decimals after reserving 0.3% for exchange-rate differences", () => {
  assert.equal(findReceivePrice(73, rate, 100, 0, steamTotal, () => 200), 824);
  assert.equal(findReceivePrice(72, rate, 100, 0, steamTotal, () => 200), 810);
  assert.equal(findReceivePrice(63, rate, 100, 0, steamTotal, () => 200), 684);
});

test("different target prices keep distinct payouts when Steam rounds both buyer totals to ₹6", () => {
  const lowest = findReceivePrice(42, rate, 100, 0, steamTotal, () => 200);
  const undercut = findReceivePrice(41, rate, 100, 0, steamTotal, () => 200);
  assert.equal(lowest, 389);
  assert.equal(undercut, 375);
  assert.equal(steamTotal(lowest), 600);
  assert.equal(steamTotal(undercut), 600);
  assert.equal(findReceivePrice(32, rate, 100, 0, steamTotal, () => 200), 249);
});

test("applies the minimum fee, higher native fees, and the minimum listing price", () => {
  assert.equal(findReceivePrice(72, rate, 100, 0, (amount) => amount + 180, () => 180), 810);
  assert.equal(findReceivePrice(72, rate, 100, 0, (amount) => amount + 250, () => 250), 760);
  assert.equal(findReceivePrice(20, rate, 100, 0, steamTotal, () => 200), null);
});
