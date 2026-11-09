import { fetchText } from "./http";
import { isCs2Listing } from "./listing";
import { parseLiveBook, parseSsrSnapshot, type MarketSnapshot } from "./snapshot";
import { loadWallet } from "./wallet";

export type { MarketSnapshot } from "./snapshot";
export { isCs2Listing } from "./listing";

type Cache = {
  path: string;
  snapshot: MarketSnapshot;
};

let context: Cache | null = null;

async function refreshBook(path: string, snapshot: MarketSnapshot) {
  const bucket = snapshot.key.slice(snapshot.key.indexOf("/") + 1);
  const params = new URLSearchParams({ q: "Load", qp: JSON.stringify([730, bucket]) });
  const payload: unknown = JSON.parse(await fetchText(`/market/orderbook?${params}`, {
    "x-valve-request-type": "queryAction",
  }));
  const next: MarketSnapshot = {
    ...snapshot,
    ...parseLiveBook(payload, snapshot.currency),
    updatedAt: Date.now(),
  };
  if (location.pathname === path) context = { path, snapshot: next };
  return next;
}

export async function loadMarket() {
  if (!isCs2Listing(location.pathname)) {
    throw new Error("此脚本仅支持 CS2 物品市场详情页。");
  }
  const path = location.pathname;
  if (context?.path === path) return refreshBook(path, context.snapshot);

  const html = await fetchText(location.href);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.getElementById("valve-ssr-data")?.textContent;
  if (!raw) throw new Error("未读取到新版市场数据，请重新加载 Steam 页面。");
  const embedded: unknown = JSON.parse(raw);
  const snapshot = parseSsrSnapshot(embedded, path, await loadWallet());
  if (location.pathname === path) context = { path, snapshot };
  return snapshot;
}
