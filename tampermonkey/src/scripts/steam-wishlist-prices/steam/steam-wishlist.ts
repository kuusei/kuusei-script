import { cacheSet, wishlistCacheKey } from "../cache/cache";
import { wishlistAttemptKey, wishlistCacheMessages, wishlistCacheState } from "../cache/wishlist-cache";
import {
  fillWishlistStoreItems,
  readWebApiToken,
  steamGetJson,
  withSteamAuth,
  type SteamStoreAssets,
  type SteamStoreItem,
} from "./steam-http";

const ASSET_CDN = "https://shared.akamai.steamstatic.com/store_item_assets/";
const CATALOG_REQUEST = {
  include_basic_info: true,
  include_release: true,
  include_assets: true,
  include_all_purchase_options: true,
};

export type WishlistGame = {
  appid: number;
  title: string;
  comingSoon: boolean;
  releasedAt: number | null;
  free: boolean;
  delisted: boolean;
  capsule: string;
};

export type WishlistLoad = {
  games: WishlistGame[];
  refreshed: boolean;
  addedAppids: number[];
  countryItems: Map<string, Map<number, SteamStoreItem>>;
};

type CatalogItem = {
  title: string;
  comingSoon: boolean;
  releasedAt: number | null;
  free: boolean;
  delisted: boolean;
  capsule: string;
};

const unixTime = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const assetUrl = (assets: SteamStoreAssets | undefined, file?: string) => {
  if (!assets?.asset_url_format || !file) return "";
  return `${ASSET_CDN}${assets.asset_url_format.replace("${FILENAME}", file)}`;
};

const hashedCapsule = (url: string) =>
  /store_item_assets\/steam\/apps\/\d+\/[a-f0-9]{8,}\//i.test(url);

const capsuleOf = (_appid: number, assets?: SteamStoreAssets) =>
  assetUrl(assets, assets?.small_capsule) ||
  assetUrl(assets, assets?.header) ||
  assetUrl(assets, assets?.main_capsule) ||
  "";

const parseAppIds = (items: Array<{ appid?: number }> | undefined) =>
  (items ?? [])
    .map((item) => item.appid)
    .filter((appid): appid is number => Number.isFinite(appid));

const catalogFromStoreItem = (appid: number, item: SteamStoreItem): CatalogItem => {
  const id = item.appid && item.appid > 0 ? item.appid : appid;
  const restricted = item.unvailable_for_country_restriction === true;
  const delisted = !restricted && (item.visible === false || !item.appid || item.success !== 1);
  return {
    title: item.name?.trim() || `App ${id}`,
    comingSoon: item.release?.is_coming_soon === true,
    releasedAt:
      unixTime(item.release?.steam_release_date) ?? unixTime(item.release?.original_release_date),
    free: item.is_free === true,
    delisted,
    capsule: capsuleOf(id, item.assets),
  };
};

export const fetchWishlistAppIds = async (steamId: string, token: string) => {
  const data = await steamGetJson<{
    response?: { items?: Array<{ appid?: number }> };
  }>(
    withSteamAuth(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`, token),
    "Steam wishlist",
  );
  const appids = parseAppIds(data.response?.items);
  if (appids.length === 0) {
    throw new Error("愿望单为空或未公开");
  }
  return appids;
};

const mergeCatalog = (base: Map<number, CatalogItem>, extra: Map<number, CatalogItem>) => {
  for (const [appid, item] of extra) {
    const current = base.get(appid);
    if (!current) {
      base.set(appid, item);
      continue;
    }
    if (current.delisted && !item.delisted) {
      base.set(appid, {
        title: current.title === `App ${appid}` ? item.title : current.title,
        comingSoon: current.comingSoon || item.comingSoon,
        releasedAt: current.releasedAt ?? item.releasedAt,
        free: current.free || item.free,
        delisted: false,
        capsule: hashedCapsule(current.capsule) ? current.capsule : item.capsule || current.capsule,
      });
      continue;
    }
    if (!current.delisted && item.delisted) {
      continue;
    }
    base.set(appid, {
      title: current.title === `App ${appid}` ? item.title : current.title,
      comingSoon: current.comingSoon || item.comingSoon,
      releasedAt: current.releasedAt ?? item.releasedAt,
      free: current.free || item.free,
      delisted: current.delisted && item.delisted,
      capsule: hashedCapsule(current.capsule) ? current.capsule : item.capsule || current.capsule,
    });
  }
};

const mergeAppIds = (appids: number[], extra: number[]) => {
  const seen = new Set(appids);
  for (const appid of extra) {
    if (!seen.has(appid)) {
      seen.add(appid);
      appids.push(appid);
    }
  }
};

const isPricedGame = (game: WishlistGame) => !game.delisted && !game.comingSoon && !game.free;

export const loadSteamWishlist = async (
  steamId: string,
  home: string,
  pageCount: number | null = null,
  countries: string[] = [home],
  knownAppids?: number[],
): Promise<WishlistLoad> => {
  const key = wishlistCacheKey(steamId, home);
  const state = wishlistCacheState(steamId, home, pageCount);
  const previous = state.games ?? [];
  if (!state.refresh) {
    if (!state.games) throw new Error(wishlistCacheMessages["zh-CN"].retryLater);
    return {
      games: state.games,
      refreshed: false,
      addedAppids: [],
      countryItems: new Map(),
    };
  }
  cacheSet(wishlistAttemptKey(steamId), true);
  const token = await readWebApiToken();
  const appids = knownAppids ? [...knownAppids] : await fetchWishlistAppIds(steamId, token);
  const filled = await fillWishlistStoreItems(steamId, token, home, CATALOG_REQUEST, undefined, appids.length);
  const countryItems = new Map([[home, filled.storeItems]]);
  mergeAppIds(appids, filled.appids);
  const catalog = new Map<number, CatalogItem>();
  for (const [appid, item] of filled.storeItems) {
    catalog.set(appid, catalogFromStoreItem(appid, item));
  }
  const missingMetadata = () => appids.filter((appid) => {
    const item = catalog.get(appid);
    return !item || item.delisted || item.title === `App ${appid}` || !item.capsule ||
      (item.releasedAt === null && !item.comingSoon);
  });
  // Selected regions are also needed for prices; retain their complete responses for reuse.
  for (const country of new Set(countries)) {
    if (country === home || missingMetadata().length === 0) continue;
    const extra = await fillWishlistStoreItems(steamId, token, country, CATALOG_REQUEST, undefined, appids.length);
    countryItems.set(country, extra.storeItems);
    mergeCatalog(catalog, new Map([...extra.storeItems].map(([appid, item]) =>
      [appid, catalogFromStoreItem(appid, item)])));
  }
  const games = appids.map((appid) => {
    const item = catalog.get(appid);
    return {
      appid,
      title: item?.title ?? `App ${appid}`,
      comingSoon: item?.comingSoon ?? false,
      releasedAt: item?.releasedAt ?? null,
      free: item?.free ?? false,
      delisted: item?.delisted ?? true,
      capsule: item?.capsule ?? capsuleOf(appid),
    };
  });
  const previousIds = new Set(previous.map((game) => game.appid));
  const addedAppids = games
    .filter((game) => isPricedGame(game) && !previousIds.has(game.appid))
    .map((game) => game.appid);
  cacheSet(key, games);
  return {
    games,
    refreshed: true,
    addedAppids,
    countryItems,
  };
};
