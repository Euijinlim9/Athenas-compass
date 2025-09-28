import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/friends': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/friend-request': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/accept-friend': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/users': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
