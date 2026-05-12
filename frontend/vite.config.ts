import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (mode === 'production') {
    const backendUrl = env.VITE_BACKEND_URL
    if (!backendUrl || backendUrl.includes('localhost')) {
      throw new Error(
        '\n\n❌  VITE_BACKEND_URL is not set or still points to localhost.\n' +
        '    Set it to your deployed backend URL in Vercel environment variables before building.\n'
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: 'globalThis',
    },
  }
})
