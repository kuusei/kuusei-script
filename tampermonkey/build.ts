import { build, context, type BuildOptions } from "esbuild";
import { spawnSync } from "node:child_process";
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

      const meta = await readJson<UserscriptMeta>(path.join(baseDir, "meta.json"));
      const iconPath = path.join(baseDir, "icon.png");
      let listingIcon: string | undefined;
      try {
        const icon = await readFile(iconPath);
        listingIcon = `${name}.icon.png`;
        await writeFile(path.join(distDir, listingIcon), icon);
      } catch {
        // Scripts without a local listing mark keep meta.icon.
      }

      return {
        name,
        entry: path.join(baseDir, "index.ts"),
        meta,
        readme: await readOptionalText(path.join(baseDir, "README.md")),
        listingIcon,
      };
    }),
  );
}

function resolveMeta(script: ScriptEntry) {
  return {
    ...script.meta,
    ...(script.listingIcon && pagesBaseUrl
      ? { icon: `${pagesBaseUrl}/${script.listingIcon}` }
      : {}),
    ...(pagesBaseUrl
      ? {
          homepageURL: `${pagesBaseUrl}`,
          downloadURL: `${pagesBaseUrl}/${script.name}.user.js`,
          updateURL: `${pagesBaseUrl}/${script.name}.meta.js`,
        }
      : {}),
  };
}

function userscriptBanner(meta: UserscriptMeta) {
  return [
    "// ==UserScript==",
    `// @name         ${meta.name}`,
    `// @namespace    ${meta.namespace}`,
    `// @version      ${meta.version}`,
    `// @description  ${meta.description}`,
    `// @author       ${meta.author}`,
    ...(meta.icon ? [`// @icon         ${meta.icon}`] : []),
    ...meta.match.map((item) => `// @match        ${item}`),
    ...meta.grant.map((item) => `// @grant        ${item}`),
    ...(meta.connect ?? []).map((item) => `// @connect      ${item}`),
    ...(meta.license ? [`// @license      ${meta.license}`] : []),
    ...(meta.homepageURL ? [`// @homepageURL  ${meta.homepageURL}`] : []),
    ...(meta.downloadURL ? [`// @downloadURL  ${meta.downloadURL}`] : []),
    ...(meta.updateURL ? [`// @updateURL     ${meta.updateURL}`] : []),
    ...(meta.runAt ? [`// @run-at       ${meta.runAt}`] : []),
    "// ==/UserScript==",
    "",
  ].join("\n");
}

function cssAsReadableJs(css: string) {
  const limit = 2000;
  const chunks: string[] = [];
  for (const raw of css.split("\n")) {
    if (raw.length <= limit) {
      chunks.push(JSON.stringify(raw));
      continue;
    }
    for (let i = 0; i < raw.length; i += limit) {
      chunks.push(JSON.stringify(raw.slice(i, i + limit)));
    }
  }
  if (chunks.length === 0) return 'export default "";';
  return `const cssChunks = [${chunks.join(",\n")}];\nexport default cssChunks.join("\\n");`;
}

function createBuildOptions(script: ScriptEntry, outFile: string): BuildOptions {
  return {
    alias: {
      "@": path.join(__dirname, "src"),
    },
    entryPoints: [script.entry],
    outfile: outFile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
    minify: false,
    plugins: [
      {
        name: "css-text-readable",
        setup(build) {
          build.onLoad({ filter: /\.css$/ }, async (args) => ({
            contents: cssAsReadableJs(await readFile(args.path, "utf8")),
            loader: "js",
          }));
        },
      },
    ],
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

function assertNotMinified(code: string, file: string) {
  const flagged = code.split("\n").filter((line) => line.length > 5000 && line.includes("function"));
  if (flagged.length > 0) {
    throw new Error(`Greasy Fork would reject ${file}: line longer than 5000 with "function"`);
  }
}

async function buildScript(script: ScriptEntry) {
  const outFile = path.join(distDir, `${script.name}.user.js`);
  await build(createBuildOptions(script, outFile));
  assertNotMinified(await readFile(outFile, "utf8"), path.relative(__dirname, outFile));
  console.log(`[build:user] ${script.name} -> ${path.relative(__dirname, outFile)}`);

  await writeMetaFile(script);
  console.log(
    `[build:meta] ${script.name} -> ${path.relative(__dirname, path.join(distDir, `${script.name}.meta.js`))}`,
  );
}

function compileReportCss() {
  const scriptDir = path.join(__dirname, "src", "scripts", "steam-wishlist-prices");
  const input = path.join(scriptDir, "ui", "report.css");
  const output = path.join(scriptDir, "ui", "report.generated.css");
  const result = spawnSync(
    "bunx",
    ["@tailwindcss/cli", "-i", input, "-o", output],
    { cwd: __dirname, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("Tailwind CSS build failed");
  }
  console.log("[build:css] steam-wishlist-prices -> ui/report.generated.css");
}

async function run() {
  await compileReportCss();
  await mkdir(distDir, { recursive: true });

  if (!watchMode) {
    await rm(distDir, { recursive: true, force: true });
    await mkdir(distDir, { recursive: true });
  }

  const scripts = await loadScripts();

  if (watchMode) {
    for (const script of scripts) {
      const ctx = await context(
        createBuildOptions(script, path.join(distDir, `${script.name}.user.js`)),
      );
      await ctx.watch();
      console.log(
        `[watch:user] ${script.name} -> ${path.relative(__dirname, path.join(distDir, `${script.name}.user.js`))}`,
      );
    }
    return;
  }

  await Promise.all(scripts.map(buildScript));
  await writeIndexPage(distDir, scripts, pagesBaseUrl);
  console.log(
    `[build:index] index -> ${path.relative(__dirname, path.join(distDir, "index.html"))}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
