import {
  compareMonthSlugs,
  EARLIEST_MEMBERSHIP_MONTH,
  membershipUrlFromSlug,
  monthlyUrlFromSlug,
  parseMonthSlug,
  type MonthSlug,
} from "../calendar/choice-month";
import { parseChoicePage } from "../parsers/choice-page";
import { parseMonthlyPage } from "../parsers/monthly-page";
import type { ParsedMonth } from "../parsers/types";

export type FetchMonthResult =
  | { ok: true; slug: string; page: ParsedMonth }
  | { ok: false; slug: string; status: number; reason: string };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchHtml = async (url: string) => {
  let lastError = "unknown error";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(750 * attempt);
    }
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      lastStatus = response.status;
      if (response.status === 404) {
        return { status: 404, html: null, error: "not found" };
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      return { status: response.status, html: await response.text(), error: "" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { status: lastStatus, html: null, error: lastError };
};

const isChoiceEra = (slug: string) => {
  const parsed = parseMonthSlug(slug);
  return (
    parsed !== null &&
    compareMonthSlugs(slug as MonthSlug, EARLIEST_MEMBERSHIP_MONTH) >= 0
  );
};

export const fetchMonth = async (slug: string): Promise<FetchMonthResult> => {
  let lastStatus = 404;
  let lastError = "not found";

  if (isChoiceEra(slug)) {
    const url = membershipUrlFromSlug(slug);
    const result = await fetchHtml(url);
    lastStatus = result.status;
    lastError = result.error;
    if (result.html) {
      const page = parseChoicePage(result.html, url);
      if (page) {
        return { ok: true, slug, page };
      }
    }
  }

  const url = monthlyUrlFromSlug(slug);
  const result = await fetchHtml(url);
  if (result.html) {
    const page = parseMonthlyPage(result.html, url);
    if (page) {
      return { ok: true, slug, page };
    }
  }

  const status = lastStatus === 404 && result.status === 404 ? 404 : result.status || lastStatus;
  return {
    ok: false,
    slug,
    status,
    reason: status === 404 ? "not found" : result.error || lastError || "page data missing",
  };
};
