import { Component, JSX, splitProps, mergeProps, createSignal } from 'solid-js'
import { colors, radius } from '../theme/tokens'

export interface SwitchProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  style?: JSX.CSSProperties
}

const TRACK_WIDTH = 40
const TRACK_HEIGHT = 22
const THUMB_SIZE = 18
const THUMB_OFFSET = 2

export const Switch: Component<SwitchProps> = (props) => {
  const merged = mergeProps({ checked: false, disabled: false }, props)
  const [local, rest] = splitProps(merged, ['checked', 'onChange', 'disabled', 'style'])

  const [internalChecked, setInternalChecked] = createSignal(local.checked)

  const isChecked = () => local.checked ?? internalChecked()

  const handleClick = () => {
    if (local.disabled) return
    const next = !isChecked()
    setInternalChecked(next)
    local.onChange?.(next)
  }

  const trackStyle = (): JSX.CSSProperties => ({
    width: `${TRACK_WIDTH}px`,
    height: `${TRACK_HEIGHT}px`,
    'border-radius': `${TRACK_HEIGHT / 2}px`,
    background: isChecked() ? colors.accent : colors.primary,
    cursor: local.disabled ? 'not-allowed' : 'pointer',
    opacity: local.disabled ? '0.5' : '1',
    position: 'relative',
    transition: 'background 0.2s ease',
    display: 'inline-block',
    ...(typeof local.style === 'object' ? local.style : {}),
  })

  const thumbStyle = (): JSX.CSSProperties => ({
    width: `${THUMB_SIZE}px`,
    height: `${THUMB_SIZE}px`,
    'border-radius': radius.lg,
    background: colors.text,
    position: 'absolute',
    top: `${THUMB_OFFSET}px`,
    left: isChecked() ? `${TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET}px` : `${THUMB_OFFSET}px`,
    transition: 'left 0.2s ease',
  })

  return (
    <div
      role="switch"
      aria-checked={isChecked()}
      tabIndex={0}
      style={trackStyle()}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <div style={thumbStyle()} />
    </div>
  )
}
