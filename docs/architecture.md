# WhaLe architecture

A practical summary of **where each piece runs** and how data moves between them.

## 1) High-level layout

```txt
Solid UI  (main / overlay / settings / __devtools__)
  ↕  Tauri IPC (invoke/listen)
Rust Runtime  (StoreManager / InputManager / FridaManager / Window Commands)
  ↕  Frida message channel (send/recv)
Target process  (injected script + __<store>__)
```

Key points:

- The "backend" is **not** a separate server — it's a Rust state object living inside the Tauri process.
- The source of truth for UI state is `StoreManager`.
- Frida scripts read/write the *same* store through the `__<store>__` preamble.

## 2) Module responsibilities

### `packages/cli`

- Commands: `whale dev / build / create / config:generate / clean`.
- Reads `whale.config.ts`, generates `.whale/*.html`, `.whale/tauri.conf.json`.
- On dev/build keeps `src-tauri/capabilities/default.json` window labels in sync.
- Runs `tauri icon` from the configured icon source.

### `packages/sdk`

- Hooks / public API used by app code: `createSyncStore`, `useHotkey`, `useWindow`, `useDevice`, `useSession`, etc.
- Safe wrappers around Tauri `invoke` / `listen` (`safeInvoke`, `safeInvokeVoid`, `safeListen`) that never throw when the backend is absent.
- The `useSession(device, { scripts })` overload collapses the whole "connect device → attach process → load scripts" flow into one hook.

### `packages/tauri-runtime`

- `StoreManager` — store state, subscriptions, persist loop.
- `InputManager` — global key listener (rdev) + hotkey dispatch.
- `FridaManager` — device / session / script lifecycle.
- `window_cmd` — window control; can re-create closed windows from config.

### `apps/example`

- Reference usage.
- Demonstrates a `trainer` store + main/overlay/settings windows + one Frida script.
- Uses the `useDevice` + `useSession(device, { scripts })` pattern (no hand-written `session.ts`).

## 3) Store sync flows

### UI → Rust → UI

1. UI calls `trainer.setGodMode(true)`.
2. The SDK applies the local value immediately (optimistic update).
3. SDK invokes `store_set` over IPC.
4. Rust emits a `store:changed` event with the patch to all subscribing windows.
5. Each UI window applies the patch.

### Frida → Rust → UI

1. Frida script sends `send({ __whale: true, store, patch })`.
2. `bridge.rs` inspects the marker and parses the patch.
3. `StoreManager::merge_patch_ref` merges only the changed keys.
4. Subscribing windows for that store receive `store:changed`.

Notes:

- If there are no subscribers, a broadcast fallback is used.
- In debug builds the `__devtools__` window also receives store events.

## 4) Persistence

- Storage path: `app_data_dir()/whale_stores.json`.
- If the store is dirty, it's flushed every 500ms.
- Persistence can be toggled at runtime with `store_get_persist_enabled` / `store_set_persist_enabled`.

UI behaviour:

- `createSyncStore` hydrates from `store_get_all` on mount.
- On restart the previous values are re-applied.

## 5) Hotkey / key event flow

1. At startup `InputManager::start_listener` spawns the rdev listener.
2. Call `input_register_hotkey` to register combinations.
3. Incoming key events update `pressed_keys` / `active_hotkeys` state.
4. On state transitions, `input:hotkey-triggered` is emitted with `phase: "press"` or `phase: "release"`.

Stability guarantees:

- Duplicate press events for an already-held key are ignored.
- Multi-key combos dedupe release dispatch via state-based computation.

## 6) Window control

- `window_show(id)` — if the window is gone, re-create it from config and show.
- `window_toggle(id)` — toggle visibility if it exists; re-create and show if not.
- `window_hide / close` — no-op if the window is already gone.

Net result: accidentally closing a window is recoverable via `show` / `toggle`.

## 7) What `whale dev` actually does

1. Load `whale.config.ts`.
2. Generate `.whale/*.html` + bootstrap entries.
3. Generate `.whale/tauri.conf.json`.
4. Start the Vite dev server.
5. If Rust is available, start `tauri dev`.
6. In debug builds, F12 toggles the `__devtools__` window.

If Rust is missing or `WHALE_SKIP_TAURI=1` is set, step 5 is skipped and the app runs in frontend-only mode.
