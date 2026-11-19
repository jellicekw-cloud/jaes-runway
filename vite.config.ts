import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Two pages: Runway (/) and the tablet Budget (/tablet/)
      input: { main: resolve(__dirname, 'index.html'), tablet: resolve(__dirname, 'tablet/index.html') },
    },
  },
})
