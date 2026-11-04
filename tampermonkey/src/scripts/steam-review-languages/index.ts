import { injectStyle, whenDocumentReady } from "@/shared";
import { createStatsLoader, fetchStats, readCache, readPageStats, writeCache } from "./api";
import { languageName } from "./languages";
import { coverageStatus, isSummary, otherLanguages, reviewRate, reviewUrl, sortStats, stackPercentages, type ReviewStats, type SortKey } from "./stats";
import css from "./style.css";

const PANEL_ID = "ks-review-languages";
const number = new Intl.NumberFormat("zh-CN");

function mount(appid: number, target: HTMLElement) {
  if (document.getElementById(PANEL_ID)) return;
  injectStyle(`${PANEL_ID}-style`, css);
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "各语言评测统计");
  panel.innerHTML = `
    <div class="ks-heading"><h3>各语言评测</h3><button type="button" data-action="refresh">刷新</button></div>
    <div class="ks-table-scroll"><table aria-label="各语言评论数、好评数、差评数和好评率">
      <thead><tr><th scope="col">语言</th>
        <th scope="col" aria-sort="descending"><button type="button" data-sort="total">评论数 ↓</button></th>
        <th scope="col"><button type="button" data-sort="positive">好评数</button></th>
        <th scope="col"><button type="button" data-sort="negative">差评数</button></th>
        <th scope="col">占比</th>
        <th scope="col"><button type="button" data-sort="rate">好评率</button></th>
      </tr></thead><tbody></tbody>
    </table></div>
    <div class="ks-footer"><button type="button" data-action="expand" hidden>展开全部语言</button>
      <span class="ks-status" role="status" aria-live="polite">等待加载</span></div>`;
  // Keep the panel outside Steam's React root so rerenders cannot remove it.
  target.before(panel);
  const body = panel.querySelector("tbody")!;
  const status = panel.querySelector<HTMLElement>(".ks-status")!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-action="refresh"]')!;
  const expand = panel.querySelector<HTMLButtonElement>('[data-action="expand"]')!;
  const data = new Map<string, ReviewStats>();
  const loader = createStatsLoader({
    readPage: () => readPageStats(document, appid),
    readCache: () => readCache(appid),
    request: () => fetchStats(appid),
    saveCache: rows => writeCache(appid, rows),
  });
  let sort: SortKey = "total";
  let descending = true;
  let expanded = false;
  let busy = false;
  const sortLabels: Record<SortKey, string> = {
    total: "评论数", positive: "好评数", negative: "差评数", rate: "好评率",
  };

  function render() {
    const all = data.get("all");
    const allPurchases = data.get("all_purchases");
    const native = [...data.values()];
    const rows = sortStats(native.filter(row => !isSummary(row) && row.total > 0), sort, descending);
    const other = otherLanguages(native);
    const visible = expanded ? rows : rows.slice(0, 8);
    const fragment = document.createDocumentFragment();
    const summaries = [...(all ? [all] : []), ...(allPurchases ? [allPurchases] : [])];
    const displayed = [...summaries, ...visible, ...(other ? [other] : [])];
    let separated = false;
    for (const row of displayed) {
      if (!isSummary(row) && summaries.length && !separated) {
        const gap = document.createElement("tr");
        gap.className = "ks-summary-gap";
        gap.setAttribute("aria-hidden", "true");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        gap.append(cell);
        fragment.append(gap);
        separated = true;
      }
      const tr = document.createElement("tr");
      if (isSummary(row)) {
        tr.className = row.language === "all" ? "ks-total" : "ks-total ks-all-purchases";
      } else {
        const stack = stackPercentages(row);
        tr.className = "ks-stacked";
        tr.style.setProperty("--ks-positive-end", `${stack.positive}%`);
        tr.style.setProperty("--ks-total-end", `${stack.total}%`);
      }
      const name = document.createElement("td");
      if (row.language === "other") {
        name.textContent = "其他语言";
        name.title = "尚未单列的语言合计";
      } else {
        const link = document.createElement("a");
        link.textContent = languageName(row.language);
        link.href = reviewUrl(appid, row.language);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = `查看${languageName(row.language)}评测`;
        name.append(link);
      }
      const count = document.createElement("td");
      count.className = "ks-count";
      count.textContent = number.format(row.total);
      const positive = document.createElement("td");
      positive.className = "ks-up";
      positive.textContent = number.format(row.positive);
      const negative = document.createElement("td");
      negative.className = "ks-down";
      negative.textContent = number.format(row.total - row.positive);
      const share = document.createElement("td");
      share.textContent = isSummary(row) ? row.total > 0 ? "100.0%" : "—"
        : all && all.total > 0 ? `${(row.total / all.total * 100).toFixed(1)}%` : "—";
      const rating = document.createElement("td");
      const rate = reviewRate(row);
      const group = document.createElement("span");
      group.className = `ks-rating ${rate === null ? "" : rate >= 70 ? "ks-positive" : rate >= 40 ? "ks-mixed" : "ks-negative"}`;
      group.title = `好评 ${number.format(row.positive)} · 差评 ${number.format(row.total - row.positive)}`;
      const percent = document.createElement("span");
      percent.className = "ks-rate";
      percent.textContent = rate === null ? "—" : `${rate.toFixed(1)}%`;
      group.append(percent);
      rating.append(group);
      tr.append(name, count, positive, negative, share, rating);
      fragment.append(tr);
    }
    body.replaceChildren(fragment);
    expand.hidden = rows.length <= 8;
    expand.disabled = busy;
    expand.textContent = expanded ? "收起" : `展开全部语言（${rows.length}）`;
    for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-sort]"))) {
      const key = button.dataset.sort as SortKey;
      button.textContent = `${sortLabels[key]}${key === sort ? descending ? " ↓" : " ↑" : ""}`;
      button.parentElement!.setAttribute("aria-sort", key === sort ? descending ? "descending" : "ascending" : "none");
    }
  }

  async function load(force = false) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    panel.setAttribute("aria-busy", "true");
    status.classList.remove("ks-error");
    status.textContent = "加载中…";
    try {
      const rows = await loader.load(force);
      data.clear();
      for (const row of rows) data.set(row.language, row);
      status.textContent = coverageStatus(rows);
      render();
    } catch (error) {
      status.classList.add("ks-error");
      status.textContent = error instanceof Error ? error.message : "统计加载失败，点击刷新重试";
    } finally {
      busy = false;
      refresh.disabled = false;
      panel.setAttribute("aria-busy", "false");
      render();
    }
  }

  panel.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.action === "refresh") void load(true);
    else if (button.dataset.action === "expand") {
      expanded = !expanded;
      render();
    }
    else if (button.dataset.sort === "total" || button.dataset.sort === "rate"
      || button.dataset.sort === "positive" || button.dataset.sort === "negative") {
      descending = button.dataset.sort === sort ? !descending : true;
      sort = button.dataset.sort;
      render();
    }
  });
  render();
  void load();
  return { panel, resume: () => { void load(); } };
}

whenDocumentReady(() => {
  const appid = Number(location.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1]);
  if (!Number.isSafeInteger(appid) || appid <= 0) return;
  let mounted: ReturnType<typeof mount>;
  const tryMount = () => {
    if (mounted?.panel.isConnected || document.getElementById(PANEL_ID)) return;
    const target = document.querySelector<HTMLElement>('[data-featuretarget="appreviews"]')
      ?? document.querySelector<HTMLElement>("#user_reviews, #app_reviews_hash");
    if (!target) return;
    if (mounted) {
      target.before(mounted.panel);
      mounted.resume();
    } else mounted = mount(appid, target);
  };
  // Steam may render late or replace the entire review section. Reattach the
  // existing panel so statistics, sorting and event handlers survive that update.
  const observer = new MutationObserver(tryMount);
  observer.observe(document.body, { childList: true, subtree: true });
  tryMount();
});
