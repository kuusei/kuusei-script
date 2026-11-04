import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createStatsLoader, extractReviewTag } from "../api";
import { coverageStatus, isSummary, makeStats, otherLanguages, parsePageStats, reviewRate, reviewUrl, sortStats, stackPercentages, type ReviewStats } from "../stats";

describe("Steam review statistics", () => {
  test("zero reviews have no approval rate; invalid totals are rejected", () => {
    assert.equal(reviewRate({ language: "arabic", total: 0, positive: 0 }), null);
    assert.equal(reviewRate({ language: "english", total: 1000, positive: 876 }), 87.6);
    assert.equal(makeStats("english", 10, 11), null);
    assert.equal(makeStats("english", -1, 0), null);
    assert.equal(makeStats("english", "10", 5), null);
    assert.equal(makeStats("english", NaN, 0), null);
  });

  test("only accepts page totals for the same app and filtering scope", () => {
    const props = JSON.stringify({ appid: 730, summary_options: {
      summaryGlobalNoOutliers: { nReviews: 1000, nReviewsPositive: 800, bFilteredReviews: true, nAgeInDays: 0 },
    }, filter_options: {
      nReviewsPositive: 1600, nReviewsNegative: 400,
      rgLanguageOutliers: [
        { strLanguage: "english", nReviews: 400, nReviewsPositive: 350, bFilteredReviews: true, nAgeInDays: 0 },
        { strLanguage: "russian", nReviews: 20, nReviewsPositive: 10, bFilteredReviews: true, nAgeInDays: 30 },
        { strLanguage: "schinese", nReviews: 200, nReviewsPositive: 100, bFilteredReviews: false, nAgeInDays: 0 },
      ],
    } });
    assert.deepEqual(parsePageStats(props, 730), [
      { language: "all", total: 1000, positive: 800 },
      { language: "english", total: 400, positive: 350 },
      { language: "all_purchases", total: 2000, positive: 1600 },
    ]);
    assert.deepEqual(parsePageStats(props, 570), []);
    assert.deepEqual(parsePageStats("{broken", 730), []);
  });

  test("sorts rating both ways with empty languages last and ties by volume", () => {
    const rows = [
      { language: "empty", total: 0, positive: 0 },
      { language: "large", total: 100, positive: 50 },
      { language: "small", total: 10, positive: 5 },
      { language: "best", total: 20, positive: 20 },
    ];
    assert.deepEqual(sortStats(rows, "rate", true).map(row => row.language), ["best", "large", "small", "empty"]);
    assert.deepEqual(sortStats(rows, "rate", false).map(row => row.language), ["large", "small", "best", "empty"]);
    assert.equal(rows[0].language, "empty");
  });

  test("reports missing language coverage without inventing zero-count languages", () => {
    assert.equal(coverageStatus([
      { language: "all", total: 1000, positive: 800 },
      { language: "english", total: 900, positive: 750 },
    ]), "1 种语言 · 其余语言合并显示");
    assert.equal(coverageStatus([{ language: "all", total: 10, positive: 8 }]), "Steam 未提供各语言明细");
    assert.equal(coverageStatus([{ language: "all", total: 0, positive: 0 }]), "暂无评测");
    assert.equal(new URL(reviewUrl(730, "tchinese")).searchParams.get("filterLanguage"), "tchinese");
  });

  test("paid-game score totals exclude key activations and reconcile every count", () => {
    const counts: Array<[string, number, number]> = [
      ["english", 9750, 6933], ["russian", 3412, 2544], ["german", 1467, 996],
      ["schinese", 1342, 611], ["czech", 1173, 1003], ["turkish", 674, 526],
      ["french", 525, 370], ["polish", 510, 402], ["spanish", 499, 402],
      ["ukrainian", 373, 285], ["italian", 295, 239], ["brazilian", 244, 189], ["koreana", 201, 92],
    ];
    const props = JSON.stringify({ appid: 1941540, summary_options: {
      summaryGlobalNoOutliers: { nReviews: 21390, nReviewsPositive: 15222, bFilteredReviews: true, nAgeInDays: 0 },
    }, filter_options: { nReviewsPositive: 22832, nReviewsNegative: 8401,
      rgLanguageOutliers: counts.map(([strLanguage, nReviews, nReviewsPositive]) => ({
        strLanguage, nReviews, nReviewsPositive, bFilteredReviews: true, nAgeInDays: 0,
      })),
    } });
    const rows = parsePageStats(props, 1941540);
    const all = rows.find(row => row.language === "all")!;
    assert.deepEqual(all, { language: "all", total: 21390, positive: 15222 });
    assert.equal(reviewRate(all)?.toFixed(1), "71.2");
    const other = otherLanguages(rows)!;
    assert.deepEqual(other, { language: "other", total: 925, positive: 630 });
    const allPurchases = rows.find(row => row.language === "all_purchases")!;
    assert.deepEqual(allPurchases, { language: "all_purchases", total: 31233, positive: 22832 });
    const detail = [...rows.filter(row => !isSummary(row)), other];
    assert.equal(detail.reduce((sum, row) => sum + row.total, 0), all.total);
    assert.equal(detail.reduce((sum, row) => sum + row.positive, 0), all.positive);
    assert.equal(detail.reduce((sum, row) => sum + row.total - row.positive, 0), 6168);
  });

  test("never substitutes all-purchase totals when a score total is unavailable", () => {
    const rows = parsePageStats(JSON.stringify({ appid: 1,
      filter_options: { nReviewsPositive: 100, nReviewsNegative: 10 },
    }), 1);
    assert.deepEqual(rows, [{ language: "all_purchases", total: 110, positive: 100 }]);
    assert.equal(rows.some(row => row.language === "all"), false);
    assert.equal(otherLanguages([
      { language: "all", total: 10, positive: 5 },
      { language: "english", total: 20, positive: 10 },
    ]), null);
  });

  test("positive and negative counts have independent sorting", () => {
    const rows = [
      { language: "a", total: 100, positive: 90 },
      { language: "b", total: 200, positive: 80 },
    ];
    assert.equal(sortStats(rows, "positive", true)[0].language, "a");
    assert.equal(sortStats(rows, "negative", true)[0].language, "b");
  });

  test("each language fills its row using its own approval ratio, excluding summaries", () => {
    const rows: ReviewStats[] = [
      { language: "all", total: 1000, positive: 800 },
      { language: "all_purchases", total: 2000, positive: 1800 },
      { language: "english", total: 800, positive: 600 },
    ];
    const other = otherLanguages(rows)!;
    assert.deepEqual(other, { language: "other", total: 200, positive: 200 });
    assert.deepEqual(stackPercentages(rows[2]), { positive: 75, total: 100 });
    assert.deepEqual(stackPercentages(other), { positive: 100, total: 100 });
    assert.deepEqual(stackPercentages({ language: "small", total: 10, positive: 7 }), { positive: 70, total: 100 });
    assert.deepEqual(stackPercentages({ language: "empty", total: 0, positive: 0 }), { positive: 0, total: 0 });
    assert.equal(coverageStatus(rows), "1 种语言 · 其余语言合并显示");
  });
});

