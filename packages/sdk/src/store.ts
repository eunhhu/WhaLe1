import { createStore, produce } from 'solid-js/store'
import { getOwner, onCleanup } from 'solid-js'
import type { SyncStore } from './types'
import {
  getCurrentWindowLabel,
  safeInvokeVoid,
  safeListen,
} from './tauri'

type StoreRecord = Record<string, unknown>
type StoreKey<T extends StoreRecord> = Extract<keyof T, string>

function isStoreKey<T extends StoreRecord>(store: T, key: string): key is StoreKey<T> {
  return Object.prototype.hasOwnProperty.call(store, key)
}

function toSetterField<T extends StoreRecord>(
  setterName: string,
  defaults: T,
): StoreKey<T> | undefined {
  if (!setterName.startsWith('set') || setterName.length <= 3) return undefined
  const field = setterName[3].toLowerCase() + setterName.slice(4)
  return isStoreKey(defaults, field) ? field : undefined
}

export function createSyncStore<T extends StoreRecord>(
  name: string,
  defaults: T,
): SyncStore<T> {
  const [store, setStore] = createStore<T>({ ...defaults })

  // Rust에 store 등록
  safeInvokeVoid('store_register', { name, defaults })

  // 현재 윈도우의 구독 등록 — defaults의 모든 키를 구독
  const keys = Object.keys(defaults) as StoreKey<T>[]
  const windowLabel = getCurrentWindowLabel()
  if (windowLabel) {
    safeInvokeVoid('store_subscribe', { name, window: windowLabel, keys })
  }

  // Tauri 이벤트 수신 — 다른 윈도우 또는 Frida에서 변경된 값 반영
  const unlisten = safeListen<{ store: string; patch: Partial<T> }>(
    'store:changed',
    (event) => {
      if (event.payload.store !== name) return
      setStore(
        produce((s: T) => {
          for (const [key, value] of Object.entries(event.payload.patch)) {
            if (!isStoreKey(defaults, key)) continue
            s[key] = value as T[StoreKey<T>]
          }
        }),
      )
    },
  )

  // Cleanup
  if (getOwner()) {
    onCleanup(() => {
      unlisten.then((fn) => fn())
      if (windowLabel) {
        safeInvokeVoid('store_unsubscribe', { name, window: windowLabel })
      }
    })
  }

  // Proxy로 getter/setter 제공
  return new Proxy(store, {
    get(target: T, prop: string | symbol, receiver: unknown) {
      if (typeof prop !== 'string') {
        return Reflect.get(target as object, prop, receiver)
      }

      // setXxx 패턴 감지
      const field = toSetterField(prop, defaults)
      if (field) {
        return (value: T[typeof field]) => {
          setStore(
            produce((s: T) => {
              s[field] = value
            }),
          )
          safeInvokeVoid('store_set', { name, key: field, value })
        }
      }

      if (isStoreKey(defaults, prop)) {
        return target[prop]
      }

      return Reflect.get(target as object, prop, receiver)
    },
  }) as SyncStore<T>
}
