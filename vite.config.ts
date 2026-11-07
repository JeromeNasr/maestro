/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Response headers for the dev and preview servers. A <meta> CSP does not cover Web Workers, but a header on the worker
 * script's response does, so the hand-detection worker is held to the same network allow-list as the page.
 * (When deploying, send the same header; see README.)
 */
const CSP = "connect-src 'self' blob: data: ws://localhost:* ws://127.0.0.1:* https://cdn.jsdelivr.net https://storage.googleapis.com"

export default defineConfig({
  plugins: [react()],
  server: { headers: { 'Content-Security-Policy': CSP } },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  worker: { format: 'iife' },
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
