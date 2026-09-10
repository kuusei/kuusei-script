import type { RegionPrice } from "./price-rows";

export const discountTimeMessages = {
  "zh-CN": { discountEndsAt: "折扣截止", timeZone: "北京时间", sort: "折扣截止", ascending: "早→晚", descending: "晚→早" },
  "en-US": { discountEndsAt: "Sale ends", timeZone: "UTC+8", sort: "Sale end date", ascending: "Earliest first", descending: "Latest first" },
};

export const formatDiscountEnd = (endsAt: number | null, locale: keyof typeof discountTimeMessages = "zh-CN") => {
  if (endsAt === null || !Number.isFinite(endsAt) || endsAt <= 0) return null;
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  const text = discountTimeMessages[locale];
  const when = date.toLocaleString(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return { label: text.discountEndsAt, when, timeZone: text.timeZone };
};

export const gameDiscountEnd = (prices: Record<string, RegionPrice>, home: string) => {
  const validEnd = (price: RegionPrice | undefined) =>
    price && price.cut > 0 && Number.isFinite(price.discountEndsAt) && Number(price.discountEndsAt) > 0
      ? price.discountEndsAt
      : null;
  const homeEnd = validEnd(prices[home]);
  if (homeEnd !== null) return homeEnd;
  const ends = Object.values(prices).map(validEnd).filter((end): end is number => end !== null);
  return ends.length > 0 ? Math.min(...ends) : null;
};
