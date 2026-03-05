# WhaLe 아키텍처

이 문서는 "어디서 무엇이 실행되는지"를 빠르게 이해하기 위한 실전 요약입니다.

## 1) 전체 구조

```txt
Solid UI (main / overlay / settings / __devtools__)
  ↕  Tauri IPC (invoke/listen)
Rust Runtime (StoreManager / InputManager / FridaManager / Window Commands)
  ↕  Frida message channel (send/recv)
Target Process (injected script + __<store>__)
```

핵심 포인트:

- 백엔드는 별도 서버가 아니라 **Tauri 프로세스 내부 Rust 상태 객체**입니다.
- UI 상태의 기준점은 `StoreManager`입니다.
- Frida 스크립트는 `__<store>__` preamble을 통해 같은 store를 읽고 쓰게 됩니다.

## 2) 모듈별 역할

### packages/cli

- `whale dev/build/create/config:generate/clean`
- `whale.config.ts`를 읽고 `.whale` 산출물과 `tauri.conf.json` 생성
- dev/build 시 `src-tauri/capabilities/default.json` windows 라벨 동기화
- 아이콘 소스를 기준으로 `tauri icon` 실행

### packages/sdk

- 앱 코드에서 사용하는 훅/API (`createSyncStore`, `useHotkey`, `useWindow`, `useDevice`, `useSession` 등)
- Tauri API(`invoke`, `listen`)를 직접 감싸는 안전 래퍼(`safeInvoke`, `safeListen`)
- `useSession(device, { scripts })` 오버로드로 기기 연결 → 프로세스 attach → 스크립트 자동 로드 전체 흐름을 단일 훅으로 제공

### packages/tauri-runtime

- `StoreManager`: store 상태, 구독, persist loop
- `InputManager`: 글로벌 키 이벤트(rdev) + hotkey dispatch
- `FridaManager`: device/session/script lifecycle
- `window_cmd`: 창 제어, 필요 시 닫힌 창 재생성

### apps/example

- 실제 사용 예시
- `trainer` store + main/overlay/settings window + frida script
- `useDevice` + `useSession(device, { scripts })` 패턴으로 Frida 세션 관리 (별도 session.ts 불필요)

## 3) Store 동기화 흐름

## UI -> Rust -> UI

1. UI에서 `trainer.setGodMode(true)` 호출
2. SDK가 로컬 상태를 먼저 반영(optimistic update)
3. SDK가 `store_set` IPC 호출
4. Rust가 patch를 구독 윈도우에 `store:changed` 이벤트로 emit
5. 각 UI window가 patch를 받아 반영

## Frida -> Rust -> UI

1. Frida script가 `send({ __whale: true, store, patch })` 전송
2. `bridge.rs`가 marker를 검사하고 patch 파싱
3. `StoreManager.merge_patch_ref`로 변경 키만 반영
4. 해당 store 구독 윈도우에 `store:changed` emit

주의:

- 구독이 없으면 broadcast fallback이 실행됩니다.
- debug 빌드에서는 `__devtools__` window도 store 이벤트를 수신합니다.

## 4) Persist(저장) 흐름

- 저장 파일 경로: `app_data_dir()/whale_stores.json`
- dirty 상태면 500ms 주기로 자동 flush
- runtime persist 플래그 on/off 가능 (`store_get_persist_enabled`, `store_set_persist_enabled`)

UI 측 동작:

- `createSyncStore` 생성 직후 `store_get_all`로 snapshot hydrate
- 앱 재시작 시 이전 값이 store에 반영됩니다.

## 5) Hotkey/키 이벤트 흐름

1. 앱 시작 시 `InputManager.start_listener()`가 rdev listener 시작
2. `input_register_hotkey`로 조합 등록
3. 키 입력 시 내부 `pressed_keys`/`active_hotkeys` 상태를 갱신
4. hotkey 상태 전이 시 `input:hotkey-triggered` emit
   - `phase: "press"`
   - `phase: "release"`

안정성 포인트:

- 이미 눌린 키의 중복 press 이벤트는 무시
- 다중 키 조합 해제 시 중복 dispatch를 방지하도록 상태 기반 계산

## 6) Window 제어 흐름

- `window_show(id)`:
  - 창이 없으면 config에서 재생성 후 show
- `window_toggle(id)`:
  - 있으면 visible 토글
  - 없으면 재생성 후 show
- `window_hide/close`:
  - 기존 창이 있어야 동작

즉, 실수로 창을 닫아도 `show/toggle`로 복구 가능한 설계입니다.

## 7) Dev 모드에서 일어나는 일

`whale dev` 실행 시:

1. `whale.config.ts` 로드
2. `.whale/*.html` + bootstrap 엔트리 생성
3. `.whale/tauri.conf.json` 생성
4. Vite dev server 시작
5. Rust가 있으면 Tauri dev 실행
6. debug에서는 F12로 `__devtools__` 토글

Rust가 없거나 `WHALE_SKIP_TAURI=1`이면 5번을 건너뛰고 프론트엔드-only 모드로 동작합니다.
