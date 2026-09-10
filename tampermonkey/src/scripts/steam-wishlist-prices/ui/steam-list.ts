import type { formatDiscountEnd } from "../pricing/discount-time";

export type SteamPriceChip = {
  label: string;
  cny: string;
  local: string;
  cut: number;
  band: "cheap" | "near" | "";
  gift: boolean;
};

export type SteamGameCard = {
  appid: number;
  title: string;
  capsule: string;
  meta: string;
  status: string;
  vsHome: string;
  discountEnd: ReturnType<typeof formatDiscountEnd>;
  cheapestLabel: string;
  cheapest: string;
  chips: SteamPriceChip[];
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const chipHtml = (chip: SteamPriceChip) => {
  const pct =
    chip.cut > 0 ? `<span class="wl-disc-pct">-${chip.cut}%</span>` : "";
  const gift = chip.gift ? `<span class="wl-disc-gift">可送礼</span>` : "";
  const local = chip.local ? `<span class="wl-disc-local">${escapeHtml(chip.local)}</span>` : "";
  return `<div class="wl-disc${chip.band ? ` is-${chip.band}` : ""}"><span class="wl-disc-region">${escapeHtml(chip.label)}</span>${pct}<span class="wl-disc-prices"><span class="wl-disc-cny">${chip.cny}</span>${local}</span>${gift}</div>`;
};

export const steamListHtml = (cards: SteamGameCard[]) => {
  if (cards.length === 0) {
    return `<p class="py-16 text-center text-sm text-muted">没有匹配的游戏</p>`;
  }
  return cards
    .map((card) => {
      const href = `https://store.steampowered.com/app/${card.appid}`;
      const end = card.discountEnd
        ? `<span class="wl-row-discount-end">${escapeHtml(card.discountEnd.label)} <span class="wl-row-discount-time">${escapeHtml(card.discountEnd.when)}</span> ${escapeHtml(card.discountEnd.timeZone)}</span>`
        : "";
      const body = card.status
        ? `<p class="wl-row-status">${escapeHtml(card.status)}</p>`
        : `<div class="wl-row-stats"><span>${escapeHtml(card.cheapestLabel)} <span class="wl-row-cheapest">${escapeHtml(card.cheapest)}</span></span><span>${escapeHtml(card.vsHome)}</span>${end}</div><div class="wl-row-chips">${card.chips.map(chipHtml).join("")}</div>`;
      const cap = card.capsule
        ? `<img alt="" loading="lazy" src="${escapeHtml(card.capsule)}" />`
        : "";
      return `<article class="wl-row"><a class="wl-cap" href="${href}" target="_blank" rel="noreferrer">${cap}</a><div class="wl-row-body"><a class="wl-title" href="${href}" target="_blank" rel="noreferrer">${escapeHtml(card.title)}</a><p class="wl-row-meta">${escapeHtml(card.meta)}</p>${body}</div></article>`;
    })
    .join("");
};
