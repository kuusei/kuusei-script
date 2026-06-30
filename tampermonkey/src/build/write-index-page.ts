import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ScriptEntry } from "../shared/types/script-entry";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderReadme(readme: string) {
  if (!readme.trim()) {
    return '<p class="script-readme empty">暂无说明。</p>';
  }

  return `<div class="script-readme">${escapeHtml(readme.trim())}</div>`;
}

export async function writeIndexPage(distDir: string, scripts: ScriptEntry[]) {
  const css = await readFile(new URL("./index-page.css", import.meta.url), "utf8");
  const items = scripts
    .slice()
    .sort((left, right) => {
      const leftTime = left.meta.updatedAt ? Date.parse(left.meta.updatedAt) : 0;
      const rightTime = right.meta.updatedAt ? Date.parse(right.meta.updatedAt) : 0;
      return rightTime - leftTime;
    })
    .map((script) => {
      const title = escapeHtml(script.meta.name);
      const description = escapeHtml(script.meta.description);
      const version = escapeHtml(script.meta.version);
      const updatedAt = escapeHtml(formatUpdatedAt(script.meta.updatedAt));
      const installHref = `./${script.name}.user.js`;
      const metaHref = `./${script.name}.meta.js`;

      return `
        <article class="script-card">
          <div class="script-head">
            <div>
              <h2>${title}</h2>
              <p class="script-desc">${description}</p>
            </div>
            <code>${script.name}</code>
          </div>
          <div class="script-meta">
            <span>版本：${version}</span>
            <span>更新时间：${updatedAt}</span>
          </div>
          ${renderReadme(script.readme)}
          <div class="script-links">
            <a class="primary" href="${installHref}" target="_blank" rel="noopener noreferrer">安装脚本</a>
            <a href="${metaHref}" target="_blank" rel="noopener noreferrer">查看元信息</a>
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
    <title>Tampermonkey 脚本列表</title>
    <style>${css}</style>
  </head>
  <body>
    <main>
      <h1>Tampermonkey 脚本列表</h1>
      <p class="lead">自动构建的脚本发布页，按更新时间倒序展示当前可安装脚本。</p>
      <section class="grid">${items}
      </section>
    </main>
  </body>
</html>
`;

  await writeFile(path.join(distDir, "index.html"), html, "utf8");
}
