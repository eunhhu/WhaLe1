// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComponent, type JSX } from 'solid-js'
import { render } from 'solid-js/web'
import { Button } from '../components/Button'
import { IconButton } from '../components/IconButton'
import { Slider } from '../components/Slider'
import { Switch } from '../components/Switch'
import { ThemeProvider } from '../components/ThemeProvider'

function mount(component: () => JSX.Element) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(component, host)
  return { host, dispose }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-transparent')
  document.body.removeAttribute('data-transparent')
  document.documentElement.style.removeProperty('background')
  document.documentElement.style.removeProperty('background-color')
  document.body.style.removeProperty('background')
  document.body.style.removeProperty('background-color')
})

describe('ui components', () => {
  it('composes Switch onClick without breaking toggle behavior', async () => {
    const onClick = vi.fn()
    const onChange = vi.fn()
    const { host, dispose } = mount(() => createComponent(Switch, { onClick, onChange }))

    host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(host.querySelector('button')?.getAttribute('aria-checked')).toBe('true')
    dispose()
  })

  it('updates Slider label in uncontrolled mode', async () => {
    const { host, dispose } = mount(() => createComponent(Slider, { min: 0, max: 100 }))
    const input = host.querySelector('input')
    expect(input).not.toBeNull()

    ;(input as HTMLInputElement).value = '75'
    input?.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()

    expect(host.querySelector('span')?.textContent).toBe('75')
    dispose()
  })

  it('defaults Button and IconButton to type=button', () => {
    const buttonMount = mount(() =>
      createComponent(Button, {
        get children() {
          return 'Click'
        },
      }),
    )
    expect(buttonMount.host.querySelector('button')?.getAttribute('type')).toBe('button')
    buttonMount.dispose()

    const iconMount = mount(() =>
      createComponent(IconButton, {
        get children() {
          return '+'
        },
      }),
    )
    expect(iconMount.host.querySelector('button')?.getAttribute('type')).toBe('button')
    iconMount.dispose()
  })

  it('keeps transparent globals until the last ThemeProvider unmounts', () => {
    const first = mount(() =>
      createComponent(ThemeProvider, {
        transparent: true,
        get children() {
          return 'one'
        },
      }),
    )
    const second = mount(() =>
      createComponent(ThemeProvider, {
        transparent: true,
        get children() {
          return 'two'
        },
      }),
    )

    expect(document.documentElement.getAttribute('data-transparent')).toBe('true')

    first.dispose()
    expect(document.documentElement.getAttribute('data-transparent')).toBe('true')

    second.dispose()
    expect(document.documentElement.getAttribute('data-transparent')).toBeNull()
  })
})
