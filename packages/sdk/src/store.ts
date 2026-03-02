import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { createStore, produce } from 'solid-js/store'
import { onCleanup } from 'solid-js'
import type { SyncStore } from './types'

export function createSyncStore<T extends Record<string, any>>(
  name: string,
  defaults: T,
): SyncStore<T> {
  const [store, setStore] = createStore<T>({ ...defaults })

  // Rust에 store 등록
  invoke('store_register', { name, defaults })

  // 현재 윈도우의 구독 등록 — defaults의 모든 키를 구독
  const keys = Object.keys(defaults)
  let windowLabel: string | undefined
  try {
    windowLabel = getCurrentWebviewWindow().label
    invoke('store_subscribe', { name, window: windowLabel, keys })
  } catch {
    // Tauri 환경이 아닌 경우 (테스트 등) 무시
  }

  // Tauri 이벤트 수신 — 다른 윈도우 또는 Frida에서 변경된 값 반영
  const unlisten = listen<{ store: string; patch: Partial<T> }>(
    'store:changed',
    (event) => {
      if (event.payload.store !== name) return
      setStore(
        produce((s: T) => {
          for (const [key, value] of Object.entries(event.payload.patch)) {
            ;(s as any)[key] = value
          }
        }),
      )
    },
  )

  // Cleanup
  try {
    onCleanup(() => {
      unlisten.then((fn) => fn())
      if (windowLabel) {
        invoke('store_unsubscribe', { name, window: windowLabel })
      }
    })
  } catch {
    // onCleanup은 컴포넌트 바깥에서 호출 시 무시
  }

  // Proxy로 getter/setter 제공
  return new Proxy(store, {
    get(target, prop: string) {
      // setXxx 패턴 감지
      if (prop.startsWith('set') && prop.length > 3) {
        const field = prop[3].toLowerCase() + prop.slice(4)
        return (value: any) => {
          setStore(
            produce((s: T) => {
              ;(s as any)[field] = value
            }),
          )
          invoke('store_set', { name, key: field, value })
        }
      }
      return (target as any)[prop]
    },
  }) as SyncStore<T>
}
