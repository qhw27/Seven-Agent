import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // 解决 Electron main process 模块问题
    external: ['electron'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/main': path.resolve(__dirname, './src/main'),
      '@/renderer': path.resolve(__dirname, './src/renderer'),
      '@/preload': path.resolve(__dirname, './src/preload'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/main': path.resolve(__dirname, './src/main'),
      '@/renderer': path.resolve(__dirname, './src/renderer'),
      '@/preload': path.resolve(__dirname, './src/preload'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
})