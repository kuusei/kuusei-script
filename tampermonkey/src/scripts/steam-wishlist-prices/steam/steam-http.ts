import { request, sleep } from "@/shared";

import { WISHLIST_STORE_FILL_MAX, WISHLIST_STORE_PAGE_SIZE } from "../config";
import { noteRequest } from "../requests/request-meter";

const MAX_ATTEMPTS = 8;
const INITIAL_MS = 1000;
const MAX_MS = 60_000;
const RETRY_STATUSES = new Set([403, 408, 429, 500, 502, 503, 504]);

const backoffMs = (attempt: number) => {
  const exp = Math.min(INITIAL_MS * 2 ** attempt, MAX_MS);
  return exp + Math.floor(Math.random() * 250);
};

const GET_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const WISHLIST_SORTED_URL = "https://api.steampowered.com/IWishlistService/GetWishlistSortedFiltered/v1/";
const MAX_GET_URL = 7800;
const MAX_GET_ITEMS = 250;

export type GetItemsContext = {
  language: string;
  country_code: string;
};

export type SteamStoreAssets = {
  asset_url_format?: string;
  small_capsule?: string;
  header?: string;
  main_capsule?: string;
};

export type SteamStoreItem = {
  id?: number;
  appid?: number;
  success?: number;
  visible?: boolean;
  name?: string;
  is_free?: boolean;
  unvailable_for_country_restriction?: boolean;
  assets?: SteamStoreAssets;
  release?: {
    is_coming_soon?: boolean;
    steam_release_date?: number;
    original_release_date?: number;
  };
  best_purchase_option?: {
    final_price_in_cents?: string;
    original_price_in_cents?: string;
    formatted_final_price?: string;
    discount_pct?: number;
    active_discounts?: { discount_end_date?: number }[];
  };
};

export type WishlistSortedItem = {
  appid?: number;
  store_item?: SteamStoreItem;
};

export const withSteamAuth = (url: string, token: string) =>
  token ? `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}` : url;

const tokenFromConfig = () => {
  const config = document.getElementById("application_config");
  if (!config) return "";
  for (const attr of Array.from(config.attributes)) {
    if (!attr.name.startsWith("data-") || !attr.value) continue;
    try {
      const parsed = JSON.parse(attr.value) as unknown;
      if (typeof parsed === "string" && parsed.startsWith("eyJ")) return parsed;
      if (parsed && typeof parsed === "object") {
        const token = (parsed as { webapi_token?: string }).webapi_token;
        if (typeof token === "string" && token.startsWith("eyJ")) return token;
      }
    } catch {
      if (attr.value.startsWith("eyJ")) return attr.value;
    }
  }
  return "";
};

let sessionWebApiToken = "";

export const hasPageWebApiToken = () => Boolean(tokenFromConfig() || sessionWebApiToken);

export const peekWebApiToken = () => tokenFromConfig() || sessionWebApiToken;

export const readWebApiToken = async () => {
  const fromPage = tokenFromConfig();
  if (fromPage) {
    sessionWebApiToken = fromPage;
    return fromPage;
  }
  if (sessionWebApiToken) {
    return sessionWebApiToken;
  }
  try {
    const data = await steamGetJson<{ data?: { webapi_token?: string } }>(
      "https://store.steampowered.com/pointssummary/ajaxgetasyncconfig",
      "Steam webapi token",
    );
    sessionWebApiToken = data.data?.webapi_token || "";
    return sessionWebApiToken;
  } catch {
    return "";
  }
};

const parseSortedAppIds = (items: WishlistSortedItem[]) =>
  items.map((item) => item.appid).filter((appid): appid is number => Number.isFinite(appid));

const hasStoreItem = (item: WishlistSortedItem) =>
  Boolean(item.store_item && Object.keys(item.store_item).length > 0);

export const fetchWishlistSortedPage = async (
  steamId: string,
  token: string,
  country: string,
  startIndex: number,
  dataRequest: Record<string, boolean>,
  pageSize = WISHLIST_STORE_PAGE_SIZE,
) => {
  const input = {
    steamid: steamId,
    context: { language: "schinese", country_code: country },
    data_request: dataRequest,
    filters: {},
    start_index: startIndex,
    page_size: pageSize,
  };
  const url = withSteamAuth(
    `${WISHLIST_SORTED_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`,
    token,
  );
  const data = await steamGetJson<{ response?: { items?: WishlistSortedItem[] } }>(
    url,
    `Steam wishlist ${country} ${startIndex}`,
  );
  return data.response?.items ?? [];
};

