import {
  choiceMonthSlugFromDate,
  compareMonthSlugs,
  EARLIEST_CHOICE_MONTH,
  monthIdFromSlug,
  nearbyMonthSlugs,
  parseMonthSlug,
  shiftMonthSlug,
  type MonthSlug,
} from "../calendar/choice-month";
import { emptyCatalog, mergeCatalogs } from "../archive/catalog-archive";
import type { ChoiceCatalog, ChoiceMonth } from "../types/catalog";
import { fetchMonth } from "./fetch-month";
import { normalizeMonth } from "./normalize-month";
import { fillSteamAppIds } from "./steam-app-lookup";

export type ScrapeOptions = {
  now?: Date;
  backfill?: number;
  archive?: ChoiceCatalog;
  delayMs?: number;
};

const MISS_LIMIT = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const asSlug = (value: string): MonthSlug | null =>
  parseMonthSlug(value) ? (value as MonthSlug) : null;

const archivedKeys = (archive: ChoiceCatalog) => {
  const known = new Set<string>();
  for (const month of archive.months) {
    known.add(month.slug);
    known.add(month.id);
  }
  return known;
};

const isArchived = (slug: MonthSlug, known: Set<string>) =>
  known.has(slug) || known.has(monthIdFromSlug(slug));

const oldestSlug = (archive: ChoiceCatalog, fallback: MonthSlug) => {
  const last = archive.months[archive.months.length - 1];
  return (last && asSlug(last.slug)) || fallback;
};

export const scrapeChoiceCatalog = async (
  options: ScrapeOptions = {},
): Promise<ChoiceCatalog> => {
  const archive = options.archive ?? emptyCatalog();
  const now = options.now ?? new Date();
  const current = choiceMonthSlugFromDate(now);
  const known = archivedKeys(archive);
  const budget = Math.max(1, options.backfill ?? 24);
  const incoming: ChoiceMonth[] = [];
  let fetched = 0;
  let consecutiveMisses = 0;

  const take = async (slug: MonthSlug) => {
    if (compareMonthSlugs(slug, EARLIEST_CHOICE_MONTH) < 0) {
      console.log(`[scrape] skip ${slug}: before ${EARLIEST_CHOICE_MONTH}`);
      return "floor" as const;
    }
    if (isArchived(slug, known) || incoming.some((month) => month.slug === slug)) {
      console.log(`[scrape] skip ${slug}: already archived`);
      return "skip" as const;
    }
    if (fetched >= budget) {
      return "budget" as const;
    }
    if (fetched > 0) {
      await sleep(options.delayMs ?? 400);
    }
    fetched += 1;
    const result = await fetchMonth(slug);
    if (!result.ok) {
      console.warn(`[scrape] skip ${slug}: ${result.reason}`);
      return result.status === 404 ? "miss" : "error";
    }
    const parsed = normalizeMonth(slug, result.page);
    if (!parsed) {
      console.warn(`[scrape] skip ${slug}: empty month`);
      return "miss" as const;
    }
    const month = await fillSteamAppIds(parsed);
    console.log(`[scrape] ${slug} -> ${month.games.length} items`);
    incoming.push(month);
    known.add(month.slug);
    known.add(month.id);
    return "ok" as const;
  };

  for (const slug of nearbyMonthSlugs(now)) {
    const status = await take(slug);
    if (status === "ok") {
      consecutiveMisses = 0;
    }
  }

  const reachedEarliest = (slug: MonthSlug) =>
    compareMonthSlugs(slug, EARLIEST_CHOICE_MONTH) <= 0;

  const oldest = archive.months.length
    ? oldestSlug(archive, current)
    : null;
  let exhausted =
    Boolean(archive.backfillExhausted) &&
    Boolean(oldest && reachedEarliest(oldest));
  if (!exhausted && oldest && reachedEarliest(oldest)) {
    exhausted = true;
    console.log(`[scrape] history complete at ${EARLIEST_CHOICE_MONTH}`);
  }
  if (!exhausted) {
    let cursor = archive.months.length
      ? shiftMonthSlug(oldestSlug(archive, current), -1)
      : shiftMonthSlug(current, -2);
    while (fetched < budget && consecutiveMisses < MISS_LIMIT) {
      if (compareMonthSlugs(cursor, EARLIEST_CHOICE_MONTH) < 0) {
        exhausted = true;
        console.log(`[scrape] history complete at ${EARLIEST_CHOICE_MONTH}`);
        break;
      }
      if (isArchived(cursor, known)) {
        cursor = shiftMonthSlug(cursor, -1);
        continue;
      }
      const status = await take(cursor);
      if (status === "budget" || status === "floor") {
        exhausted = status === "floor" || exhausted;
        break;
      }
      if (status === "ok") {
        consecutiveMisses = 0;
        if (reachedEarliest(cursor)) {
          exhausted = true;
          console.log(`[scrape] history complete at ${EARLIEST_CHOICE_MONTH}`);
          break;
        }
      } else if (status === "miss") {
        consecutiveMisses += 1;
      }
      cursor = shiftMonthSlug(cursor, -1);
    }
  }

  if (incoming.length === 0 && exhausted === Boolean(archive.backfillExhausted)) {
    console.log("[scrape] no new months");
    return archive;
  }

  return mergeCatalogs(archive, incoming, { backfillExhausted: exhausted });
};
