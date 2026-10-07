import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES } from "../../config";
import { compareRegionLimit, mountSetup, needsRegionSetup, renderSetupShell, type RegionSetup } from "../../ui/region-settings";

beforeEach(() => {
  Object.assign(globalThis, { localStorage: { getItem: () => null } });
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
  const started: RegionSetup[] = [];
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

test("changing home cannot exceed the cap and resetting keeps only the current account region", () => {
  const ui = harness(selection(5), 5000);
  ui.fire("setup-home-list", "change", { name: "wl-home", value: "VN", checked: true });
  assert.equal(ui.nodes.get("#setup-start").disabled, true);
  ui.fire("setup-start", "click");
  assert.equal(ui.started.length, 0);
  ui.fire("setup-all", "click");
  assert.equal(ui.boxes.filter(box => box.checked).length, 1);
  assert.equal(ui.boxes.find(box => box.dataset.compare === "VN")?.disabled, true);
  ui.fire("setup-start", "click");
  assert.deepEqual(ui.started, [{ home: "VN", shown: ["VN"] }]);
});

test("setup keeps the selection controls without the wishlist-count description", () => {
  const html = renderSetupShell(selection(6));
  assert.doesNotMatch(html, /愿望单.*款.*最多/);
  assert.match(html, /仅账户区/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /建议少于 8 个|>全选</);
});
