import { StrictMode, useState, useCallback, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PrivacyPolicy from './components/PrivacyPolicy.jsx'
import OfflineGuard from './components/OfflineGuard.jsx'
import { LanguageProvider } from './i18n'
import { AuthProvider } from './context/AuthContext'
import { SoundProvider } from './context/SoundContext'

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

// ─── Privacy Policy context ────────────────────────────────────────────────
// Permite que AuthScreen y SettingsModal abran la Privacy Policy como
// componente interno, sin depender de window.location (que siempre es '/'
// en el WebView de Capacitor).
//
// Uso desde cualquier componente hijo:
//   const { openPrivacy } = usePrivacyPolicy();
//   <button onClick={openPrivacy}>Privacy Policy</button>
export const PrivacyPolicyContext = createContext({ openPrivacy: () => {}, closePrivacy: () => {} });
export const usePrivacyPolicy = () => useContext(PrivacyPolicyContext);

// ─── Componente raíz ───────────────────────────────────────────────────────
const PRIVACY_PATHS = ['/privacy', '/policy'];

function RootApp() {
  const isPrivacyUrl = PRIVACY_PATHS.includes(window.location.pathname.toLowerCase());
  const [showPrivacy, setShowPrivacy] = useState(isPrivacyUrl);
  const openPrivacy  = useCallback(() => setShowPrivacy(true),  []);
  const closePrivacy = useCallback(() => {
    setShowPrivacy(false);
    // Si llegó vía URL directa, volver a la raíz sin recargar
    if (PRIVACY_PATHS.includes(window.location.pathname.toLowerCase())) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  return (
    <OfflineGuard>
      <PrivacyPolicyContext.Provider value={{ openPrivacy, closePrivacy }}>
        {showPrivacy ? (
          // PrivacyPolicy recibe onBack para volver a la app sin cambiar URL
          <PrivacyPolicy onBack={closePrivacy} />
        ) : (
          <LanguageProvider>
            <AuthProvider>
              <SoundProvider>
                <App />
              </SoundProvider>
            </AuthProvider>
          </LanguageProvider>
        )}
      </PrivacyPolicyContext.Provider>
    </OfflineGuard>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
