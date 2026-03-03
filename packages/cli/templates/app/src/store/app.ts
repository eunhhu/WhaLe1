import { createSyncStore } from '@whale1/sdk'

export const app = createSyncStore('app', {
  count: 0,
})
