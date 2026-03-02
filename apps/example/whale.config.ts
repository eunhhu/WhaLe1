import { defineConfig } from '@whale/cli'

export default defineConfig({
  app: {
    name: 'Example Trainer',
    version: '0.1.0',
    identifier: 'com.whale.example',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
      width: 400,
      height: 500,
      resizable: false,
    },
    overlay: {
      entry: './src/ui/windows/overlay.tsx',
      width: 300,
      height: 200,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    },
    settings: {
      entry: './src/ui/windows/settings.tsx',
      width: 500,
      height: 400,
      visible: false,
    },
  },
  store: {
    persist: true,
  },
})
