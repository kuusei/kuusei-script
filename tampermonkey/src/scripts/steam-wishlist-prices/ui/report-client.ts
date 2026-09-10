import { AAA_USD_MIN, COUNTRIES, FX_CHEAP_BAND, GIFT_BAND_LOOSE, GIFT_BAND_STRICT } from "../config";
import { discountTimeMessages, formatDiscountEnd, gameDiscountEnd } from "../pricing/discount-time";
import type { ReportPayload } from "./report-html";
import { loadRegionSetup, saveRegionSetup } from "./region-settings";
import { steamListHtml } from "./steam-list";

type ReportState = {
  q: string;
  sale: boolean;
  missing: boolean;
  gift: boolean;
  aaa: boolean;
  soon: boolean;
  cheapest: string;
  sort: string;
  dir: "asc" | "desc";
  shown: Set<string>;
  giftLoose: boolean;
  fxCheap: boolean;
  home: string;
};

export const mountReport = (
  root: ParentNode,
  payload: ReportPayload,
  handlers?: { onRefetch?: () => void },
) => {
  const codes = payload.countries.map((country) => country.code);
  const allCodes = COUNTRIES.map((country) => country.code);
  const el = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const loadShown = (): Set<string> => {
    const setup = loadRegionSetup();
    if (setup?.shown.length) {
      return new Set(setup.shown.filter((code) => allCodes.includes(code)));
    }
    return new Set(codes);
  };
  const state: ReportState = {
    q: "",
    sale: false,
    missing: false,
    gift: false,
    aaa: false,
    soon: false,
    cheapest: "",
    sort: "vsHome",
    dir: "desc",
    shown: loadShown(),
    giftLoose: localStorage.getItem("wishlist-gift-mode") === "loose",
    fxCheap: localStorage.getItem("wishlist-fx-cheap") !== "off",
    home: allCodes.includes(payload.home) ? payload.home : "CN",
  };
  state.shown.add(state.home);
  const nearBand = () => (state.giftLoose ? GIFT_BAND_LOOSE : GIFT_BAND_STRICT);
  const cheapBand = () => (state.fxCheap ? FX_CHEAP_BAND : 0.0001);
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
  const ymd = (ts: number | null) => {
    if (ts == null) return "—";
    const date = new Date(ts * 1000);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  };
  const visibleCountries = () => {
    const shown = payload.countries.filter((country) => state.shown.has(country.code));
    return shown
      .filter((country) => country.code === state.home)
      .concat(shown.filter((country) => country.code !== state.home));
  };
  const labelOf = (code: string) =>
    COUNTRIES.find((country) => country.code === code)?.label ||
    payload.countries.find((country) => country.code === code)?.label ||
    code ||
    "—";
  const viewOf = (row: ReportPayload["rows"][number]) => {
    let cheapestCny: number | null = null;
    for (const country of visibleCountries()) {
      const cny = row.prices[country.code]?.cny;
      if (cny != null && (cheapestCny == null || cny < cheapestCny)) cheapestCny = cny;
    }
    const cheapestCodes: string[] = [];
    if (cheapestCny != null) {
      for (const country of visibleCountries()) {
        const cny = row.prices[country.code]?.cny;
        if (cny != null && cny <= cheapestCny * (1 + cheapBand())) cheapestCodes.push(country.code);
      }
    }
    const home = row.prices[state.home]?.cny ?? null;
    const vsHome =
      home != null && cheapestCny != null && home > 0 ? (home - cheapestCny) / home : null;
    return { cheapestCode: cheapestCodes[0] || null, cheapestCodes, cheapestCny, vsHome };
  };
  const band = (cny: number | null | undefined, min: number | null): "" | "cheap" | "near" => {
    if (cny == null || min == null) return "";
    if (cny <= min * (1 + cheapBand())) return "cheap";
    if (cny <= min * (1 + nearBand())) return "near";
    return "";
  };
  const canGiftToHome = (cny: number | null | undefined, code: string, home: number | null) => {
    if (cny == null || home == null || home <= 0 || code === state.home) return false;
    if (cny > home * 1.0001) return false;
    return cny / home >= 1 - nearBand();
  };
  const noDeal = (row: ReportPayload["rows"][number]) =>
    row.delisted || row.comingSoon || row.free;
  const statusText = (row: ReportPayload["rows"][number]) =>
    row.delisted ? "已下架" : row.comingSoon ? "未发售" : row.free ? "免费" : "";
  const filtered = (opts: { skipCheap?: boolean } = {}) =>
    payload.rows.filter((row) => {
      const query = state.q.trim().toLowerCase();
      if (query && !row.title.toLowerCase().includes(query) && !String(row.appid).includes(query)) {
        return false;
      }
      const view = viewOf(row);
      const shownPrices = visibleCountries().map((country) => row.prices[country.code]);
      if (state.sale && (noDeal(row) || !shownPrices.some((price) => price && price.cut > 0))) {
        return false;
      }
      if (state.missing && (noDeal(row) || shownPrices.every((price) => price?.cny != null))) {
        return false;
      }
      if (state.gift) {
        if (noDeal(row)) return false;
        const home = row.prices[state.home]?.cny ?? null;
        const giftable = visibleCountries().some((country) =>
          canGiftToHome(row.prices[country.code]?.cny, country.code, home),
        );
        if (!giftable) return false;
      }
      if (state.aaa) {
        if (noDeal(row)) return false;
        const us = row.prices.US;
        if (us?.currency !== "USD" || us?.regular == null || us.regular < AAA_USD_MIN) return false;
      }
      if (state.soon && row.comingSoon) return false;
      if (!opts.skipCheap && state.cheapest && !view.cheapestCodes.includes(state.cheapest)) {
        return false;
      }
      return true;
    });
  const cheapShare = (count: number, total: number) =>
    total ? `${Math.round((count / total) * 100)}%` : "0%";
  const cheapStats = () => {
    const rows = filtered({ skipCheap: true }).filter((row) => !noDeal(row));
    const counts: Record<string, number> = {};
    for (const row of rows) {
      for (const code of viewOf(row).cheapestCodes) {
        counts[code] = (counts[code] || 0) + 1;
      }
    }
    return { total: rows.length, counts };
  };
  const valueOf = (row: ReportPayload["rows"][number], key: string) => {
    const view = viewOf(row);
    if (key === "title") return row.title;
    if (key === "releasedAt") return row.releasedAt;
    if (key === "discountEndsAt") return noDeal(row) ? null : gameDiscountEnd(row.prices, state.home);
    if (key === "appid") return row.appid;
    if (key === "cheapestCode") return view.cheapestCode || "";
    if (key === "cheapest") return view.cheapestCny;
    if (key === "vsHome") return view.vsHome;
    return row.prices[key]?.cny;
  };
  const cmp = (left: unknown, right: unknown, dir: "asc" | "desc") => {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    const sign = dir === "asc" ? 1 : -1;
    if (typeof left === "string") return left.localeCompare(String(right), "zh") * sign;
    return ((left as number) - (right as number)) * sign;
  };
  const isPriceSort = (key: string) => key !== "title" && key !== "releasedAt" && key !== "appid";
  const sorted = (rows: ReportPayload["rows"]) =>
    [...rows].sort((left, right) => {
      if (isPriceSort(state.sort)) {
        const aBottom = noDeal(left) ? 1 : 0;
        const bBottom = noDeal(right) ? 1 : 0;
        if (aBottom !== bBottom) return aBottom - bBottom;
      }
      return cmp(valueOf(left, state.sort), valueOf(right, state.sort), state.dir);
    });
  const applySort = (key: string) => {
    if (state.sort === key) return;
    const wasPrice = isPriceSort(state.sort);
    state.sort = key;
    if (key === "title") state.dir = "asc";
    else if (key === "releasedAt") state.dir = "desc";
    else if (key === "discountEndsAt") state.dir = "asc";
    else if (!wasPrice) state.dir = "desc";
  };
  const dirLabel = () => {
    if (state.sort === "discountEndsAt") {
      const text = discountTimeMessages["zh-CN"];
      return state.dir === "asc" ? text.ascending : text.descending;
    }
    if (state.sort === "title") return state.dir === "asc" ? "A→Z" : "Z→A";
    if (state.sort === "releasedAt") return state.dir === "desc" ? "新→旧" : "旧→新";
    return state.dir === "desc" ? "高→低" : "低→高";
  };
  const closeMenus = () => {
    el("region-menu-panel").classList.add("hidden");
    el("cheap-menu-panel").classList.add("hidden");
    el("home-menu-panel").classList.add("hidden");
    el("sort-menu-panel").classList.add("hidden");
  };
  const sortOptions = () => {
    const fixed = [
      { key: "vsHome", label: "相对账户区" },
      { key: "cheapest", label: "最低价" },
      { key: "title", label: "标题" },
      { key: "releasedAt", label: "发售日" },
      { key: "discountEndsAt", label: discountTimeMessages["zh-CN"].sort },
    ];
    const regions = visibleCountries().map((country) => ({
      key: country.code,
      label: country.label,
    }));
    return fixed.concat(regions);
  };
  const sortLabel = (key: string) =>
    sortOptions().find((item) => item.key === key)?.label || "相对账户区";
  const syncSortMenu = () => {
    const keys = new Set(sortOptions().map((item) => item.key));
    if (!keys.has(state.sort)) {
      state.sort = "vsHome";
      state.dir = "desc";
    }
    el("sort-menu-label").textContent = sortLabel(state.sort);
    el("sort-dir-label").textContent = dirLabel();
    el("sort-menu-list").innerHTML = sortOptions()
      .map((item) => {
        const on = item.key === state.sort;
        return `<button type="button" data-sort="${item.key}" class="wl-opt flex w-full items-center px-2 py-1.5 text-left text-sm ${on ? "is-on" : "text-ink"}">${item.label}</button>`;
      })
      .join("");
  };
  const toggleMenu = (id: string) => {
    const panel = el(id);
    const willOpen = panel.classList.contains("hidden");
    closeMenus();
    if (willOpen) panel.classList.remove("hidden");
  };
  const syncCheapMenu = () => {
    if (state.cheapest && !state.shown.has(state.cheapest)) state.cheapest = "";
    const stats = cheapStats();
    const selectedCount = state.cheapest ? stats.counts[state.cheapest] || 0 : 0;
    el("cheap-menu-label").textContent = state.cheapest
      ? `最低价区：${labelOf(state.cheapest)}`
      : "最低价区：全部";
    const stat = el("cheap-menu-stat");
    if (state.cheapest) {
      stat.textContent = `${selectedCount} · ${cheapShare(selectedCount, stats.total)}`;
      stat.classList.remove("hidden");
    } else {
      stat.textContent = "";
      stat.classList.add("hidden");
    }
    const items = [{ code: "", label: "全部", count: 0 }].concat(
      visibleCountries().map((country) => ({
        code: country.code,
        label: country.label,
        count: stats.counts[country.code] || 0,
      })),
    );
    el("cheap-menu-list").innerHTML = items
      .map((item) => {
        const on = item.code === state.cheapest;
        const meta = item.code
          ? `<span class="tabular-nums text-xs text-muted whitespace-nowrap">${item.count} · ${cheapShare(item.count, stats.total)}</span>`
          : "";
        return `<button type="button" data-cheap="${item.code}" class="wl-opt flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-sm ${on ? "is-on" : "text-ink"}"><span>${item.label}</span>${meta}</button>`;
      })
      .join("");
  };
  const syncRegionMenu = () => {
    el("region-menu-count").textContent = `${state.shown.size}/${allCodes.length}`;
    for (const input of Array.from(el("region-menu-list").querySelectorAll("input[data-region]"))) {
      const box = input as HTMLInputElement;
      const code = box.dataset.region || "";
      box.checked = state.shown.has(code);
      box.disabled = code === state.home;
    }
  };
  const persistRegions = () => {
    state.shown.add(state.home);
    saveRegionSetup({ home: state.home, shown: [...state.shown] });
    const needsFetch = [...state.shown].some((code) => !codes.includes(code));
    if (needsFetch) {
      handlers?.onRefetch?.();
      return;
    }
    syncRegionMenu();
    syncCheapMenu();
    syncSortMenu();
    render();
  };
  const syncHomeMenu = () => {
    if (!allCodes.includes(state.home)) state.home = "CN";
    el("home-menu-label").textContent = labelOf(state.home);
    el("home-menu-list").innerHTML = COUNTRIES.map((country) => {
      const on = country.code === state.home;
      return `<button type="button" data-home="${country.code}" class="wl-opt flex w-full items-center px-2 py-1.5 text-left text-sm ${on ? "is-on" : "text-ink"}">${country.label}</button>`;
    }).join("");
  };
  const persistHome = () => {
    state.shown.add(state.home);
    saveRegionSetup({ home: state.home, shown: [...state.shown] });
    if (!codes.includes(state.home)) {
      handlers?.onRefetch?.();
      return;
    }
    syncHomeMenu();
    syncRegionMenu();
    render();
  };
  const giftTip = () =>
    state.giftLoose
      ? "宽松 15%：给公开汇率和 Steam 内部结算汇率留余量。相对当前账户区域，该区价 ÷ 账户区价 ≥ 85%。当前账户区不标；最低价只要够近也会标。接近阈值仅供参考。"
      : "严谨 10%：跟 SteamDB / 社区反推的旧送礼门槛。相对当前账户区域，该区价 ÷ 账户区价 ≥ 90%。当前账户区不标；最低价只要够近也会标。Valve 未公布官方百分比。";
  const syncGiftMode = () => {
    const value = Math.round(nearBand() * 100);
    el("near-pct").textContent = String(value);
    el("gift-pct").textContent = String(value);
    el("gift-tip").textContent = giftTip();
    const giftModeClass = (on: boolean, edge: boolean) =>
      `h-5 px-1.5 text-[11px] leading-none ${edge ? "border-l border-line " : ""}${on ? "bg-cream text-ink" : "text-muted hover:bg-cream"}`;
    el("gift-strict").className = giftModeClass(!state.giftLoose, false);
    el("gift-loose").className = giftModeClass(state.giftLoose, true);
  };
  const persistGiftMode = () => {
    localStorage.setItem("wishlist-gift-mode", state.giftLoose ? "loose" : "strict");
    syncGiftMode();
    render();
  };
  const render = () => {
    const countries = visibleCountries();
    const rows = sorted(filtered());
    el("count").textContent = `显示 ${rows.length} / ${payload.rows.length}`;
    syncSortMenu();
    el("list").innerHTML = steamListHtml(
      rows.map((row) => {
        const view = viewOf(row);
        const status = noDeal(row) ? statusText(row) : "";
        return {
          appid: row.appid,
          title: row.title,
          capsule: row.capsule,
          meta: `${row.appid} · ${ymd(row.releasedAt)}`,
          status,
          discountEnd: status ? null : formatDiscountEnd(gameDiscountEnd(row.prices, state.home)),
          vsHome: status ? "" : `相对${labelOf(state.home)} ${pct(view.vsHome)}`,
          cheapestLabel: "最低",
          cheapest: status
            ? ""
            : `${view.cheapestCodes.map((code) => labelOf(code)).join(" / ")} ${fmt(view.cheapestCny)}`,
          chips: status
            ? []
            : countries.map((country) => {
                const price = row.prices[country.code];
                const cny = price?.cny ?? null;
                const home = row.prices[state.home]?.cny ?? null;
                return {
                  label: country.label,
                  cny: fmt(cny),
                  local:
                    price?.amount != null ? `${price.amount.toFixed(2)} ${price.currency}` : "",
                  cut: price?.cut ?? 0,
                  band: band(cny, view.cheapestCny),
                  gift: canGiftToHome(cny, country.code, home),
                };
              }),
        };
      }),
    );
    for (const img of Array.from(el("list").querySelectorAll("img"))) {
      img.addEventListener("error", () => {
        (img as HTMLImageElement).style.visibility = "hidden";
      });
    }
    syncCheapMenu();
  };

  (el("q") as HTMLInputElement).addEventListener("input", (event) => {
    state.q = (event.target as HTMLInputElement).value;
    render();
  });
  (el("sale") as HTMLInputElement).addEventListener("change", (event) => {
    state.sale = (event.target as HTMLInputElement).checked;
    render();
  });
  (el("missing") as HTMLInputElement).addEventListener("change", (event) => {
    state.missing = (event.target as HTMLInputElement).checked;
    render();
  });
  (el("gift") as HTMLInputElement).addEventListener("change", (event) => {
    state.gift = (event.target as HTMLInputElement).checked;
    render();
  });
  (el("aaa") as HTMLInputElement).addEventListener("change", (event) => {
    state.aaa = (event.target as HTMLInputElement).checked;
    render();
  });
  (el("soon") as HTMLInputElement).addEventListener("change", (event) => {
    state.soon = (event.target as HTMLInputElement).checked;
    render();
  });
  (el("fxCheap") as HTMLInputElement).checked = state.fxCheap;
  el("fxCheap").addEventListener("change", (event) => {
    state.fxCheap = (event.target as HTMLInputElement).checked;
    localStorage.setItem("wishlist-fx-cheap", state.fxCheap ? "on" : "off");
    render();
  });
  el("gift-strict").addEventListener("click", () => {
    if (!state.giftLoose) return;
    state.giftLoose = false;
    persistGiftMode();
  });
  el("gift-loose").addEventListener("click", () => {
    if (state.giftLoose) return;
    state.giftLoose = true;
    persistGiftMode();
  });
  el("home-menu-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("home-menu-panel");
  });
  el("home-menu-panel").addEventListener("click", (event) => {
    event.stopPropagation();
    const btn = (event.target as Element).closest("[data-home]") as HTMLElement | null;
    if (!btn) return;
    state.home = btn.dataset.home || state.home;
    closeMenus();
    persistHome();
  });
  el("cheap-menu-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("cheap-menu-panel");
  });
  el("cheap-menu-panel").addEventListener("click", (event) => {
    event.stopPropagation();
    const btn = (event.target as Element).closest("[data-cheap]") as HTMLElement | null;
    if (!btn) return;
    state.cheapest = btn.dataset.cheap || "";
    closeMenus();
    syncCheapMenu();
    render();
  });
  el("region-menu-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("region-menu-panel");
  });
  el("region-menu-panel").addEventListener("click", (event) => event.stopPropagation());
  el("region-menu-list").addEventListener("change", (event) => {
    const input = (event.target as Element).closest("input[data-region]") as HTMLInputElement | null;
    if (!input || input.disabled) return;
    const code = input.dataset.region || "";
    if (input.checked) state.shown.add(code);
    else state.shown.delete(code);
    persistRegions();
  });
  el("regions-all").addEventListener("click", () => {
    state.shown = new Set(allCodes);
    persistRegions();
  });
  root.addEventListener("click", closeMenus);
  el("sort-menu-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("sort-menu-panel");
  });
  el("sort-dir-btn").addEventListener("click", (event) => {
    event.stopPropagation();
    state.dir = state.dir === "asc" ? "desc" : "asc";
    closeMenus();
    render();
  });
  el("sort-menu-panel").addEventListener("click", (event) => {
    event.stopPropagation();
    const sortEl = (event.target as Element).closest("[data-sort]") as HTMLElement | null;
    if (!sortEl) return;
    applySort(sortEl.dataset.sort || "vsHome");
    closeMenus();
    render();
  });
  el("guide-close").addEventListener("click", () => {
    el("guide").classList.remove("open");
    localStorage.setItem("wishlist-guide-done", "1");
  });
  el("guide-open").addEventListener("click", () => el("guide").classList.add("open"));
  el("guide").addEventListener("click", (event) => {
    if (event.target === el("guide")) {
      el("guide").classList.remove("open");
      localStorage.setItem("wishlist-guide-done", "1");
    }
  });
  syncRegionMenu();
  syncCheapMenu();
  syncHomeMenu();
  syncGiftMode();
  render();
};
