export interface TrainerScriptState {
  speedHack: number
  godMode: boolean
  infiniteAmmo: boolean
  noRecoil: boolean
  fov: number
}

export interface TrainerScriptStore extends TrainerScriptState {
  set<K extends keyof TrainerScriptState>(key: K, value: TrainerScriptState[K]): void
}

declare global {
  const __whale_store__: TrainerScriptStore
}

export {}
