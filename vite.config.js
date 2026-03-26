import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/glances': {
        target: 'http://localhost:61208',
        rewrite: path => path.replace(/^\/glances/, ''),
      },
      '/gpu-stats': {
        target: 'http://localhost:61211',
        rewrite: path => path.replace(/^\/gpu-stats/, ''),
      },
    },
  },
})
