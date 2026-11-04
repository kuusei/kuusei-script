import { makeStats, parsePageStats, type ReviewStats } from "./stats";

const CACHE_KEY = "steam-review-languages:cache:v4";
const TTL = 60 * 60 * 1000;
type CacheEntry = { timestamp: number; rows: ReviewStats[] };
type Cache = Record<string, CacheEntry>;

export function readPageStats(root: Document, appid: number): ReviewStats[] {
  const target = root.querySelector('[data-featuretarget="appreviews"]');
  return parsePageStats(target?.getAttribute("data-props") ?? null, appid);
}

export function extractReviewTag(html: string): string {
  return html.match(/<div\b[^>]*\bdata-featuretarget\s*=\s*["']appreviews["'][^>]*>/i)?.[0] ?? "";
}

/** Fetch the whole breakdown once; no per-language requests or automatic retries. */
export async function fetchStats(appid: number): Promise<ReviewStats[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://store.steampowered.com/app/${appid}/`, {
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`统计加载失败（HTTP ${response.status}）`);
    // Parse only the data-bearing div, keeping images, iframes and other page
    // resources out of the detached document as well as the live page.
    const tag = extractReviewTag(await response.text());
    const page = new DOMParser().parseFromString(`${tag}</div>`, "text/html");
    const rows = readPageStats(page, appid);
    if (!rows.length) throw new Error("商店页未提供语言统计，请刷新页面后重试");
    return rows;
  } finally { clearTimeout(timeout); }
}

export function readCache(appid: number): ReviewStats[] {
  try {
    const entry = GM_getValue<Cache>(CACHE_KEY, {})[String(appid)];
    const now = Date.now();
    if (!entry || !Number.isFinite(entry.timestamp) || now - entry.timestamp < 0
      || now - entry.timestamp > TTL || !Array.isArray(entry.rows)) return [];
    const rows: ReviewStats[] = [];
    for (const row of entry.rows) {
      if (!row || typeof row.language !== "string") return [];
      const stats = makeStats(row.language, row.total, row.positive);
      if (!stats) return [];
      rows.push(stats);
    }
    return rows;
  } catch { return []; }
}

export function writeCache(appid: number, rows: ReviewStats[]) {
  try {
    const cache = GM_getValue<Cache>(CACHE_KEY, {});
    cache[String(appid)] = { timestamp: Date.now(), rows };
    // Bound storage across games, retaining the 30 most recently queried apps.
    const trimmed = Object.entries(cache)
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, 30);
    GM_setValue(CACHE_KEY, Object.fromEntries(trimmed));
  } catch { /* Storage failure must not hide successful statistics. */ }
}

type Sources = {
  readPage: () => ReviewStats[];
  readCache: () => ReviewStats[];
  request: () => Promise<ReviewStats[]>;
  saveCache: (rows: ReviewStats[]) => void;
};

export function createStatsLoader(sources: Sources) {
  let current: ReviewStats[] | null = null;
  let pending: Promise<ReviewStats[]> | null = null;
  let failed = false;
  let lastError: unknown;
  return {
    load(force = false): Promise<ReviewStats[]> {
      if (pending) return pending;
      if (!force) {
        if (current) return Promise.resolve(current);
        if (failed) return Promise.reject(lastError);
        const page = sources.readPage();
        const available = page.length ? page : sources.readCache();
        if (available.length) {
          current = available;
          if (page.length) sources.saveCache(page);
          return Promise.resolve(current);
        }
      }
      pending = sources.request().then(rows => {
        current = rows;
        failed = false;
        sources.saveCache(rows);
        return rows;
      }).catch(error => {
        failed = true;
        lastError = error;
        throw error;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
