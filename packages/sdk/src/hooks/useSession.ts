import { createSignal, getOwner, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Session, Script } from '../types'
import { safeInvoke, safeInvokeVoid, safeListen } from '../tauri'

export interface SessionHandle {
  status: Accessor<'attached' | 'detached'>
  loadScript(code: string): Promise<Script>
  loadScriptFile(path: string): Promise<Script>
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
    loadScript: async (code: string) => {
      const scriptId = await safeInvoke<string>('frida_load_script', { sessionId: session.id, code })
      if (!scriptId) throw new Error('Failed to load script')
      return { id: scriptId }
    },
    loadScriptFile: async (path: string) => {
      const scriptId = await safeInvoke<string>('frida_load_script_file', { sessionId: session.id, path })
      if (!scriptId) throw new Error('Failed to load script file')
      return { id: scriptId }
    },
    detach: () => { safeInvokeVoid('frida_detach', { sessionId: session.id }); setStatus('detached') },
  }
}
