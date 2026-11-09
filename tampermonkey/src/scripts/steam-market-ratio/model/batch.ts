export type PurchaseBatch = {
  cost: number;
  count: number;
  unitCost: number;
};

export function parseBatch(total: string, quantity: string): PurchaseBatch {
  if (!/^\d+(?:\.\d{1,2})?$/.test(total.trim())) {
    throw new Error("请输入有效的人民币总成本，最多两位小数。");
  }
  const cost = Math.round(Number(total) * 100);
  const count = Number(quantity);
  const quantityOk = /^\d+$/.test(quantity.trim()) && Number.isSafeInteger(count) && count > 0 && count <= 1e6;
  if (!Number.isSafeInteger(cost) || cost <= 0 || !quantityOk) {
    throw new Error("总成本必须大于 0，数量应为 1–1,000,000 的整数。");
  }
  return { cost, count, unitCost: cost / count / 100 };
}
