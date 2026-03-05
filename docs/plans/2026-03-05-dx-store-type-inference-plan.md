# DX 강화: Store 타입 자동 추론 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Frida 스크립트에서 `__trainer__` 등 store별 전역 변수를 타입 안전하게 사용, `whale-store.d.ts` 이중 유지 제거

**Architecture:** Frida tsconfig에 `moduleResolution: bundler` 추가 → `globals.d.ts`에서 store 파일의 `typeof` 타입을 `import type`으로 직접 참조. 런타임은 Rust가 이미 `__trainer__` 이름으로 preamble을 주입하므로 타입 선언만 맞추면 됨.

**Tech Stack:** TypeScript (strict), Frida GUM, @whale1/sdk `createSyncStore`

---

### Task 1: Frida tsconfig 업데이트

**Files:**
- Modify: `apps/example/src/script/tsconfig.json`

**Step 1: 파일 수정**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "types": ["frida-gum"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts", "./**/*.d.ts"]
}
```

**Step 2: 타입 체크**

```bash
bun x tsc --noEmit -p apps/example/src/script/tsconfig.json
```

Expected: 에러 없음 (globals.d.ts 아직 없으므로 whale-store.d.ts 기존 에러만 있을 수 있음)

---

### Task 2: `globals.d.ts` 생성 (whale-store.d.ts 대체)

**Files:**
- Create: `apps/example/src/script/globals.d.ts`
- Delete: `apps/example/src/script/whale-store.d.ts`

**Step 1: globals.d.ts 생성**

```ts
// apps/example/src/script/globals.d.ts
// Store 전역 변수 타입 선언 — store 추가 시 이 파일에 한 줄 추가
// 런타임에서 Rust가 frida.scripts[].store 이름으로 preamble 주입함

import type { trainer } from '../../store/trainer'

type StoreGlobal<T> = {
  readonly [K in keyof T]: T[K]
} & {
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare const __trainer__: StoreGlobal<typeof trainer>
```

**Step 2: whale-store.d.ts 삭제**

```bash
rm apps/example/src/script/whale-store.d.ts
```

**Step 3: 타입 체크**

```bash
bun x tsc --noEmit -p apps/example/src/script/tsconfig.json
```

Expected: 에러 없음

---

### Task 3: `main.ts` 업데이트 — `__whale_store__` → `__trainer__`

**Files:**
- Modify: `apps/example/src/script/main.ts`

**Step 1: `__whale_store__` 를 `__trainer__` 로 전체 치환**

모든 `__whale_store__` 참조를 `__trainer__` 로 변경.

**Step 2: 타입 체크**

```bash
bun x tsc --noEmit -p apps/example/src/script/tsconfig.json
```

Expected: 에러 없음

---

### Task 4: Rust preamble 변수명 확인

**Files:**
- Read: `packages/tauri-runtime/src/state/frida_state.rs` (또는 bridge.rs)

preamble 주입 코드에서 전역 변수 이름이 `__whale_store__`로 하드코딩되어 있는지 확인.
만약 `store` 필드 이름을 그대로 `__<store>__` 형태로 변환한다면 이미 `__trainer__`로 주입됨 → 변경 불필요.
만약 `__whale_store__`로 하드코딩되어 있다면 `__<storeName>__` 패턴으로 수정 필요.

**Step 1: 확인 명령**

```bash
grep -r "__whale_store__\|preamble\|whale_store" packages/tauri-runtime/src/
```

**Step 2: 필요 시 Rust 수정**

preamble 생성 부분에서 store 이름(`storeName`)을 `__<storeName>__` 형태로 변수명에 반영.

**Step 3: Rust 빌드 (변경 시)**

```bash
# tauri-runtime은 whale dev/build 시 자동 빌드됨
# 변경 없으면 skip
```

---

### Task 5: docs 업데이트

**Files:**
- Modify: `docs/api/sdk.md` — store 추가 시 globals.d.ts 패턴 설명
- Modify: `README.md` — starter 구성에서 whale-store.d.ts 제거 확인
- Modify: `docs/config.md` — frida.scripts[].store 이름이 __<store>__ 전역과 연결됨을 명시

**Step 1: docs/api/sdk.md에 섹션 추가**

`## Frida 스크립트에서 Store 사용` 섹션 추가:

```markdown
## Frida 스크립트에서 Store 사용

### store별 전역 변수

`whale.config.ts`의 `frida.scripts[].store` 필드에 store 이름을 지정하면,
런타임이 `__<name>__` 전역 변수를 스크립트에 자동 주입합니다.

```ts
// whale.config.ts
frida: {
  scripts: [{ entry: './src/script/main.ts', store: 'trainer' }]
}
// → Frida 스크립트 안에서 __trainer__ 사용 가능
```

### 타입 선언 (globals.d.ts)

store 추가 시 `src/script/globals.d.ts`에 한 줄 추가:

```ts
import type { trainer } from '../../store/trainer'
import type { esp } from '../../store/esp'

type StoreGlobal<T> = { readonly [K in keyof T]: T[K] } & {
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare const __trainer__: StoreGlobal<typeof trainer>
declare const __esp__: StoreGlobal<typeof esp>
```

store 파일의 타입이 바뀌면 자동으로 반영됩니다. 별도 `.d.ts` 이중 유지 불필요.
```

---

### Task 6: 전체 타입 체크 및 검증

**Step 1: SDK + example 앱 타입 체크**

```bash
bun x tsc --noEmit -p packages/sdk/tsconfig.json
bun x tsc --noEmit -p apps/example/tsconfig.json
bun x tsc --noEmit -p apps/example/src/script/tsconfig.json
```

Expected: 모두 에러 없음

**Step 2: SDK 테스트**

```bash
bun x vitest --run --dir packages/sdk
```

Expected: 전체 통과

**Step 3: Commit**

```bash
git add apps/example/src/script/ docs/
git commit -m "feat(dx): replace whale-store.d.ts with globals.d.ts using import type inference"
```
