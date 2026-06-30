import { build, context, type BuildOptions } from "esbuild";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { UserscriptMeta } from "./src/shared";
import { writeIndexPage } from "./src/build/write-index-page";
import type { ScriptEntry } from "./src/shared/types/script-entry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const watchMode = process.argv.includes("--watch");
const pagesBaseUrl = process.env.PAGES_BASE_URL?.replace(/\/$/, "");

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function readOptionalText(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function loadScripts(): Promise<ScriptEntry[]> {
  const scriptsDir = path.join(__dirname, "src", "scripts");
  const names = await readdir(scriptsDir, { withFileTypes: true });

  return Promise.all(
    names.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const name = entry.name;
      const baseDir = path.join(scriptsDir, name);

      return {
        name,
        entry: path.join(baseDir, "index.ts"),
        meta: await readJson<UserscriptMeta>(path.join(baseDir, "meta.json")),
        readme: await readOptionalText(path.join(baseDir, "README.md")),
      };
    }),
  );
}

function resolveMeta(script: ScriptEntry) {
  return pagesBaseUrl
    ? {
        ...script.meta,
        downloadURL: `${pagesBaseUrl}/${script.name}.user.js`,
        updateURL: `${pagesBaseUrl}/${script.name}.meta.js`,
      }
    : script.meta;
}

function userscriptBanner(meta: UserscriptMeta) {
  return [
    "// ==UserScript==",
    `// @name         ${meta.name}`,
    `// @namespace    ${meta.namespace}`,
    `// @version      ${meta.version}`,
    `// @description  ${meta.description}`,
    `// @author       ${meta.author}`,
    ...meta.match.map((item) => `// @match        ${item}`),
    ...meta.grant.map((item) => `// @grant        ${item}`),
    ...(meta.connect ?? []).map((item) => `// @connect      ${item}`),
    ...(meta.downloadURL ? [`// @downloadURL  ${meta.downloadURL}`] : []),
    ...(meta.updateURL ? [`// @updateURL     ${meta.updateURL}`] : []),
    ...(meta.runAt ? [`// @run-at       ${meta.runAt}`] : []),
    "// ==/UserScript==",
    "",
  ].join("\n");
}

function createUserBuildOptions(script: ScriptEntry): BuildOptions {
  return {
    alias: {
      "@": path.join(__dirname, "src"),
    },
    entryPoints: [script.entry],
    outfile: path.join(distDir, `${script.name}.user.js`),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
    minify: true,
    banner: {
      js: userscriptBanner(resolveMeta(script)),
    },
  };
}

async function writeMetaFile(script: ScriptEntry) {
  await writeFile(
    path.join(distDir, `${script.name}.meta.js`),
    userscriptBanner(resolveMeta(script)),
    "utf8",
  );
}

async function buildScript(script: ScriptEntry) {
  await build(createUserBuildOptions(script));
  console.log(
    `[build:user] ${script.name} -> ${path.relative(__dirname, path.join(distDir, `${script.name}.user.js`))}`,
  );

  await writeMetaFile(script);
  console.log(
    `[build:meta] ${script.name} -> ${path.relative(__dirname, path.join(distDir, `${script.name}.meta.js`))}`,
  );
}

async function run() {
  await mkdir(distDir, { recursive: true });

  if (!watchMode) {
    await rm(distDir, { recursive: true, force: true });
    await mkdir(distDir, { recursive: true });
  }

  const scripts = await loadScripts();

  if (watchMode) {
    for (const script of scripts) {
      const ctx = await context(createUserBuildOptions(script));
      await ctx.watch();
      console.log(
        `[watch:user] ${script.name} -> ${path.relative(__dirname, path.join(distDir, `${script.name}.user.js`))}`,
      );
    }
    return;
  }

  await Promise.all(scripts.map(buildScript));
  await writeIndexPage(distDir, scripts);
  console.log(
    `[build:index] index -> ${path.relative(__dirname, path.join(distDir, "index.html"))}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
