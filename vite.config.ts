/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const extractionTarget = env.VITE_QUESTIFY_URL || 'http://127.0.0.1:8000'

  return defineConfig({
    plugins: [react()],
    // Vitest unit tests only — the Playwright e2e suite (e2e/*.spec.ts) must
    // never run under vitest (`npm test`); it runs via `npm run test:e2e`.
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    },
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      // Proxy /extraction/* to the extraction service to avoid CORS issues in
      // the browser. In dev mode the client uses '/extraction' as the base URL
      // (same-origin), so the browser makes same-origin requests and Vite forwards them.
      proxy: {
        '/extraction': {
          target: extractionTarget,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/extraction/, ''),
        },
      },
    },
  })
})
