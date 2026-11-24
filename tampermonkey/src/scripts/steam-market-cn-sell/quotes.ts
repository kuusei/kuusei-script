import { compactLevels } from "../steam-market-ratio/model/order-book";
import { parseCnyAmount } from "./price";

const MARKET = "https://steamcommunity.com/market/priceoverview/";
const MARKET_CURRENCY = { country: "CN", currency: "23" };
const RATES = "https://marketdb.info/api/v1/exchange-rates?base=CNY";

export type ItemKey = { appid: number; marketHashName: string; contextid?: string; itemNameId?: string };

function getText(url: string, label: string, anonymous = true): Promise<string> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      anonymous,
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

const itemNameIds = new Map<string, Promise<string>>();

function loadItemNameId({ appid, contextid, marketHashName }: ItemKey) {
  if (!contextid || !/^[1-9]\d*$/.test(contextid)) throw new Error("Steam 未提供此物品的国区盘口。");
  const url = new URL("https://steamcommunity.com/market/multisell");
  url.search = new URLSearchParams({ appid: String(appid), contextid, "items[]": marketHashName }).toString();
  let pending = itemNameIds.get(url.href);
  if (!pending) {
    // Steam's batch page still exposes exact histogram IDs and requires the user's Steam session.
    pending = getText(url.href, "国区盘口", false).then((html) => {
      const readArray = (name: string): unknown => {
        const match = new RegExp(String.raw`\b${name}\s*=\s*(\[(?:\s*(?:"(?:[^"\\]|\\.)*"|\d+)\s*,?)*\s*\])`).exec(html);
        return match ? JSON.parse(match[1]) : undefined;
      };
      const names = readArray("g_rgMarketHashNames");
      const ids = readArray("g_rgItemNameIds");
      const pageAppid = /\bg_unAppId\s*=\s*(\d+)\s*;/.exec(html)?.[1];
      const index = Array.isArray(names) ? names.indexOf(marketHashName) : -1;
      const id = Array.isArray(ids) && index >= 0 ? ids[index] : undefined;
      if (Number(pageAppid) !== appid || !Array.isArray(names) || !Array.isArray(ids)
        || names.length !== ids.length || typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
        throw new Error("Steam 未提供此物品的国区盘口。");
      }
      return id;
    }).catch((failure) => {
      itemNameIds.delete(url.href);
      throw failure;
    });
    itemNameIds.set(url.href, pending);
  }
  return pending;
}

export async function loadChinaOrderBook(item: ItemKey) {
  const itemNameId = item.itemNameId ?? await loadItemNameId(item);
  if (!/^[1-9]\d*$/.test(itemNameId)) throw new Error("Steam 未提供此物品的国区盘口。");

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
type Rates = { base: "CNY"; rates: { code: string; rate: unknown }[] };

let cachedRates: { rates: Rates; expiresAt: number } | undefined;
let pendingRates: Promise<Rates> | undefined;

export async function loadCurrencyPerCny(currency: WalletCurrency) {
  const now = Date.now();
  let data = cachedRates && cachedRates.expiresAt > now ? cachedRates.rates : undefined;
  if (!data) {
    pendingRates ??= getJson(RATES, "汇率").then((response) => {
      const result = response as Partial<Rates> | null;
      const entries = result?.rates;
      if (result?.base !== "CNY" || !Array.isArray(entries)
        || !["INR", "UAH"].every((code) => entries.some((entry) => entry?.code === code && isValidRate(entry.rate)))) {
        throw new Error("未取得有效的 Steam 市场汇率。");
      }
      const rates = result as Rates;
      cachedRates = { rates, expiresAt: Date.now() + 3_600_000 };
      return rates;
    }).finally(() => { pendingRates = undefined; });
    data = await pendingRates;
  }
  const rate = data.rates.find((entry) => entry?.code === currency)?.rate;
  if (!isValidRate(rate)) throw new Error(`未取得有效的人民币兑 ${currency} 汇率。`);
  return rate;
}

function isValidRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}
