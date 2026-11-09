import { injectStyle, loadValue, saveValue } from "@/shared";

import { parseBatch } from "../model/batch";
import { CURRENCIES } from "../model/currencies";
import { getExchangeRate, type ExchangeRate } from "../exchange/rates";
import { isCs2Listing, loadMarket, type MarketSnapshot } from "../steam/market";
import css from "./panel.css";
import { clearOrderTables, updateOrderTables } from "./orders";
import { mountOrderTooltip } from "./tooltip";

const PANEL_ID = "kuusei-steam-market-ratio";
const STORAGE_PREFIX = "kuusei-steam-market-ratio:v1:";
const REFRESH_GAP_MS = 10_000;

const PANEL_MARKUP = `<div class="ksr-settings">
    <strong>挂刀比例</strong>
    <label>购买总价 (CNY) <input id="ksr-cost" inputmode="decimal" placeholder="1000" autocomplete="off"></label>
    <span>/</span><label>数量 <input id="ksr-quantity" inputmode="numeric" placeholder="25" autocomplete="off"></label>
    <span id="ksr-unit"></span><button id="ksr-refresh" type="button">刷新</button>
  </div>
  <div class="ksr-info"><span id="ksr-rate">自动获取汇率中…</span>
    <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a></div>
  <div id="ksr-status" role="status" aria-live="polite"></div>
  <div id="ksr-validation" role="status" aria-live="polite"></div>`;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "加载失败，请重试。";
}

function rateLabel(currency: number, rate: ExchangeRate) {
  if (currency === 23) return "CNY → CNY = 1";
  const code = CURRENCIES[currency] ?? `币种 #${currency}`;
  return `1 ${code} = ${rate.rate.toFixed(6)} CNY · ${new Date(rate.updatedAt).toLocaleDateString("zh-CN")}`;
}

function placePanel(host: HTMLElement, tables: HTMLTableElement[]) {
  const first = tables[0];
  if (!first) return;
  let anchor: Element = first;
  while (anchor.parentElement) {
    const parent = anchor.parentElement;
    if (tables.every((table) => parent.contains(table))) break;
    anchor = parent;
  }
  const parent = anchor.parentElement;
  if (!parent || host.contains(parent)) return;
  if (host.parentElement !== parent || host.nextElementSibling !== anchor) parent.insertBefore(host, anchor);
}

