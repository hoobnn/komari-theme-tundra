# AGENTS.md

Repo guide for `komari-theme-tundra` (Tundra, a Komari theme derived from Tokinx/komari-theme-emerald).

## Snapshot

- Branch: `master`
- App: React 19 (React Compiler) + Vite 8 (rolldown) + Radix UI + Tailwind CSS v4 theme for Komari Monitor
- Package manager: `bun` (>= 1.2); `bun.lock` is committed
- TypeScript 7 (native `tsc`) does type checking; lint is oxlint (type-aware rules via `oxlint-tsgolint`, also on TS 7) and formatting is oxfmt. Nothing in the toolchain needs the TS 5/6 JS API, so do not add ESLint, typescript-eslint or other tools that `require('typescript')`
- Theme manifest: `komari-theme.json`

## What this repo is

- Builds a Komari theme, not a generic web app
- Release artifact is a zip package Komari can import
- Runtime app code lives under `src/`
- Flag and OS logo images (`/assets/flags/*.svg`, `/assets/logo/*.svg`) are served by the Komari server, not by this theme
- Release preview image is `docs/preview.png`

## Tundra design rules

- Look: modern and clean. Neutral cool-gray background, solid white cards (`bg-card shadow-xs`, `rounded-xl`), vivid Tailwind `emerald` as the only accent. No grid patterns, gradient washes, dashed dividers or sage/olive tones (they read as retro).
- Tokens live on `:root` / `.dark` in `src/styles/main.css`.
- Font: Geist Variable for UI and numbers; `.num` adds tabular figures. Do not use monospace for data.
- Ping colors: normal latency stays neutral text; only fast (emerald), slow (amber) and bad (red) get color. Bars use the same thresholds as text.
- Never join values with `/` in node cards or lists; use aligned rows instead.
- Dual-stack ping: IPv4 and IPv6 each get their own row; v6 must stay visually distinct from v4 (chart: darker color + dashed line).
- Node cards must align across the grid: fixed-height trend bars, tags anchored to the bottom.
- Ping task names ending in ` v4` / ` v6` are grouped by `src/utils/pingStack.ts`.
- New localStorage keys use the `komari-theme-tundra:` prefix. Older keys inherited from Emerald (`themeMode`, `nodeViewMode`, finance keys) keep their names so saved preferences survive. Theme settings are keyed by manifest `short` (`Tundra`).

## Root structure

- `src/` app source
- `public/` only `favicon.ico`
- `.github/workflows/release-on-version-bump.yml` the only CI workflow
- `docs/preview.png` release preview image (a real screenshot of the live panel)
- `komari-theme.json` theme manifest consumed by the zip build
- `CHANGELOG.md` user-facing release notes; the Release body is taken from it
- `scripts/publish.ts` version bump + changelog release; `scripts/release-notes.ts` CI release body
- `vite.config.ts` build, React Compiler (`@rolldown/plugin-babel` + `reactCompilerPreset`), chunking (rolldown `codeSplitting` groups), zip packaging (`fflate`)
- `.oxlintrc.json` / `.oxfmtrc.json` lint and format config
- `package.json` root commands and pinned dependency versions
- `bun.lock` resolved lockfile (managed by bun)

## Root commands

Run from repo root only.

```bash
bun run dev
bun run build
bun run preview
bun run lint
```

Notes:

- `bun run build` runs `tsc -b` and then `vite build`
- `bun run lint` runs `oxlint --type-aware --fix` and then `oxfmt` (writes files); `bun run lint:check` only checks
- There is no test suite in this repository
- Do not invent `bun test` or Vitest commands here

## Build and release contract

`bun run build` must preserve the Komari packaging flow defined in `vite.config.ts`.

Expected output:

- `dist/`
- `komari-theme-tundra-build-<sha>.zip`

Zip contents:

- `dist/`
- `komari-theme.json`
- `preview.png`

Current source of packaged preview:

- `docs/preview.png` on disk
- renamed to `preview.png` inside the zip

Do not change zip naming, manifest filename, or preview filename without updating the real build contract.

## CI facts

