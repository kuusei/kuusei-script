import { build, context, type BuildOptions } from "esbuild";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { UserscriptMeta } from "./src/shared";

type ScriptEntry = {
  name: string;
  entry: string;
  meta: UserscriptMeta;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const watchMode = process.argv.includes("--watch");
const pagesBaseUrl = process.env.PAGES_BASE_URL?.replace(/\/$/, "");

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
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
      };
    }),
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

async function writeIndexPage(scripts: ScriptEntry[]) {
  const items = scripts
    .map((script) => {
      const title = escapeHtml(script.meta.name);
      const description = escapeHtml(script.meta.description);
      const installHref = `./${script.name}.user.js`;
      const metaHref = `./${script.name}.meta.js`;

      return `
        <article class="script-card">
          <h2>${title}</h2>
          <p>${description}</p>
          <div class="script-links">
            <a href="${installHref}">Install</a>
            <a href="${metaHref}">Meta</a>
          </div>
        </article>
      `;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tampermonkey Scripts</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        padding: 40px 20px;
        background: #0b0d10;
        color: #f4f7fb;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 32px;
      }

      .lead {
        margin: 0 0 32px;
        color: #a8b3c2;
      }

      .grid {
        display: grid;
        gap: 16px;
      }

      .script-card {
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.04);
      }

      .script-card h2 {
        margin: 0 0 8px;
        font-size: 20px;
      }

      .script-card p {
        margin: 0 0 16px;
        color: #a8b3c2;
      }

      .script-links {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .script-links a {
        color: #7cc4ff;
        text-decoration: none;
      }

      .script-links a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Tampermonkey Scripts</h1>
      <p class="lead">Auto-generated install page for all published userscripts.</p>
      <section class="grid">${items}
      </section>
    </main>
  </body>
</html>
`;

  await writeFile(path.join(distDir, "index.html"), html, "utf8");
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
  await writeIndexPage(scripts);
  console.log(
    `[build:index] index -> ${path.relative(__dirname, path.join(distDir, "index.html"))}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
