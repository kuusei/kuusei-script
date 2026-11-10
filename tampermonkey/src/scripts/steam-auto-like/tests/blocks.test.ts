import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { exportBlocks, importBlocks, normalizeBlocks, personLabel, removeBlock, removeMatchingBlocks, ruleMatches, upsertBlock } from "../model/blocks";
import { accountIdFromSteamId, isOwnAuthor, profileKey } from "../model/identity";

describe("activity block list", () => {
  test("keeps one rule per player and content type, and fills a later account id", () => {
    const rules = normalizeBlocks([
      { type: "nope" },
      null,
      { type: "review", profile: "https://steamcommunity.com/id/Alice", name: "Alice" },
      { type: "review", accountId: "42", profile: "https://steamcommunity.com/id/Alice/", name: "Alicia" },
      { type: "status", profile: "https://steamcommunity.com/id/Alice", name: "Alice" },
      { type: "status" },
    ]);

    assert.equal(rules.length, 2);
    assert.equal(rules[0].type, "review");
    assert.equal(rules[0].accountId, "42");
    assert.equal(rules[0].profile, "/id/alice");
    assert.equal(rules[0].name, "Alicia");
    assert.equal(rules[1].type, "status");
    assert.equal(personLabel(rules[1]), "Alice");
  });

  test("matches a renamed profile when the account id is unchanged", () => {
    const steamId = "76561198000000000";
    const accountId = accountIdFromSteamId(steamId);
    const [rule] = normalizeBlocks([{
      type: "screenshot",
      profile: `https://steamcommunity.com/profiles/${steamId}/screenshots`,
      name: "Alice",
    }]);

    assert.ok(accountId);
    assert.equal(rule.accountId, accountId);
    assert.equal(rule.profile, `/profiles/${steamId}`);
    assert.equal(ruleMatches(rule, { accountId, profile: "/id/renamed" }, "screenshot"), true);
    assert.equal(ruleMatches(rule, { accountId, profile: "/id/renamed" }, "status"), false);
    assert.equal(ruleMatches(rule, { accountId: "7", profile: "/id/someone" }, "screenshot"), false);
  });

  test("stops at 200 rules and can remove one player-type pair", () => {
    const input = Array.from({ length: 201 }, (_, index) => ({
      type: "purchase",
      accountId: String(index + 1),
      name: "",
    }));
    const rules = normalizeBlocks(input);
    assert.equal(rules.length, 200);
    assert.equal(upsertBlock(rules, { type: "purchase", accountId: "999999", profile: "", name: "" }).status, "full");

    const removed = removeBlock(rules, rules[0].id);
    assert.equal(removed.length, 199);
    const cleared = removeMatchingBlocks(rules, [{ type: "purchase", accountId: rules[4].accountId, profile: "" }]);
    assert.equal(cleared.some(rule => rule.accountId === rules[4].accountId), false);
    assert.equal(cleared.length, 199);
  });

  test("clipboard export merges by account id and ignores duplicates", () => {
    const current = normalizeBlocks([{ type: "status", accountId: "7", name: "holy egg" }]);
    const raw = exportBlocks(normalizeBlocks([
      { type: "status", accountId: "7", name: "holy egg" },
      { type: "review", accountId: "8", profile: "https://steamcommunity.com/id/Lau", name: "Lauuuuuuu" },
    ]));
    const merged = importBlocks(current, raw);
    assert.equal(merged.status, "ok");
    assert.equal(merged.added, 1);
    assert.equal(merged.rules.length, 2);
    assert.equal(merged.rules[1].profile, "/id/lau");
    assert.equal(importBlocks(current, "[]").status, "empty");
    assert.equal(importBlocks(current, "{").status, "invalid");
    assert.equal(importBlocks(current, "{}").status, "invalid");
  });

  test("rejects stored profiles that are not Steam community links", () => {
    assert.equal(profileKey("https://example.com/id/alice"), "");
    assert.deepEqual(normalizeBlocks([{ type: "artwork", profile: "https://example.com/id/alice", name: "Alice" }]), []);
    assert.deepEqual(normalizeBlocks("blocks"), []);
  });
});

describe("activity author ownership", () => {
  test("treats the same profile or account as own, and leaves a different url kind unknown", () => {
    const self = { accountId: "", profiles: ["/id/me"] };
    assert.equal(isOwnAuthor({ accountId: "", profile: "/id/me", name: "" }, self), true);
    assert.equal(isOwnAuthor({ accountId: "", profile: "/id/other", name: "" }, self), false);
    assert.equal(isOwnAuthor({ accountId: "5", profile: "/id/other", name: "" }, { accountId: "5", profiles: ["/id/me"] }), true);
    assert.equal(isOwnAuthor({ accountId: "", profile: "/profiles/76561198000000000", name: "" }, self), null);
    assert.equal(isOwnAuthor(null, self), null);
  });
});
