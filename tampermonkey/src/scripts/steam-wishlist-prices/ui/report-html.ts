import { COUNTRIES } from "../config";
import type { CountryColumn } from "../config";
import type { GameRow } from "../pricing/price-rows";

export type ReportPayload = {
  wishlistCount?: number;
  generatedAt: string;
  fxAt: string;
  steamId: string;
  steamName: string;
  home: string;
  countries: CountryColumn[];
  rows: GameRow[];
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
          Steam <a class="tip inline cursor-help border-b border-dotted border-muted hover:text-ink" href="${href}" target="_blank" rel="noreferrer">${name}<span class="tip-box absolute left-0 top-full z-40 mt-1.5 w-max tabular-nums">${escapeHtml(payload.steamId)}</span></a> 愿望单
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
          <button type="button" id="itad-settings" class="text-xs font-normal text-near underline underline-offset-2">史低设置</button>
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
        <p>各区现价、折扣和截止时间分别取自该区 Steam 愿望单。价格缓存 1 小时，愿望单刷新时更新所选区域。</p>
        <p>「折扣」筛选显示区域中有折扣的游戏，包含其中的史低和新史低。配置 ITAD 后显示史低和「新史低」筛选：史低筛选本区已达史低的游戏（包含新史低）；「新史低」只筛选本区新史低。这三项只能选一个，选中时自动取消另外两项，再次点击可取消。其他筛选条件与所选项取交集。</p>
        <p>ITAD 只查询当前账户区域的 Steam 商店史低。史低持久保存，切换主区域时清除。现价与已保存史低币种相同且高于或等于史低时，跳过该游戏的 ITAD 查询；无记录或现价更低时再查，同价重查间隔 1 小时。本区没有数据时显示暂无史低数据。价格后的绿色史低表示现价已达到史低；本区现价低于 ITAD 记录的史低，或 ITAD 本区 Steam 报价标记为新史低且与现价一致时，显示深绿色「新史低」。人民币换算采用当前汇率，币种不同时不判断是否达到史低。</p>
      </div>
      <p class="mt-3 text-sm leading-6 text-muted">ITAD 的新史低识别不完全准确，部分新史低可能仅标记为史低，因此「新史低」筛选可能遗漏这些游戏。</p>
      <button type="button" id="guide-close" class="mt-5 h-9 w-full rounded-lg bg-cream text-sm text-ink hover:bg-chip">好</button>
    </div>
  </div>
</div>`;
};
