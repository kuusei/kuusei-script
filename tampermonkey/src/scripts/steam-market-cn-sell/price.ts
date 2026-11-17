const INR_MINIMUM_FEE = 200;
const EXCHANGE_RATE_BUFFER = 0.003;

export function parseCnyAmount(text: string) {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = Number(match[1].replace(/,/g, "")) * 100
    + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function findReceivePrice(
  targetCny: number,
  walletCurrencyPerCny: number,
  minimum: number,
  maximum: number,
  steamTotal: (receive: number) => number,
  inrFees?: (receive: number) => number,
) {
  const estimatedTotal = Math.floor(targetCny * walletCurrencyPerCny * (1 - EXCHANGE_RATE_BUFFER));
  if (!Number.isSafeInteger(estimatedTotal) || !Number.isSafeInteger(minimum) || minimum <= 0) {
    throw new Error("Steam 金额参数无效。");
  }
  if (maximum > 0 && estimatedTotal > maximum) throw new Error("目标售价超过 Steam 价格上限。");

  const getTotal = (receive: number) => {
    const total = steamTotal(receive);
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Steam 手续费计算失败。");
    return total;
  };
  const fits = (receive: number) => {
    if (!inrFees) return getTotal(receive) <= estimatedTotal;

    // Preserve distinct INR payouts even when Steam rounds their buyer totals to the same price.
    const fees = inrFees(receive);
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
  const total = getTotal(low);
  if (maximum > 0 && total > maximum) throw new Error("目标售价超过 Steam 价格上限。");
  return total >= 3 * minimum ? low : null;
}
