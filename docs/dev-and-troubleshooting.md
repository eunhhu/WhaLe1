# Dev & troubleshooting guide

## 1) What `whale dev` does

Internally, in this order:

1. Load `whale.config.ts`.
2. Generate `.whale/*.html` + bootstrap entries.
3. Generate `.whale/tauri.conf.json`.
4. Start the Vite dev server (with HMR).
5. Check the Rust toolchain.
6. Start `tauri dev` if Rust is available, otherwise stay in frontend-only mode.

## 2) Common commands

From the repo root:

```bash
bun install
bun --filter whale-example-trainer dev
bun --filter whale-example-trainer build
bun test
```

Frontend-only mode:

```bash
WHALE_SKIP_TAURI=1 bun --filter whale-example-trainer dev
```

## 3) HMR isn't reloading

Walk through in order:

1. Check that `whale dev` printed the Vite URL.
2. Confirm `.whale/__whale_entry_*.ts` files exist.
3. Look for module-load errors in the browser console.
4. Check `build.devHost` / `build.devPort` for firewall / port conflicts.

Notes:

- The generated bootstrap code wires up `import.meta.hot.accept(...)` automatically.

## 4) DevTools aren't updating in real time

Things to check:

1. You're on a debug build (behind `cfg!(debug_assertions)`).
2. `__devtools__` is included in the capability windows list.
3. The F12 toggle hotkey is registered.
4. Event-stream env vars:
   - `WHALE_DEVTOOLS_INPUT_STREAM`
   - `WHALE_DEVTOOLS_FRIDA_LOG`

How they work:

- If the env var is anything other than `0` / `false` / `no` / `off`, stream emits are on.

## 5) A window was closed and won't reopen

Current runtime behaviour:

- `window_show` / `window_toggle` re-create the window from config if it's gone.
- `window_hide` / `window_close` require an existing window.

So for "recovery open" actions, use `show` / `toggle`.

## 6) Hotkey events look wrong

The runtime guarantees:

- Duplicate press events for an already-held key are dropped.
- Multi-key combos compute press/release transitions from `active_hotkeys` state.
- The SDK `useHotkey` supports `phase`-based callbacks.

Debugging tips:

1. Watch `input:key-event` / `input:hotkey-triggered` in the DevTools Input tab.
2. Use normalized combo strings (`ctrl`, `shift`, `alt`, `meta`).
3. Make sure the same hotkey isn't registered twice.

## 7) Persisted values don't come back after restart

Normal path:

1. `createSyncStore` is called.
2. `store_get_all` hydrates the snapshot.
3. Patches apply and reactive UI updates.

If the snapshot doesn't land:

1. Check that the store name is the same in UI, Frida script, and config.
2. Check that `defaults` keys match the snapshot keys.
3. Make sure the store is actually created while the component is mounted.
4. Confirm the runtime persist toggle hasn't been disabled.

## 8) Icon shows as the default Tauri icon

Walk through:

1. Does `app.icon` in `whale.config.ts` point to an existing file?
2. If it's missing, is `assets/icon.png` present in the project or an ancestor workspace?
3. Did `whale dev/build` actually run `tauri icon` (check the logs)?
4. Is `src-tauri/icons/*` freshly regenerated?

## 9) Working without a Rust toolchain

Recommended approach:

1. Develop the UI with `WHALE_SKIP_TAURI=1`.
2. Guard native-only code with `isTauriRuntime()`.
3. Use `safeInvoke` / `safeListen` so missing native calls don't crash the app.

Example:

```ts
if (isTauriRuntime()) {
  await safeInvoke('store_set_persist_enabled', { enabled: true })
}
```
