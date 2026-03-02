import { Component, JSX, splitProps, mergeProps } from 'solid-js'
import { spacing } from '../theme/tokens'

export interface FlexProps extends JSX.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column'
  align?: JSX.CSSProperties['align-items']
  justify?: JSX.CSSProperties['justify-content']
  gap?: keyof typeof spacing
  wrap?: boolean
}

export const Flex: Component<FlexProps> = (props) => {
  const merged = mergeProps(
    { direction: 'row' as const, align: 'stretch', justify: 'flex-start', wrap: false },
    props,
  )
  const [local, rest] = splitProps(merged, ['direction', 'align', 'justify', 'gap', 'wrap', 'style', 'children'])

  const style = (): JSX.CSSProperties => ({
    display: 'flex',
    'flex-direction': local.direction,
    'align-items': local.align,
    'justify-content': local.justify,
    'flex-wrap': local.wrap ? 'wrap' : 'nowrap',
    ...(local.gap != null ? { gap: spacing[local.gap] } : {}),
    ...(typeof local.style === 'object' ? local.style : {}),
  })

  return (
    <div style={style()} {...rest}>
      {local.children}
    </div>
  )
}
