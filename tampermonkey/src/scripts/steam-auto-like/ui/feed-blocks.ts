import { injectStyle } from "@/shared";
import type { BlockRule } from "../model/blocks";
import { contentTypes, type ContentType } from "../model/content";
import { readActivityAuthor, type ActivityAuthor } from "../model/identity";
import { blockedMatches, renderActivityFolds, toggleActivityFold, type FeedBlockCopy } from "./feed-fold";
import { feedBlockStyles } from "./styles";

export function mountActivityBlocks(options: {
  getRules: () => BlockRule[];
  onBlock: (author: ActivityAuthor, type: ContentType) => void;
  onUnblock: (matches: { author: ActivityAuthor; type: ContentType }[]) => void;
  onUnknown: () => void;
  copy: () => FeedBlockCopy;
}): { refresh: () => void } {
  injectStyle("sav-feed-block-styles", feedBlockStyles);
  let applying = false;
  let queued = false;
  let dirtyWhileApplying = false;

  const refresh = () => {
    applying = true;
    try {
      renderActivityFolds(options.getRules(), options.copy());
    } finally {
      applying = false;
      if (dirtyWhileApplying) {
        dirtyWhileApplying = false;
        queue();
      }
    }
  };
  const queue = () => {
    if (applying) {
      dirtyWhileApplying = true;
      return;
    }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      refresh();
    });
  };

  document.addEventListener("click", event => onFeedClick(event, options), true);
  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => {
      const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return Boolean(node && !node.closest("#wt629_com_controlPanel, .sav-fold-bar, .sav-block-actions"));
    });
    if (relevant) queue();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
  return { refresh };
}

function onFeedClick(event: Event, options: {
  onBlock: (author: ActivityAuthor, type: ContentType) => void;
  onUnblock: (matches: { author: ActivityAuthor; type: ContentType }[]) => void;
  onUnknown: () => void;
  getRules: () => BlockRule[];
  copy: () => FeedBlockCopy;
}): void {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-sav-action]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.savAction;
  if (action === "toggle") {
    const folded = button.closest<HTMLElement>(".sav-folded");
    if (folded) toggleActivityFold(folded, options.copy());
    return;
  }
  if (action === "block") {
    const type = contentTypes.find(item => item === button.dataset.savType);
    const block = button.closest(".blotter_block");
    const author = block ? readActivityAuthor(block) : null;
    if (!type || !author) {
      options.onUnknown();
      return;
    }
    options.onBlock(author, type);
    return;
  }
  if (action !== "unblock") return;
  const folded = button.closest(".sav-folded");
  if (!folded) return;
  const matches = blockedMatches(folded, options.getRules());
  if (matches.length) options.onUnblock(matches);
}
