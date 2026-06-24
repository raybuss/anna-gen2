import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://anna.bytor.co',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
