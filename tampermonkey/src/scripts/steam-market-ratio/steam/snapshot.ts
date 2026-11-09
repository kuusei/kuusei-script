import { compactLevels, type OrderLevel } from "../model/order-book";
import { isRecord } from "../model/record";
import { isCs2Listing, listingAppId } from "./listing";
import { feeRuleFromWallet, type WalletInfo } from "./wallet";

export type MarketSnapshot = {
  key: string;
  name: string;
  currency: number;
  country: string;
  rule: ReturnType<typeof feeRuleFromWallet>;
  buy: OrderLevel[];
  sell: OrderLevel[];
  updatedAt: number;
};

const UNREADABLE = "无法识别新版市场的物品信息，请在箱子市场详情页使用。";

function readJson(value: unknown) {
  return typeof value === "string" ? JSON.parse(value) as unknown : value;
}

function listingsFrom(ssr: Record<string, unknown>) {
  const source = ssr.loaderData ?? [];
  if (!Array.isArray(source)) throw new Error(UNREADABLE);
  return source.map((entry) => readJson(entry));
}

function queriesFrom(ssr: Record<string, unknown>) {
  const renderContext = isRecord(ssr.renderContext) ? ssr.renderContext : undefined;
  const queryData = readJson(renderContext?.queryData);
  if (!isRecord(queryData) || !Array.isArray(queryData.queries)) return [];
  return queryData.queries;
}

function marketState(queries: unknown[], kind: string, appid: number, bucket?: string) {
  const entry = queries.find((query) => {
    if (!isRecord(query) || !Array.isArray(query.queryKey)) return false;
    const [scope, name, id, selected] = query.queryKey;
    if (scope !== "market" || name !== kind || Number(id) !== appid) return false;
    return bucket === undefined || selected === bucket;
  });
  if (!isRecord(entry) || !isRecord(entry.state)) return undefined;
  return entry.state.data;
}

function listingFor(loaders: unknown[], appid: number) {
  return loaders.find((entry) => {
    return isRecord(entry) && Boolean(entry.success) && Number(entry.appid) === appid && Boolean(entry.buckets);
  });
}

export function parseSsrSnapshot(ssr: unknown, path: string, wallet: WalletInfo): MarketSnapshot {
  if (!isCs2Listing(path)) throw new Error("此脚本仅支持 CS2 物品市场详情页。");
  if (!isRecord(ssr)) throw new Error(UNREADABLE);
  const appid = listingAppId(path);
  const listing = listingFor(listingsFrom(ssr), appid);
  if (!isRecord(listing)) throw new Error(UNREADABLE);
  const bucket = listing.initialSelectedBucketID ?? listing.initialFallbackBucketID;
  if (typeof bucket !== "string" || !bucket) {
    throw new Error("请先在 Steam 页面选择具体物品，再刷新计算器。");
  }

  const queries = queriesFrom(ssr);
  const book = marketState(queries, "orderbook", appid, bucket);
  if (!isRecord(book)) throw new Error("Steam 未返回此物品的买卖深度，请稍后刷新。");
  const currency = Number(book.eCurrency);
  if (!Number.isSafeInteger(currency) || currency <= 0 || Number(wallet.wallet_currency) !== currency) {
    throw new Error("订单币种与钱包币种不一致，请登录并重新加载 Steam 市场页面。");
  }

  const description = marketState(queries, "description", appid, bucket);
  const marketName = isRecord(description) ? description.market_name : undefined;
  const userConfig = isRecord(ssr.UserConfig) ? ssr.UserConfig : undefined;
  return {
    key: `${appid}/${bucket}`,
    name: marketName == null ? bucket : String(marketName),
    currency,
    country: String(wallet.wallet_country ?? userConfig?.country_code ?? "未知"),
    rule: feeRuleFromWallet(wallet, marketState(queries, "fees", appid)),
    buy: compactLevels(book.rgCompactBuyOrders, "buy", Number.POSITIVE_INFINITY),
    sell: compactLevels(book.rgCompactSellOrders, "sell", Number.POSITIVE_INFINITY),
    updatedAt: Date.now(),
  };
}

export function parseLiveBook(response: unknown, currency: number) {
  const result = isRecord(response) ? response.data : undefined;
  if (!isRecord(result) || !result.success || !isRecord(result.data)) {
    throw new Error("订单数据读取失败。");
  }
  if (Number(result.data.eCurrency) !== currency) {
    throw new Error("订单币种与钱包币种不一致。");
  }
  return {
    buy: compactLevels(result.data.rgCompactBuyOrders, "buy", Number.POSITIVE_INFINITY),
    sell: compactLevels(result.data.rgCompactSellOrders, "sell", Number.POSITIVE_INFINITY),
  };
}
