export const ORDER_DEPTH = 10;

export type OrderLevel = {
  price: number;
  quantity: number;
};

export type OrderSide = "buy" | "sell";

export function compactLevels(values: unknown, side: OrderSide, limit = ORDER_DEPTH): OrderLevel[] {
  if (!Array.isArray(values) || values.length % 2 !== 0) {
    throw new Error("新版市场深度格式异常。");
  }
  const levels: OrderLevel[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const price = Number(values[index]);
    const quantity = Number(values[index + 1]);
    const previous = levels[levels.length - 1];
    const outOfOrder = !!previous && (side === "buy" ? price >= previous.price : price <= previous.price);
    const invalid = !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0;
    if (invalid || outOfOrder) throw new Error("新版市场档位价格或数量异常。");
    levels.push({ price, quantity });
    if (levels.length === limit) break;
  }
  return levels;
}
