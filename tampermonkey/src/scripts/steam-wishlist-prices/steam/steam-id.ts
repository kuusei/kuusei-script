import { steamGetText } from "./steam-http";

const STEAM_ID_RE = /^7656119\d{10}$/;

const fromHref = (href: string) => {
  const profile = href.match(/\/(?:wishlist\/)?profiles\/(\d{17})/);
  if (profile?.[1] && STEAM_ID_RE.test(profile[1])) {
    return profile[1];
  }
  const vanity = href.match(/\/(?:wishlist\/)?id\/([^/?#]+)/);
  return vanity?.[1] ? { vanity: decodeURIComponent(vanity[1]) } : null;
};

const parsePersonaId = (xml: string) => {
  const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  return match?.[1] && STEAM_ID_RE.test(match[1]) ? match[1] : null;
};

const resolveVanity = async (vanity: string) => {
  const xml = await steamGetText(
    `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`,
    "Steam vanity",
  );
  const steamId = parsePersonaId(xml);
  if (!steamId) {
    throw new Error(`无法解析自定义 URL: ${vanity}`);
  }
  return steamId;
};

const fromPageGlobals = () => {
  const root = (typeof unsafeWindow === "undefined" ? window : unsafeWindow) as Window & {
    g_steamID?: string;
    g_rgProfileData?: { steamid?: string };
  };
  const candidates = [root.g_rgProfileData?.steamid, root.g_steamID];
  for (const value of candidates) {
    if (value && STEAM_ID_RE.test(value)) {
      return value;
    }
  }
  return null;
};

export const resolveSteamId = async () => {
  const parsed = fromHref(location.href);
  if (typeof parsed === "string") {
    return parsed;
  }
  if (parsed && "vanity" in parsed) {
    return resolveVanity(parsed.vanity);
  }
  const fromPage = fromPageGlobals();
  if (fromPage) {
    return fromPage;
  }
  throw new Error("当前页找不到 Steam ID，请打开愿望单页面后再试");
};
