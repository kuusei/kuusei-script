import { requestJson } from "@/shared";

import type { ChoiceCatalog, ChoiceHit } from "./types";

const CATALOG_URLS = [
  "https://cdn.jsdelivr.net/gh/kuusei/kuusei-script@hb-data/catalog.json",
  "https://raw.githubusercontent.com/kuusei/kuusei-script/hb-data/catalog.json",
];

export const loadChoiceCatalog = async (): Promise<ChoiceCatalog> => {
  let lastError = "catalog missing";
  for (const url of CATALOG_URLS) {
    try {
      const catalog = await requestJson<ChoiceCatalog>({ url });
      if (Array.isArray(catalog.months) && catalog.months.length > 0) {
        return catalog;
      }
      lastError = "empty catalog";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
};

export const indexChoiceHits = (catalog: ChoiceCatalog) => {
  const hits = new Map<number, ChoiceHit>();
  for (const month of catalog.months) {
    const label = month.title || month.slug || month.id;
    const url =
      month.url ||
      `https://www.humblebundle.com/membership/${month.slug}`;
    for (const game of month.games) {
      if (game.isExtra) {
        continue;
      }
      for (const appId of game.steamAppIds ?? []) {
        if (!appId) {
          continue;
        }
        const current = hits.get(appId);
        if (!current) {
          hits.set(appId, { title: game.title, months: [{ label, url }] });
          continue;
        }
        if (!current.months.some((item) => item.label === label)) {
          current.months.push({ label, url });
        }
      }
    }
  }
  return hits;
};
