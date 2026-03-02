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
      console.log('[whale:sdk] loadScript: session', session.id, 'storeName', storeName ?? '(none)')
      const scriptId = await safeInvoke<string>('frida_load_script', { sessionId: session.id, code, storeName: storeName ?? null })
      if (!scriptId) throw new Error('Failed to load script')
      console.log('[whale:sdk] loadScript: loaded', scriptId)
      return { id: scriptId }
    },
    loadScriptFile: async (path: string, storeName?: string) => {
      console.log('[whale:sdk] loadScriptFile: session', session.id, 'path', path, 'storeName', storeName ?? '(none)')
      const scriptId = await safeInvoke<string>('frida_load_script_file', { sessionId: session.id, path, storeName: storeName ?? null })
      if (!scriptId) throw new Error('Failed to load script file')
      console.log('[whale:sdk] loadScriptFile: loaded', scriptId)
      return { id: scriptId }
    },
    unloadScript: async (scriptId: string) => {
      console.log('[whale:sdk] unloadScript:', scriptId)
      await safeInvokeVoid('frida_unload_script', { scriptId })
      console.log('[whale:sdk] unloadScript: done')
    },
    detach: () => {
      console.log('[whale:sdk] detach: session', session.id)
      safeInvokeVoid('frida_detach', { sessionId: session.id })
      setStatus('detached')
    },
  }
}
