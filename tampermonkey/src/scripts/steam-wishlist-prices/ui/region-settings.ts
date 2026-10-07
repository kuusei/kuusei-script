import { COUNTRIES, type CountryColumn } from "../config";
import { syncItadHome } from "../pricing/itad-prices";

const SETUP_KEY = "wishlist-setup-v1";
const SETUP_VERSION = 1;
const DEFAULT_HOME = "CN";
const DEFAULT_COMPARE = ["CN", "US"];

export type RegionSetup = {
  home: string;
  shown: string[];
};

const codes = COUNTRIES.map((country) => country.code);

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const uniqueCodes = (home: string, shown: string[]) => {
  const picked = [home, ...shown].filter((code) => codes.includes(code));
  return [...new Set(picked)];
};

export const loadRegionSetup = (): RegionSetup | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETUP_KEY) || "null") as {
      v?: number;
      home?: string;
      shown?: string[];
    } | null;
    if (!parsed || parsed.v !== SETUP_VERSION) return null;
    if (!parsed.home || !codes.includes(parsed.home) || !Array.isArray(parsed.shown)) return null;
    const shown = uniqueCodes(parsed.home, parsed.shown);
    if (shown.length === 0) return null;
    return { home: parsed.home, shown };
  } catch {
    return null;
  }
};

export const saveRegionSetup = (setup: RegionSetup) => {
  syncItadHome(setup.home);
  const shown = uniqueCodes(setup.home, setup.shown);
  localStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ v: SETUP_VERSION, home: setup.home, shown }),
  );
  localStorage.setItem("wishlist-guide-done", "1");
};

export const countriesForSetup = (setup: RegionSetup): CountryColumn[] => {
  const wanted = new Set(uniqueCodes(setup.home, setup.shown));
  return COUNTRIES.filter((country) => wanted.has(country.code));
};

export const compareRegionLimit = (wishlistCount: number) => wishlistCount > 4000 ? 5 : 9;

export const needsRegionSetup = (setup: RegionSetup | null, wishlistCount: number, force = false) =>
  force || !setup || countriesForSetup(setup).length > compareRegionLimit(wishlistCount);

const defaultSetup = (): RegionSetup => ({
  home: DEFAULT_HOME,
  shown: DEFAULT_COMPARE.filter((code) => codes.includes(code)),
});

const readLegacyShown = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("wishlist-regions") || "null");
    if (!saved) return null;
    const picked = Array.isArray(saved) ? saved : saved.shown;
    if (!Array.isArray(picked)) return null;
    const shown = picked.filter((code: unknown): code is string => typeof code === "string" && codes.includes(code));
    return shown.length ? shown : null;
  } catch {
    return null;
  }
};

export const legacyRegionSetup = (): RegionSetup | null => {
  const homeRaw = localStorage.getItem("wishlist-home-region");
  const home = homeRaw && codes.includes(homeRaw) ? homeRaw : DEFAULT_HOME;
  const shown = readLegacyShown();
  if (!shown && !(homeRaw && codes.includes(homeRaw))) return null;
  return {
    home,
    shown: uniqueCodes(home, shown ?? DEFAULT_COMPARE),
  };
};

export const draftRegionSetup = (saved?: RegionSetup | null) =>
  saved ?? legacyRegionSetup() ?? defaultSetup();

export const renderSetupShell = (initial?: RegionSetup | null) => {
  const setup = draftRegionSetup(initial);
  const homeItems = COUNTRIES.map((country) => {
    const on = country.code === setup.home;
    return `<label class="wl-opt wl-setup-chip"><input type="radio" name="wl-home" value="${country.code}" ${on ? "checked" : ""} class="size-3.5 accent-near" />${escapeHtml(country.label)}</label>`;
  }).join("");
  const compareItems = COUNTRIES.map((country) => {
    const on = setup.shown.includes(country.code) || country.code === setup.home;
    const locked = country.code === setup.home;
    return `<label class="wl-opt wl-setup-chip"><input type="checkbox" data-compare="${country.code}" ${on ? "checked" : ""} ${locked ? "disabled" : ""} class="size-3.5 accent-near" />${escapeHtml(country.label)}</label>`;
  }).join("");
  return `
<div class="wl-setup">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-base font-semibold text-white">选择比价区域</h1>
    <button type="button" id="setup-close" class="wl-close shrink-0">关闭</button>
  </div>
  <h2 class="mt-4 text-[13px] font-medium text-ink">当前账户区域</h2>
  <div id="setup-home-list" class="wl-setup-grid mt-1.5">${homeItems}</div>
  <div class="mt-4 flex items-center justify-between gap-3">
    <div>
      <h2 class="text-[13px] font-medium text-ink">要比价的区域</h2>
    </div>
    <button type="button" id="setup-all" class="shrink-0 text-xs text-muted hover:text-ink">仅账户区</button>
  </div>
  <div id="setup-compare-list" class="wl-setup-grid mt-1.5">${compareItems}</div>
  <p id="setup-limit-hint" class="mt-2 text-xs leading-5 text-ink" role="status" aria-live="polite"></p>
  <button type="button" id="setup-start" class="wl-setup-go">开始比价</button>
</div>`;
};

export const mountSetup = (root: ParentNode, initial: RegionSetup | null | undefined, onStart: (setup: RegionSetup) => void, wishlistCount = 0) => {
  const setup = draftRegionSetup(initial);
  const home = { current: setup.home };
  const shown = new Set(uniqueCodes(setup.home, setup.shown));
  const limit = compareRegionLimit(wishlistCount);
  const el = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const syncCompare = () => {
    for (const input of Array.from(el("setup-compare-list").querySelectorAll("input[data-compare]"))) {
      const box = input as HTMLInputElement;
      const code = box.dataset.compare || "";
      box.checked = shown.has(code);
      box.disabled = code === home.current || (!box.checked && shown.size >= limit);
    }
    const over = shown.size > limit;
    el("setup-limit-hint").textContent = over
      ? `已选 ${shown.size} 个区域，请减少至 ${limit} 个以内。`
      : `已选 ${shown.size} / ${limit} 个区域`;
    const start = el("setup-start") as HTMLButtonElement;
    start.disabled = over;
    start.style.opacity = over ? "0.5" : "";
    start.style.cursor = over ? "not-allowed" : "";
  };
  el("setup-home-list").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "wl-home" || !input.checked) return;
    home.current = input.value;
    shown.add(home.current);
    syncCompare();
  });
  el("setup-compare-list").addEventListener("change", (event) => {
    const input = (event.target as Element).closest("input[data-compare]") as HTMLInputElement | null;
    if (!input || input.disabled) return;
    const code = input.dataset.compare || "";
    if (input.checked && shown.size < limit) shown.add(code);
    else shown.delete(code);
    syncCompare();
  });
  el("setup-all").addEventListener("click", () => {
    shown.clear();
    shown.add(home.current);
    syncCompare();
  });
  el("setup-start").addEventListener("click", () => {
    shown.add(home.current);
    if (shown.size > limit) { syncCompare(); return; }
    onStart({ home: home.current, shown: uniqueCodes(home.current, [...shown]) });
  });
  syncCompare();
};
