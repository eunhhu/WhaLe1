import { createSignal, getOwner, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Session, Script } from '../types'
import { safeInvoke, safeInvokeVoid, safeListen } from '../tauri'

export interface SessionHandle {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string, storeName?: string): Promise<Script>
  loadScriptFile(path: string, storeName?: string): Promise<Script>
  unloadScript(scriptId: string): Promise<void>
  detach(): void
}

export function useSession(session: Session): SessionHandle {
  const [status, setStatus] = createSignal<'attached' | 'detached'>('attached')
  const unlisten = safeListen<{ sessionId: string }>('frida:session-detached', (event) => {
    if (event.payload.sessionId === session.id) setStatus('detached')
  })
  if (getOwner()) onCleanup(() => { unlisten.then((fn) => fn()) })
  return {
    status,
    loadScript: async (code: string, storeName?: string) => {
      const payload = typeof storeName === 'string'
        ? { sessionId: session.id, code, storeName }
        : { sessionId: session.id, code }
      const scriptId = await safeInvoke<string>('frida_load_script', payload)
      if (!scriptId) throw new Error('Failed to load script')
      return { id: scriptId }
    },
    loadScriptFile: async (path: string, storeName?: string) => {
      const payload = typeof storeName === 'string'
        ? { sessionId: session.id, path, storeName }
        : { sessionId: session.id, path }
      const scriptId = await safeInvoke<string>('frida_load_script_file', payload)
      if (!scriptId) throw new Error('Failed to load script file')
      return { id: scriptId }
    },
    unloadScript: async (scriptId: string) => {
      await safeInvokeVoid('frida_unload_script', { scriptId })
    },
    detach: () => {
      safeInvokeVoid('frida_detach', { sessionId: session.id })
      setStatus('detached')
    },
  }
}
