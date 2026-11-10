import { personLabel, ruleMatches, type BlockRule } from "../model/blocks";
import { contentNodeSelector, contentSelectors, contentTypeOf, contentTypes, type ContentType } from "../model/content";
import { getSelfIdentity, isOwnAuthor, readActivityAuthor, type ActivityAuthor } from "../model/identity";
import { removeBlockLaunchers, syncBlockLaunchers } from "./block-launch";

export type FeedBlockCopy = {
  block: string;
  blocked: string;
  expand: string;
  collapse: string;
  unblock: string;
  join: string;
  typeLabel: (type: ContentType) => string;
};

type Hit = {
  type: ContentType;
  node: Element;
  block: Element;
  author: ActivityAuthor | null;
  blocked: boolean;
};

const openFolds = new WeakSet<Element>();

export function renderActivityFolds(rules: BlockRule[], copy: FeedBlockCopy): void {
  const identity = getSelfIdentity();
  const groups = collectHits(rules);
  const active = new Set<Element>();
  for (const [block, hits] of groups) {
    const blocked = hits.filter(hit => hit.blocked);
    if (hits.length > 0 && blocked.length === hits.length) {
      for (const hit of hits) clearFold(hit.node);
      removeBlockLaunchers(block);
      active.add(block);
      // Every activity in the block is blocked, so fold the author row with the body.
      setFold(block, summary(copy, blocked), copy);
      continue;
    }
    clearFold(block);
    for (const hit of hits) {
      if (!hit.blocked) {
        clearFold(hit.node);
        continue;
      }
      active.add(hit.node);
      setFold(hit.node, summary(copy, [hit]), copy);
    }
    const blockable = hits.filter(hit => !hit.blocked && isOwnAuthor(hit.author, identity) !== true);
    syncBlockLaunchers(block, [...new Set(blockable.map(hit => hit.type))], type => `${copy.block} · ${copy.typeLabel(type)}`);
  }
  for (const folded of Array.from(document.querySelectorAll(".sav-folded"))) {
    if (!active.has(folded)) clearFold(folded);
  }
}

export function toggleActivityFold(folded: HTMLElement, copy: FeedBlockCopy): void {
  const open = folded.classList.toggle("sav-fold-open");
  if (open) openFolds.add(folded);
  else openFolds.delete(folded);
  const toggle = folded.querySelector(":scope > .sav-fold-bar button[data-sav-action=toggle]");
  setText(toggle, open ? copy.collapse : copy.expand);
}

export function blockedMatches(root: Element, rules: BlockRule[]): { author: ActivityAuthor; type: ContentType }[] {
  const selector = contentNodeSelector();
  const nodes = root.matches(selector) ? [root] : Array.from(root.querySelectorAll(selector));
  const matches: { author: ActivityAuthor; type: ContentType }[] = [];
  for (const node of nodes) {
    const type = contentTypeOf(node);
    const author = readActivityAuthor(node);
    if (!type || !author || !rules.some(rule => ruleMatches(rule, author, type))) continue;
    if (matches.some(item => item.type === type && sameAuthor(item.author, author))) continue;
    matches.push({ author, type });
  }
  return matches;
}

function collectHits(rules: BlockRule[]): Map<Element, Hit[]> {
  const groups = new Map<Element, Hit[]>();
  for (const type of contentTypes) {
    for (const node of Array.from(document.querySelectorAll(contentSelectors[type]))) {
      const block = node.closest(".blotter_block");
      if (!block) continue;
      const author = readActivityAuthor(node);
      const hit: Hit = {
        type,
        node,
        block,
        author,
        blocked: Boolean(author && rules.some(rule => ruleMatches(rule, author, type))),
      };
      const list = groups.get(block);
      if (list) list.push(hit);
      else groups.set(block, [hit]);
    }
  }
  return groups;
}

function sameAuthor(left: ActivityAuthor, right: ActivityAuthor): boolean {
  if (left.accountId && right.accountId && left.accountId === right.accountId) return true;
  return Boolean(left.profile && right.profile && left.profile === right.profile);
}

function summary(copy: FeedBlockCopy, hits: Hit[]): string {
  const names: string[] = [];
  const types: string[] = [];
  for (const hit of hits) {
    const name = hit.author ? personLabel(hit.author) : "";
    if (name && !names.includes(name)) names.push(name);
    const label = copy.typeLabel(hit.type);
    if (!types.includes(label)) types.push(label);
  }
  return `${copy.blocked} · ${names.join(copy.join)} · ${types.join(copy.join)}`;
}

function setFold(element: Element, text: string, copy: FeedBlockCopy): void {
  element.classList.add("sav-folded");
  const open = openFolds.has(element);
  element.classList.toggle("sav-fold-open", open);
  let bar = element.querySelector(":scope > .sav-fold-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "sav-fold-bar";
    const label = document.createElement("span");
    label.className = "sav-fold-text";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.savAction = "toggle";
    const unblock = document.createElement("button");
    unblock.type = "button";
    unblock.dataset.savAction = "unblock";
    bar.append(label, toggle, unblock);
    element.insertBefore(bar, element.firstChild);
  }
  setText(bar.querySelector(".sav-fold-text"), text);
  setText(bar.querySelector("button[data-sav-action=toggle]"), open ? copy.collapse : copy.expand);
  setText(bar.querySelector("button[data-sav-action=unblock]"), copy.unblock);
}

function setText(node: Element | null, text: string): void {
  if (node && node.textContent !== text) node.textContent = text;
}

function clearFold(element: Element): void {
  const bar = element.querySelector(":scope > .sav-fold-bar");
  if (!bar && !element.classList.contains("sav-folded")) return;
  element.classList.remove("sav-folded", "sav-fold-open");
  bar?.remove();
  openFolds.delete(element);
}
