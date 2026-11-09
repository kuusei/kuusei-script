import { loadValue, saveValue } from "@/shared";

import { CURRENCIES } from "../model/currencies";
import { isRecord } from "../model/record";

const STORAGE_KEY = "kuusei-steam-market-ratio:exchange-rates:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const INVALID_RATES = "汇率接口返回的数据无效。";

export type ExchangeRateCache = {
  rates: Record<string, number>;
  updatedAt: number;
  expiresAt: number;
};

export type ExchangeRate = {
  rate: number;
  updatedAt: number;
};

let pending: Promise<ExchangeRateCache> | null = null;

export function parseExchangeRates(data: unknown, now = Date.now()): ExchangeRateCache {
  const updatedUnix = isRecord(data) ? data.time_last_update_unix : undefined;
  const valid = isRecord(data)
    && isRecord(data.rates)
    && data.result === "success"
    && data.base_code === "CNY"
    && data.rates.CNY === 1
    && typeof updatedUnix === "number"
    && Number.isFinite(updatedUnix)
    && updatedUnix > 0;
  if (!valid || !isRecord(data) || !isRecord(data.rates) || typeof updatedUnix !== "number") {
    throw new Error(INVALID_RATES);
  }

  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(data.rates)) {
    if (/^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[code] = rate;
    }
  }
  const next = Number(data.time_next_update_unix) * 1000;
  const untilNext = Number.isFinite(next) && next > now ? next : now + HOUR_MS;
  return {
    rates,
    updatedAt: updatedUnix * 1000,
    expiresAt: Math.min(now + DAY_MS, untilNext),
  };
}

function requestRates() {
  return new Promise<ExchangeRateCache>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: "https://open.er-api.com/v6/latest/CNY",
      timeout: 15_000,
      anonymous: true,
      onload(response) {
        try {
          if (response.status !== 200) throw new Error(`汇率接口请求失败（${response.status}）。`);
          resolve(parseExchangeRates(JSON.parse(response.responseText) as unknown));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(INVALID_RATES));
        }
      },
      onerror: () => reject(new Error("汇率获取失败，请检查网络后重试。")),
      ontimeout: () => reject(new Error("汇率接口请求超时，请重试。")),
    });
  });
}

function loadRates() {
  if (!pending) {
    pending = requestRates().then((result) => {
      saveValue(STORAGE_KEY, result);
      return result;
    }).finally(() => {
      pending = null;
    });
  }
  return pending;
}

export async function getExchangeRate(currency: number): Promise<ExchangeRate> {
  if (currency === 23) return { rate: 1, updatedAt: Date.now() };
  const code = CURRENCIES[currency];
  if (!code) throw new Error(`暂不支持钱包币种 #${currency} 的自动汇率。`);

  let cached = loadValue<ExchangeRateCache | null>(STORAGE_KEY, null);
  if (!cached || !Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now()) {
    cached = await loadRates();
  }
  const quoted = cached.rates?.[code];
  if (typeof quoted !== "number" || !Number.isFinite(quoted) || quoted <= 0) {
    throw new Error(`汇率接口暂未提供 ${code} 汇率。`);
  }
  // The table quotes foreign currency per 1 CNY; the market needs CNY per 1 wallet unit.
  return { rate: 1 / quoted, updatedAt: cached.updatedAt };
}
