import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const extractionTarget = env.VITE_QUESTIFY_URL || 'https://questify-ul4h.onrender.com'

  return defineConfig({
    plugins: [react()],
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
