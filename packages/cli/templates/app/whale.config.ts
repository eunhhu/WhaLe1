import { defineConfig } from '@whale1/cli'

export default defineConfig({
  app: {
    name: 'My Whale App',
    version: '0.1.0',
    identifier: 'com.whale.app',
    icon: '../../assets/icon.png',
  },
  windows: {
    main: {
      entry: './src/ui/windows/main.tsx',
      title: 'My Whale App',
      width: 400,
      height: 500,
      resizable: false,
    },
  },
  frida: {
    scripts: [],
  },
  store: {
    persist: true,
  },
})
