export type FeeRule = {
  steamRate: number;
  publisherRate: number;
  minimum: number;
  increment: number;
  base?: number;
  steamCap?: number;
  publisherCap?: number;
  enabled?: boolean;
};

const INVALID_RULE = "手续费参数无效：费率应为 0–100%，最小金额与步长应为正整数。";

function isUnitRate(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateRule(rule: FeeRule) {
  const ratesOk = [rule.steamRate, rule.publisherRate].every(isUnitRate);
  const stepsOk = [rule.minimum, rule.increment].every(isPositiveInteger);
  const capsOk = [rule.base ?? 0, rule.steamCap ?? 0, rule.publisherCap ?? 0].every(isNonNegativeInteger);
  if (!ratesOk || !stepsOk || !capsOk) throw new Error(INVALID_RULE);
}

export function validPrice(amount: number, rule: FeeRule, roundUp: boolean) {
  if (amount <= rule.minimum) return rule.minimum;
  const steps = roundUp
    ? Math.ceil(amount / rule.increment)
    : Math.floor(amount / rule.increment + 0.5);
  return Math.max(rule.increment, steps * rule.increment);
}

function feeAmount(net: number, rate: number, cap: number, rule: FeeRule) {
  if (rate <= 1e-5) return 0;
  const amount = validPrice(Math.floor(net * rate), rule, false);
  return cap > 0 ? Math.min(amount, cap) : amount;
}

export function totalWithFees(received: number, rule: FeeRule) {
  const net = validPrice(received, rule, true);
  if (rule.enabled === false) return net;
  return net
    + feeAmount(net, rule.steamRate, rule.steamCap ?? 0, rule)
    + (rule.base ?? 0)
    + feeAmount(net, rule.publisherRate, rule.publisherCap ?? 0, rule);
}

// Largest seller receive amount whose buyer total, including fees, does not exceed price.
export function receivedFromBuyer(price: number, rule: FeeRule) {
  validateRule(rule);
  if (!Number.isSafeInteger(price) || price <= 0) {
    throw new Error("市场价格必须是正整数最小金额单位。");
  }
  if (totalWithFees(rule.minimum, rule) > price) return 0;
  let low = 0;
  let high = Math.floor(price / rule.increment);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (totalWithFees(mid * rule.increment, rule) <= price) low = mid;
    else high = mid - 1;
  }
  return Math.max(rule.minimum, low * rule.increment);
}
