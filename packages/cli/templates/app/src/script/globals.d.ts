import type { app } from '../../store/app'

type StoreGlobal<T> = {
  readonly [K in keyof T]: T[K]
} & {
  set<K extends keyof T>(key: K, value: T[K]): void
}

declare global {
  const __app__: StoreGlobal<typeof app>
}

export {}
