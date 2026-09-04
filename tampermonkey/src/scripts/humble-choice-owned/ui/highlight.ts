import { injectStyle } from "@/shared";

import type { ChoiceHit, ChoiceMonthHit } from "../model/types";

/** Official Humble Bundle "H" mark (msapplication-TileImage). */
const FLAG_ICON =
  'url("data:image/png;base64,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")';

const STYLE = `
.hb-choice-cont,
.hb-choice-cont * {
  box-sizing: border-box;
}
.hb-choice-target--card {
  position: relative;
}
.hb-choice-flag {
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  border-radius: 5px;
  background-color: #cc2929;
  background-image: ${FLAG_ICON};
  background-repeat: no-repeat;
  background-size: 12px 12px;
  background-position: 4px center;
}
.hb-choice-flag:hover {
  color: #fff;
  filter: brightness(1.08);
}
.hb-choice-cont--card {
  position: absolute;
  left: 5px;
  top: 33px;
  z-index: 10;
  line-height: 19px;
  pointer-events: none;
}
.TopSellerCapsule .hb-choice-cont--card {
  top: 45px;
}
.store_main_capsule .hb-choice-cont--card {
  top: 42px;
}
.hb-choice-cont--card .hb-choice-flag {
  display: block;
  padding: 0 8px 0 20px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.55);
  pointer-events: auto;
}
.hb-choice-cont--row {
  position: absolute;
  bottom: 0;
  left: 9px;
  z-index: 5;
  display: flex;
}
.hb-choice-cont--row .hb-choice-flag {
  display: inline-block;
  width: 20px;
  height: 20px;
  padding: 0;
  overflow: hidden;
  font-size: 0;
  border-radius: 5px 5px 0 0;
  background-size: 13px 13px;
  background-position: center;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.55);
}
.hb-choice-tip {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 6px;
  padding: 4px 6px;
  border-radius: 5px;
  background: #fff;
  color: #000;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  box-shadow: 2px -2px 6px #000;
  transition: opacity 0.15s ease;
}
.hb-choice-flag:hover .hb-choice-tip {
  opacity: 1;
}
.hb-choice-cont--page {
  position: relative;
  z-index: 4;
  width: 100%;
  margin: 0 0 8px;
  color: #fff;
  font-family: "Motiva Sans", sans-serif;
  font-size: 18px;
  font-weight: 300;
  line-height: 40px;
}
.hb-choice-text {
  display: flex;
  align-items: center;
  width: 100%;
  background-image: linear-gradient(
    to right,
    rgb(255 255 255 / 0.1) 0%,
    rgb(0 0 0 / 0.2) 100%
  );
}
.hb-choice-cont--page .hb-choice-flag {
  flex: 0 0 auto;
  margin: 8px;
  padding: 0 8px 0 20px;
  line-height: 18px;
  box-shadow: 1px 1px 2px #000;
}
.hb-choice-text > span {
  min-width: 0;
  margin: 0 10px 0 0;
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  line-height: 40px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hb-choice-month {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hb-choice-month:hover {
  color: #ccc;
}
@media (max-width: 768px) {
  .hb-choice-text {
    flex-wrap: wrap;
  }
  .hb-choice-text > span {
    order: 10;
    white-space: normal;
    line-height: 1.4;
    padding: 4px 8px 10px;
  }
}
`;

const safeHttpUrl = (url: string) => (/^https?:/i.test(url) ? url : "");

const monthLabel = (months: ChoiceMonthHit[]) =>
  months.map((month) => month.label).join(" · ");

export const getStoreAppId = () => {
  const fromPage = document
    .querySelector(".game_page_background.game[data-miniprofile-appid]")
    ?.getAttribute("data-miniprofile-appid");
  if (fromPage) {
    return Number(fromPage);
  }
  const fromUrl = location.pathname.match(/\/app\/(\d+)/);
  return fromUrl ? Number(fromUrl[1]) : 0;
};

const parseAppIds = (value: string | undefined) =>
  (value ?? "")
    .split(/[,\s]+/)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

const appIdFromHref = (href: string) => {
  const match = href.match(/\/app\/(\d+)/);
  return match ? Number(match[1]) : 0;
};

const hitForIds = (hits: Map<number, ChoiceHit>, ids: number[]) => {
  for (const id of ids) {
    const hit = hits.get(id);
    if (hit) {
      return hit;
    }
  }
  return undefined;
};

const isRowTarget = (element: HTMLElement) => {
  const className = element.className;
  return (
    element.classList.contains("search_result_row") ||
    element.classList.contains("tab_item") ||
    className.includes("SaleItemBrowserRow") ||
    className.includes("StoreSaleItemReview")
  );
};

const createFlag = (hit: ChoiceHit, kind: "page" | "card" | "row") => {
  const href = safeHttpUrl(hit.months[0]?.url ?? "");
  const flag = document.createElement(href ? "a" : "span");
  flag.className = "hb-choice-flag";
  if (flag instanceof HTMLAnchorElement) {
    flag.href = href;
    flag.target = "_blank";
    flag.rel = "noreferrer";
  }
  flag.append("Humble Choice");
  if (kind === "page") {
    return flag;
  }
  const tip = document.createElement("span");
  tip.className = "hb-choice-tip";
  tip.textContent = `Humble Choice ${monthLabel(hit.months)}`;
  flag.append(tip);
  if (kind === "row") {
    flag.title = tip.textContent;
  }
  return flag;
};

