interface WhaleStore {
  count: number
  set<K extends keyof WhaleStore>(key: K, value: WhaleStore[K]): void
}

declare const __whale_store__: WhaleStore
