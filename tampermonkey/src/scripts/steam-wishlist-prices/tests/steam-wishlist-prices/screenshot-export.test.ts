import { test } from "node:test";
import assert from "node:assert/strict";
import { JPEG_MAX_HEIGHT, screenshotHtml, SCREENSHOT_SCALE, SCREENSHOT_WIDTHS, splitScreenshotRows } from "../../ui/screenshot-export";

test("long screenshots split at card boundaries without losing or repeating rows", () => {
  assert.deepEqual(splitScreenshotRows([], 100), [[]]);
  assert.deepEqual(splitScreenshotRows([40, 52, 60, 32], 100), [[0, 1], [2, 3]]);
  assert.deepEqual(splitScreenshotRows([100, 100, 100], 100), [[0], [1], [2]]);
  assert.deepEqual(splitScreenshotRows([30.2, 60.1, 1], 100), [[0, 1], [2]]);
  assert.throws(() => splitScreenshotRows([101], 100), /PC 版/);
});

test("395 games fill long JPGs up to the format limit without losing their order", () => {
  const heights = Array.from({ length: 395 }, (_, index) => 150 + index % 4 * 20);
  const overhead = 220;
  const available = JPEG_MAX_HEIGHT / SCREENSHOT_SCALE - overhead - 64;
  const pages = splitScreenshotRows(heights, available);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.flat(), heights.map((_, index) => index));
  for (const page of pages) {
    const height = page.reduce((sum, index) => sum + heights[index], 0) + (page.length - 1) * 8 + overhead;
    assert.ok(height * SCREENSHOT_SCALE < JPEG_MAX_HEIGHT);
  }
});

test("screenshots preserve the selected report content and can omit plugin attribution", () => {
  const snapshot = {
    steamName: '<img src=x onerror="bad()">', home: "中国", countries: ["中国", "美国"],
    generatedAt: "生成于 2026/11/10 20:00:00", summary: "显示 1 / 3 · 本区总价 ¥9.00",
    listHtml: '<article class="wl-row">筛选后的游戏</article>',
  };
  const withIntro = screenshotHtml(snapshot, { layout: "mobile", includeIntro: true });
  const withoutIntro = screenshotHtml(snapshot, { layout: "pc", includeIntro: false });
  assert.match(withIntro, /Steam 愿望单区域比价 by kuusei/);
  assert.match(withIntro, /href="https:\/\/greasyfork.org\/zh-CN\/scripts\/595010-/);
  assert.doesNotMatch(withIntro, /<img/);
  for (const html of [withIntro, withoutIntro]) {
    assert.match(html, /中国 \/ 美国/);
    assert.match(html, /显示 1 \/ 3/);
    assert.match(html, /筛选后的游戏/);
  }
  assert.doesNotMatch(withoutIntro, /by kuusei|greasyfork/);
  assert.equal(SCREENSHOT_WIDTHS.mobile * SCREENSHOT_SCALE, 960);
  assert.equal(SCREENSHOT_WIDTHS.pc * SCREENSHOT_SCALE, 2560);
});
