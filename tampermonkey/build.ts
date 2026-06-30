import { build, context, type BuildOptions } from "esbuild";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { UserscriptMeta } from "./src/shared";

type ScriptEntry = {
  name: string;
  entry: string;
};

type BuildVariant = {
  label: string;
  outFile: string;
  minify: boolean;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const watchMode = process.argv.includes("--watch");
const pagesBaseUrl = process.env.PAGES_BASE_URL?.replace(/\/$/, "");

async function loadScripts(): Promise<ScriptEntry[]> {
  const scriptsDir = path.join(__dirname, "src", "scripts");
  const names = await readdir(scriptsDir, { withFileTypes: true });

  return names
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const baseDir = path.join(scriptsDir, name);

      return {
        name,
        entry: path.join(baseDir, "index.ts"),
      };
    });
}

function getBuildVariants(script: ScriptEntry): BuildVariant[] {
  return [
    {
      label: "build",
      outFile: path.join(distDir, `${script.name}.js`),
      minify: false,
    },
    {
      label: "build:min",
      outFile: path.join(distDir, `${script.name}.min.js`),
      minify: true,
    },
  ];
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

function userscriptBanner(meta: UserscriptMeta) {
  const lines = [
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
  ];

  return lines.join("\n");
}

async function resolveMeta(scriptName: string) {
  return readJson<UserscriptMeta>(path.join(__dirname, "src", "scripts", scriptName, "meta.json"));
}

async function createBuildOptions(
  script: ScriptEntry,
  variant: BuildVariant,
): Promise<BuildOptions> {
  const meta = await resolveMeta(script.name);
  const fileName = path.basename(variant.outFile);
  const resolvedMeta: UserscriptMeta = pagesBaseUrl
    ? {
        ...meta,
        downloadURL: `${pagesBaseUrl}/${fileName}`,
        updateURL: `${pagesBaseUrl}/${fileName}`,
      }
    : meta;

  return {
    alias: {
      "@": path.join(__dirname, "src"),
    },
    entryPoints: [script.entry],
    outfile: variant.outFile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
    minify: variant.minify,
    banner: {
      js: userscriptBanner(resolvedMeta),
    },
  };
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
      for (const variant of getBuildVariants(script)) {
        const options = await createBuildOptions(script, variant);
        const ctx = await context(options);
        await ctx.watch();
        console.log(
          `[watch] ${script.name} -> ${path.relative(__dirname, variant.outFile)}`,
        );
      }
    }
    return;
  }

  await Promise.all(
    scripts.map(async (script) => {
      await Promise.all(
        getBuildVariants(script).map(async (variant) => {
          const options = await createBuildOptions(script, variant);
          await build(options);
          console.log(
            `[${variant.label}] ${script.name} -> ${path.relative(__dirname, variant.outFile)}`,
          );
        }),
      );
    }),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
