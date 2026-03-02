// Type declaration for __whale_store__ (matches createSyncStore defaults in store/trainer.ts)
// Included via src/script/tsconfig.json

interface WhaleStore {
  speedHack: number
  godMode: boolean
  infiniteAmmo: boolean
  noRecoil: boolean
  fov: number
  set<K extends keyof WhaleStore>(key: K, value: WhaleStore[K]): void
}

declare const __whale_store__: WhaleStore
