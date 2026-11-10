import { personLabel, type BlockRule } from "../model/blocks";
import type { ContentType } from "../model/content";

export function renderBlockList(root: HTMLElement, rules: BlockRule[], copy: {
  typeLabel: (type: ContentType) => string;
  removeLabel: string;
  empty: string;
}): void {
  root.replaceChildren();
  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "sav-empty";
    empty.textContent = copy.empty;
    root.append(empty);
    return;
  }
  const visible = rules.slice().reverse();
  for (const rule of visible) {
    const row = document.createElement("div");
    row.className = "sav-block-row";
    const name = document.createElement("span");
    name.className = "sav-block-name";
    name.textContent = personLabel(rule);
    name.title = [rule.profile, rule.accountId].filter(Boolean).join(" · ");
    const type = document.createElement("span");
    type.className = "sav-block-type";
    type.textContent = copy.typeLabel(rule.type);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "sav-text-button";
    remove.dataset.unblock = rule.id;
    remove.textContent = copy.removeLabel;
    row.append(name, type, remove);
    root.append(row);
  }
}
