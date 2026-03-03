import { Button, Text, Flex, Card, Badge, ThemeProvider } from '@whale1/ui'
import { isTauriRuntime } from '@whale1/sdk'
import { app } from '../../store/app'
import { setupSession } from '../../frida/session'

export default function Main() {
  const { device } = setupSession()

  return (
    <ThemeProvider>
      <Flex direction="column" gap={4} style={{ padding: '16px', height: '100%' }}>
        <Flex justify="space-between" align="center">
          <Text size="xl" weight="bold">My Whale App</Text>
          <Badge variant={isTauriRuntime() ? 'success' : 'default'}>
            {isTauriRuntime() ? 'READY' : 'NO RUNTIME'}
          </Badge>
        </Flex>

        {/* Store sync demo — this value syncs across windows and Frida scripts */}
        <Card>
          <Flex direction="column" gap={3}>
            <Text size="sm" weight="semibold" color="var(--whale-dim)">STORE DEMO</Text>
            <Flex justify="space-between" align="center">
              <Text>Counter</Text>
              <Badge variant="accent">{app.count}</Badge>
            </Flex>
            <Flex gap={2}>
              <Button onClick={() => app.setCount(app.count - 1)}>-</Button>
              <Button onClick={() => app.setCount(app.count + 1)}>+</Button>
              <Button variant="ghost" onClick={() => app.setCount(0)}>Reset</Button>
            </Flex>
          </Flex>
        </Card>

        {/* Device connection status */}
        <Card>
          <Flex direction="column" gap={2}>
            <Text size="sm" weight="semibold" color="var(--whale-dim)">DEVICE</Text>
            <Flex justify="space-between" align="center">
              <Text size="sm">Status</Text>
              <Badge variant={device.status() === 'connected' ? 'success' : 'default'}>
                {device.status()}
              </Badge>
            </Flex>
            <Button variant="ghost" onClick={() => void device.refresh()}>Refresh Device</Button>
          </Flex>
        </Card>

        {/*
          Next steps:
          - Add more windows: edit whale.config.ts → windows section
          - Add cheats: edit src/store/app.ts → add fields
          - Add Frida hooks: edit src/script/main.ts
          - Add overlay: create src/ui/windows/overlay.tsx
        */}
      </Flex>
    </ThemeProvider>
  )
}
