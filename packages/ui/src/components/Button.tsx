import { Component, JSX, splitProps, mergeProps } from 'solid-js'
import { colors, radius, font, spacing } from '../theme/tokens'

export type ButtonVariant = 'primary' | 'accent' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

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
    border: `1px solid ${colors.dim}`,
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
  const [local, rest] = splitProps(merged, ['variant', 'size', 'style', 'children'])

  const baseStyle: JSX.CSSProperties = {
    'font-family': font.family,
    'border-radius': radius.md,
    cursor: 'pointer',
    'font-weight': '500',
    transition: 'opacity 0.15s ease',
  }

  return (
    <button
      style={{
        ...baseStyle,
        ...variantStyles[local.variant],
        ...sizeStyles[local.size],
        ...(typeof local.style === 'object' ? local.style : {}),
      }}
      {...rest}
    >
      {local.children}
    </button>
  )
}
