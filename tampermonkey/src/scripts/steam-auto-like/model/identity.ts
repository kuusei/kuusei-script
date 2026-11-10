export type Identity = { accountId: string; profiles: string[] };
export type ActivityAuthor = { accountId: string; profile: string; name: string };

// Optional fallback if Steam's signed-in user information is unavailable.
export const selfProfileUrl = "";

export function profileKey(href: unknown): string {
  if (typeof href !== "string" || !href.trim()) return "";
  try {
    const url = absoluteUrl(href.trim());
    if (!url || url.hostname.toLowerCase() !== "steamcommunity.com") return "";
    const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)(?:\/|$)/i);
    return match ? `/${match[1].toLowerCase()}/${decodeURIComponent(match[2]).toLowerCase()}` : "";
  } catch { return ""; }
}

function absoluteUrl(href: string): URL | null {
  if (/^https?:\/\//i.test(href)) return new URL(href);
  if (href.startsWith("//")) return new URL(`https:${href}`);
  const base = typeof location !== "undefined" && location.href ? location.href : "https://steamcommunity.com";
  return new URL(href, base);
}

export function accountIdFromSteamId(steamId: unknown): string {
  if (typeof steamId !== "string" || !/^\d{17}$/.test(steamId)) return "";
  const accountId = BigInt(steamId) - 76561197960265728n;
  return accountId > 0n && accountId <= 4294967295n ? accountId.toString() : "";
}

export function getSelfIdentity(): Identity | null {
  const identity: Identity = { accountId: "", profiles: [] };
  const addSteamId = (value: unknown) => {
    const accountId = accountIdFromSteamId(value);
    if (accountId) identity.accountId = accountId;
  };
  const addProfile = (href: unknown) => {
    const key = profileKey(href);
    if (!key) return;
    if (!identity.profiles.includes(key)) identity.profiles.push(key);
    if (key.startsWith("/profiles/")) addSteamId(key.slice(10));
  };
  // The page URL describes the viewed profile, not necessarily the signed-in user.
  const element = document.getElementById("application_config");
  if (element) {
    try {
      const info: unknown = JSON.parse(element.getAttribute("data-userinfo") || "{}");
      if (info && typeof info === "object" && "steamid" in info) addSteamId(info.steamid);
    } catch { /* Continue with the page global/header. */ }
  }
  addSteamId((window as Window & { g_steamID?: unknown }).g_steamID);
  const avatar = document.querySelector("#global_header a.user_avatar[href]");
  if (avatar) {
    addProfile(avatar.getAttribute("href"));
    const mini = avatar.matches("[data-miniprofile]") ? avatar : avatar.querySelector("[data-miniprofile]");
    const id = mini?.getAttribute("data-miniprofile") || "";
    if (/^\d+$/.test(id)) identity.accountId = id;
  }
  addProfile(selfProfileUrl);
  return identity.accountId || identity.profiles.length ? identity : null;
}

export function readActivityAuthor(element: Element): ActivityAuthor | null {
  const entry = element.closest(".blotter_entry") || element.closest(".blotter_block");
  const author = entry?.querySelector(".blotter_author_block");
  if (!author) return null;
  // Only the author header counts. Ignore comment avatars and mentions in the body.
  const link = author.querySelector(".blotter_avatar_holder a[href]") ||
    Array.from(author.querySelectorAll("a[href]")).find(a => profileKey(a.getAttribute("href")));
  const profile = profileKey(link?.getAttribute("href"));
  const mini = (link?.matches("[data-miniprofile]") ? link : link?.querySelector("[data-miniprofile]")) || author.querySelector("[data-miniprofile]");
  let accountId = mini?.getAttribute("data-miniprofile") || "";
  if (!/^\d+$/.test(accountId)) accountId = "";
  if (!accountId && profile.startsWith("/profiles/")) accountId = accountIdFromSteamId(profile.slice(10));
  if (!accountId && !profile) return null;
  return { accountId, profile, name: authorName(author) };
}

export function isOwnAuthor(author: ActivityAuthor | null, identity: Identity | null): boolean | null {
  if (!identity || !author) return null;
  if (author.profile && identity.profiles.includes(author.profile)) return true;
  if (author.accountId && identity.accountId) return author.accountId === identity.accountId;
  if (author.profile && identity.profiles.some(profile => profile.split("/")[1] === author.profile.split("/")[1])) return false;
  return null;
}

export function isOwnActivity(element: Element, identity: Identity | null): boolean | null {
  return isOwnAuthor(readActivityAuthor(element), identity);
}

export function activityNameAnchor(element: Element): HTMLAnchorElement | null {
  const entry = element.closest(".blotter_entry") || element.closest(".blotter_block");
  const author = entry?.querySelector(".blotter_author_block");
  return author ? authorNameAnchor(author) : null;
}

function authorName(author: Element): string {
  const text = (authorNameAnchor(author)?.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

function authorNameAnchor(author: Element): HTMLAnchorElement | null {
  const preferred = author.querySelector("a.bb_link");
  if (preferred instanceof HTMLAnchorElement && anchorText(preferred) && !preferred.querySelector("img")) return preferred;
  for (const anchor of Array.from(author.querySelectorAll("a"))) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    if (anchor.closest(".blotter_avatar_holder") || anchor.querySelector("img")) continue;
    if (anchorText(anchor)) return anchor;
  }
  return null;
}

function anchorText(anchor: Element): string {
  return (anchor.textContent || "").replace(/\s+/g, " ").trim();
}