describe("request budget", () => {
  const page: ReviewStats[] = [
    { language: "all", total: 1000, positive: 800 },
    { language: "english", total: 900, positive: 750 },
  ];
  function setup(native = page, cached: ReviewStats[] = []) {
    let requests = 0;
    const loader = createStatsLoader({
      readPage: () => native,
      readCache: () => cached,
      request: async () => { requests++; return page; },
      saveCache: () => {},
    });
    return { loader, count: () => requests };
  }

  test("refresh only parses the statistics tag, excluding resource-loading elements", () => {
    const tag = '<div class="" data-featuretarget="appreviews" data-props="{&quot;appid&quot;:730}">';
    const html = `<html><script src="/site.js"></script><img src="/cover.jpg">${tag}<iframe src="/frame"></iframe></div></html>`;
    assert.equal(extractReviewTag(html), tag);
    assert.equal(extractReviewTag('<div data-featuretarget="other"></div>'), "");
  });

  test("native page statistics need zero requests, even with missing languages", async () => {
    const { loader, count } = setup();
    assert.deepEqual(await loader.load(), page);
    await loader.load();
    assert.equal(count(), 0);
  });

  test("cache fallback needs zero requests", async () => {
    const { loader, count } = setup([], page);
    assert.deepEqual(await loader.load(), page);
    assert.equal(count(), 0);
  });

  test("missing page data makes one request shared by simultaneous loads and remounts", async () => {
    const { loader, count } = setup([]);
    await Promise.all([loader.load(), loader.load(), loader.load()]);
    await loader.load();
    assert.equal(count(), 1);
  });

  test("refresh makes one request and subsequent loads retain the refreshed snapshot", async () => {
    const { loader, count } = setup();
    await loader.load();
    await Promise.all([loader.load(true), loader.load(true)]);
    await loader.load();
    assert.equal(count(), 1);
  });

  test("failed requests are not automatically retried on remount", async () => {
    let requests = 0;
    const loader = createStatsLoader({
      readPage: () => [], readCache: () => [], saveCache: () => {},
      request: async () => { requests++; throw new Error("HTTP 429"); },
    });
    await assert.rejects(loader.load(), /429/);
    await assert.rejects(loader.load(), /429/);
    assert.equal(requests, 1);
    await assert.rejects(loader.load(true), /429/);
    assert.equal(requests, 2);
  });
});
