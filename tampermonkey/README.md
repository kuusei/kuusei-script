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
- 固定链接格式：`https://<owner>.github.io/<repo>/tampermonkey/<file>`

当前脚本永久链接：

- `https://kuusei.github.io/kuusei-script/tampermonkey/baidu-openlist-sync.js`
- `https://kuusei.github.io/kuusei-script/tampermonkey/baidu-openlist-sync.min.js`

构建时会自动注入：

- `@downloadURL`
- `@updateURL`

这些 URL 由 GitHub Actions 通过 `PAGES_BASE_URL` 动态注入，所以 fork 后也会自动指向 fork 自己的 Pages 地址。

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
3. `bun run build` 后会自动输出到：
   - `tampermonkey/dist/<script-name>.js`
   - `tampermonkey/dist/<script-name>.min.js`

## 当前脚本

- `dist/baidu-openlist-sync.js`
- `dist/baidu-openlist-sync.min.js`
