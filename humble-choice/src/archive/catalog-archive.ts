import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChoiceCatalog, ChoiceMonth } from "../types/catalog";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isChoiceMonth = (value: unknown): value is ChoiceMonth => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.games)
  );
};

export const emptyCatalog = (): ChoiceCatalog => ({
  generatedAt: new Date().toISOString(),
  source: "humblebundle.com",
  months: [],
  backfillExhausted: false,
});

export const mergeCatalogs = (
  base: ChoiceCatalog,
  incoming: ChoiceMonth[],
  extra: Partial<Pick<ChoiceCatalog, "backfillExhausted">> = {},
): ChoiceCatalog => {
  const months = new Map(base.months.map((month) => [month.id, month]));
  for (const month of incoming) {
    months.set(month.id, month);
  }
  return {
    generatedAt:
      incoming.length > 0 ? new Date().toISOString() : base.generatedAt,
    source: "humblebundle.com",
    months: [...months.values()].sort((left, right) =>
      right.id.localeCompare(left.id),
    ),
    backfillExhausted:
      extra.backfillExhausted ?? base.backfillExhausted ?? false,
  };
};

export const readArchive = async (archiveDir: string): Promise<ChoiceCatalog> => {
  const catalogPath = path.join(archiveDir, "catalog.json");
  try {
    const raw = JSON.parse(await readFile(catalogPath, "utf8")) as unknown;
    if (isRecord(raw) && Array.isArray(raw.months)) {
      return {
        generatedAt:
          typeof raw.generatedAt === "string"
            ? raw.generatedAt
            : new Date().toISOString(),
        source: "humblebundle.com",
        months: raw.months.filter(isChoiceMonth),
        backfillExhausted: raw.backfillExhausted === true,
      };
    }
  } catch {
    // Fall through to per-month files when catalog.json is missing.
  }

  const monthsDir = path.join(archiveDir, "months");
  try {
    const files = await readdir(monthsDir);
    const months: ChoiceMonth[] = [];
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const raw = JSON.parse(
        await readFile(path.join(monthsDir, file), "utf8"),
      ) as unknown;
      if (isChoiceMonth(raw)) {
        months.push(raw);
      }
    }
    return mergeCatalogs(emptyCatalog(), months);
  } catch {
    return emptyCatalog();
  }
};

export const writeArchive = async (
  archiveDir: string,
  catalog: ChoiceCatalog,
) => {
  const monthsDir = path.join(archiveDir, "months");
  await mkdir(monthsDir, { recursive: true });
  await writeFile(
    path.join(archiveDir, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  await Promise.all(
    catalog.months.map((month) =>
      writeFile(
        path.join(monthsDir, `${month.id}.json`),
        `${JSON.stringify(month, null, 2)}\n`,
        "utf8",
      ),
    ),
  );
};
