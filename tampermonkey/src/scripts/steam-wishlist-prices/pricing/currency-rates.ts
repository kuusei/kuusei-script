import { requestJson } from "@/shared";

import { cacheGet, cacheSet, fxCacheKey, FX_TTL_MS } from "../cache/cache";
import { noteRequest } from "../requests/request-meter";

export type UsdRates = {
  fetchedAt: string;
  usdTo: Record<string, number>;
};

const FX_URL = "https://open.er-api.com/v6/latest/USD";

export const loadUsdRates = async () => {
  const cached = cacheGet<UsdRates>(fxCacheKey, FX_TTL_MS);
  if (cached) {
    return cached;
  }
  noteRequest();
  const data = await requestJson<{ result?: string; rates?: Record<string, number> }>({
    url: FX_URL,
  });
  if (data.result !== "success" || !data.rates?.CNY) {
    throw new Error("FX response missing CNY rate");
  }
  const rates: UsdRates = {
    fetchedAt: new Date().toISOString(),
    usdTo: data.rates,
  };
  cacheSet(fxCacheKey, rates);
  return rates;
};

export const toCny = (amount: number, currency: string, rates: UsdRates) => {
  const code = currency.toUpperCase();
  if (code === "CNY") {
    return amount;
  }
  const usdToCny = rates.usdTo.CNY;
  const usdToSource = code === "USD" ? 1 : rates.usdTo[code];
  if (!usdToCny || !usdToSource) {
    return null;
  }
  return (amount / usdToSource) * usdToCny;
};
