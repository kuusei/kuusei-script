import { COUNTRIES, type CountryColumn } from "../config";
import { loadItadApiKey, syncItadHome } from "../pricing/itad-prices";

const SETUP_KEY = "wishlist-setup-v1";
const SETUP_VERSION = 1;
const GUIDE_KEY = "wishlist-guide-done";
const GUIDE_VERSION = "v2";
const TAGS_KEY = "wishlist-tags-enabled";
const DEFAULT_HOME = "CN";
const DEFAULT_COMPARE = ["CN", "US"];

export type RegionSetup = {
  home: string;
  shown: string[];
};

export type SetupDraft = RegionSetup & {
  itadKey: string;
  tagsEnabled: boolean;
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

export const loadTagsEnabled = () => localStorage.getItem(TAGS_KEY) !== "off";

export const saveTagsEnabled = (enabled: boolean) => {
  localStorage.setItem(TAGS_KEY, enabled ? "on" : "off");
};

export const needsGuideSetup = () => localStorage.getItem(GUIDE_KEY) !== GUIDE_VERSION;

export const saveRegionSetup = (setup: RegionSetup) => {
  syncItadHome(setup.home);
  const shown = uniqueCodes(setup.home, setup.shown);
  localStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ v: SETUP_VERSION, home: setup.home, shown }),
  );
  localStorage.setItem(GUIDE_KEY, GUIDE_VERSION);
};

export const countriesForSetup = (setup: RegionSetup): CountryColumn[] => {
  const wanted = new Set(uniqueCodes(setup.home, setup.shown));
  return COUNTRIES.filter((country) => wanted.has(country.code));
};

export const compareRegionLimit = (wishlistCount: number) => wishlistCount > 4000 ? 5 : 9;

export const needsRegionSetup = (setup: RegionSetup | null, wishlistCount: number, force = false) =>
  force || !setup || countriesForSetup(setup).length > compareRegionLimit(wishlistCount);

const withPreferences = (setup: RegionSetup): SetupDraft => ({
  ...setup,
  itadKey: loadItadApiKey(),
  tagsEnabled: loadTagsEnabled(),
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

export const draftRegionSetup = (saved?: RegionSetup | null): SetupDraft =>
  withPreferences(saved ?? legacyRegionSetup() ?? {
    home: DEFAULT_HOME,
    shown: DEFAULT_COMPARE.filter((code) => codes.includes(code)),
  });

const closeIcon = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>`;

export const renderSetupShell = (initial?: RegionSetup | null) => {
  const setup = draftRegionSetup(initial);
  const homeItems = COUNTRIES.map((country) => {
    const on = country.code === setup.home;
    return `<label class="wl-setup-chip"><input type="radio" name="wl-home" value="${country.code}" ${on ? "checked" : ""} /><span class="wl-setup-chip-text">${escapeHtml(country.label)}</span><span class="wl-setup-dot" aria-hidden="true"></span></label>`;
  }).join("");
  const compareItems = COUNTRIES.map((country) => {
    const on = setup.shown.includes(country.code) || country.code === setup.home;
    const locked = country.code === setup.home;
    return `<label class="wl-setup-chip"><input type="checkbox" data-compare="${country.code}" ${on ? "checked" : ""} ${locked ? "disabled" : ""} /><span class="wl-setup-chip-text">${escapeHtml(country.label)}</span><span class="wl-setup-check" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6l2.5 2.5 4.5-5" /></svg></span></label>`;
  }).join("");
  return `
<div class="wl-setup">
  <div class="wl-setup-header">
    <h1 class="wl-setup-title">选择比价区域</h1>
    <button type="button" id="setup-close" class="wl-setup-close" aria-label="关闭">${closeIcon}</button>
  </div>
  <section class="wl-setup-section">
    <div class="wl-setup-section-head">
      <h2 class="wl-setup-label">当前账户区域</h2>
    </div>
    <div id="setup-home-list" class="wl-setup-grid">${homeItems}</div>
  </section>
  <section class="wl-setup-section">
    <div class="wl-setup-section-head">
      <h2 class="wl-setup-label">要比价的区域</h2>
      <p id="setup-limit-hint" class="wl-setup-hint" role="status" aria-live="polite"></p>
    </div>
    <div id="setup-compare-list" class="wl-setup-grid">${compareItems}</div>
  </section>
  <section class="wl-setup-section wl-setup-prefs">
    <div class="wl-setup-field">
      <label for="setup-itad-key" class="wl-setup-label">历史低价数据 Key</label>
      <input id="setup-itad-key" type="password" autocomplete="off" spellcheck="false" class="wl-setup-input" />
      <p class="wl-setup-desc">在 <a href="https://isthereanydeal.com/apps/" target="_blank" rel="noreferrer" class="wl-setup-link">ITAD 注册应用</a>后复制。留空则不查询史低</p>
    </div>
    <label class="wl-setup-switch-row">
      <div class="wl-setup-switch-copy">
        <span class="wl-setup-label">愿望单标签</span>
        <p class="wl-setup-desc">开启后读取 Steam 标签，可筛选和编辑。</p>
      </div>
      <input id="setup-tags" type="checkbox" ${setup.tagsEnabled ? "checked" : ""} class="wl-setup-switch-input" />
      <span class="wl-setup-switch" aria-hidden="true"></span>
    </label>
  </section>
  <button type="button" id="setup-start" class="wl-setup-go">开始比价</button>
</div>`;
};

export const mountSetup = (root: ParentNode, initial: RegionSetup | null | undefined, onStart: (setup: SetupDraft) => void, wishlistCount = 0) => {
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
    const hint = el("setup-limit-hint");
    hint.textContent = over
      ? `已选 ${shown.size} 个区域，请减少至 ${limit} 个以内。`
      : `已选 ${shown.size} / ${limit} 个区域`;
    hint.classList?.toggle("is-over", over);
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
  const itadKey = el("setup-itad-key") as HTMLInputElement;
  const tags = el("setup-tags") as HTMLInputElement;
  itadKey.value = setup.itadKey;
  tags.checked = setup.tagsEnabled;
  el("setup-start").addEventListener("click", () => {
    shown.add(home.current);
    if (shown.size > limit) { syncCompare(); return; }
    onStart({
      home: home.current,
      shown: uniqueCodes(home.current, [...shown]),
      itadKey: itadKey.value,
      tagsEnabled: tags.checked,
    });
  });
  syncCompare();
};
