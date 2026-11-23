import { receivedFromBuyer } from "../steam-market-ratio/model/fees";

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
  publisherRate: number,
  steamRate: number,
) {
  const estimatedTotal = Math.floor(targetCny * walletCurrencyPerCny);
  if (!Number.isSafeInteger(targetCny) || targetCny <= 0
    || !Number.isFinite(walletCurrencyPerCny) || walletCurrencyPerCny <= 0
    || !Number.isSafeInteger(estimatedTotal) || !Number.isSafeInteger(minimum) || minimum <= 0) {
    throw new Error("Steam 金额参数无效。");
  }
  if (maximum > 0 && estimatedTotal > maximum) throw new Error("目标售价超过 Steam 价格上限。");

  // Reverse fees in CNY cents before converting the seller's net amount.
  const netCny = receivedFromBuyer(targetCny, {
    publisherRate, steamRate, minimum: 7, increment: 1,
  });
  const receive = Math.floor(netCny * walletCurrencyPerCny);
  if (receive < minimum) return null;
  const total = steamTotal(receive);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Steam 手续费计算失败。");
  if (maximum > 0 && total > maximum) throw new Error("目标售价超过 Steam 价格上限。");
  return total >= 3 * minimum ? receive : null;
}
