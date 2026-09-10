import { AAA_USD_MIN, COUNTRIES } from "../config";
import type { CountryColumn } from "../config";
import type { GameRow } from "../pricing/price-rows";

export type ReportPayload = {
  generatedAt: string;
  fxAt: string;
  steamId: string;
  steamName: string;
  home: string;
  countries: CountryColumn[];
  rows: GameRow[];
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

const pill = (id: string, label: string) =>
  `<label class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink has-[:checked]:bg-cream"><input id="${id}" type="checkbox" class="size-3.5 accent-cheap" />${label}</label>`;

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
          Steam <a class="tip inline cursor-help border-b border-dotted border-muted hover:text-ink" href="${href}" target="_blank" rel="noreferrer">${name}<span class="tip-box absolute left-0 top-full z-40 mt-1.5 w-max rounded-lg border border-near bg-menu px-2.5 py-1.5 text-left text-[11px] font-normal tabular-nums leading-5 text-muted shadow-xl">${escapeHtml(payload.steamId)}</span></a> 愿望单
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
          <button type="button" id="guide-open" class="text-xs font-normal text-muted underline decoration-dotted underline-offset-2 hover:text-ink">说明</button>
        </h1>
        <p class="ml-auto shrink-0 text-xs text-muted">生成于 ${fmtWhen(payload.generatedAt)} · 汇率 ${fmtWhen(payload.fxAt)}</p>
      </div>
      <p class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted"><span class="font-bold text-cheap">绿色</span>最低价 · <span class="font-bold text-near">浅蓝</span>最低价 +≤<span id="near-pct">10</span>% · <span class="tip inline cursor-help border-b border-dotted border-gift"><span class="font-bold text-gift">可送礼</span>相对当前账户区域差价 ≤<span id="gift-pct">10</span>%<span class="tip-box absolute left-0 top-full z-40 mt-1.5 w-72 rounded-lg border border-near bg-menu px-3 py-2 text-left text-[11px] font-normal leading-5 text-muted shadow-xl" id="gift-tip"></span></span><span class="inline-flex overflow-hidden rounded border border-line bg-surface align-middle" title="差价阈值"><button type="button" id="gift-strict" class="h-5 px-1.5 text-[11px] leading-none text-ink bg-cream">严谨 10%</button><button type="button" id="gift-loose" class="h-5 border-l border-line px-1.5 text-[11px] leading-none text-muted hover:bg-cream">宽松 15%</button></span><label class="inline-flex h-5 cursor-pointer items-center gap-1 rounded border border-line bg-surface px-1.5 text-[11px] leading-none text-ink has-[:checked]:bg-cream"><input id="fxCheap" type="checkbox" class="size-3 accent-cheap" />忽略误差1%</label></p>
    </div>
  </header>
  <div class="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-line bg-paper px-5 py-3">
    <input id="q" type="search" placeholder="搜索游戏 / AppID" class="h-8 w-52 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-near" />
    <div class="relative">
      <button type="button" id="cheap-menu-btn" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink hover:bg-cream">
        <span id="cheap-menu-label">最低价区：全部</span>
        <span id="cheap-menu-stat" class="hidden rounded-full bg-chip px-1.5 text-[11px] text-muted tabular-nums"></span>
        <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
      </button>
      <div id="cheap-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-64 rounded-xl p-2">
        <div id="cheap-menu-list" class="max-h-72 overflow-auto"></div>
      </div>
    </div>
    <div class="relative">
      <button type="button" id="region-menu-btn" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink hover:bg-cream">
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
    ${pill("sale", "有折扣")}
    ${pill("missing", "锁区")}
    ${pill("gift", "可赠礼")}
    ${pill("aaa", `3A（美区 ≥ $${AAA_USD_MIN}）`)}
    ${pill("soon", "屏蔽未发售")}
    <div class="relative">
      <div class="inline-flex overflow-hidden rounded-lg border border-line">
        <button type="button" id="sort-menu-btn" class="inline-flex h-8 items-center gap-1.5 bg-surface px-2.5 text-sm text-ink hover:bg-cream">
          <span id="sort-menu-label">相对账户区</span>
          <svg class="size-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
        </button>
        <button type="button" id="sort-dir-btn" class="h-8 border-l border-line bg-surface px-2.5 text-sm text-ink hover:bg-cream" title="切换正序 / 倒序">
          <span id="sort-dir-label">高→低</span>
        </button>
      </div>
      <div id="sort-menu-panel" class="wl-pop absolute left-0 z-40 mt-2 hidden w-52 rounded-xl p-2">
        <div id="sort-menu-list" class="max-h-72 overflow-auto"></div>
      </div>
    </div>
    <span id="count" class="ml-auto text-xs text-muted"></span>
  </div>
  <div class="flex min-h-0 flex-1 flex-col px-5 py-4">
    <div id="list"></div>
  </div>
  <div id="guide" class="fixed inset-0 z-50 items-center justify-center bg-[rgba(27,25,22,0.45)] p-4">
    <div class="wl-pop max-h-[min(36rem,calc(100vh-2rem))] w-full max-w-lg overflow-auto rounded-2xl p-5">
      <h2 class="text-base font-semibold text-ink">说明</h2>
      <div class="mt-3 space-y-3 text-sm leading-6 text-ink">
        <p>当前账户区域是你 Steam 实际所在区。比价和可送礼都相对这个区。</p>
        <p><span class="font-bold text-cheap">绿色</span>是最低价区，差价小于 1% 默认视为汇率误差也算最低价。<span class="font-bold text-near">浅蓝色</span>是和最低价区差价 +≤10%（宽松 15%）以内的区。<span class="font-bold text-gift">可送礼</span>说明可以赠送到当前区域。临界价格受 Steam 汇率影响，不一定能送。</p>
        <p>比价区域用来选择要拉取对比的区。账户区始终包含在内。</p>
      </div>
      <button type="button" id="guide-close" class="mt-5 h-9 w-full rounded-lg bg-cream text-sm text-ink hover:bg-chip">好</button>
    </div>
  </div>
</div>`;
};
