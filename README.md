<div align="center">

# WhaLe

**A Tauri + SolidJS + Frida framework for building trainer-style desktop apps.**

[![CI](https://github.com/eunhhu/WhaLe1/actions/workflows/ci.yml/badge.svg)](https://github.com/eunhhu/WhaLe1/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm: @whale1/sdk](https://img.shields.io/npm/v/@whale1/sdk?label=%40whale1%2Fsdk)](https://www.npmjs.com/package/@whale1/sdk)
[![npm: @whale1/cli](https://img.shields.io/npm/v/@whale1/cli?label=%40whale1%2Fcli)](https://www.npmjs.com/package/@whale1/cli)

</div>

WhaLe bundles up the three things that are hard about building Frida-based trainer apps:

- **Multi-window apps** (`main` / `overlay` / `settings`) driven from a single config file.
- **UI ↔ Rust ↔ Frida store sync**, so UI reads/writes, Rust state, and injected Frida scripts all see the same values in real time.
- **A `whale` CLI** that handles `dev`, `build`, `create`, and config generation for you.

---

## Quick start (new project)

### Requirements

- `Node.js 20+`
- `npm` (or `bun`)
- Rust is optional — you can develop the UI without it.

### Scaffold

```bash
npx @whale1/cli create my-whale-app
cd my-whale-app
npm install
```

### Run in dev

```bash
npm run dev
```

### UI-only (no Rust toolchain)

```bash
WHALE_SKIP_TAURI=1 npm run dev
```

In this mode you still get Vite HMR and the full UI, but native features (window control, global hotkeys, Frida IPC) are disabled.

### Build

```bash
# frontend + tauri bundle
npm run build

# frontend only
WHALE_SKIP_TAURI=1 npm run build
```

---

## Generated starter layout

```txt
my-whale-app/
  assets/icon.png
  whale.config.ts
  src/
    ui/windows/main.tsx
    store/app.ts
    script/main.ts
```

- The default app icon lives at `assets/icon.png`.
- App name / window titles / identifier are configured in `whale.config.ts`.
- Any script registered under `frida.scripts` is auto-loaded when you attach — no separate `session.ts` boilerplate needed.

---

## CLI commands

| Command | Description |
|---|---|
| `whale create <name>` | Scaffold a new project from the starter template. |
| `whale dev` | Run Vite dev server and (optionally) Tauri dev. |
| `whale build` | Production build of frontend and Tauri bundle. |
| `whale config:generate [out]` | Generate `tauri.conf.json` from `whale.config.ts`. |
| `whale clean [--all]` | Remove `.whale/` and `src-tauri/target`. `--all` also wipes `node_modules`. |

---

## Runtime safety pattern

Guard native calls so your app also works in the browser / UI-only mode:

```ts
import { isTauriRuntime, safeInvoke } from '@whale1/sdk'

if (isTauriRuntime()) {
  await safeInvoke('store_set_persist_enabled', { enabled: true })
}
```

`safeInvoke` / `safeInvokeVoid` / `safeListen` never throw when the Tauri backend is absent — they simply resolve to `undefined` / no-op — so you can sprinkle them through UI code without feature-gating everything.

---

## Working in this repo (framework contributors)

### Install

```bash
bun install
```

### Run the example app

```bash
bun --filter whale-example-trainer dev
```

### Frontend-only example

```bash
WHALE_SKIP_TAURI=1 bun --filter whale-example-trainer dev
```

### Test / build

```bash
bun run test        # vitest across all packages
bun run build       # build sdk + ui + cli + example (frontend-only)
bun run typecheck   # build packages and typecheck the example app
```

---

## Documentation

- [Docs index](./docs/README.md)
- [Architecture](./docs/architecture.md)
- [SDK API](./docs/api/sdk.md)
- [Configuration reference](./docs/config.md)
- [Dev & troubleshooting](./docs/dev-and-troubleshooting.md)

## License

MIT — see [LICENSE](./LICENSE).
