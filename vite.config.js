// vite.config.js
import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  server: { port: 5173, open: true },
  build: {
    chunkSizeWarningLimit: 1600, // ↑ aumenta o limite do aviso
  },
})
