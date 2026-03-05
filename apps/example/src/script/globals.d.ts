// Store 전역 변수 타입 선언
// ─────────────────────────────────────────────
// 런타임에서 Rust가 frida.scripts[].store 이름을 기반으로
// __<name>__ 전역 변수를 스크립트에 자동 주입합니다.
//
// store 추가 시:
//   1. store/yourstore.ts 에 createSyncStore 생성
//   2. 아래 declare global 블록에 import type + declare const 추가
//   3. whale.config.ts frida.scripts 에 { entry, store: 'yourstore' } 추가
// ─────────────────────────────────────────────

import type { trainer } from '../../store/trainer'

/** Frida 스크립트 안에서 store에 접근하는 전역 타입 */
type StoreGlobal<T> = {
  readonly [K in keyof T]: T[K]
} & {
  /** store 값을 변경하고 UI에 자동 동기화 */
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare global {
  const __trainer__: StoreGlobal<typeof trainer>
}

export {}
