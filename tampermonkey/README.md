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

在 `src/scripts/` 下创建独立目录，以脚本名称命名。构建器会自动发现该目录，无需另外注册入口。

| 文件 | 用途 |
| --- | --- |
| `index.ts` | 脚本入口，按需在目录内拆分模块 |
| `meta.json` | 脚本名称、版本、描述、匹配页面及权限等元信息 |
| `README.md` | 面向使用者说明功能、支持站点和操作方式 |

README 内容会直接展示在脚本列表页，不写开发过程和测试记录。

`meta.json` 可参考已有脚本，完整字段见 [UserscriptMeta](src/shared/types/userscript.ts)。脚本头由构建器生成，无需在源码中重复填写；增加功能或调整权限时同步更新元信息。

可选添加 `icon.png` 作为列表图标。使用第三方代码或资源时，将需要保留的许可声明放入 `THIRD-PARTY-NOTICES.txt`，构建器会将其嵌入安装脚本。

在 `tampermonkey` 目录执行 `bun run build:typecheck`，完成类型检查和构建。产物写入 `dist/`：

- `<script-name>.user.js`：可安装的油猴脚本。
- `<script-name>.meta.js`：用于更新检查的脚本元信息。
- `index.html`：包含所有脚本说明和安装入口的列表页。

