import { describe, expect, it } from 'vitest'

describe('publisher playground adapters', () => {
  it('provides a standalone browser adapter factory', async () => {
    await expect(import('./demoAdapters')).resolves.toHaveProperty('createDemoAdapters')
  })
})
