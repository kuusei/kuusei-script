import { COUNTRIES } from "../config";
import type { CountryColumn } from "../config";
import type { GameRow } from "../pricing/price-rows";
import type { WishlistTags } from "../steam/wishlist-tags";
import { tagControlsHtml } from "./wishlist-tags";

export type ReportPayload = {
  wishlistCount?: number;
  generatedAt: string;
  fxAt: string;
  steamId: string;
  steamName: string;
  home: string;
  countries: CountryColumn[];
  rows: GameRow[];
  tags?: WishlistTags;
  tagShareToken?: string;
  itad?: { enabled: boolean; home: string; warning: string | null };
};

const fmtWhen = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const filterToggle = (id: string, label: string, tip = "") =>
  `<span class="wl-filter-option${tip ? " tip" : ""}"><label class="wl-filter-toggle"><input id="${id}" type="checkbox"${tip ? ` aria-describedby="${id}-tip"` : ""} /><span class="wl-filter-face"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="wl-filter-add" d="M8 3.5v9M3.5 8h9" /><path class="wl-filter-check" d="m3.5 8 3 3 6-6" /></svg><span>${label}</span></span></label>${tip ? `<span id="${id}-tip" class="tip-box wl-filter-tip-box" role="tooltip">${escapeHtml(tip)}</span>` : ""}</span>`;

export const renderReportShell = (payload: ReportPayload) => {
  const fetched = new Set(payload.countries.map((country) => country.code));
  const regionItems = COUNTRIES.map((country) => {
    const locked = country.code === payload.home;
    const on = fetched.has(country.code) || locked;
    return `<label class="wl-opt flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm text-ink"><input type="checkbox" data-region="${country.code}" ${on ? "checked" : ""} ${locked ? "disabled" : ""} class="size-3.5 accent-near" />${escapeHtml(country.label)}</label>`;
  }).join("");
  const name = escapeHtml(payload.steamName || payload.steamId);
  const href = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(payload.steamId)}/`;
  return `
