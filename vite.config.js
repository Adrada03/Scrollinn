import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // En modo 'native' (npx vite build --mode native) el SW se deshabilita
  // completamente: Capacitor no necesita SW y evita conflictos con sus plugins.
  const isNative = mode === 'native'

  const plugins = [react(), tailwindcss()]

  if (!isNative) {
    plugins.push(
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
    )
  }

  return {
    // base './' es obligatorio para Capacitor: el WebView carga los assets
    // desde un origen file:// o capacitor://, donde las rutas absolutas ('/assets/…')
    // no resuelven. Con './' todos los paths son relativos al HTML.
    //
    // ¿Rompe Vercel? No, porque esta app no tiene rutas de URL profundas
    // (no usa React Router con paths reales). Todo el "routing" es estado
    // interno; el único documento servido siempre es '/', por lo que
    // './assets/…' resuelve correctamente a '/assets/…' desde ese origen.
    // Los rewrites de Vercel (/* → /index.html) siguen funcionando igual.
    base: './',
    plugins,
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
