import type { ContentType } from "../model/content";
import { activityNameAnchor } from "../model/identity";

const svgNamespace = "http://www.w3.org/2000/svg";

const iconMarkup: Record<"block" | ContentType, string> = {
  block: '<circle cx="12" cy="12" r="8"/><path d="M6.8 17.2 17.2 6.8"/>',
  status: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/><path d="M7 9h10M7 13h6"/>',
  screenshot: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 4-4 5 5"/><circle cx="16" cy="8" r="1"/>',
  review: '<path d="M6 3h12v18l-6-3-6 3V3Z"/><path d="M9 8h6M9 12h4"/>',
  purchase: '<path d="M3 4h2l3 12h11l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  artwork: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>',
};

export function syncBlockLaunchers(block: Element, types: ContentType[], labelFor: (type: ContentType) => string): void {
  const anchor = activityNameAnchor(block);
  const holders = actionHolders(block, anchor);
  if (!types.length) {
    holders.forEach(holder => holder.remove());
    return;
  }
  const holder = placeHolder(block, anchor, holders);
  if (!holder) return;
  const pending = new Set(types);
  for (const button of Array.from(holder.querySelectorAll("button"))) {
    const type = pending.has(button.dataset.savType as ContentType) ? button.dataset.savType as ContentType : undefined;
    if (!type) {
      button.remove();
      continue;
    }
    pending.delete(type);
    paintLauncher(button, type, labelFor(type));
  }
  for (const type of types) {
    if (!pending.has(type)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sav-block-launch";
    button.dataset.savAction = "block";
    button.dataset.savType = type;
    paintLauncher(button, type, labelFor(type));
    holder.append(button);
  }
}

export function removeBlockLaunchers(block: Element): void {
  actionHolders(block, activityNameAnchor(block)).forEach(holder => holder.remove());
}

function placeHolder(block: Element, anchor: HTMLAnchorElement | null, holders: Element[]): HTMLElement | null {
  let holder = holders[0] instanceof HTMLElement ? holders[0] : null;
  holders.slice(1).forEach(extra => extra.remove());
  if (!holder) {
    holder = document.createElement("span");
    holder.className = "sav-block-actions";
  }
  if (anchor) {
    if (holder.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }
  const author = block.querySelector(".blotter_author_block");
  if (!author) return null;
  if (holder.parentElement !== author) author.append(holder);
  return holder;
}

function actionHolders(block: Element, anchor: HTMLAnchorElement | null): Element[] {
  const found = new Set<Element>(Array.from(block.querySelectorAll(".sav-block-actions")));
  const sibling = anchor?.nextElementSibling;
  if (sibling?.classList.contains("sav-block-actions")) found.add(sibling);
  return [...found];
}

function paintLauncher(button: HTMLButtonElement, type: ContentType, label: string): void {
  if (button.getAttribute("title") !== label) button.setAttribute("title", label);
  if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  if (button.dataset.savIcons === type && button.querySelector("svg")) return;
  button.replaceChildren(icon("block"), icon(type));
  button.dataset.savIcons = type;
}

function icon(kind: "block" | ContentType): SVGSVGElement {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = iconMarkup[kind];
  return svg;
}
