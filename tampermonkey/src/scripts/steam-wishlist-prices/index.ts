import { HudCard, injectStyle, startPolling, whenDocumentReady } from "@/shared";

import { loadUsdRates } from "./pricing/currency-rates";
import { estimateOpeningRequests, fxRequestPending } from "./requests/estimate-opening";
import { closeReportOverlay, openRegionSetup, openReportOverlay } from "./ui/overlay";
import { buildGameRows } from "./pricing/price-rows";
import { countriesForSetup, legacyRegionSetup, loadRegionSetup } from "./ui/region-settings";
import { createRequestMeter, setRequestHook } from "./requests/request-meter";
import { resolveSteamId } from "./steam/steam-id";
import { estimateCountryFillRequests, loadSteamCountryPrices } from "./pricing/steam-prices";
import { loadSteamPersona } from "./steam/steam-profile";
import { peekWebApiToken } from "./steam/steam-http";
import { loadSteamWishlist } from "./steam/steam-wishlist";
import { readWishlistPageCount } from "./cache/wishlist-cache";

const BUTTON_ID = "wl-prices-launch";
const TITLE_RE = /愿望单|願望單|Wishlist/i;

const BUTTON_STYLE = `
.wl-prices-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
#${BUTTON_ID} {
  flex: none;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 2px;
  background: #1a2c3d;
  color: #67c1f5;
  font-size: 13px;
  cursor: pointer;
  font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
}
#${BUTTON_ID}:hover {
  background: #67c1f5;
  color: #fff;
}
`;

const findHeaderRow = (): HTMLElement | null => {
  const legacy = document.querySelector(".wishlist_header");
  if (legacy instanceof HTMLElement) {
    return legacy;
  }
  const title = Array.from(document.querySelectorAll("h1, h2, h3")).find((el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return TITLE_RE.test(text) && text.length < 80;
  });
  if (!title) {
    return null;
  }
  let node = title.parentElement;
  for (let i = 0; i < 8 && node; i++) {
    const style = window.getComputedStyle(node);
    const flex = style.display.includes("flex");
    const wide = node.getBoundingClientRect().width >= 640;
    if (flex && wide) {
      return node;
    }
    node = node.parentElement;
  }
  return title.parentElement;
};

const placeButton = (host: HTMLElement, button: HTMLButtonElement) => {
  const others = Array.from(host.querySelectorAll("button")).filter((el) => el.id !== BUTTON_ID);
  const last = others[others.length - 1];
  if (last) {
    button.style.marginLeft = "8px";
    last.insertAdjacentElement("afterend", button);
    return;
  }
  button.style.marginLeft = "auto";
  host.appendChild(button);
};

const ensureLaunchButton = () => {
  const host = findHeaderRow();
  if (!host) {
    return;
  }
  host.classList.add("wl-prices-header");
  let button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "区域比价";
    button.addEventListener("click", () => {
      void runReport();
    });
  }
  if (host.contains(button)) {
    const others = Array.from(host.querySelectorAll("button")).filter((el) => el.id !== BUTTON_ID);
    const last = others[others.length - 1];
    if (last && button.previousElementSibling !== last) {
      last.insertAdjacentElement("afterend", button);
    }
    return;
  }
  placeButton(host, button);
};

const runReport = async (forceSetup = false) => {
  closeReportOverlay();
  const saved = loadRegionSetup();
  const setup = !saved || forceSetup ? await openRegionSetup(saved ?? legacyRegionSetup()) : saved;
  if (!setup) return;
  const countries = countriesForSetup(setup);
  const hud = new HudCard("愿望单比价", "解析 Steam ID…");
  const meter = createRequestMeter((done, total) => hud.setRequestCount(done, total));
  setRequestHook(() => meter.bump());
  try {
    const steamId = await resolveSteamId();
    const pageCount = readWishlistPageCount();
    meter.setTotal(estimateOpeningRequests(steamId, setup.home, pageCount));
    hud.update("读取资料和愿望单…");
    const steamName = loadSteamPersona(steamId);
    const wishlist = await loadSteamWishlist(steamId, setup.home, pageCount);
    const games = wishlist.games;
    const priceAppids = games
      .filter((game) => !game.delisted && !game.comingSoon && !game.free)
      .map((game) => game.appid);
    const countryCodes = countries.map((country) => country.code);
    const priceOptions = {
      home: setup.home,
      refreshed: wishlist.refreshed,
      addedAppids: wishlist.addedAppids,
      homeItems: wishlist.homeItems,
      usItems: wishlist.usItems,
    };
    const fillRequests = estimateCountryFillRequests(
      countryCodes,
      priceAppids,
      priceOptions,
      peekWebApiToken(),
      games.length,
    );
    meter.setTotal(meter.done + fillRequests + (fxRequestPending() ? 1 : 0));
    hud.update(
      wishlist.refreshed
        ? `更新 ${countries.length} 区价格…`
        : fillRequests > 0
          ? "补齐新区域价格…"
          : "读取缓存价格…",
    );
    const deals = await loadSteamCountryPrices(
      steamId,
      countryCodes,
      priceAppids,
      priceOptions,
      (country, index, total) => {
        hud.update(`价格 ${country}（${index}/${total}）`);
        hud.setProgress((index / total) * 100);
      },
    );
    hud.update("换算人民币…");
    const rates = await loadUsdRates();
    const rows = buildGameRows(games, deals, countries, rates);
    openReportOverlay(
      {
        generatedAt: new Date().toISOString(),
        fxAt: rates.fetchedAt,
        steamId,
        steamName,
        home: setup.home,
        countries,
        rows,
      },
      { onRefetch: () => void runReport(false) },
    );
    hud.update(`${steamName} · ${rows.length} 款`, "完成", "success");
    hud.dismiss(1600);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hud.update(message, "失败", "error");
    hud.dismiss(5000);
  } finally {
    setRequestHook(null);
  }
};

whenDocumentReady(() => {
  injectStyle("wl-prices-launch-style", BUTTON_STYLE);
  startPolling(ensureLaunchButton, 800);
  GM_registerMenuCommand("打开区域比价", () => {
    void runReport();
  });
  GM_registerMenuCommand("设置比价区域", () => {
    void runReport(true);
  });
});
