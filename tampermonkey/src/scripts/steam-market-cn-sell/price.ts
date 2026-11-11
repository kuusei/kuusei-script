const INR_MINIMUM_FEE = 200;
const EXCHANGE_RATE_BUFFER = 0.003;

export function findReceivePrice(
  targetCny: number,
  inrPerCny: number,
  minimum: number,
  maximum: number,
  steamTotal: (receive: number) => number,
  steamFees: (receive: number) => number,
) {
  const estimatedTotal = Math.floor(targetCny * inrPerCny * (1 - EXCHANGE_RATE_BUFFER));
  if (!Number.isSafeInteger(estimatedTotal) || !Number.isSafeInteger(minimum) || minimum <= 0) {
    throw new Error("Steam 金额参数无效。");
  }
  if (maximum > 0 && estimatedTotal > maximum) throw new Error("目标售价超过 Steam 价格上限。");

  const fits = (receive: number) => {
    const fees = steamFees(receive);
    if (!Number.isSafeInteger(fees) || fees < 0) {
      throw new Error("Steam 手续费计算失败。");
    }
    return receive + Math.max(INR_MINIMUM_FEE, fees) <= estimatedTotal;
  };
  if (!fits(minimum)) return null;

  let low = minimum;
  let high = estimatedTotal;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  // Steam rounds the buyer display independently; use its total only to validate listing limits.
  const total = steamTotal(low);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Steam 手续费计算失败。");
  if (maximum > 0 && total > maximum) throw new Error("目标售价超过 Steam 价格上限。");
  return total >= 3 * minimum ? low : null;
}
