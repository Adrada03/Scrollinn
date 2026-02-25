import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n'
import { AuthProvider } from './context/AuthContext'

/* ═══════════════════════════════════════════════════════════
   CAPA 3: Bloqueo global de zoom nativo a nivel de documento
   ═══════════════════════════════════════════════════════════
   Safari iOS usa eventos propietarios `gesturestart`/`gesturechange`
   para su zoom nativo. Estos NO son parte de la cadena touch, así que
   el `e.preventDefault()` en touchmove no los detiene.
   También bloqueamos touchmove con 2+ dedos a nivel de document como
   red de seguridad absoluta (passive: false).
   ═══════════════════════════════════════════════════════════ */

// Safari: bloquear gesture events propietarios (pinch zoom nativo)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

// Red de seguridad: bloquear touchmove multi-dedo a nivel global
// (solo cuando hay 2+ dedos → pinch; 1 dedo fluye normal para scroll)
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
