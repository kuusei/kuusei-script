import {
  loadTimedValue,
  saveTimedValue,
  whenDocumentReady,
} from "@/shared";

import { indexChoiceHits, loadChoiceCatalog } from "./model/choice-catalog";
import type { ChoiceCatalog, ChoiceHit } from "./model/types";
import { paintChoiceHits } from "./ui/highlight";

const CACHE_KEY = "hb-choice-catalog";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OBSERVER_THROTTLE_MS = 1000;

const throttle = (fn: () => void, waitMs: number) => {
  let last = 0;
  let timer = 0;
  return () => {
    const remain = waitMs - (Date.now() - last);
    if (remain <= 0) {
      last = Date.now();
      fn();
      return;
    }
    if (timer) {
      return;
    }
    timer = window.setTimeout(() => {
      timer = 0;
      last = Date.now();
      fn();
    }, remain);
  };
};

whenDocumentReady(() => {
  let hits = new Map<number, ChoiceHit>();

  const paint = () => {
    if (hits.size === 0) {
      return;
    }
    paintChoiceHits(hits);
  };

  const watch = throttle(paint, OBSERVER_THROTTLE_MS);
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
      watch();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const applyCatalog = (catalog: ChoiceCatalog) => {
    hits = indexChoiceHits(catalog);
    paint();
  };

  const loadCatalog = async () => {
    const catalog = await loadChoiceCatalog();
    saveTimedValue(CACHE_KEY, catalog, "v1");
    applyCatalog(catalog);
  };

  const cached = loadTimedValue<ChoiceCatalog>(CACHE_KEY, {
    version: "v1",
    ttlMs: CACHE_TTL_MS,
  });
  if (cached) {
    applyCatalog(cached);
  } else {
    void loadCatalog().catch(() => undefined);
  }

  GM_registerMenuCommand("重新加载 Humble Choice 目录", () => {
    void loadCatalog();
  });
});
