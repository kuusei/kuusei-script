export type ContentType = "status" | "screenshot" | "review" | "purchase" | "artwork";

export const contentTypes: readonly ContentType[] = ["status", "screenshot", "review", "purchase", "artwork"];

export const contentSelectors: Record<ContentType, string> = {
  status: ".blotter_block .blotter_userstatus",
  screenshot: ".blotter_block .blotter_screenshot",
  review: ".blotter_block .blotter_recommendation",
  purchase: ".blotter_block .blotter_gamepurchase",
  artwork: ".blotter_block .blotter_workshopitempublished",
};

export function contentTypeOf(element: Element): ContentType | null {
  for (const type of contentTypes) {
    const selector = contentSelectors[type].split(" ").pop();
    if (selector && element.matches(selector)) return type;
  }
  return null;
}

export function contentNodeSelector(): string {
  return contentTypes.map(type => contentSelectors[type].split(" ").pop() || "").filter(Boolean).join(", ");
}
