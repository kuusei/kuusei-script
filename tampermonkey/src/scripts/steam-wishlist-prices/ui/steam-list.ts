import type { formatDiscountEnd } from "../pricing/discount-time";

export type SteamPriceChip = {
  label: string;
  cny: string;
  local: string;
  cut: number;
  band: "cheap" | "near" | "";
  gift: boolean;
  atLow?: boolean;
  newLow?: boolean;
  bundle?: { cny: string; local: string; name: string };
};

export type SteamGameCard = {
  appid: number;
  title: string;
  capsule: string;
  released: string;
  status: string;
  vsHome: string;
  discountEnd: ReturnType<typeof formatDiscountEnd>;
  cheapestLabel: string;
  cheapest: string;
  chips: SteamPriceChip[];
  history?: { label: string; price: string; date: string };
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const chipHtml = (chip: SteamPriceChip) => {
  const pct =
    chip.cut > 0 ? `<span class="wl-disc-pct">-${chip.cut}%</span>` : "";
  const gift = chip.gift ? `<span class="wl-disc-gift">可送礼</span>` : "";
  const local = chip.local ? `<span class="wl-disc-local">${escapeHtml(chip.local)}</span>` : "";
  const low = chip.newLow
    ? `<span class="wl-disc-low is-new" title="本区现价低于 ITAD 史低，或匹配 ITAD 新史低报价（N）" aria-label="新史低">新史低</span>`
    : chip.atLow ? `<span class="wl-disc-low" title="本区已达史低（ITAD Steam）" aria-label="本区已达史低">史低</span>` : "";
  const bundle = chip.bundle
    ? `<span class="wl-disc-bundle" title="${escapeHtml(chip.bundle.name)}最低价：${escapeHtml(chip.bundle.local)}">捆绑包 ${escapeHtml(chip.bundle.cny)}</span>`
    : "";
  return `<div class="wl-disc${chip.band ? ` is-${chip.band}` : ""}"><span class="wl-disc-region">${escapeHtml(chip.label)}</span>${pct}<span class="wl-disc-prices"><span class="wl-disc-price-line"><span class="wl-disc-cny">${escapeHtml(chip.cny)}</span>${low}${bundle}</span>${local}</span>${gift}</div>`;
};

export const steamListHtml = (cards: SteamGameCard[]) => {
  if (cards.length === 0) {
    return `<p class="py-16 text-center text-sm text-muted">没有匹配的游戏</p>`;
  }
  return cards
    .map((card) => {
      const href = `https://store.steampowered.com/app/${card.appid}`;
      const end = card.discountEnd
        ? `<span class="wl-row-discount-end">${escapeHtml(card.discountEnd.label)} <span class="wl-row-discount-time">${escapeHtml(card.discountEnd.when)}</span></span>`
        : "";
      const history = card.history
        ? `<p class="wl-row-history"><a href="https://isthereanydeal.com/" target="_blank" rel="noreferrer">ITAD</a> ${escapeHtml(card.history.label)} · ${escapeHtml(card.history.price)}${card.history.date ? ` · ${escapeHtml(card.history.date)}` : ""}</p>`
        : "";
      const body = card.status
        ? `<p class="wl-row-status">${escapeHtml(card.status)}</p>`
        : `<div class="wl-row-stats"><span>${escapeHtml(card.cheapestLabel)} <span class="wl-row-cheapest">${escapeHtml(card.cheapest)}</span></span><span>${escapeHtml(card.vsHome)}</span>${end}</div>${history}<div class="wl-row-chips">${card.chips.map(chipHtml).join("")}</div>`;
      const cap = card.capsule
        ? `<img alt="" loading="lazy" src="${escapeHtml(card.capsule)}" />`
        : "";
      const released = card.released ? `<span class="wl-release-date">${escapeHtml(card.released)}</span>` : "";
      return `<article class="wl-row"><a class="wl-cap" href="${href}" target="_blank" rel="noreferrer">${cap}</a><div class="wl-row-body"><div class="wl-row-heading"><a class="wl-title" href="${href}" target="_blank" rel="noreferrer">${escapeHtml(card.title)}</a>${released}</div>${body}</div></article>`;
    })
    .join("");
};
