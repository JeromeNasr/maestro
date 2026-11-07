/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // react-router ships dual ESM/CJS builds; under Node, 'react-router' and 'react-router/dom' can resolve to different
    // copies (two router contexts). Pin both to the ESM build so tests share one instance. Browser builds are unaffected.
    alias: [
      { find: /^react-router\/dom$/, replacement: fileURLToPath(new URL('./node_modules/react-router/dist/development/dom-export.mjs', import.meta.url)) },
      { find: /^react-router$/, replacement: fileURLToPath(new URL('./node_modules/react-router/dist/development/index.mjs', import.meta.url)) },
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
