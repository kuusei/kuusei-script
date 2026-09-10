const TITLE_RE = /愿望单|願望單|Wishlist/i;

const pageRoot = () =>
  (typeof unsafeWindow === "undefined" ? window : unsafeWindow) as Window & {
    g_rgProfileData?: { personaname?: string; steamid?: string };
  };

const fromProfileData = () => {
  const name = pageRoot().g_rgProfileData?.personaname;
  return typeof name === "string" && name.trim() ? name.trim() : null;
};

const nameFromTitle = (text: string) => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const cut = trimmed.replace(/\s*(的)?(愿望单|願望單|Wishlist).*$/i, "").trim();
  if (!cut || TITLE_RE.test(cut) || cut.length > 64) {
    return null;
  }
  return cut;
};

const fromDom = () => {
  const header = document.querySelector(".wishlist_header h2, .wishlist_header h1, .profile_small_header_name");
  if (header?.textContent) {
    const name = nameFromTitle(header.textContent);
    if (name) {
      return name;
    }
  }
  const heading = Array.from(document.querySelectorAll("h1, h2")).find((el) => TITLE_RE.test(el.textContent || ""));
  if (heading?.textContent) {
    return nameFromTitle(heading.textContent);
  }
  return nameFromTitle(document.title);
};

export const loadSteamPersona = (steamId: string) => fromProfileData() || fromDom() || steamId;
