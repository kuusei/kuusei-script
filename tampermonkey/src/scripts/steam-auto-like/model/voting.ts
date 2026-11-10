import { ruleMatches } from "./blocks";
import type { Config } from "./config";
import { contentSelectors, type ContentType } from "./content";
import { getSelfIdentity, isOwnAuthor, readActivityAuthor } from "./identity";

export type { ContentType };
export const contentOptions: [ContentType, keyof Config][] = [
  ["status", "thumbUpUserStatus"], ["screenshot", "thumbUpScreenshot"],
  ["review", "thumbUpRecommendation"], ["purchase", "thumbUpGamePurchase"],
  ["artwork", "thumbUpWorkshopItemPublished"],
];
const labels: Record<ContentType, [string, string]> = {
  status: ["状态动态", "Status updates"], screenshot: ["游戏截图", "Screenshots"],
  review: ["游戏评测", "Game reviews"], purchase: ["购买游戏", "Game purchases"],
  artwork: ["艺术作品与收藏", "Artwork & favorites"],
};

function firstScreenshotControls(group: Element): Element | null {
  const firstThumbnail = group.querySelector(
    ".blotter_screenshot_gallery_image, .blotter_screenshot_gallery_image_selected",
  );
  const screenshotId = firstThumbnail?.id.match(/^ss_.+_(\d+)$/)?.[1];
  if (screenshotId) {
    // Use the first thumbnail's controls even when a different image is selected.
    // If its controls are missing, skip the group instead of liking another image.
    return group.querySelector(`[id="ratingcontrols_ss_${screenshotId}"]`);
  }
  const controls = group.querySelector('[id^="ratingcontrols_ss_"]');
  if (controls) return controls;
  const icon = group.querySelector(".thumb_up");
  return icon?.parentElement?.parentElement?.parentElement || null;
}

export function voteContentType(type: ContentType, config: Config, log: (message: string) => void): void {
  const chinese = config.language === "chinese";
  const identity = getSelfIdentity();
  if (!identity) {
    log(chinese ? "无法识别当前账号，已停止点赞。可在脚本 selfProfileUrl 中填写自己的资料链接。" : "Cannot identify the signed-in account. Voting stopped; set selfProfileUrl if needed.");
    return;
  }
  let own = 0, unknown = 0, already = 0, likes = 0, funny = 0, blocked = 0;
  const rules = config.blocks ?? [];
  const clicked = new Set<HTMLElement>();
  for (const element of Array.from(document.querySelectorAll(contentSelectors[type]))) {
    const author = readActivityAuthor(element);
    const self = isOwnAuthor(author, identity);
    if (self === true) { own++; continue; }
    if (author && rules.some(rule => ruleMatches(rule, author, type))) { blocked++; continue; }
    if (self === null) { unknown++; continue; }
    const scope = type === "screenshot" ? firstScreenshotControls(element) : element;
    if (!scope) { unknown++; continue; }
    if (scope.querySelector(".active, .btn_active")) { already++; continue; }
    let useFunny = false;
    if (type === "review" && config.thumbHappyByRecommendation) {
      const thumb = scope.querySelector(".thumb")?.innerHTML || "";
      if (thumb.includes("thumbsDown.png")) useFunny = true;
      else if (!thumb.includes("thumbsUp.png")) { unknown++; continue; }
    }
    const icon = scope.querySelector(useFunny ? ".funny" : ".thumb_up");
    if (!icon) continue;
    const target = icon.closest<HTMLElement>("button, a, [onclick]") || icon.parentElement?.parentElement;
    if (!(target instanceof HTMLElement) || clicked.has(target)) continue;
    clicked.add(target);
    target.click();
    if (useFunny) funny++; else likes++;
  }
  const label = labels[type][chinese ? 0 : 1];
  log(chinese ? `${label} · 本次点击 ${likes}，欢乐 ${funny}，已点赞 ${already}` : `${label} · Clicked ${likes}, funny ${funny}, already liked ${already}`);
  log(chinese ? `跳过自己的内容：${own} · 跳过屏蔽：${blocked} · 跳过无法识别的内容：${unknown}` : `Skipped own content: ${own} · Skipped blocked: ${blocked} · Skipped unidentified content: ${unknown}`);
}
