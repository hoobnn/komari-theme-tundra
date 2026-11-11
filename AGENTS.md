# AGENTS.md

Repo guide for `komari-theme-tundra` (Tundra, a Komari theme derived from Tokinx/komari-theme-emerald).

## Snapshot

- Branch: `master`
- App: Vue 3 + Vite 8 (rolldown) + reka-ui + Tailwind CSS v4 theme for Komari Monitor
- Package manager: `bun` (>= 1.2); `bun.lock` is committed
- TypeScript is pinned to 6.0: TypeScript 7 is the native port and has no JS API, so `vue-tsc` cannot run on it
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
- `vite.config.ts` build, chunking (rolldown `codeSplitting` groups), zip packaging (`fflate`)
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

- `bun run build` runs `vue-tsc --build` and then `vite build`
- `bun run lint` runs eslint with `--fix --cache`
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

On every push to `master` CI runs `bun install --frozen-lockfile` and `bun run build`. When the version in `package.json` changed (it must match `komari-theme.json`), it tags `v<version>` and publishes a GitHub release with the zip attached. Bump both files together with `bun run publish`.

There is no test suite.

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
- UI is built on `reka-ui` + Tailwind CSS v4 (shadcn-vue style under `src/components/ui/`). Do **not** reintroduce Naive UI, UnoCSS, or SCSS — they have been removed.

## Repo grounded anti-patterns

- Do not rename `komari-theme.json`
- Do not move or rename `docs/preview.png` casually
- Do not add generic framework advice here that belongs in `src/AGENTS.md`

## Child guides

For local rules, defer to the nearest child guide:

- `src/AGENTS.md` for app code, component, store, router, and utility changes

If a child guide exists, it overrides this root file for its subtree.
