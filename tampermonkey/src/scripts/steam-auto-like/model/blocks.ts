import { contentTypes, type ContentType } from "./content";
import { accountIdFromSteamId, profileKey } from "./identity";

export type BlockRule = {
  id: string;
  type: ContentType;
  accountId: string;
  profile: string;
  name: string;
};

export type BlockDraft = {
  id?: string;
  type: ContentType;
  accountId: string;
  profile: string;
  name: string;
};

export type BlockTarget = {
  type: ContentType;
  accountId: string;
  profile: string;
};

const blockableTypes = new Set<string>(contentTypes);
const MAX_BLOCKS = 200;

export function personLabel(person: { name: string; profile: string; accountId: string }): string {
  if (person.name) return person.name;
  const slug = person.profile.split("/").filter(Boolean).pop();
  return slug || person.accountId;
}

export function ruleMatches(rule: BlockRule, author: { accountId: string; profile: string }, type: ContentType): boolean {
  return sameTarget(rule, { type, accountId: author.accountId, profile: author.profile });
}

export function upsertBlock(rules: BlockRule[], draft: BlockDraft): { rules: BlockRule[]; status: "created" | "updated" | "unchanged" | "full" } {
  const index = rules.findIndex(rule => sameTarget(rule, draft));
  if (index === -1) {
    if (rules.length >= MAX_BLOCKS) return { rules, status: "full" };
    const rule: BlockRule = {
      id: uniqueId(rules, draft.id && draft.id.length <= 80 ? draft.id : ""),
      type: draft.type,
      accountId: draft.accountId,
      profile: draft.profile,
      name: draft.name,
    };
    return { rules: [...rules, rule], status: "created" };
  }
  const current = rules[index];
  const next: BlockRule = {
    ...current,
    accountId: current.accountId || draft.accountId,
    profile: current.profile || draft.profile,
    name: draft.name || current.name,
  };
  if (next.accountId === current.accountId && next.profile === current.profile && next.name === current.name) {
    return { rules, status: "unchanged" };
  }
  const copy = rules.slice();
  copy[index] = next;
  return { rules: copy, status: "updated" };
}

export function removeBlock(rules: BlockRule[], id: string): BlockRule[] {
  return rules.filter(rule => rule.id !== id);
}

export function removeMatchingBlocks(rules: BlockRule[], targets: BlockTarget[]): BlockRule[] {
  return rules.filter(rule => !targets.some(target => sameTarget(rule, target)));
}

export function exportBlocks(rules: BlockRule[]): string {
  return JSON.stringify(rules.map(rule => ({
    type: rule.type,
    accountId: rule.accountId,
    profile: rule.profile,
    name: rule.name,
  })));
}

export function importBlocks(rules: BlockRule[], raw: string): { rules: BlockRule[]; added: number; status: "ok" | "invalid" | "empty" | "full" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^\uFEFF/, ""));
  } catch {
    return { rules, added: 0, status: "invalid" };
  }
  if (!Array.isArray(parsed)) return { rules, added: 0, status: "invalid" };
  const incoming = normalizeBlocks(parsed);
  if (!incoming.length) return { rules, added: 0, status: "empty" };
  let next = rules;
  let added = 0;
  for (const rule of incoming) {
    const result = upsertBlock(next, rule);
    if (result.status === "created") added += 1;
    next = result.rules;
    if (result.status === "full") return { rules: next, added, status: added ? "ok" : "full" };
  }
  return { rules: next, added, status: "ok" };
}

export function normalizeBlocks(value: unknown): BlockRule[] {
  if (!Array.isArray(value)) return [];
  let rules: BlockRule[] = [];
  for (const item of value) {
    const draft = parseDraft(item);
    if (!draft) continue;
    const result = upsertBlock(rules, draft);
    rules = result.rules;
    if (result.status === "full") break;
  }
  return rules;
}

function sameTarget(rule: BlockTarget, target: BlockTarget): boolean {
  if (rule.type !== target.type) return false;
  if (rule.accountId && target.accountId && rule.accountId === target.accountId) return true;
  if (rule.profile && target.profile && rule.profile === target.profile) return true;
  return false;
}

function parseDraft(value: unknown): BlockDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.type !== "string" || !blockableTypes.has(raw.type)) return null;
  const profile = canonicalProfile(raw.profile);
  let accountId = cleanAccountId(raw.accountId);
  if (!accountId && profile.startsWith("/profiles/")) accountId = accountIdFromSteamId(profile.slice(10));
  if (!accountId && !profile) return null;
  return {
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    type: raw.type as ContentType,
    accountId,
    profile,
    name: cleanName(raw.name),
  };
}

function canonicalProfile(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return profileKey(`https:${trimmed}`);
  if (trimmed.startsWith("/")) return profileKey(`https://steamcommunity.com${trimmed}`);
  if (/^https?:\/\//i.test(trimmed)) return profileKey(trimmed);
  return "";
}

function cleanAccountId(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return "";
  try {
    const id = BigInt(value);
    return id > 0n && id <= 4294967295n ? value : "";
  } catch {
    return "";
  }
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function uniqueId(rules: BlockRule[], preferred?: string): string {
  const used = new Set(rules.map(rule => rule.id));
  let id = preferred && !used.has(preferred) ? preferred : createId();
  while (used.has(id)) id = createId();
  return id;
}

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
