# Source Tree Guide

This document applies to `/src` only. Keep changes aligned with the current React 19 + Vite + Radix UI + Tailwind CSS v4 structure. There is no Vue, Pinia, reka-ui or Naive UI here — do not reintroduce them.

## Core architecture

- `main.tsx` is bootstrap only. It sets `window.$message`, kicks off `setupIconify()`, starts `initApp()` from `@/utils/init` **outside React** (so StrictMode's double mount never opens a second connection), and renders `<App />` inside `StrictMode` + `BrowserRouter`. Do not move feature logic into bootstrap.
- `App.tsx` is the app shell: `Provider`, `Background`, `LoadingCover`, `Header`, `Footer`, sonner `Toaster`, and the routes.
- Routes (both lazy via `React.lazy`):
  - `/` → `@/views/HomeView` — always mounted inside `<Activity mode={isHome ? 'visible' : 'hidden'}>` so search, grouping and scroll position survive a trip to a detail page (this replaces Vue's `KeepAlive`). HomeView saves/restores scroll in a `useLayoutEffect`.
  - `/instance/:id` → `@/views/InstanceDetail`
- No route guards. Do not add one unless there is a real need.

## UI responsibility boundaries

- `views/HomeView.tsx` composes page regions; filtering and view policy are in `hooks/useHomeNodes.ts`, scroll restoration in `hooks/useHomeScrollRestoration.ts`.
- `components/home/` owns the node toolbar, results, notices and ping dialog. `components/nodes/` owns resource, network and ping regions inside `NodeCard`.
- `components/overview/` owns summary presentation and finance popover; `hooks/useNodeOverview.ts` computes summary values.
- Load fetching belongs to `hooks/useLoadRecords.ts`, pure ECharts configuration to `utils/charts/loadChartOptions.ts`; ping chart fetching belongs to `hooks/usePingChartData.ts`.
- Use `ScrollableTabsList` for group/time-range overflow. Do not duplicate selection-scroll logic or wrap search/view buttons in a tablist.
- See `../docs/architecture.md` for the full adjustment map and preserved contracts.

## Authoring conventions

- Function components, one default-exported component per file in `src/components/` and `src/views/`; `src/components/ui/` uses named exports through each folder's `index.ts`.
- React Compiler is on (`vite.config.ts`). Derive values inline during render; `useMemo` / `useCallback` are only needed for values that must stay referentially stable for a non-React consumer. Never mirror derived data into state, never set state during render.
- Effects must be StrictMode-safe: every subscription, timer, WebGL/ECharts instance or listener is torn down in the cleanup.
- Prefer `@/` imports. `import type` for types (`verbatimModuleSyntax`).
- Heavy UI stays lazy (`React.lazy` + `Suspense`): `NodeCard`, `NodeList`, `NodeGeneralCards`, `NodeEarthMaps`, `LoadChart`, `PingChart`.

## UI library (`src/components/ui/`)

Local shadcn/ui-style components (alert, avatar, back-top, badge, button, card-x, data-tooltip, dialog, empty, input, progress-thin, sonner, spinner, tabs). Each one:

- Wraps a `radix-ui` primitive when applicable (`import { Tabs as TabsPrimitive } from 'radix-ui'`), `asChild` via `Slot.Root`.
- Declares variants with `class-variance-authority` and merges classes via `cn()` from `@/lib/utils`.
- Styles state with Radix data attributes (`data-[state=active]:`, `data-[orientation=horizontal]:`), not reka-style `data-active:`.

New UI: compose existing primitives first; if one is missing, add it in the same pattern (radix-ui + cva + `cn()`), not by pulling in another component library.

## State (`src/stores/`, zustand)

- `@/stores/app` — `useAppStore(selector)`: public settings, validated theme settings (`settings`, derived once in `setPublicSettings` via `deriveThemeSettings`), login state, theme mode, view mode, selected group, scroll memory, `isScrolled`, visitor country. Selectors/hooks: `useThemeSettings()`, `useIsDark()`, `selectNodeViewMode`, `selectCurrentBackgroundUrl`.
- `@/stores/nodes` — `useNodesStore(selector)`: nodes (immutable updates; unchanged nodes keep identity), `nodesByUuid`, `earthNodes` snapshot, WebSocket state. Hooks: `useNodeGroups()`, `useOnlineCount()`, `useNode(uuid)`.
- zustand v5: a selector must not return a new object/array on every call; select primitives/stable references or use `useShallow`.
- Non-React code (e.g. `@/utils/init`) uses `useXxxStore.getState()` / `setState()`.
- New theme settings: add the key to `komari-theme.json`, then to `ThemeSettings` + `deriveThemeSettings` with the same defensive checks (`typeof`, value filtering, defaults).
- localStorage keys inherited from Emerald (`themeMode`, `nodeViewMode`, `nodeSelectedGroup`, finance keys) are stored as raw strings; keep their names and format. New keys use the `komari-theme-tundra:` prefix.

## Hooks (`src/hooks/`)

`useNodePingStats` (shared, deduplicated ping records per time window via `useSyncExternalStore`, with a localStorage warm cache), `useNodePingDisplay` (the home card/list ping table), `useNodeFormatters`, `useBackgroundSurface`, `useExchangeRates`, `useMediaQuery`. Generic timing helpers live in `@/lib/timing` (`debounce`, `throttle`).

## Utils

- `src/utils` is framework-free: transport, formatting, lookups and startup orchestration.
- API and RPC access only through `@/utils/api` (REST) and `@/utils/rpc` (JSON-RPC, typed methods on `KomariRpc`). Components must not call `fetch` or `rpc.getClient().call('…')` directly; add a typed method instead.
- Chart data: `@/utils/pingHistory`, `@/utils/chartViews`, `@/utils/chartTheme`. ECharts modules are registered once in `@/utils/echarts`; render charts with `@/components/EChart` (`<EChart option={…} />`), which handles init, resize and dispose.
- Startup, transport selection, polling, reconnects and WebSocket fallback stay in `@/utils/init`.
- Formatting in `@/utils/helper`, record shaping in `@/utils/recordHelper`, lookups in `regionHelper`, `osImageHelper`, `tagHelper`.
- `@/utils/message` (exposed as `window.$message`) wraps sonner's `toast`.

## App globals

- Only one app global on `window`: `$message`, typed in `src/types/global.d.ts` together with the build-time constants `__BUILD_VERSION__` / `__BUILD_GIT_HASH__` injected by `vite.config.ts`.
- Theming: `Provider.tsx` toggles `.dark` and `color-scheme` on `<html>` from `useIsDark()` (`themeMode` + `prefers-color-scheme`).

## Icons

All icons go through `@iconify/react` (`<Icon icon="icon-park-outline:sun" />`), fetched on demand from the Iconify CDN. Lucide icons via the `lucide:` prefix. Do not add `lucide-react` or other icon-component packages.

## Styles

- Single global stylesheet `@/styles/main.css`: `tailwindcss`, `tw-animate-css`, the `dark` custom variant and OKLCH tokens for both modes. No SCSS, no CSS modules.
- Component styling is Tailwind utilities composed with `cn()`. Put CSS in `main.css` only when Tailwind cannot express it (keyframes, complex selectors), under a component-prefixed class.
- Enter animations use tw-animate-css classes and respect the `disablePageAnimation` setting.

## Validation

- `bun run lint` (oxlint + oxfmt) and `bun run build` (`tsc -b` + `vite build`).
- There is no test suite. Do not invent one.