export const fillWishlistStoreItems = async (
  steamId: string,
  token: string,
  country: string,
  dataRequest: Record<string, boolean>,
  needed?: Set<number>,
  knownCount = 0,
) => {
  const storeItems = new Map<number, SteamStoreItem>();
  const appids: number[] = [];
  const listed = new Set<number>();
  let start = 0;
  for (let page = 0; page < 100; page++) {
    const remain = listed.size > 0 ? listed.size - start : 0;
    const pageSize =
      remain > 0
        ? Math.min(WISHLIST_STORE_FILL_MAX, remain)
        : Math.min(Math.max(knownCount, WISHLIST_STORE_PAGE_SIZE), WISHLIST_STORE_FILL_MAX);
    if (listed.size > 0 && start >= listed.size) {
      break;
    }
    const items = await fetchWishlistSortedPage(steamId, token, country, start, dataRequest, pageSize);
    const pageIds = parseSortedAppIds(items);
    if (pageIds.length === 0) {
      break;
    }
    for (const appid of pageIds) {
      if (!listed.has(appid)) {
        listed.add(appid);
        appids.push(appid);
      }
    }
    let filled = 0;
    for (const item of items) {
      if (item.appid && hasStoreItem(item) && item.store_item && !storeItems.has(item.appid)) {
        storeItems.set(item.appid, item.store_item);
        filled += 1;
      }
    }
    if (needed && [...needed].every((appid) => storeItems.has(appid) || (listed.size > 0 && !listed.has(appid)))) {
      break;
    }
    if (listed.size > 0 && storeItems.size >= listed.size) {
      break;
    }
    if (listed.size > 0 && listed.size <= pageSize) {
      break;
    }
    if (start > 0 && filled === 0) {
      break;
    }
    start += pageSize;
    if (start >= listed.size) {
      break;
    }
  }
  return { appids, storeItems, resolved: listed };
};

export const buildGetItemsUrl = (
  appids: number[],
  context: GetItemsContext,
  dataRequest: Record<string, boolean>,
  token = "",
) => {
  const input = {
    ids: appids.map((appid) => ({ appid })),
    context,
    data_request: dataRequest,
  };
  let url = `${GET_ITEMS_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
  if (token) {
    url += `&access_token=${encodeURIComponent(token)}`;
  }
  return url;
};

export const PRICE_DATA_REQUEST: Record<string, boolean> = {
  include_all_purchase_options: true,
};

export const canFetchAppPricesInOneRequest = (
  appids: number[],
  country: string,
  token = "",
) => {
  if (appids.length === 0) {
    return true;
  }
  const context = { language: "schinese", country_code: country };
  return chunkGetItems(appids, context, PRICE_DATA_REQUEST, token).length <= 1;
};

export const chunkGetItems = (
  appids: number[],
  context: GetItemsContext,
  dataRequest: Record<string, boolean>,
  token = "",
) => {
  const groups: number[][] = [];
  let current: number[] = [];
  for (const appid of appids) {
    const next = current.concat(appid);
    const fits =
      next.length <= MAX_GET_ITEMS &&
      buildGetItemsUrl(next, context, dataRequest, token).length <= MAX_GET_URL;
    if (current.length > 0 && !fits) {
      groups.push(current);
      current = [appid];
    } else {
      current = next;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
};

export const steamGetText = async (url: string, label: string): Promise<string> => {
  noteRequest();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await request({ url });
      if (response.status >= 200 && response.status < 300) {
        return response.responseText;
      }
      lastError = new Error(`${label} HTTP ${response.status}`);
      if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_ATTEMPTS - 1) {
        throw lastError;
      }
    }
    const wait = backoffMs(attempt);
    console.log(
      `[wishlist-prices] ${lastError?.message ?? label}, retry in ${Math.ceil(wait / 1000)}s (${attempt + 1}/${MAX_ATTEMPTS})`,
    );
    await sleep(wait);
  }
  throw lastError ?? new Error(`${label} retries exhausted`);
};

export const steamGetJson = async <T>(url: string, label: string): Promise<T> =>
  JSON.parse(await steamGetText(url, label)) as T;
