import { Component, JSX, splitProps, mergeProps, createSignal, createEffect } from 'solid-js'
import { colors, radius, transition } from '../theme/tokens'

export interface SwitchProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>
  disabled?: boolean
  style?: JSX.CSSProperties
}

const TRACK_WIDTH = 40
const TRACK_HEIGHT = 22
const THUMB_SIZE = 16
const THUMB_OFFSET = 2
type SwitchClickEvent = MouseEvent & {
  currentTarget: HTMLButtonElement
  target: Element
}

export const Switch: Component<SwitchProps> = (props) => {
  const merged = mergeProps({ disabled: false }, props)
  const [local, rest] = splitProps(merged, ['checked', 'onChange', 'disabled', 'style', 'onClick'])

  const [internalChecked, setInternalChecked] = createSignal(Boolean(local.checked))
  const isControlled = () => typeof local.checked === 'boolean'
  const isChecked = () => (isControlled() ? Boolean(local.checked) : internalChecked())

  // Keep internal state aligned when switching controlled values.
  createEffect(() => {
    if (isControlled()) {
      setInternalChecked(Boolean(local.checked))
    }
  })

  const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (local.onClick) {
      if (typeof local.onClick === 'function') {
        local.onClick(event as SwitchClickEvent)
      } else {
        const bound = local.onClick as JSX.BoundEventHandler<
          HTMLButtonElement,
          MouseEvent
        >
        bound[0](bound[1], event as SwitchClickEvent)
      }
    }
    if (event.defaultPrevented) return
    if (local.disabled) return
    const next = !isChecked()
    if (!isControlled()) {
      setInternalChecked(next)
    }
    local.onChange?.(next)
  }

  const trackStyle = (): JSX.CSSProperties => ({
    width: `${TRACK_WIDTH}px`,
    height: `${TRACK_HEIGHT}px`,
    'border-radius': `${TRACK_HEIGHT / 2}px`,
    background: isChecked() ? colors.accent : colors.border,
    appearance: 'none',
    padding: '0',
    cursor: local.disabled ? 'not-allowed' : 'pointer',
    opacity: local.disabled ? '0.5' : '1',
    position: 'relative',
    border: `1px solid ${colors.border}`,
    outline: 'none',
    transition: `background ${transition.normal}`,
    display: 'inline-block',
    ...(typeof local.style === 'object' ? local.style : {}),
  })

  const thumbStyle = (): JSX.CSSProperties => ({
    width: `${THUMB_SIZE}px`,
    height: `${THUMB_SIZE}px`,
    'border-radius': radius.full,
    background: '#ffffff',
    'box-shadow': '0 1px 3px rgba(0, 0, 0, 0.3)',
    position: 'absolute',
    top: `${THUMB_OFFSET}px`,
    left: isChecked() ? `${TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET - 2}px` : `${THUMB_OFFSET}px`,
    transition: `left ${transition.normal}`,
  })

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked()}
      disabled={local.disabled}
      style={trackStyle()}
      onClick={handleClick}
      {...rest}
    >
      <div style={thumbStyle()} />
    </button>
  )
}
