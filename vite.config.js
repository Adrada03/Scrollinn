import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Usa el manifest.json manual que ya tenemos en /public
      manifest: false,
      workbox: {
        // Archivos de la build que se pre-cachean automáticamente
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // No pre-cachear assets muy pesados (> 3 MB)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Estrategia de runtime cache para imágenes externas
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 días
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
