# Tampermonkey Scripts

一个轻量级的 Tampermonkey 多脚本项目。

## 特点

- TypeScript 类型检查
- 多脚本入口
- 共享 UI/工具模块
- 直接构建为可导入 Tampermonkey 的 `.js` 文件

## 开始

```bash
bun install
bun run build
```

## 自动构建

- push 到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages

构建时会自动注入：

- `@downloadURL`
- `@updateURL`

这些 URL 由 GitHub Actions 通过仓库变量 `PAGES_BASE_URL` 动态注入。

例如可以配置成：`https://script.example.com`

配置位置：`Settings > Secrets and variables > Actions > Variables`

首次启用时，需要在 GitHub 仓库设置里把 Pages Source 切到 `GitHub Actions`

## 目录

```text
tampermonkey/
  dist/
  src/
    scripts/
    shared/
  build.ts
```

## 新增脚本

1. 在 `src/scripts/<script-name>/index.ts` 新建入口。
2. 在 `src/scripts/<script-name>/meta.json` 填写脚本元信息。
3. 在 `src/scripts/<script-name>/README.md` 写清楚功能和使用方式。
4. `bun run build` 后会自动输出到：
   - `tampermonkey/dist/index.html`
   - `tampermonkey/dist/<script-name>.user.js`
   - `tampermonkey/dist/<script-name>.meta.js`
   - `tampermonkey/dist/<script-name>.full.js`
