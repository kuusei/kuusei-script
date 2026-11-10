import { loadValue, saveValue } from "@/shared";
import { noteRequest } from "../requests/request-meter";
import { readWebApiToken } from "./steam-http";

export type WishlistTag = { id: string; name: string };
export type WishlistTags = {
  available: boolean;
  editable: boolean;
  categories: WishlistTag[];
  items: Record<string, string[]>;
  warning: string | null;
};
const cacheKey = (steamId: string) => `wishlist-tags-v1:${steamId}`;
const TAG_CACHE_TTL_MS = 5 * 60 * 1000;
type CachedTags = Pick<WishlistTags, "categories" | "items"> & { fetchedAt?: number };
const categoryId = (id: unknown): id is string => typeof id === "string" && /^[1-9]\d*$/.test(id);
export const tokenSteamId = (token: string): string | null => {
  try {
    const data = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof data.sub === "string" && /^7656119\d{10}$/.test(data.sub) &&
      (typeof data.exp !== "number" || data.exp * 1000 > Date.now()) ? data.sub : null;
  } catch { return null; }
};
const parseCategories = (raw: unknown): WishlistTag[] => {
  if (!Array.isArray(raw)) throw new Error("Steam 标签数据格式异常");
  return raw.map((item) => {
    if (!categoryId(item?.categoryid) || typeof item.name !== "string") throw new Error("Steam 标签数据格式异常");
    return { id: item.categoryid, name: item.name };
  });
};
const tagRequest = async (method: string, input: object, token: string, write = false): Promise<Record<string, any>> => {
  noteRequest();
  const params = new URLSearchParams({ input_json: JSON.stringify(input), access_token: token });
  const url = `https://api.steampowered.com/IWishlistService/${method}/v1/`;
  let response: { status: number; responseText: string; responseHeaders: string };
  try {
    if (typeof GM_xmlhttpRequest === "function") {
      response = await new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: write ? "POST" : "GET", url: write ? url : `${url}?${params}`,
        ...(write ? { data: params.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
        anonymous: true, timeout: 20000,
        onload: (res) => resolve({ status: res.status, responseText: res.responseText, responseHeaders: res.responseHeaders }),
        onerror: () => reject(new Error()), ontimeout: () => reject(new Error()), onabort: () => reject(new Error()),
      }));
    } else {
      const res = await fetch(write ? url : `${url}?${params}`, {
        method: write ? "POST" : "GET", credentials: "omit", signal: AbortSignal.timeout(20000),
        ...(write ? { body: params.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
      });
      response = { status: res.status, responseText: await res.text(), responseHeaders: `x-eresult: ${res.headers.get("x-eresult") ?? ""}` };
    }
  } catch { throw new Error("Steam 标签请求失败或超时，请重试"); }
  const result = response.responseHeaders.match(/^x-eresult:\s*(\d+)/im)?.[1];
  if (response.status < 200 || response.status >= 300 || result && result !== "1" || write && result !== "1") {
    throw new Error(`Steam 标签${write ? "保存" : "读取"}失败（${result ? `结果 ${result}` : `HTTP ${response.status}`}）`);
  }
  const data = JSON.parse(response.responseText);
  if (!data.response || typeof data.response !== "object") throw new Error("Steam 标签数据格式异常");
  return data.response;
};
const ownedToken = async (steamId: string) => {
  const token = await readWebApiToken();
  if (tokenSteamId(token) !== steamId) throw new Error("只能编辑当前登录账号自己的愿望单标签");
  return token;
};
export const persistWishlistTags = (steamId: string, tags: WishlistTags, shareToken = "", fetchedAt?: number) => {
  // Shared links may expose different subsets; never reuse data across share permissions.
  if (tags.available && !shareToken) {
    // Editing one game must not extend the freshness of the entire wishlist.
    fetchedAt ??= loadValue<CachedTags | null>(cacheKey(steamId), null)?.fetchedAt;
    saveValue(cacheKey(steamId), { categories: tags.categories, items: tags.items, fetchedAt });
  }
};
export const loadWishlistTags = async (
  steamId: string, country: string, shareToken = "", memberships?: Record<string, string[]>,
  options: { force?: boolean } = {},
): Promise<WishlistTags> => {
  const empty: WishlistTags = { available: false, editable: false, categories: [], items: {}, warning: null };
  let own = false;
  try {
    const token = await readWebApiToken();
    own = tokenSteamId(token) === steamId;
    if (!own && !shareToken) return empty;
    const cached = own ? loadValue<CachedTags | null>(cacheKey(steamId), null) : null;
    const age = cached?.fetchedAt == null ? Infinity : Date.now() - cached.fetchedAt;
    if (cached && !options.force && !memberships && age >= 0 && age < TAG_CACHE_TTL_MS) {
      return { ...empty, categories: cached.categories, items: cached.items, available: true, editable: true };
    }
    const [definitions, wishlist] = await Promise.all([
      tagRequest(own ? "GetWishlistCategories" : "GetSharedWishlistCategories",
        own ? {} : { steamid: steamId, share_token: shareToken }, token),
      // Reuse fresh catalog memberships when the wishlist itself has refreshed.
      own && memberships ? Promise.resolve({ items: Object.entries(memberships).map(([appid, category_ids]) => ({ appid: Number(appid), category_ids })) }) : tagRequest("GetWishlistSortedFiltered", {
        steamid: steamId, context: { language: "schinese", country_code: country }, filters: {},
        ...(!own && shareToken ? { share_token: shareToken } : {}),
      }, token),
    ]);
    const categories = parseCategories(definitions.categories ?? []);
    const items: Record<string, string[]> = {};
    if (!Array.isArray(wishlist.items)) throw new Error("Steam 愿望单标签数据格式异常");
    for (const item of wishlist.items) {
      if (!Number.isSafeInteger(item.appid) || item.appid <= 0 ||
        item.category_ids !== undefined && (!Array.isArray(item.category_ids) || !item.category_ids.every(categoryId))) {
        throw new Error("Steam 愿望单标签数据格式异常");
      }
      items[item.appid] = [...new Set<string>(item.category_ids ?? [])];
    }
    const tags: WishlistTags = { available: true, editable: own, categories, items, warning: null };
    persistWishlistTags(steamId, tags, own ? "" : shareToken, Date.now());
    return tags;
  } catch (error) {
    const cached = own ? loadValue<CachedTags | null>(cacheKey(steamId), null) : null;
    return { ...empty, ...(cached ? { categories: cached.categories, items: cached.items, available: true } : {}),
      warning: error instanceof Error ? error.message : "标签读取失败" };
  }
};
export const matchesWishlistTags = (ids: string[] | undefined, selected: ReadonlySet<string>, excluded?: ReadonlySet<string>) => {
  if (selected.size === 0 && !excluded?.size) return true;
  if (ids === undefined) return false;
  if (excluded?.has("0") && ids.length === 0 || ids.some((id) => excluded?.has(id))) return false;
  return selected.size === 0 || selected.has("0") && ids.length === 0 || ids.some((id) => selected.has(id));
};

export type TagEdits = { add: string[]; remove: string[]; create: string[] };
export const saveGameTags = async (steamId: string, appid: number, tags: WishlistTags, edits: TagEdits) => {
  const token = await ownedToken(steamId);
  if (!Number.isSafeInteger(appid) || appid <= 0 || ![...edits.add, ...edits.remove].every(categoryId) ||
    edits.create.some((name) => !name.trim() || name.length > 500)) throw new Error("标签修改内容无效");
  const failures: string[] = [];
  const ids = new Set(tags.items[appid] ?? []);
  for (const id of edits.remove) {
    try { await tagRequest("RemoveWishlistItemCategory", { appid, categoryid: id }, token, true); ids.delete(id); }
    catch (error) { failures.push(`移除 ${tags.categories.find((tag) => tag.id === id)?.name ?? id}：${(error as Error).message}`); }
  }
  for (const input of [...edits.add.map((id) => ({ categoryid: id })), ...edits.create.map((name) => ({ category_name: name }))]) {
    try {
      const result = await tagRequest("AddWishlistItemCategory", { appid, ...input }, token, true);
      const [category] = parseCategories([result]);
      ids.add(category.id);
      const existing = tags.categories.find((tag) => tag.id === category.id);
      if (existing) existing.name = category.name;
      else tags.categories.push(category);
    } catch (error) { failures.push(`添加 ${"category_name" in input ? input.category_name : tags.categories.find((tag) => tag.id === input.categoryid)?.name ?? input.categoryid}：${(error as Error).message}`); }
  }
  tags.items[appid] = [...ids];
  persistWishlistTags(steamId, tags);
  return failures;
};
export const renameWishlistTag = async (steamId: string, tags: WishlistTags, id: string, name: string) => {
  if (!categoryId(id) || !name.trim() || name.length > 500) throw new Error("标签名称无效");
  await tagRequest("RenameWishlistCategory", { categoryid: id, name }, await ownedToken(steamId), true);
  const category = tags.categories.find((tag) => tag.id === id);
  if (category) category.name = name;
  persistWishlistTags(steamId, tags);
};
