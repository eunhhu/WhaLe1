# `whale.config.ts` reference

`whale.config.ts` is the single configuration entry point for a WhaLe app.

## Basic shape

```ts
import { defineConfig } from '@whale1/cli'

export default defineConfig({
  app: {
    name: 'Example Trainer',
    version: '0.1.0',
    identifier: 'com.whale.example',
    icon: './assets/icon.png',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
      title: 'Main',
      width: 900,
      height: 700,
    },
    overlay: {
      entry: './src/ui/windows/overlay.tsx',
      title: 'Overlay',
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    },
  },
  frida: {
    scripts: [{ entry: './src/script/main.ts', store: 'trainer' }],
  },
  store: {
    persist: true,
  },
  build: {
    outDir: '.whale',
    devHost: '127.0.0.1',
    devPort: 1420,
  },
})
```

## `app`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | App name. Used as Tauri `productName` and the default window title. |
| `version` | `string` | App version. |
| `identifier` | `string` | Bundle identifier (e.g. `com.company.app`). |
| `icon?` | `string` | Path to the source icon file. |

Icon resolution order:

1. If `app.icon` exists, use that file.
2. Otherwise look for `assets/icon.png` in the project or workspace root.
3. Otherwise fall back to the default Tauri icon set.

## `windows`

`Record<string, WindowConfig>`.

| Field | Type | Description |
|---|---|---|
| `entry` | `string` | TS/TSX entry file for this window. |
| `title?` | `string` | Window title. Defaults to `app.name`. |
| `width?`, `height?` | `number` | Initial size. |
| `resizable?` | `boolean` | Whether the window can be resized. |
| `alwaysOnTop?` | `boolean` | Keep on top. |
| `transparent?` | `boolean` | Transparent window. |
| `decorations?` | `boolean` | Show titlebar / frame. |
| `shadow?` | `boolean` | Window shadow. |
| `skipTaskbar?` | `boolean` | Hide from the taskbar. |
| `visible?` | `boolean` | Start visible. |
| `position?` | `{x:number,y:number} \| string` | Initial position. |
| `clickThrough?` | `boolean` | Typed but not wired to the runtime yet. |

Notes:

- In dev mode a `__devtools__` window is added automatically.

## `frida`

| Field | Type | Description |
|---|---|---|
| `scripts` | `{ entry: string; store?: string }[]` | Frida scripts to auto-load on attach. |

- `entry` must point to a real file; `whale dev/build` validates this.
- Setting `store` injects a `__<name>__` global preamble at runtime.
- Passing the list through `useSession(device, { scripts: whaleConfig.frida?.scripts })` auto-loads everything after attach — no manual `loadScripts()` call.
- Inside a Frida script the store name is `__<name>__` (e.g. `store: 'trainer'` → `__trainer__`).
- Names containing `-` or `.` are normalized to `_` when generating the global (`my-store.v1` → `__my_store_v1__`).
- Types are picked up via `import type` in `src/script/globals.d.ts` — no hand-maintained `.d.ts` needed.

## `store`

| Field | Type | Description |
|---|---|---|
| `persist?` | `boolean` | Typed only. |
| `persistPath?` | `string` | Typed only. |

Caveats:

- The runtime persist path is currently fixed at `app_data_dir()/whale_stores.json` and persistence is toggled at runtime via commands.
- As a result `store.persist` and `store.persistPath` are not wired into CLI/runtime behaviour today.

## `build`

| Field | Type | Default | Description |
|---|---|---|---|
| `outDir?` | `string` | `.whale` | Where generated files are written. |
| `devHost?` | `string` | `127.0.0.1` | Dev server host. |
| `devPort?` | `number` | `1420` | Dev server port. |
| `devUrl?` | `string` | `http://{host}:{port}` | Override the full dev URL. |
| `beforeDevCommand?` | `string` | `""` | Passed through to Tauri. |
| `beforeBuildCommand?` | `string` | `""` | Passed through to Tauri. |

Precedence:

- If `devUrl` is set, host/port are derived from it.
- Otherwise `build.devHost` / `build.devPort`.
- Otherwise the `WHALE_DEV_HOST` / `WHALE_DEV_PORT` env vars.
- Otherwise the defaults above.

## Environment variables

| Variable | Description |
|---|---|
| `WHALE_SKIP_TAURI=1` | Skip Rust/Tauri entirely; run the frontend-only dev/build path. |
| `WHALE_DEV_HOST` | Dev host override. |
| `WHALE_DEV_PORT` | Dev port override. |
| `TAURI_DEV_HOST` | Fallback for `WHALE_DEV_HOST`. |

## Practical tips

- Keep the window title / app name in one place; the CLI propagates it to generated HTML titles and the Tauri window title.
- Keep a single source icon (`assets/icon.png`) and let the CLI regenerate platform-specific icons — much less maintenance.
