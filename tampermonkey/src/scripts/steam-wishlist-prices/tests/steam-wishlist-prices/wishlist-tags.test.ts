import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { loadWishlistTags, matchesWishlistTags, renameWishlistTag, saveGameTags, tokenSteamId, type WishlistTags } from "../../steam/wishlist-tags";
import { steamListHtml } from "../../ui/steam-list";
import { mountWishlistTagControls, tagEscape } from "../../ui/wishlist-tags";
import type { ReportPayload } from "../../ui/report-html";

const steamId = "76561199423692922";
const otherId = "76561199423692923";
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalGm = globalThis.GM_xmlhttpRequest;
const originalNow = Date.now;
const storage = new Map<string, unknown>();
const calls: { method: string; input: any; write: boolean }[] = [];
let activeToken: string;
let respond: (method: string, input: any) => Response;
let now: number;
const token = (sub = steamId, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub, exp })).toString("base64url")}.signature`;
const reply = (response: object, result = "1") => Response.json({ response }, { headers: { "x-eresult": result } });
const snapshot = (): WishlistTags => ({
  available: true, editable: true, warning: null,
  categories: [{ id: "9007199254740993", name: "想买" }, { id: "2", name: "等等" }],
  items: { 220: ["9007199254740993"], 440: [] },
});
beforeEach(() => {
  now = originalNow(); Date.now = () => now;
  storage.clear(); calls.length = 0; activeToken = token();
  Object.assign(globalThis, {
    document: { getElementById: () => ({ attributes: [{ name: "data-userconfig", value: JSON.stringify({ webapi_token: activeToken }) }] }) },
    GM_getValue: (key: string, fallback: unknown) => storage.get(key) ?? fallback,
    GM_setValue: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    GM_xmlhttpRequest: undefined,
  });
  respond = (method) => method === "GetWishlistCategories" ? reply({ categories: [
    { categoryid: "9007199254740993", name: "想买", item_count: 1 }, { categoryid: "2", name: "等等" },
  ] }) : reply({ items: [{ appid: 220, category_ids: ["9007199254740993"] }, { appid: 440 }] });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const params = init?.body ? new URLSearchParams(String(init.body)) : parsed.searchParams;
    const method = parsed.pathname.split("/")[2];
    const input = JSON.parse(params.get("input_json")!);
    calls.push({ method, input, write: init?.method === "POST" });
    assert.equal(params.get("access_token"), activeToken);
    return respond(method, input);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.document = originalDocument; globalThis.GM_xmlhttpRequest = originalGm; Date.now = originalNow; });

test("reads game/DLC memberships and preserves uint64 category IDs in two requests", async () => {
  const tags = await loadWishlistTags(steamId, "IN");
  assert.equal(tags.editable, true);
  assert.deepEqual(tags.items, { 220: ["9007199254740993"], 440: [] });
  assert.equal(tags.categories[0].id, "9007199254740993");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input.context.country_code, "IN");
  assert.equal(calls[1].input.filters && Object.keys(calls[1].input.filters).length, 0);
  assert.equal(JSON.stringify([...storage.values()]).includes(activeToken), false);
});
test("other wishlists require a share token and remain read-only", async () => {
  assert.equal((await loadWishlistTags(otherId, "CN")).available, false);
  assert.equal(calls.length, 0);
  respond = (method) => method === "GetSharedWishlistCategories" ? reply({ categories: [] }) : reply({ items: [{ appid: 440 }] });
  const tags = await loadWishlistTags(otherId, "CN", "share-permission");
  assert.equal(tags.available, true); assert.equal(tags.editable, false);
  assert.ok(calls.every((call) => call.input.share_token === "share-permission"));
  assert.equal(storage.size, 0);
  await assert.rejects(() => saveGameTags(otherId, 440, tags, { add: [], remove: [], create: ["标签"] }), /自己的愿望单/);
  assert.equal(calls.filter((call) => call.write).length, 0);
});
test("fresh wishlist memberships avoid a duplicate wishlist request", async () => {
  const tags = await loadWishlistTags(steamId, "IN", "", { 220: ["2"], 440: [] });
  assert.deepEqual(tags.items[220], ["2"]);
  assert.deepEqual(calls.map((call) => call.method), ["GetWishlistCategories"]);
});
test("reopening within five minutes reuses the persisted owner cache across regions", async () => {
  const first = await loadWishlistTags(steamId, "IN");
  calls.length = 0;
  now += 5 * 60 * 1000 - 1;
  const cached = await loadWishlistTags(steamId, "US");
  assert.deepEqual(cached, first);
  assert.equal(cached.editable, true);
  assert.equal(calls.length, 0);
  now += 1;
  await loadWishlistTags(steamId, "US");
  assert.equal(calls.length, 2);
});
test("manual refresh and fresh catalog memberships bypass the tag cache", async () => {
  await loadWishlistTags(steamId, "IN");
  calls.length = 0;
  await loadWishlistTags(steamId, "IN", "", undefined, { force: true });
  assert.equal(calls.length, 2);
  calls.length = 0;
  const tags = await loadWishlistTags(steamId, "IN", "", { 220: ["2"], 440: [] });
  assert.deepEqual(tags.items[220], ["2"]);
  assert.deepEqual(calls.map((call) => call.method), ["GetWishlistCategories"]);
});
test("legacy caches without timestamps refresh once and remain usable when offline", async () => {
  const old = snapshot();
  storage.set(`wishlist-tags-v1:${steamId}`, { categories: old.categories, items: old.items });
  respond = () => { throw new Error("offline"); };
  const fallback = await loadWishlistTags(steamId, "IN");
  assert.equal(fallback.available, true);
  assert.equal(fallback.editable, false);
  assert.deepEqual(fallback.items, old.items);
  assert.match(fallback.warning!, /请求失败/);
  assert.equal((storage.get(`wishlist-tags-v1:${steamId}`) as any).fetchedAt, undefined);
  respond = (method) => method === "GetWishlistCategories" ? reply({ categories: [] }) : reply({ items: [{ appid: 440 }] });
  const refreshed = await loadWishlistTags(steamId, "IN");
  assert.equal(refreshed.editable, true);
  assert.deepEqual(refreshed.items, { 440: [] });
  calls.length = 0;
  await loadWishlistTags(steamId, "IN");
  assert.equal(calls.length, 0);
});
test("expired cache failures do not renew freshness or enable edits", async () => {
  await loadWishlistTags(steamId, "IN");
  now += 5 * 60 * 1000;
  respond = () => { throw new Error("offline"); };
  for (let attempt = 0; attempt < 2; attempt++) {
    calls.length = 0;
    const tags = await loadWishlistTags(steamId, "IN");
    assert.equal(tags.available, true);
    assert.equal(tags.editable, false);
    assert.match(tags.warning!, /请求失败/);
    assert.equal(calls.length, 2);
  }
});
test("cached labels are never exposed after switching accounts or through another share link", async () => {
  await loadWishlistTags(steamId, "IN");
  calls.length = 0;
  activeToken = token(otherId);
  assert.equal((await loadWishlistTags(steamId, "IN")).available, false);
  assert.equal(calls.length, 0);
  respond = (method) => method === "GetSharedWishlistCategories" ? reply({ categories: [] }) : reply({ items: [{ appid: 440 }] });
  const shared = await loadWishlistTags(steamId, "IN", "restricted-share");
  assert.equal(shared.editable, false);
  assert.deepEqual(shared.items, { 440: [] });
  assert.equal(calls.length, 2);
  await loadWishlistTags(steamId, "IN", "restricted-share");
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.input.share_token === "restricted-share"));
  assert.deepEqual((storage.get(`wishlist-tags-v1:${steamId}`) as any).items[220], ["9007199254740993"]);
});
test("tag edits update the cached snapshot without extending its original read expiry", async () => {
  const tags = await loadWishlistTags(steamId, "IN");
  now += 4 * 60 * 1000;
  respond = (method, input) => method === "AddWishlistItemCategory"
    ? reply({ categoryid: "3", name: input.category_name }) : reply({});
  await saveGameTags(steamId, 220, tags, { remove: ["9007199254740993"], add: [], create: ["新标签"] });
  await renameWishlistTag(steamId, tags, "3", "改名");
  calls.length = 0;
  const cached = await loadWishlistTags(steamId, "IN");
  assert.deepEqual(cached.items[220], ["3"]);
  assert.equal(cached.categories.find((tag) => tag.id === "3")?.name, "改名");
  assert.equal(calls.length, 0);
  now += 60 * 1000;
  await loadWishlistTags(steamId, "IN");
  assert.equal(calls.length, 2);
});
test("read failures preserve own cached labels without allowing edits or pretending entries are unclassified", async () => {
  await loadWishlistTags(steamId, "IN");
  respond = () => { throw new Error("offline"); };
  const cached = await loadWishlistTags(steamId, "US", "", undefined, { force: true });
  assert.equal(cached.available, true); assert.equal(cached.editable, false);
  assert.deepEqual(cached.items[220], ["9007199254740993"]);
  assert.match(cached.warning!, /请求失败/);
  assert.equal(matchesWishlistTags(undefined, new Set(["0"])), false);
  assert.equal((await loadWishlistTags(otherId, "US", "different-share")).available, false);
});
test("multi-select matches any category and intersects correctly with unclassified", () => {
  assert.equal(matchesWishlistTags(["2"], new Set(["2", "3"])), true);
  assert.equal(matchesWishlistTags(["9"], new Set(["2", "3"])), false);
  assert.equal(matchesWishlistTags([], new Set(["0", "2"])), true);
  assert.equal(matchesWishlistTags(["9"], new Set(["0"])), false);
  assert.equal(matchesWishlistTags(undefined, new Set()), true);
});
test("exclusions override included tags, support unclassified and work without inclusions", () => {
  assert.equal(matchesWishlistTags(["2", "3"], new Set(["2"]), new Set(["3"])), false);
  assert.equal(matchesWishlistTags(["2"], new Set(["2"]), new Set(["3"])), true);
  assert.equal(matchesWishlistTags(["2"], new Set(), new Set(["3"])), true);
  assert.equal(matchesWishlistTags(["3"], new Set(), new Set(["3", "4"])), false);
  assert.equal(matchesWishlistTags([], new Set(), new Set(["0"])), false);
  assert.equal(matchesWishlistTags(["2"], new Set(), new Set(["0"])), true);
  assert.equal(matchesWishlistTags(undefined, new Set(), new Set(["3"])), false);
});
test("filter controls switch include/exclude exclusively, toggle off, and clear both", () => {
  const nodes = new Map<string, any>();
  const root = {
    querySelector: (id: string) => {
      if (!nodes.has(id)) nodes.set(id, {
        value: "", innerHTML: "", textContent: "", classList: { toggle() {}, add() {} },
        events: new Map(), setAttribute() {},
        addEventListener(name: string, callback: (event: any) => void) { this.events.set(name, callback); },
      });
      return nodes.get(id);
    }, addEventListener() {},
  } as unknown as ParentNode;
  const payload = { tags: snapshot(), rows: [{ appid: 220 }, { appid: 440 }] } as unknown as ReportPayload;
  let renders = 0;
  const controls = mountWishlistTagControls(root, payload, () => renders++);
  const click = (dataset: object) => nodes.get("#tags-options").events.get("click")({ target: { closest: () => ({ dataset }) } });
  click({ tagFilter: "9007199254740993" });
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), false);
  click({ tagExclude: "9007199254740993" });
  assert.equal(controls.matches(220), false); assert.equal(controls.matches(440), true);
  assert.match(nodes.get("#tags-menu-btn").textContent, /排除 1/);
  assert.match(nodes.get("#tags-options").innerHTML, /is-excluded/);
  click({ tagFilter: "9007199254740993" });
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), false);
  click({ tagExclude: "2" });
  nodes.get("#tags-clear").events.get("click")();
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), true);
  assert.equal(nodes.get("#tags-menu-btn").textContent, "标签：全部 ▾");
  click({ tagExclude: "9007199254740993" }); click({ tagExclude: "9007199254740993" });
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), true);
  assert.equal(renders, 7);
  const clickCard = (id: string) => nodes.get("#list").events.get("click")({ target: { closest: () => ({ dataset: { gameTag: id } }) } });
  clickCard("9007199254740993");
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), false);
  clickCard("9007199254740993");
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), true);
  click({ tagFilter: "2" });
  click({ tagExclude: "0" });
  clickCard("9007199254740993");
  assert.equal(nodes.get("#tags-menu-btn").textContent, "标签：含 2 / 排除 1 ▾");
  assert.equal(controls.matches(220), true); assert.equal(controls.matches(440), false);
  click({ tagExclude: "9007199254740993" });
  clickCard("9007199254740993");
  assert.equal(nodes.get("#tags-menu-btn").textContent, "标签：含 2 / 排除 1 ▾");
  assert.equal(controls.matches(220), true);
});
test("save sends only requested deltas and retains successful operations on partial failure", async () => {
  const tags = snapshot();
  respond = (method, input) => {
    if (method === "RemoveWishlistItemCategory") return reply({});
    if (input.categoryid === "2") return reply({}, "15");
    return reply({ categoryid: "3", name: input.category_name });
  };
  const failures = await saveGameTags(steamId, 220, tags, { remove: ["9007199254740993"], add: ["2"], create: ["新分类"] });
  assert.equal(failures.length, 1); assert.match(failures[0], /等等.*结果 15/);
  assert.deepEqual(tags.items[220], ["3"]);
  assert.deepEqual(tags.categories.find((tag) => tag.id === "3"), { id: "3", name: "新分类" });
  assert.equal(calls.length, 3); assert.ok(calls.every((call) => call.write && call.input.appid === 220));
});
test("HTTP 200 with failed or absent EResult cannot silently remove a category", async () => {
  const tags = snapshot();
  respond = () => Response.json({ response: {} });
  assert.equal((await saveGameTags(steamId, 220, tags, { remove: ["9007199254740993"], add: [], create: [] })).length, 1);
  assert.deepEqual(tags.items[220], ["9007199254740993"]);
});
test("successful rename updates all uses of the shared definition; failed rename preserves it", async () => {
  const tags = snapshot(); respond = () => reply({});
  await renameWishlistTag(steamId, tags, "9007199254740993", "改名");
  assert.equal(tags.categories[0].name, "改名");
  assert.deepEqual(tags.items[220], ["9007199254740993"]);
  respond = () => reply({}, "8");
  await assert.rejects(() => renameWishlistTag(steamId, tags, "9007199254740993", "失败"), /结果 8/);
  assert.equal(tags.categories[0].name, "改名");
});
test("expired/invalid tokens and switched accounts cannot edit", async () => {
  assert.equal(tokenSteamId(token(steamId, 1)), null);
  assert.equal(tokenSteamId("bad"), null);
  activeToken = token(otherId);
  await assert.rejects(() => renameWishlistTag(steamId, snapshot(), "2", "修改"), /自己的愿望单/);
  assert.equal(calls.length, 0);
});
test("tag names are escaped in game cards, including DLC and unavailable entries", () => {
  const name = `<img src=x onerror="alert(1)"> ' &`;
  const html = steamListHtml([{ appid: 440, title: "DLC", capsule: "", released: "", status: "未发售", vsHome: "", discountEnd: null, cheapest: "", cheapestLabel: "", chips: [], tags: [{ id: "2", name }], editTags: true }]);
  assert.ok(html.includes(tagEscape(name)));
  assert.ok(html.includes('data-edit-tags="440"'));
  assert.equal(html.includes("<img src=x"), false);
});
