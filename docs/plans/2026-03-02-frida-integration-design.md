# frida-rust 풀 구현 디자인

**Date:** 2026-03-02
**Approach:** FridaManager에 frida-rust 직접 통합, auto-download feature

## 1. 개요

현재 `packages/tauri-runtime`의 Frida 관련 코드는 전부 스텁. frida-rust crate를 `auto-download` feature로 추가하여 실제 device enumeration, process attach/spawn, script load/execute를 구현한다.

### 핵심 원칙
- **Config는 "무엇을"** — whale.config.ts에 scripts 선언적 등록
- **코드는 "어떻게"** — 메인 코드에서 device/session/attach 프로그래매틱 작성
- **UI 변경 없음** — 모든 Frida 진행 상황은 로깅으로 확인
- **타입 자동 추론** — script types.ts 삭제, store defaults에서 추론

## 2. Cargo.toml 의존성

```toml
[dependencies]
frida = { version = "0.17", features = ["auto-download"] }
```

- `auto-download` feature로 빌드 시 Frida devkit 자동 다운로드
- 별도 환경 설정 불필요

## 3. FridaManager 재설계

기존 `HashMap<String, SessionInfo>` 메모리 추적 → 실제 frida-rust 객체 보관:

```rust
pub struct FridaManager {
    frida: frida::Frida,
    sessions: Mutex<HashMap<String, FridaSessionEntry>>,
    scripts: Mutex<HashMap<String, FridaScriptEntry>>,
}

struct FridaSessionEntry {
    session: frida::Session,
    device_id: String,
    pid: u32,
}

struct FridaScriptEntry {
    script: frida::Script,
    session_id: String,
}
```

Thread safety: frida-rust 객체가 `Send`가 아닐 경우 unsafe Send wrapper 또는 전용 스레드로 처리.

## 4. Tauri Commands — 스텁 → 실제 구현

| Command | 현재 | 변경 후 |
|---------|------|---------|
| `frida_list_devices` | 로컬만 반환 | `DeviceManager::enumerate_devices()` 실제 호출 |
| `frida_spawn` | 에러 반환 | `Device::spawn()` 실제 호출 |
| `frida_attach` | session_id만 생성 | `Device::attach(pid)` 실제 호출 |
| `frida_load_script` | 프리앰블만 조합 | `Session::create_script()` + `script.load()` |
| `frida_detach` | 메모리에서만 제거 | `Session::detach()` 실제 호출 |

### 새 Commands 추가

| Command | 용도 |
|---------|------|
| `frida_enumerate_processes` | Device의 실행 중인 프로세스 목록 |
| `frida_resume` | spawn 후 프로세스 resume |
| `frida_unload_script` | 스크립트 언로드 |

### Script Message Callback → Bridge 연결

```
Frida Script send() → frida-rust message callback
  → bridge::handle_frida_message(app, &message)
    → __whale 마커 감지 → StoreManager 업데이트 → store:changed emit
      → 모든 윈도우 UI 반응형 업데이트
```

기존 bridge.rs 파이프라인 그대로 활용. callback만 연결하면 됨.

## 5. whale.config.ts — frida 섹션 추가

```typescript
export default defineConfig({
  app: { ... },
  windows: { ... },
  frida: {
    scripts: [
      { entry: './src/script/main.ts', store: 'trainer' }
    ],
  },
  store: { persist: true },
})
```

- `FridaConfig` 타입을 `WhaleConfig`에 추가
- scripts: entry(스크립트 경로) + store(연결할 store 이름) 매핑
- CLI가 config 파싱 → 빌드 시 스크립트 번들링 또는 런타임에 Rust로 전달

## 6. Frida Script tsconfig 분리

```
apps/example/src/script/
  tsconfig.json      ← frida-gum 타입 자동 포함
  main.ts            ← /// <reference> 불필요
```

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "types": ["frida-gum"],
    "strict": true,
    "noEmit": true
  },
  "include": ["./**/*.ts"]
}
```

- UI 코드(`src/ui/`)와 Frida 스크립트(`src/script/`) 타입 환경 완전 분리
- `/// <reference types="frida-gum" />` 제거
- `__whale_store__` 타입은 store defaults에서 자동 추론 (types.ts 삭제)

## 7. SDK Hooks 변경

기존 IPC 인터페이스 동일 → 대부분 변경 없음.

**추가:**
- `useDevice`에 `enumerateProcesses()` 메서드
- `useSession`에 symbol 기반 `loadScript(name)` — config에 등록된 이름으로 로드
- `useSession`에 `unloadScript(scriptId)` 메서드
- `types.ts`에 `Process` 타입 추가

## 8. Example 앱 — session 모듈

```
apps/example/src/frida/
  session.ts    — device 연결 → attach → script load 플로우
```

```typescript
import { useDevice, useSession } from '@whale/sdk'
import { createEffect } from 'solid-js'

export function setupTrainer() {
  const device = useDevice({ type: 'local' })

  createEffect(() => {
    if (device.status() !== 'connected') return
    console.log('[frida] device connected:', device.device()?.name)

    device.attach(targetPid).then(session => {
      console.log('[frida] attached to pid:', session.pid)
      const handle = useSession(session)
      handle.loadScript('trainer').then(script => {
        console.log('[frida] script loaded:', script.id)
      })
    })
  })
}
```

main.tsx에서 `setupTrainer()` 호출. UI 변경 없음.

## 9. 로깅

**Rust:**
- `[whale:frida] listing devices...`
- `[whale:frida] found N devices`
- `[whale:frida] spawning {bundle_id} on {device_id}`
- `[whale:frida] attached to pid N, session_id=...`
- `[whale:frida] loading script (N bytes) on session_id`
- `[whale:frida] script message: {...}`
- `[whale:frida] session detached: session_id`

**SDK:**
- `[whale:sdk] useDevice: searching for device...`
- `[whale:sdk] useDevice: connected to {name}`
- `[whale:sdk] useSession: loading script...`
- `[whale:sdk] useSession: detached`

## 10. 디바이스 지원 범위

- Local (PC 게임 트레이너)
- USB (iOS/Android 모바일)
- Remote (frida-server IP 연결)

모두 frida-rust의 `DeviceManager::enumerate_devices()`로 자동 열거.
