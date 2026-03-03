# WhaLe

WhaLe는 **Tauri + SolidJS + Frida + rdev** 기반의 게임 트레이너 프레임워크입니다.

핵심 목표는 하나입니다.

- UI(TypeScript/Solid)에서 상태를 바꾸면
- Rust 백엔드와 Frida 스크립트가 같은 상태를 공유하고
- 여러 윈도우(메인/오버레이/설정)가 즉시 동기화됩니다.

## 한눈에 보기

```txt
packages/
  cli/            whale CLI (dev/build/create/config)
  sdk/            앱 코드에서 쓰는 훅/스토어 API
  ui/             공통 UI 컴포넌트
  tauri-runtime/  Rust 런타임 (window/input/frida/store)
apps/
  example/        실행 가능한 예제 앱
assets/
  icon.png        기본 앱 아이콘 소스
```

## 빠른 시작

### 1) 요구 사항

- `bun`
- `node`/`npx` (Tauri CLI 실행용)
- Rust 툴체인(`cargo`)은 선택 사항

Rust가 없으면 프론트엔드-only 모드로 실행 가능합니다.

### 2) 설치

```bash
bun install
```

### 3) 예제 앱 실행

루트에서 바로 실행:

```bash
bun --filter whale-example-trainer dev
```

또는 example 디렉터리에서:

```bash
cd apps/example
bun run dev
```

### 4) Rust 없는 개발 환경 (안전 모드)

```bash
WHALE_SKIP_TAURI=1 bun --filter whale-example-trainer dev
```

이 모드에서는 Vite/HMR과 UI 개발은 가능하지만, Tauri 네이티브 기능(윈도우 제어, 글로벌 입력, Frida 연결)은 동작하지 않습니다.

## 자주 쓰는 개념

### 1) Sync Store

```ts
import { createSyncStore } from '@whale1/sdk'

export const trainer = createSyncStore('trainer', {
  speedHack: 1.0,
  godMode: false,
})

trainer.setGodMode(true)
```

- `setXxx` 호출 시 UI 상태를 먼저 반영하고, Rust `store_set`으로 동기화합니다.
- 초기 마운트 때 `store_get_all`로 persisted 상태를 다시 가져와 UI를 hydrate 합니다.

### 2) 글로벌 핫키 (press/release 구분)

```ts
import { useHotkey } from '@whale1/sdk'

useHotkey(['ctrl', 'f1'], {
  onPress: () => console.log('pressed'),
  onRelease: () => console.log('released'),
})
```

### 3) 윈도우 제어

```ts
import { useWindow } from '@whale1/sdk'

const overlay = useWindow('overlay')
overlay.toggle()
```

- `show`/`toggle`는 닫힌 윈도우도 config 기반으로 다시 생성해서 열 수 있습니다.

### 4) Frida 세션

```ts
import { useDevice, useSession } from '@whale1/sdk'

const device = useDevice({ type: 'local' })
const session = await device.attach(1234)
const handle = useSession(session)
await handle.loadScriptFile('./src/script/main.ts', 'trainer')
```

## CLI

- `whale dev`: 개발 실행 (HTML 엔트리 + tauri.conf 생성 + Vite + Tauri)
- `whale build`: 프로덕션 빌드
- `whale create <name>`: 새 프로젝트 생성
- `whale config:generate [out]`: Tauri 설정 파일 생성
- `whale clean [--all]`: `.whale`, `src-tauri/target` 정리 (`--all`은 `node_modules` 포함)

## 생성/동기화되는 파일

`whale dev` 기준으로 아래가 자동 처리됩니다.

- `.whale/*.html` / `.whale/__whale_entry_*.ts`
- `.whale/tauri.conf.json`
- `src-tauri` 미존재 시 `tauri init` 자동 실행
- `src-tauri/capabilities/default.json`의 windows 목록 자동 동기화
- 아이콘 소스(`app.icon` 또는 `assets/icon.png`) 기준으로 `src-tauri/icons/*` 재생성

## 문서

- [문서 인덱스](./docs/README.md)
- [아키텍처](./docs/architecture.md)
- [SDK API](./docs/api/sdk.md)
- [설정 가이드](./docs/config.md)
- [개발/디버깅 가이드](./docs/dev-and-troubleshooting.md)

## 테스트

```bash
bun test
```

현재 테스트는 `packages/*`의 Vitest 기반 단위/통합 테스트를 실행합니다.

## 라이선스

MIT
