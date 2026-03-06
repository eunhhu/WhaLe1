import { Component, JSX, splitProps, mergeProps } from 'solid-js'
import { colors, radius, font, spacing, transition, shadow } from '../theme/tokens'

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

type NativeButtonType = 'button' | 'submit' | 'reset' | 'menu'

const defaultButtonType: NativeButtonType = 'button'

const variantStyles: Record<ButtonVariant, JSX.CSSProperties> = {
  primary: {
    background: colors.primary,
    color: colors.text,
    border: 'none',
  },
  accent: {
    background: colors.accent,
    color: colors.text,
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: colors.dim,
    border: `1px solid ${colors.border}`,
  },
  danger: {
    background: colors.error,
    color: colors.text,
    border: 'none',
  },
}

const sizeStyles: Record<ButtonSize, JSX.CSSProperties> = {
  sm: {
    padding: `${spacing[1]} ${spacing[2]}`,
    'font-size': font.size.sm,
  },
  md: {
    padding: `${spacing[2]} ${spacing[4]}`,
    'font-size': font.size.md,
  },
  lg: {
    padding: `${spacing[2]} ${spacing[8]}`,
    'font-size': font.size.lg,
  },
}

export const Button: Component<ButtonProps> = (props) => {
  const merged = mergeProps({ variant: 'primary' as ButtonVariant, size: 'md' as ButtonSize }, props)
  const [local, rest] = splitProps(merged, ['variant', 'size', 'style', 'children', 'disabled', 'type'])

  const baseStyle: JSX.CSSProperties = {
    'font-family': font.family,
    'border-radius': radius.md,
    cursor: 'pointer',
    'font-weight': font.weight.medium,
    transition: `opacity ${transition.fast}`,
  }

  const disabledStyle: JSX.CSSProperties = local.disabled
    ? { opacity: '0.5', cursor: 'not-allowed', 'pointer-events': 'none' }
    : {}

  return (
    <button
      style={{
        ...baseStyle,
        ...variantStyles[local.variant],
        ...sizeStyles[local.size],
        ...disabledStyle,
        ...(typeof local.style === 'object' ? local.style : {}),
      }}
      disabled={local.disabled}
      type={(local.type ?? defaultButtonType) as NativeButtonType}
      {...rest}
    >
      {local.children}
    </button>
  )
}
