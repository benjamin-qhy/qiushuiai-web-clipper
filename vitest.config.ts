import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', '@heroui/react'] },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'MultiPost-Extension/tests/**/*.test.ts'],
  },
})
