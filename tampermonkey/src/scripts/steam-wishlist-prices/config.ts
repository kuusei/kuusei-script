export type CountryGroup = "base" | "low";

export type CountryColumn = {
  code: string;
  label: string;
  group: CountryGroup;
};

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const WISHLIST_CACHE_TTL_MS = 60 * 60 * 1000;
export const REGULAR_PRICE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
export const US_STORE_COUNTRY = "US";
export const WISHLIST_STORE_PAGE_SIZE = 1000;
export const WISHLIST_STORE_FILL_MAX = 2000;
export const AAA_USD_MIN = 49;
export const GIFT_BAND_STRICT = 0.1;
export const GIFT_BAND_LOOSE = 0.15;
export const FX_CHEAP_BAND = 0.01;

export const COUNTRIES: CountryColumn[] = [
  { code: "CN", label: "中国", group: "base" },
  { code: "TW", label: "台湾", group: "base" },
  { code: "HK", label: "香港", group: "base" },
  { code: "SG", label: "新加坡", group: "base" },
  { code: "JP", label: "日本", group: "base" },
  { code: "US", label: "美国", group: "base" },
  { code: "PK", label: "南亚", group: "low" },
  { code: "IN", label: "印度", group: "low" },
  { code: "ID", label: "印尼", group: "low" },
  { code: "PH", label: "菲律宾", group: "low" },
  { code: "TR", label: "土耳其", group: "low" },
  { code: "UA", label: "乌克兰", group: "low" },
  { code: "RU", label: "俄罗斯", group: "low" },
  { code: "AR", label: "阿根廷", group: "low" },
];
