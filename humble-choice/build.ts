import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emptyCatalog, readArchive, writeArchive } from "./src/archive/catalog-archive";
import { scrapeChoiceCatalog } from "./src/scrape/scrape-catalog";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const readArg = (name: string, fallback?: string) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1] ?? fallback;
  }
  return fallback;
};

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const run = async () => {
  const archiveDir = path.resolve(
    readArg("archive", path.join(rootDir, ".archive"))!,
  );
  const skipScrape = hasFlag("skip-scrape");
  const backfill = Number(readArg("backfill", "24"));
  const archive = await readArchive(archiveDir);
  const catalog = skipScrape
    ? archive
    : await scrapeChoiceCatalog({
        archive: archive.months.length ? archive : emptyCatalog(),
        backfill: Number.isFinite(backfill) ? backfill : 24,
      });

  if (catalog.months.length === 0) {
    throw new Error("No Humble Choice months available");
  }

  await mkdir(archiveDir, { recursive: true });
  await writeArchive(archiveDir, catalog);
  console.log(`[build] archive -> ${archiveDir}`);
  console.log(
    `[build] months ${catalog.months.length}${catalog.backfillExhausted ? " (history complete)" : ""}`,
  );
  console.log(`[build] range ${catalog.months.at(-1)?.id} .. ${catalog.months[0]?.id}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
