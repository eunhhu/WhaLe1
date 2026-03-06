import { Component, JSX, splitProps, mergeProps } from 'solid-js'
import { colors, radius, spacing, transition } from '../theme/tokens'

export type IconButtonVariant = 'ghost' | 'default'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant
  size?: IconButtonSize
}

type NativeButtonType = 'button' | 'submit' | 'reset' | 'menu'

const defaultButtonType: NativeButtonType = 'button'

const sizeMap: Record<IconButtonSize, string> = {
  sm: spacing[6],
  md: spacing[8],
  lg: spacing[10],
}

export const IconButton: Component<IconButtonProps> = (props) => {
  const merged = mergeProps({ variant: 'ghost' as IconButtonVariant, size: 'md' as IconButtonSize }, props)
  const [local, rest] = splitProps(merged, ['variant', 'size', 'style', 'children', 'type'])

  const style = (): JSX.CSSProperties => ({
    display: 'inline-flex',
    'align-items': 'center',
    'justify-content': 'center',
    width: sizeMap[local.size],
    height: sizeMap[local.size],
    padding: '0',
    border: local.variant === 'default' ? `1px solid ${colors.border}` : 'none',
    background: local.variant === 'default' ? colors.surface : 'transparent',
    color: colors.dim,
    'border-radius': radius.md,
    cursor: 'pointer',
    transition: `background ${transition.fast}, color ${transition.fast}`,
    ...(typeof local.style === 'object' ? local.style : {}),
  })

  return (
    <button style={style()} type={(local.type ?? defaultButtonType) as NativeButtonType} {...rest}>
      {local.children}
    </button>
  )
}
