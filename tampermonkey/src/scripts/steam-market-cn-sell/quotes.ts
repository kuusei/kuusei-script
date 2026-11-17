import { compactLevels } from "../steam-market-ratio/model/order-book";
import { parseCnyAmount } from "./price";

const MARKET = "https://steamcommunity.com/market/priceoverview/";
const MARKET_CURRENCY = { country: "CN", currency: "23" };
const RATES = "https://open.er-api.com/v6/latest/CNY";

export type ItemKey = { appid: number; marketHashName: string };

function getText(url: string, label: string, cookie?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      anonymous: !cookie,
      cookie,
      timeout: 12_000,
      onload(response) {
        if (response.status !== 200) {
          reject(new Error(response.status === 429
            ? `${label}查询过于频繁，请稍后再试。`
            : `${label}查询失败（${response.status}）。`));
          return;
        }
        resolve(response.responseText);
      },
      onerror: () => reject(new Error(`${label}查询失败，请检查网络。`)),
      ontimeout: () => reject(new Error(`${label}查询超时，请重试。`)),
    });
  });
}

async function getJson(url: string, label: string): Promise<unknown> {
  const text = await getText(url, label);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label}返回的数据无效。`);
  }
}

function parseCnyQuote(text: unknown) {
  const match = typeof text === "string" && /^[¥￥](.+)$/.exec(text.trim());
  return match ? parseCnyAmount(match[1]) : null;
}

export async function loadChinaLowest({ appid, marketHashName }: ItemKey) {
  const url = new URL(MARKET);
  url.search = new URLSearchParams({
    appid: String(appid),
    ...MARKET_CURRENCY,
    market_hash_name: marketHashName,
  }).toString();
  const data = await getJson(url.href, "国区报价") as {
    success?: unknown;
    lowest_price?: unknown;
  } | null;
  if (!data?.success) throw new Error("Steam 未返回国区报价。");
  if (!data.lowest_price) throw new Error("国区暂无在售报价。");
  const cents = parseCnyQuote(data.lowest_price);
  if (cents === null) throw new Error("Steam 未返回有效的人民币报价。");
  return cents;
}

export async function loadChinaOrderBook({ appid, marketHashName }: ItemKey) {
  const listing = `https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(marketHashName)}?l=english`;
  // The classic page exposes the histogram ID. Apply Steam's opt-out preference to this request only.
  const html = await getText(listing, "国区盘口", "bMarketOptOut=1");
  const itemNameId = /Market_LoadOrderSpread\(\s*(\d+)\s*\)/.exec(html)?.[1];
  if (!itemNameId) throw new Error("Steam 未提供此物品的国区盘口。");

  const params = new URLSearchParams({
    ...MARKET_CURRENCY,
    language: "schinese",
    item_nameid: itemNameId,
    two_factor: "0",
    norender: "1",
  });
  const data = await getJson(`https://steamcommunity.com/market/itemordershistogram?${params}`, "国区盘口") as {
    success?: unknown;
    price_prefix?: unknown;
    buy_order_table?: unknown;
    sell_order_table?: unknown;
  } | null;
  if (data?.success !== 1 || !/^[¥￥]$/.test(String(data.price_prefix).trim())) {
    throw new Error("Steam 未返回有效的国区盘口。");
  }
  return {
    buy: parseOrderTable(data.buy_order_table, "buy"),
    sell: parseOrderTable(data.sell_order_table, "sell"),
  };
}

function parseOrderTable(table: unknown, side: "buy" | "sell") {
  if (!Array.isArray(table)) throw new Error("Steam 返回的国区盘口格式异常。");
  // Steam appends an aggregate row after the five individual price levels.
  const values = table.slice(0, 5).flatMap((entry) => [
    parseCnyQuote(entry?.price) ?? 0,
    typeof entry?.quantity === "string" && /^\d+(?:,\d{3})*$/.test(entry.quantity)
      ? Number(entry.quantity.replace(/,/g, ""))
      : 0,
  ]);
  return compactLevels(values, side, 5);
}

type WalletCurrency = "INR" | "UAH";
type Rates = Partial<Record<WalletCurrency, unknown>>;

let cachedRates: { rates: Rates; expiresAt: number } | undefined;

export async function loadCurrencyPerCny(currency: WalletCurrency) {
  const now = Date.now();
  let rate = cachedRates && cachedRates.expiresAt > now ? cachedRates.rates[currency] : undefined;
  if (!isValidRate(rate)) {
    const data = await getJson(RATES, "汇率") as {
      result?: unknown;
      base_code?: unknown;
      rates?: Rates;
      time_next_update_unix?: unknown;
    } | null;
    const rates = data?.rates;
    rate = rates?.[currency];
    if (data?.result !== "success" || data.base_code !== "CNY" || !rates || !isValidRate(rate)) {
      throw new Error(`未取得有效的人民币兑 ${currency} 汇率。`);
    }
    const nextUpdate = Number(data.time_next_update_unix) * 1000;
    const expiresAt = nextUpdate > now ? Math.min(nextUpdate, now + 86_400_000) : now + 3_600_000;
    cachedRates = { rates, expiresAt };
  }
  return rate;
}

function isValidRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}
