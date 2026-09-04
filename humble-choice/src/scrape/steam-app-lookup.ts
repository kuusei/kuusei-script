import type { ChoiceGame, ChoiceMonth } from "../types/catalog";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type StoreSearchItem = {
  type?: string;
  name?: string;
  id?: number;
};

type StoreSearchResponse = {
  items?: StoreSearchItem[];
};

const lookupCache = new Map<string, number | null>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const cleanSteamTitle = (title: string) =>
  title
    .replace(/[™®©]/g, "")
    .replace(/\(r\)/gi, "")
    .replace(/\(tm\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const isAddonTitle = (name: string) =>
  /\b(soundtrack|ost|dlc|upgrade|demo)\b/i.test(name);

const scoreSteamName = (query: string, name: string) => {
  if (name === query) {
    return 100;
  }
  if (isAddonTitle(name) && !isAddonTitle(query)) {
    return 0;
  }
  if (name.startsWith(`${query}:`) || name.startsWith(`${query} - `)) {
    return 85;
  }
  return 0;
};

export const lookupSteamAppId = async (title: string) => {
  const query = cleanSteamTitle(title);
  const cacheKey = query.toLowerCase();
  if (!query) {
    return null;
  }
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey) ?? null;
  }

  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=US&l=english`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as StoreSearchResponse;
  const needle = cacheKey;
  let best: { id: number; score: number } | null = null;
  for (const item of data.items ?? []) {
    if (item.type !== "app" || !item.id || !item.name) {
      continue;
    }
    const score = scoreSteamName(needle, cleanSteamTitle(item.name).toLowerCase());
    if (score === 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = { id: item.id, score };
    }
  }

  const appId = best && best.score >= 80 ? best.id : null;
  lookupCache.set(cacheKey, appId);
  return appId;
};

export const fillSteamAppIds = async (
  month: ChoiceMonth,
  delayMs = 200,
): Promise<ChoiceMonth> => {
  const games: ChoiceGame[] = [];
  let lookups = 0;
  for (const game of month.games) {
    if (
      game.steamAppIds.length > 0 ||
      !game.deliveryMethods.includes("steam")
    ) {
      games.push(game);
      continue;
    }
    if (lookups > 0) {
      await sleep(delayMs);
    }
    lookups += 1;
    const appId = await lookupSteamAppId(game.title);
    if (appId) {
      console.log(`[steam] ${game.title} -> ${appId}`);
      games.push({ ...game, steamAppIds: [appId] });
      continue;
    }
    console.warn(`[steam] miss ${game.title}`);
    games.push(game);
  }
  return { ...month, games };
};
