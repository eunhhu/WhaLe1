import { Component, JSX, createEffect, onCleanup } from 'solid-js'
import type { WhaleTheme } from '../theme/themes'
import { darkTheme } from '../theme/themes'
import { globalResetStyles } from '../theme/global-styles'

let transparentProviderCount = 0

function applyTransparentGlobals(): void {
  document.documentElement.setAttribute('data-transparent', 'true')
  document.body.setAttribute('data-transparent', 'true')
  document.documentElement.style.setProperty('background', 'transparent', 'important')
  document.documentElement.style.setProperty('background-color', 'transparent', 'important')
  document.body.style.setProperty('background', 'transparent', 'important')
  document.body.style.setProperty('background-color', 'transparent', 'important')
}

function clearTransparentGlobals(): void {
  document.documentElement.removeAttribute('data-transparent')
  document.body.removeAttribute('data-transparent')
  document.documentElement.style.removeProperty('background')
  document.documentElement.style.removeProperty('background-color')
  document.body.style.removeProperty('background')
  document.body.style.removeProperty('background-color')
}

export interface ThemeProviderProps {
  theme?: WhaleTheme
  transparent?: boolean
  children: JSX.Element
}

export const ThemeProvider: Component<ThemeProviderProps> = (props) => {
  let styleEl: HTMLStyleElement | undefined
  let transparentApplied = false

  const syncTransparentGlobals = (enabled: boolean) => {
    if (enabled === transparentApplied) return
    transparentApplied = enabled

    if (enabled) {
      transparentProviderCount += 1
      applyTransparentGlobals()
      return
    }

    transparentProviderCount = Math.max(transparentProviderCount - 1, 0)
    if (transparentProviderCount === 0) {
      clearTransparentGlobals()
    }
  }

  createEffect(() => {
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.setAttribute('data-whale-theme', '')
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = globalResetStyles

    syncTransparentGlobals(Boolean(props.transparent))
  })

  onCleanup(() => {
    styleEl?.remove()
    syncTransparentGlobals(false)
  })

  const theme = () => props.theme ?? darkTheme

  const style = (): JSX.CSSProperties => {
    const t = theme()
    const vars: Record<string, string> = {}
    for (const [key, value] of Object.entries(t)) {
      vars[key] = value
    }
    return {
      ...vars,
      width: '100%',
      height: '100%',
      background: props.transparent ? 'transparent' : 'var(--whale-bg)',
      color: 'var(--whale-text)',
    } as JSX.CSSProperties
  }

  return (
    <div data-whale-theme-root="" style={style()}>
      {props.children}
    </div>
  )
}