<div class="flex h-full min-h-0 flex-col bg-paper text-ink antialiased">
  <header class="shrink-0 border-b border-line bg-surface">
    <div class="px-5 py-4">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="flex min-w-0 flex-wrap items-center gap-2 text-xl font-semibold text-ink">
          Steam <a id="wishlist-link" class="tip inline cursor-help border-b border-dotted border-muted hover:text-ink" href="${href}" target="_blank" rel="noreferrer">${name}<span class="tip-box absolute left-0 top-full z-40 mt-1.5 w-max tabular-nums">${escapeHtml(payload.steamId)}</span></a> 愿望单
          <span class="inline-flex items-center gap-1.5">
            <span class="text-xs font-normal text-muted">当前账户区域</span>
            <div class="relative">
              <button type="button" id="home-menu-btn" class="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-sm font-medium text-ink hover:bg-cream">
                <span id="home-menu-label"></span>
                <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
              </button>
              <div id="home-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-40 rounded-xl p-2">
                <div id="home-menu-list" class="max-h-72 overflow-auto"></div>
              </div>
            </div>
          </span>
          <button type="button" id="setup-open" class="text-xs font-normal text-near underline underline-offset-2">设置</button>
        </h1>
        <p class="ml-auto shrink-0 text-xs text-muted">生成于 ${fmtWhen(payload.generatedAt)} · 汇率 ${fmtWhen(payload.fxAt)}</p>
      </div>
      <p class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted"><span class="font-bold text-cheap">绿色</span>最低价 · <span class="font-bold text-near">浅蓝</span>最低价 +≤<span id="near-pct">10</span>% · <span class="tip inline cursor-help border-b border-dotted border-gift"><span class="font-bold text-gift">可送礼</span>相对当前账户区域差价 ≤<span id="gift-pct">10</span>%<span class="tip-box absolute left-0 top-full z-40 mt-1.5 w-72" id="gift-tip"></span></span><span class="inline-flex overflow-hidden rounded border border-line bg-surface align-middle" title="差价阈值"><button type="button" id="gift-strict" class="h-5 px-1.5 text-[11px] leading-none text-ink bg-cream">严谨 10%</button><button type="button" id="gift-loose" class="h-5 border-l border-line px-1.5 text-[11px] leading-none text-muted hover:bg-cream">宽松 15%</button></span><label class="inline-flex h-5 cursor-pointer items-center gap-1 rounded border border-line bg-surface px-1.5 text-[11px] leading-none text-ink has-[:checked]:bg-cream"><input id="fxCheap" type="checkbox" class="size-3 accent-cheap" />忽略误差1%</label></p>
    </div>
  </header>
  <div class="wl-toolbar">
    <input id="q" type="search" placeholder="搜索游戏 / AppID" class="wl-toolbar-search" />
    <div class="relative">
      <button type="button" id="cheap-menu-btn" class="wl-toolbar-button">
        <span id="cheap-menu-label">最低价区：全部</span>
        <span id="cheap-menu-stat" class="hidden rounded-full bg-chip px-1.5 text-[11px] text-muted tabular-nums"></span>
        <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
      </button>
      <div id="cheap-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-64 rounded-xl p-2">
        <div id="cheap-menu-list" class="max-h-72 overflow-auto"></div>
      </div>
    </div>
    <div class="relative">
      <button type="button" id="region-menu-btn" class="wl-toolbar-button">
        比价区域
        <span id="region-menu-count" class="rounded-full bg-chip px-1.5 text-[11px] text-muted">0/0</span>
        <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
      </button>
      <div id="region-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-52 rounded-xl p-2">
        <div id="region-menu-list" class="max-h-72 overflow-auto">${regionItems}</div>
        <p class="px-2 py-1 text-[11px] leading-4 text-muted">建议少于 8 个，区越多请求越慢</p>
        <button type="button" id="regions-all" class="wl-opt mt-1 w-full px-2 py-1.5 text-left text-xs text-muted">全选</button>
      </div>
    </div>
    <div class="relative wl-toolbar-sort">
      <div class="wl-sort-controls">
        <button type="button" id="sort-menu-btn" class="wl-toolbar-button">
          <span id="sort-menu-label">相对账户区</span>
          <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
        </button>
        <button type="button" id="sort-dir-btn" class="wl-toolbar-button" title="切换正序 / 倒序">
          <span id="sort-dir-label">低→高</span>
        </button>
      </div>
      <div id="sort-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-52 rounded-xl p-2">
        <div id="sort-menu-list" class="max-h-72 overflow-auto"></div>
      </div>
    </div>
    ${payload.tags ? tagControlsHtml() : ""}
    <span id="count" class="wl-toolbar-count"></span>
    <div class="wl-toolbar-filters" role="group" aria-label="游戏筛选">
      <div class="wl-price-filters" role="group" aria-label="价格筛选">
        ${filterToggle("sale", "折扣")}
        ${payload.itad?.enabled ? filterToggle("history-low", "史低", "本区已达史低，包含新史低。ITAD 的新史低识别不完全准确，部分新史低可能仅标记为史低。") + filterToggle("new-low", "新史低", "本区现价低于 ITAD 史低，或 ITAD 报价标记为新史低且与现价一致。识别结果不完全准确，部分新史低可能仅标记为史低，不会出现在此筛选中。") : ""}
      </div>
      ${filterToggle("missing", "锁区")}
      ${filterToggle("gift", "可赠礼")}
      ${filterToggle("soon", "屏蔽未发售")}
    </div>
  </div>
  <div class="relative flex min-h-0 flex-1 flex-col px-5 py-4">
    <div id="list"></div>
    <button type="button" id="screenshot-open" class="wl-icon-button wl-shot-trigger" aria-label="导出截图" title="导出截图">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3.5" /></svg>
    </button>
  </div>
</div>`;
};