const createAppBar = (hit: ChoiceHit) => {
  const root = document.createElement("div");
  root.className = "hb-choice-cont hb-choice-cont--page";
  const row = document.createElement("div");
  row.className = "hb-choice-text";
  const detail = document.createElement("span");
  detail.append(`${hit.title} 收录于 Humble Choice `);
  hit.months.forEach((month, index) => {
    if (index > 0) {
      detail.append("、");
    }
    const href = safeHttpUrl(month.url);
    if (!href) {
      detail.append(month.label);
      return;
    }
    const link = document.createElement("a");
    link.className = "hb-choice-month";
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = month.label;
    detail.append(link);
  });
  row.append(createFlag(hit, "page"), detail);
  root.append(row);
  return root;
};

const BADGE_SKIP =
  ".gutter_item, .hb-choice-cont, #game_area_purchase, .game_area_purchase, .game_area_purchase_game, .game_area_purchase_game_wrapper, .package_contents, .game_area_dlc_list, .game_area_dlc_row, .page_title_area, .game_title_area, .apphub_HomeHeaderContent, .apphub_HeaderStandardTop";

const pageContent = () =>
  document.querySelector("#game_area_purchase");

const removeMisplaced = () => {
  Array.from(
    document.querySelectorAll<HTMLElement>(
      ".hb-choice-cont--page, #game_area_purchase .hb-choice-cont--card, #game_area_purchase .hb-choice-cont--row, .page_title_area .hb-choice-cont, .game_title_area .hb-choice-cont, .apphub_HomeHeaderContent .hb-choice-cont, .package_contents .hb-choice-cont",
    ),
  ).forEach((element) => {
    if (
      element.classList.contains("hb-choice-cont--page") &&
      element.parentElement?.id === "game_area_purchase"
    ) {
      return;
    }
    element.remove();
  });
};

const injectAppBar = (hit: ChoiceHit | undefined) => {
  removeMisplaced();
  const existing = document.querySelector("#game_area_purchase > .hb-choice-cont--page");
  if (!hit) {
    existing?.remove();
    return 0;
  }
  if (existing) {
    return 1;
  }
  const host = pageContent();
  if (!host) {
    return 0;
  }
  host.prepend(createAppBar(hit));
  return 1;
};

const syncBadge = (element: HTMLElement, hit: ChoiceHit, kind: "card" | "row") => {
  const current = element.querySelector<HTMLElement>(":scope > .hb-choice-cont");
  const signature = `${kind}:${monthLabel(hit.months)}`;
  if (current?.dataset.hbChoice === signature) {
    return;
  }
  current?.remove();
  const mount = document.createElement("div");
  mount.className = `hb-choice-cont hb-choice-cont--${kind}`;
  mount.dataset.hbChoice = signature;
  mount.append(createFlag(hit, kind));
  element.classList.add("hb-choice-target");
  if (kind === "card") {
    element.classList.add("hb-choice-target--card");
  }
  element.append(mount);
};

const collectBadgeTargets = () => {
  const targets = new Map<HTMLElement, number[]>();
  const add = (element: Element | null, ids: number[]) => {
    if (!(element instanceof HTMLElement) || ids.length === 0) {
      return;
    }
    if (element.closest(BADGE_SKIP)) {
      return;
    }
    targets.set(element, ids);
  };

  Array.from(document.querySelectorAll<HTMLElement>("[data-ds-appid]")).forEach(
    (element) => {
      add(element, parseAppIds(element.dataset.dsAppid));
    },
  );

  Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      '#StoreTemplate a[href*="/app/"], [class^="salepreviewwidgets_"] a[href*="/app/"]',
    ),
  ).forEach((element) => {
    if (
      element.dataset.dsAppid ||
      element.closest("[data-ds-appid]") ||
      !element.querySelector("img")
    ) {
      return;
    }
    add(element, [appIdFromHref(element.href)].filter((id) => id > 0));
  });

  return targets;
};

const injectCapsuleBadges = (hits: Map<number, ChoiceHit>) => {
  if (hits.size === 0) {
    return 0;
  }
  let painted = 0;
  for (const [element, ids] of collectBadgeTargets()) {
    const hit = hitForIds(hits, ids);
    if (!hit) {
      continue;
    }
    syncBadge(element, hit, isRowTarget(element) ? "row" : "card");
    painted += 1;
  }
  return painted;
};

export const paintChoiceHits = (hits: Map<number, ChoiceHit>) => {
  injectStyle("hb-choice-badge-style", STYLE);
  const appId = getStoreAppId();
  let painted = 0;
  if (appId) {
    painted += injectAppBar(hits.get(appId));
  } else {
    removeMisplaced();
  }
  painted += injectCapsuleBadges(hits);
  return painted;
};