Source of truth: `.github/workflows/release-on-version-bump.yml`

On every push to `master` CI runs `bun install --frozen-lockfile`. When the version in `package.json` changed (it must match `komari-theme.json`), it extracts that version's section from `CHANGELOG.md` (`scripts/release-notes.ts`, fails if missing or empty), runs `bun run build`, tags `v<version>` and publishes a GitHub release whose body is the changelog section, with the zip attached.

There is no test suite.

## 发版规则

Release notes and version numbers are user-facing; follow these rules for every release.

### 版本号（SemVer，当前处于 0.x）

- **patch**（0.1.x → 0.1.y）：修复、细节和展示改进，不新增设置项，不改变已有设置的含义。
- **minor**（0.x → 0.y）：新功能模块、新增或改名的主题设置项（`komari-theme.json` 的 `configuration`）、需要使用者留意的外观大改。
- **major**（1.0 之后才用）：不兼容的设置变更，例如删除设置项或改变存储键，导致升级后旧设置失效。
- 版本号只增不减。已发布的 tag 和 Release 不改写、不复用；发错就再发一个新版本修正。

### 更新内容（CHANGELOG.md）

- 改动合入 `master` 时，同一个提交里在 `## [未发布]` 下补一条；发版时脚本把它整理成版本段落。
- 只写使用者能感知到的变化，分 `### 新增`、`### 改进`、`### 修复` 三类，没有的分类省略；纯重构、依赖升级、CI 调整不写，除非影响使用。
- 每条一行，中文，说清「哪里、变成什么样」；不写提交哈希、文件名、内部函数名，不写「优化了若干细节」这种空话。
- Release 说明直接取 CHANGELOG 对应段落，不在 GitHub 上另写。

### 发版流程

1. `bun run lint`、`bun run build` 通过，必要时在本地预览里看过改动。
2. 确认 `## [未发布]` 已写好本次内容。
3. `bun run publish`（或 `bun run publish -v 0.2.0` 指定版本）：校验「未发布」非空，改 `package.json`、`komari-theme.json` 的版本号，把「未发布」改成 `## [x.y.z] - 日期` 并更新底部对比链接，暂存这三个文件。
4. 单独提交 `chore: 发布 x.y.z`，推送 `master`。CI 自动打 tag、构建并发布带 zip 的 Release。
5. 从 Release 下载 zip，在面板「主题管理」上传覆盖，刷新后确认页脚显示的主题版本号是新版本。

## Where to look

- Start at `package.json` for root commands
- Check `vite.config.ts` for build behavior, global constants, and zip packaging
- Check `komari-theme.json` for theme metadata and managed configuration schema
- Check `src/` for app behavior
- Check `.github/workflows/release-on-version-bump.yml` for CI and release behavior

Contributor density, useful for triage:

- `src/components/` is a dense UI change area
- `src/utils/` is a dense logic and helper area
- `src/stores/` is central state, usually affected by cross-cutting changes

## Conventions seen in this repo

- Use `bun`, not pnpm/npm/yarn
- Dependency versions are declared directly in `package.json`; add new ones with `bun add` / `bun add -d`
- Keep root guidance focused on build, packaging, manifest, and repo structure
- Preserve the `@` alias to `src` defined in `vite.config.ts`
- Treat `komari-theme.json` as release input, not optional metadata
- Treat `docs/preview.png` as release input, not just documentation art
- Respect existing generated outputs and naming patterns, especially `komari-theme-tundra-build-<sha>.zip`
- Root verification is lint plus build, not tests
- UI is built on `radix-ui` + Tailwind CSS v4 (shadcn/ui style under `src/components/ui/`). Do **not** reintroduce Vue, Naive UI, UnoCSS, SCSS or another component library.

## Repo grounded anti-patterns

- Do not rename `komari-theme.json`
- Do not move or rename `docs/preview.png` casually
- Do not add generic framework advice here that belongs in `src/AGENTS.md`

## Child guides

For local rules, defer to the nearest child guide:

- `src/AGENTS.md` for app code, component, store, router, and utility changes

If a child guide exists, it overrides this root file for its subtree.
