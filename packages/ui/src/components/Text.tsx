import { Component, JSX, splitProps, mergeProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { colors, font } from '../theme/tokens'

export type TextSize = 'sm' | 'md' | 'lg'
export type TextWeight = 'normal' | 'medium' | 'bold'

export interface TextProps {
  size?: TextSize
  color?: string
  weight?: TextWeight
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'label'
  class?: string
  style?: JSX.CSSProperties
  children?: JSX.Element
}

const weightMap: Record<TextWeight, string> = {
  normal: '400',
  medium: '500',
  bold: '700',
}

export const Text: Component<TextProps> = (props) => {
  const merged = mergeProps(
    { size: 'md' as TextSize, color: colors.text, weight: 'normal' as TextWeight, as: 'span' as const },
    props,
  )
  const [local, rest] = splitProps(merged, ['size', 'color', 'weight', 'as', 'style', 'children'])

  const style = (): JSX.CSSProperties => ({
    'font-family': font.family,
    'font-size': font.size[local.size],
    color: local.color,
    'font-weight': weightMap[local.weight],
    ...(typeof local.style === 'object' ? local.style : {}),
  })

  return (
    <Dynamic component={local.as} style={style()} {...rest}>
      {local.children}
    </Dynamic>
  )
}
