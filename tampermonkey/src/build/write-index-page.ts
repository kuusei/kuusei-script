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

function renderLogo(name: string, icon?: string) {
  if (icon) {
    return `<img class="script-logo" src="${escapeHtml(icon)}" alt="${escapeHtml(name)} logo" loading="lazy" />`;
  }

  return `<div class="script-logo script-logo-fallback" aria-hidden="true">${escapeHtml(name.slice(0, 1).toUpperCase())}</div>`;
}

export async function writeIndexPage(
  distDir: string,
  scripts: ScriptEntry[],
  pageBaseUrl?: string,
) {
  const css = await readFile(new URL("./index-page.css", import.meta.url), "utf8");
  const pageTitle = "Tampermonkey 脚本列表";
  const pageDescription = "自动构建的脚本发布页，按更新时间倒序展示当前可安装脚本。";
  const pageUrl = pageBaseUrl?.replace(/\/$/, "") || "";
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
      const author = escapeHtml(script.meta.author);
      const version = escapeHtml(script.meta.version);
      const updatedAt = escapeHtml(formatUpdatedAt(script.meta.updatedAt));
      const installHref = `./${script.name}.user.js`;
      const metaHref = `./${script.name}.meta.js`;
      const fullHref = `./${script.name}.full.js`;
      const logo = renderLogo(script.meta.name, script.meta.icon);

      return `
        <article class="script-card" id="${script.name}">
          <div class="script-layout">
            ${logo}
            <div class="script-body">
              <div class="script-head">
                <div>
                  <h2>${title}</h2>
                  <p class="script-desc">${description}</p>
                </div>
                <code>${script.name}</code>
              </div>
              <div class="script-meta">
                <span>作者：${author}</span>
                <span>版本：${version}</span>
                <span>更新时间：${updatedAt}</span>
              </div>
              ${renderReadme(script.readme)}
              <div class="script-links">
                <a class="primary" href="${installHref}" target="_blank" rel="noopener noreferrer">安装脚本</a>
                <a href="${metaHref}" target="_blank" rel="noopener noreferrer">查看元信息</a>
                <a href="${fullHref}" target="_blank" rel="noopener noreferrer">查看完整源码</a>
              </div>
            </div>
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
    <title>${pageTitle}</title>
    <meta name="description" content="${pageDescription}" />
    <meta property="og:title" content="${pageTitle}" />
    <meta property="og:description" content="${pageDescription}" />
    <meta property="og:type" content="website" />
    ${pageUrl ? `<meta property="og:url" content="${pageUrl}/" />` : ""}
    <style>${css}</style>
  </head>
  <body>
    <main>
      <h1>${pageTitle}</h1>
      <p class="lead">${pageDescription}</p>
      <section class="grid">${items}
      </section>
    </main>
  </body>
</html>
`;

  await writeFile(path.join(distDir, "index.html"), html, "utf8");
}
