export type ReviewStats = { language: string; total: number; positive: number };
export type SortKey = "total" | "positive" | "negative" | "rate";

export const isSummary = (row: ReviewStats) => row.language === "all" || row.language === "all_purchases";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function makeStats(language: string, total: unknown, positive: unknown): ReviewStats | null {
  if (typeof total !== "number" || typeof positive !== "number"
    || !Number.isSafeInteger(total) || !Number.isSafeInteger(positive)
    || total < 0 || positive < 0 || positive > total) return null;
  return { language, total, positive };
}

/** Use the server-rendered totals; React owns the children of this element. */
export function parsePageStats(raw: string | null, appid: number): ReviewStats[] {
  try {
    const props = object(JSON.parse(raw ?? "null"));
    if (props?.appid !== appid) return [];
    const filters = object(props.filter_options);
    const languages = new Map<string, ReviewStats>();
    if (Array.isArray(filters?.rgLanguageOutliers)) {
      for (const value of filters.rgLanguageOutliers) {
        const entry = object(value);
        if (typeof entry?.strLanguage !== "string" || ["all", "all_purchases", "other"].includes(entry.strLanguage)
          || entry.bFilteredReviews !== true || entry.nAgeInDays !== 0) continue;
        const stats = makeStats(entry.strLanguage, entry.nReviews, entry.nReviewsPositive);
        if (stats) languages.set(stats.language, stats);
      }
    }
    // Language summaries follow Steam's score eligibility (Steam purchases for
    // paid games). filter_options.nReviewsPositive / Negative include non-Steam
    // purchases too, so they MUST NOT supply this table's global denominator.
    const rows = [...languages.values()];
    const summary = object(object(props.summary_options)?.summaryGlobalNoOutliers);
    if (summary?.bFilteredReviews === true && summary.nAgeInDays === 0) {
      const all = makeStats("all", summary.nReviews, summary.nReviewsPositive);
      if (all) rows.unshift(all);
    }
    // All-purchase totals are displayed as their own summary only. Never use
    // them for score-language shares, the remainder, or chart normalization.
    const positive = filters?.nReviewsPositive;
    const negative = filters?.nReviewsNegative;
    if (typeof positive === "number" && typeof negative === "number"
      && Number.isSafeInteger(negative) && negative >= 0) {
      const allPurchases = makeStats("all_purchases", positive + negative, positive);
      if (allPurchases) rows.push(allPurchases);
    }
    return rows;
  } catch {
    return [];
  }
}

export function reviewRate(stats: ReviewStats): number | null {
  return stats.total === 0 ? null : stats.positive / stats.total * 100;
}

export function otherLanguages(rows: ReviewStats[]): ReviewStats | null {
  const all = rows.find(row => row.language === "all");
  if (!all) return null;
  const languages = rows.filter(row => !isSummary(row) && row.language !== "other");
  const total = all.total - languages.reduce((sum, row) => sum + row.total, 0);
  const positive = all.positive - languages.reduce((sum, row) => sum + row.positive, 0);
  return total > 0 ? makeStats("other", total, positive) : null;
}

export function coverageStatus(rows: ReviewStats[]): string {
  const all = rows.find(row => row.language === "all");
  const languages = rows.filter(row => !isSummary(row) && row.language !== "other" && row.total > 0);
  if (all?.total === 0) return "暂无评测";
  if (!languages.length) return "Steam 未提供各语言明细";
  return `${languages.length} 种语言${otherLanguages(rows) ? " · 其余语言合并显示" : ""}`;
}

export function stackPercentages(row: ReviewStats) {
  const positive = reviewRate(row);
  return positive === null ? { positive: 0, total: 0 } : { positive, total: 100 };
}

export function sortStats(rows: ReviewStats[], key: SortKey, descending: boolean): ReviewStats[] {
  return [...rows].sort((a, b) => {
    const value = (row: ReviewStats) => key === "rate" ? reviewRate(row)
      : key === "negative" ? row.total - row.positive : row[key];
    const av = value(a);
    const bv = value(b);
    // Empty languages always stay last, including ascending rating order.
    if (av === null) return bv === null ? a.language.localeCompare(b.language) : 1;
    if (bv === null) return -1;
    return (descending ? bv - av : av - bv) || b.total - a.total || a.language.localeCompare(b.language);
  });
}

export function reviewUrl(appid: number, language: string): string {
  const url = new URL(`https://steamcommunity.com/app/${appid}/reviews/`);
  url.searchParams.set("browsefilter", "toprated");
  url.searchParams.set("filterLanguage", language === "all_purchases" ? "all" : language);
  return url.href;
}
