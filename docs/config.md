# whale.config.ts 가이드

`whale.config.ts`는 WhaLe 앱의 단일 설정 진입점입니다.

## 기본 형태

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

## app

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | `string` | 앱 이름. Tauri `productName` 및 기본 window title의 기준값 |
| `version` | `string` | 앱 버전 |
| `identifier` | `string` | 번들 식별자 (예: `com.company.app`) |
| `icon?` | `string` | 아이콘 원본 파일 경로 |

아이콘 해석 순서:

1. `app.icon` 경로가 존재하면 해당 파일 사용
2. 없으면 프로젝트 또는 상위 워크스페이스의 `assets/icon.png` 탐색
3. 둘 다 없으면 Tauri 기본 아이콘 세트 사용

## windows

`Record<string, WindowConfig>` 형태입니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `entry` | `string` | 각 window의 TS/TSX 엔트리 파일 |
| `title?` | `string` | 창 제목. 미지정 시 `app.name` 사용 |
| `width?`, `height?` | `number` | 창 크기 |
| `resizable?` | `boolean` | 리사이즈 허용 여부 |
| `alwaysOnTop?` | `boolean` | 항상 위 |
| `transparent?` | `boolean` | 투명 창 |
| `decorations?` | `boolean` | 타이틀바/프레임 표시 여부 |
| `shadow?` | `boolean` | 그림자 |
| `skipTaskbar?` | `boolean` | 작업표시줄 표시 여부 |
| `visible?` | `boolean` | 초기 표시 여부 |
| `position?` | `{x:number,y:number} | string` | 초기 위치 |
| `clickThrough?` | `boolean` | 타입은 존재하지만 현재 runtime 직접 연동 없음 |

참고:

- 개발 모드에서는 `__devtools__` window가 자동 추가됩니다.

## frida

| 필드 | 타입 | 설명 |
|---|---|---|
| `scripts` | `{ entry: string; store?: string }[]` | attach 시 자동 로드할 Frida 스크립트 목록 |

- `entry`는 실제 파일이어야 하며, `whale dev/build`에서 존재 여부를 검증합니다.
- `store`를 지정하면 runtime이 `__<name>__` 전역 preamble을 주입합니다.
- `useSession(device, { scripts: whaleConfig.frida?.scripts })` 패턴으로 전달하면 attach 후 자동 로드됩니다. 별도 `loadScripts()` 호출이 필요 없습니다.
- `store` 이름은 Frida 스크립트 안에서 `__<name>__` 전역 변수로 접근합니다. 예: `store: 'trainer'` → `__trainer__`
- `store` 이름에 `-`/`.` 같은 문자가 있으면 런타임에서 `_`로 정규화한 전역명을 사용합니다. 예: `my-store.v1` → `__my_store_v1__`
- 타입은 `src/script/globals.d.ts`에서 `import type`으로 자동 추론 (이중 유지 불필요)

## store

| 필드 | 타입 | 설명 |
|---|---|---|
| `persist?` | `boolean` | 설정 타입상 존재 |
| `persistPath?` | `string` | 설정 타입상 존재 |

주의:

- 현재 runtime 저장 경로는 `app_data_dir()/whale_stores.json`로 고정이며, on/off는 runtime command로 제어합니다.
- 즉 `store.persist`, `store.persistPath`는 현재 버전에서 CLI/runtime 동작에 직접 반영되지 않습니다.

## build

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `outDir?` | `string` | `.whale` | 생성 파일 출력 디렉터리 |
| `devHost?` | `string` | `127.0.0.1` | dev server host |
| `devPort?` | `number` | `1420` | dev server port |
| `devUrl?` | `string` | `http://{host}:{port}` | dev URL 직접 지정 |
| `beforeDevCommand?` | `string` | `""` | Tauri before dev command |
| `beforeBuildCommand?` | `string` | `""` | Tauri before build command |

우선순위 요약:

- `devUrl`이 있으면 URL에서 host/port 파생
- 없으면 `build.devHost/devPort`
- 없으면 env(`WHALE_DEV_HOST`, `WHALE_DEV_PORT`)
- 없으면 기본값

## 환경 변수

| 변수 | 설명 |
|---|---|
| `WHALE_SKIP_TAURI=1` | Rust/Tauri 실행을 건너뛰고 프론트엔드-only dev/build |
| `WHALE_DEV_HOST` | dev host override |
| `WHALE_DEV_PORT` | dev port override |
| `TAURI_DEV_HOST` | `WHALE_DEV_HOST`가 없을 때 fallback |

## 실무 팁

- window title/app name을 config에서 일관되게 관리하면 생성 HTML title + Tauri window title이 함께 맞춰집니다.
- 아이콘은 한 파일(`assets/icon.png`)을 소스로 관리하고 CLI가 플랫폼별 아이콘을 재생성하게 두는 방식이 유지보수에 가장 쉽습니다.
