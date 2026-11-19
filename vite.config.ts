import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Two pages: Runway (/) and the tablet Budget (/tablet/). Paths are from the project folder.
      input: { main: 'index.html', tablet: 'tablet/index.html' },
    },
  },
})
