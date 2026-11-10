import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES } from "../../config";
import { compareRegionLimit, loadTagsEnabled, mountSetup, needsGuideSetup, needsRegionSetup, renderSetupShell, saveTagsEnabled, type RegionSetup, type SetupDraft } from "../../ui/region-settings";

beforeEach(() => {
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem: () => {} },
    GM_getValue: undefined,
    GM_setValue: undefined,
  });
});

const selection = (count: number): RegionSetup => ({ home: "CN", shown: COUNTRIES.slice(0, count).map(country => country.code) });

test("4000 games permits nine total regions, 4001 permits five, including home", () => {
  assert.equal(compareRegionLimit(0), 9);
  assert.equal(compareRegionLimit(4000), 9);
  assert.equal(compareRegionLimit(4001), 5);
  assert.equal(needsRegionSetup(selection(9), 4000), false);
  assert.equal(needsRegionSetup(selection(10), 4000), true);
  assert.equal(needsRegionSetup(selection(5), 4001), false);
  assert.equal(needsRegionSetup(selection(6), 4001), true);
  assert.equal(needsRegionSetup(null, 4000), true);
  assert.equal(needsRegionSetup(selection(2), 4000, true), true);
  assert.equal(needsRegionSetup({ home: "CN", shown: ["US", "TW", "HK", "SG", "JP"] }, 4001), true);
  assert.equal(needsRegionSetup({ home: "CN", shown: ["CN", "CN", "US", "invalid"] }, 4001), false);
});

const harness = (initial: RegionSetup, count: number) => {
  const boxes = COUNTRIES.map(country => ({
    dataset: { compare: country.code }, checked: false, disabled: false,
    closest() { return this; },
  }));
  const nodes = new Map<string, any>();
  const root = { querySelector: (id: string) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: "", disabled: false, style: {}, events: new Map(),
      querySelectorAll: () => boxes,
      addEventListener(name: string, handler: (event: any) => void) { this.events.set(name, handler); },
    });
    return nodes.get(id);
  } } as unknown as ParentNode;
  const started: SetupDraft[] = [];
  mountSetup(root, initial, setup => started.push(setup), count);
  const fire = (id: string, name: string, target?: unknown) => nodes.get(`#${id}`).events.get(name)({ target });
  const toggle = (code: string, checked: boolean) => {
    const input = boxes.find(box => box.dataset.compare === code)!;
    input.checked = checked;
    fire("setup-compare-list", "change", input);
  };
  return { nodes, boxes, started, fire, toggle };
};

test("oversized saved selection is retained and cannot start until reduced to the limit", () => {
  const ui = harness(selection(6), 4001);
  assert.equal(ui.boxes.filter(box => box.checked).length, 6);
  assert.equal(ui.nodes.get("#setup-start").disabled, true);
  assert.match(ui.nodes.get("#setup-limit-hint").textContent, /已选 6.*5/);
  ui.fire("setup-start", "click");
  assert.equal(ui.started.length, 0);
  ui.toggle("US", false);
  assert.equal(ui.nodes.get("#setup-start").disabled, false);
  ui.fire("setup-start", "click");
  assert.equal(ui.started.length, 1);
  assert.equal(ui.started[0].shown.length, 5);
  assert.ok(ui.started[0].shown.includes("CN"));
});

test("unselected regions are disabled at the cap and become selectable after removing a region", () => {
  const ui = harness(selection(9), 4000);
  const newBox = ui.boxes[9];
  assert.equal(newBox.disabled, true);
  assert.equal(ui.boxes[0].disabled, true);
  ui.toggle("US", false);
  assert.equal(newBox.disabled, false);
  ui.toggle(newBox.dataset.compare, true);
  ui.fire("setup-start", "click");
  assert.equal(ui.started[0].shown.length, 9);
});

test("changing home cannot exceed the cap and locks the new account region", () => {
  const ui = harness(selection(5), 5000);
  ui.fire("setup-home-list", "change", { name: "wl-home", value: "VN", checked: true });
  assert.equal(ui.nodes.get("#setup-start").disabled, true);
  assert.equal(ui.boxes.find(box => box.dataset.compare === "VN")?.disabled, true);
  assert.equal(ui.boxes.find(box => box.dataset.compare === "CN")?.disabled, false);
  ui.fire("setup-start", "click");
  assert.equal(ui.started.length, 0);
  ui.toggle("CN", false);
  ui.fire("setup-start", "click");
  assert.equal(ui.started.length, 1);
  assert.equal(ui.started[0].home, "VN");
  assert.equal(ui.started[0].shown.length, 5);
  assert.ok(ui.started[0].shown.includes("VN"));
});

test("setup keeps the selection controls without the wishlist-count description", () => {
  const html = renderSetupShell(selection(6));
  assert.doesNotMatch(html, /愿望单.*款.*最多/);
  assert.doesNotMatch(html, /仅账户区|setup-all/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /建议少于 8 个|>全选</);
  assert.match(html, /id="setup-close"[^>]*aria-label="关闭"[\s\S]*?<svg/);
  assert.match(html, /历史低价数据 Key/);
  assert.match(html, /ITAD 注册应用<\/a>后复制。留空则不查询史低<\/p>/);
  assert.doesNotMatch(html, /油猴脚本存储|关闭后不请求标签/);
  assert.match(html, /开启后读取 Steam 标签，可筛选和编辑。<\/p>/);
  assert.match(html, /id="setup-itad-key"/);
  assert.match(html, /id="setup-tags"[^>]*checked/);
});

test("saved guide v1 opens setup again, and tags stay on unless explicitly disabled", () => {
  const saved = new Map<string, string>([["wishlist-guide-done", "1"]]);
  Object.assign(globalThis, { localStorage: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  } });
  assert.equal(needsGuideSetup(), true);
  assert.equal(loadTagsEnabled(), true);
  saveTagsEnabled(false);
  assert.equal(loadTagsEnabled(), false);
  saved.set("wishlist-guide-done", "v2");
  assert.equal(needsGuideSetup(), false);
  const ui = harness(selection(2), 10);
  const tags = ui.nodes.get("#setup-tags");
  const key = ui.nodes.get("#setup-itad-key");
  assert.equal(tags.checked, false);
  key.value = "  itad-key  ";
  tags.checked = true;
  ui.fire("setup-start", "click");
  assert.equal(ui.started[0].tagsEnabled, true);
  assert.equal(ui.started[0].itadKey, "  itad-key  ");
});