export function mountPanel() {
  if (!isCs2Listing(location.pathname) || document.getElementById(PANEL_ID)) return;
  injectStyle(`${PANEL_ID}-style`, css);
  const host = document.createElement("section");
  host.id = PANEL_ID;
  host.setAttribute("aria-label", "挂刀成本设置");
  host.innerHTML = PANEL_MARKUP;
  document.body.appendChild(host);

  const syncTooltip = mountOrderTooltip();
  const field = <T extends Element>(id: string) => {
    const element = host.querySelector<T>(`#ksr-${id}`);
    if (!element) throw new Error(`缺少 #ksr-${id}`);
    return element;
  };
  const input = (id: "cost" | "quantity") => field<HTMLInputElement>(id);
  const refreshButton = field<HTMLButtonElement>("refresh");
  const text = (id: "unit" | "rate" | "status" | "validation", value: string) => {
    const element = field(id);
    if (element.textContent !== value) element.textContent = value;
  };

  let snapshot: MarketSnapshot | null = null;
  let exchange: ExchangeRate | null = null;
  let loadedKey = "";
  let requestId = 0;
  let lastRequest = 0;
  let currentPath = location.pathname;
  let depthTimer: number | undefined;
  let depthPending = false;
  let depthCheckedAt = 0;
  let renderTimer: number | undefined;

  const scheduleDepthRefresh = () => {
    if (depthTimer !== undefined || depthPending || !snapshot) return;
    depthTimer = window.setTimeout(() => {
      void refreshDepth();
    }, Math.max(150, REFRESH_GAP_MS - (Date.now() - depthCheckedAt)));
  };

  async function refreshDepth() {
    depthTimer = undefined;
    if (!snapshot || !isCs2Listing(location.pathname)) return;
    const id = requestId;
    const key = snapshot.key;
    depthPending = true;
    depthCheckedAt = Date.now();
    try {
      const result = await loadMarket();
      if (id !== requestId || result.key !== key) return;
      snapshot = result;
      render();
    } catch (error) {
      if (id === requestId) text("status", errorText(error));
    } finally {
      depthPending = false;
    }
  }

  const render = () => {
    if (!snapshot || !isCs2Listing(location.pathname)) {
      clearOrderTables(document);
      syncTooltip();
      return;
    }
    text("validation", "");
    text("unit", "");
    let unitCost: number | null = null;
    let count: number | null = null;
    if (input("cost").value || input("quantity").value) {
      try {
        const batch = parseBatch(input("cost").value, input("quantity").value);
        unitCost = batch.unitCost;
        count = batch.count;
        text("unit", `单个 ¥${unitCost.toFixed(4)}`);
      } catch (error) {
        text("validation", errorText(error));
      }
    }
    try {
      const tables = updateOrderTables(document, {
        currency: snapshot.currency,
        rule: snapshot.rule,
        rate: exchange?.rate ?? null,
        unitCost,
        count,
        buy: snapshot.buy,
        sell: snapshot.sell,
        onDepthMismatch: scheduleDepthRefresh,
      });
      placePanel(host, tables);
    } catch (error) {
      clearOrderTables(document);
      text("validation", errorText(error));
    }
    syncTooltip();
  };

  const refresh = async () => {
    if (Date.now() - lastRequest < REFRESH_GAP_MS) {
      text("status", "请间隔 10 秒后再刷新。");
      return;
    }
    lastRequest = Date.now();
    const id = ++requestId;
    const path = location.pathname;
    refreshButton.disabled = true;
    text("status", snapshot ? "更新行情中…" : "正在读取钱包规则…");
    if (!exchange) text("rate", "自动获取汇率中…");
    try {
      const result = await loadMarket();
      if (id !== requestId || location.pathname !== path) return;
      if (snapshot?.currency !== result.currency) exchange = null;
      snapshot = result;
      if (loadedKey !== result.key) {
        const batch = loadValue<{ total?: unknown; quantity?: unknown } | null>(`${STORAGE_PREFIX}batch:${result.key}`, null);
        input("cost").value = typeof batch?.total === "string" ? batch.total : "";
        input("quantity").value = typeof batch?.quantity === "string" ? batch.quantity : "";
        loadedKey = result.key;
      }
      text("status", "");
      render();
      const rate = await getExchangeRate(result.currency);
      if (id !== requestId || location.pathname !== path) return;
      exchange = rate;
      text("rate", rateLabel(result.currency, rate));
      render();
    } catch (error) {
      if (id === requestId) {
        text("status", errorText(error));
        if (!exchange) text("rate", "汇率未就绪");
        render();
      }
    } finally {
      if (id === requestId) refreshButton.disabled = false;
    }
  };

  refreshButton.addEventListener("click", () => {
    void refresh();
  });
  host.addEventListener("input", () => {
    if (!snapshot) return;
    try {
      saveValue(`${STORAGE_PREFIX}batch:${snapshot.key}`, {
        total: input("cost").value,
        quantity: input("quantity").value,
      });
      render();
    } catch (error) {
      text("validation", `配置保存失败：${errorText(error)}`);
    }
  });

  new MutationObserver((records) => {
    const internal = records.every((record) => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      return node?.closest(`#${PANEL_ID}, #${PANEL_ID}-tooltip, [data-kuusei-ratio], [data-kuusei-level]`);
    });
    if (internal || renderTimer !== undefined) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = undefined;
      render();
    }, 80);
  }).observe(document.body, { subtree: true, childList: true, characterData: true });

  window.setInterval(() => {
    if (currentPath === location.pathname) return;
    currentPath = location.pathname;
    requestId += 1;
    snapshot = null;
    exchange = null;
    render();
    lastRequest = 0;
    host.hidden = !isCs2Listing(currentPath);
    if (!host.hidden) void refresh();
  }, 500);
  void refresh();
}
