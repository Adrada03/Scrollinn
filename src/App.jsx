// Lanza un juego directamente desde el perfil (bypass tabs)
const playGameDirectly = (gameId) => {
  const cleanId = typeof gameId === "string" ? gameId.trim().toLowerCase() : String(gameId);
  const game = GAMES.find(g => g.id && g.id.toLowerCase() === cleanId);
  if (game) {
    window.scrollTo(0, 0);
    // Cambia a pestaña jugar y selecciona el juego
    window.dispatchEvent(new CustomEvent("playGameDirectly", { detail: game.id }));
  } else {
    // eslint-disable-next-line no-console
    console.warn("[playGameDirectly] No se encontró el juego con id:", gameId);
  }
};
import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";

// Componentes
import TopNav from "./components/TopNav";
import BottomNavigationBar from "./components/BottomNavigationBar";
import GameFeed from "./components/Feed";
import GameSelectorSheet from "./components/GameSelectorSheet";
import AuthScreen from "./components/AuthScreen";
import AvatarSelectionModal from "./components/AvatarSelectionModal";
import Shop from "./components/Shop";
import UserProfile from "./components/UserProfile";
import CreditsModal from "./components/CreditsModal";
import SettingsModal from "./components/SettingsModal";

// Datos
import GAMES from "./data/games";

// Servicios
import { getTodayChallenges, getChallengeStatus } from "./services/challengeService";

// i18n
import { useLanguage } from "./i18n";

// Contexto de autenticación
import { useAuth } from "./context/AuthContext";

/**
 * Variants para fade entre pestañas principales.
 */
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function App() {
  const { session, currentUser, loading: authLoading, logout, updateUser, isGuest, exitGuest } = useAuth();
  const { t } = useLanguage();
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [isGameSelectorOpen, setIsGameSelectorOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gameEpoch, setGameEpoch] = useState(0);
  const [showAuthScreen, setShowAuthScreen] = useState(false);

  // Usuarios sin sesión se tratan como invitados
  const isEffectiveGuest = !session;

  // Cerrar AuthScreen automáticamente al iniciar sesión
  useEffect(() => {
    if (session) setShowAuthScreen(false);
  }, [session]);

  // ── Challenge status para TopNav ──
  const [challengeStatusForTopNav, setChallengeStatusForTopNav] = useState("pending");

  const refreshChallengeStatusForTopNav = useCallback(() => {
    if (!currentUser?.id) { setChallengeStatusForTopNav("none"); return; }
    getTodayChallenges(currentUser.id).then((data) => {
      setChallengeStatusForTopNav(getChallengeStatus(data));
    });
  }, [currentUser?.id]);

  useEffect(() => { refreshChallengeStatusForTopNav(); }, [refreshChallengeStatusForTopNav]);
  useEffect(() => {
    const handler = () => refreshChallengeStatusForTopNav();
    window.addEventListener("challenges-updated", handler);
    return () => window.removeEventListener("challenges-updated", handler);
  }, [refreshChallengeStatusForTopNav]);



  // ── Bottom Navigation Tab system ──
  const [mainTab, setMainTab] = useState("jugar"); // 'tienda' | 'jugar' | 'perfil'

  // ── Toast notification ──
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Escape cierra modales abiertos
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && isGameSelectorOpen) {
        setIsGameSelectorOpen(false);
      }
      if (e.key === "Escape" && isAvatarModalOpen) {
        setIsAvatarModalOpen(false);
      }
    },
    [isGameSelectorOpen, isAvatarModalOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  /**
   * Navega a un juego específico desde la galería.
   */
  const handleSelectGame = useCallback((index) => {
    setSelectedGameId(GAMES[index].id);
    setGameEpoch((e) => e + 1);
    setIsGameSelectorOpen(false);
  }, []);

  /**
   * Optimistic update del avatar equipado.
   * Se llama desde AvatarSelectionModal al guardar.
   */
  const handleAvatarChange = useCallback((newAvatarId) => {
    updateUser({ equipped_avatar_id: newAvatarId });
  }, [updateUser]);


  /**
   * Navega a un juego desde el perfil: igual que GalleryModal
   * Busca el índice en la lista activa y llama a handleSelectGame(index)
   */

  // Estado temporal para lanzar juego tras cambio de pestaña
  const [pendingProfileGameId, setPendingProfileGameId] = useState(null);

  /**
   * Navega a la pestaña central y abre el juego indicado desde el perfil.
   */
  const launchGameFromProfile = useCallback((gameId) => {
    setMainTab("jugar");
    setPendingProfileGameId(gameId);
  }, []);

  // Efecto: cuando pendingProfileGameId está seteado y la pestaña es la correcta, lanza el juego
  useEffect(() => {
    if (pendingProfileGameId && mainTab === "jugar") {
      const list = GAMES;
      const cleanId = typeof pendingProfileGameId === "string" ? pendingProfileGameId.trim().toLowerCase() : String(pendingProfileGameId);
      const index = list.findIndex((g) => (g.id && g.id.toLowerCase()) === cleanId);
      if (index !== -1) {
        handleSelectGame(index);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[Perfil] No se encontró el juego con id:", pendingProfileGameId, "en GAMES. IDs disponibles:", list.map(g => g.id));
        alert("No se encontró el juego en la lista. ID: " + pendingProfileGameId);
      }
      setPendingProfileGameId(null);
    }
  }, [pendingProfileGameId, mainTab, handleSelectGame]);

  // ── Auth guard: loading spinner ──────────────────────────────
  if (authLoading) {
    return (
      <div className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="absolute -inset-8 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" />
          <h1
            className="relative text-3xl font-black tracking-widest animate-pulse"
            style={{
              color: "#06b6d4",
              textShadow: "0 0 20px rgba(6,182,212,0.6), 0 0 60px rgba(6,182,212,0.3)",
            }}
          >
            SCROLLINN
          </h1>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Layout principal — flex column para evitar solapamiento ── */}
      <div className="h-dvh w-full flex flex-col bg-black overflow-hidden">

        <main className="flex-1 relative overflow-hidden flex flex-col min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          {/* ═══ PESTAÑA: TIENDA ═══ */}
          {mainTab === "tienda" && (
            <motion.div
              key="tab-tienda"
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {isEffectiveGuest ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
                  <svg className="w-16 h-16 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-white/40 text-sm max-w-xs">{t("authscreen.guest_login_prompt")}</p>
                  <button
                    onClick={() => setShowAuthScreen(true)}
                    className="px-6 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer active:scale-95 transition-all"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", boxShadow: "0 4px 20px rgba(6,182,212,0.3)" }}
                  >
                    {t("authscreen.guest_login_btn")}
                  </button>
                </div>
              ) : (
                <Shop
                  coins={currentUser?.coins ?? 0}
                  currentUser={currentUser}
                  onCoinsChange={(newCoins) => updateUser({ coins: newCoins })}
                />
              )}
            </motion.div>
          )}

          {/* ═══ PESTAÑA: JUGAR ═══ */}
          {mainTab === "jugar" && (
            <motion.div
              key="tab-jugar"
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {/* Top Nav minimalista: Retos | SCROLLINN | Lupa */}
              <TopNav
                onSearchClick={() => setIsGameSelectorOpen(true)}
                onOpenChallenges={() => window.dispatchEvent(new CustomEvent("open-challenges-from-topnav"))}
                challengeStatus={challengeStatusForTopNav}
                onOpenSettings={isEffectiveGuest ? () => setIsSettingsOpen(true) : undefined}
                guestBanner={isEffectiveGuest ? t("authscreen.guest_banner") : null}
                guestLoginLabel={isEffectiveGuest ? t("authscreen.guest_login_btn") : null}
                onGuestLogin={isEffectiveGuest ? () => setShowAuthScreen(true) : undefined}
              />

              <GameFeed
                key="feed-all"
                games={GAMES}
                selectedGameId={selectedGameId}
                gameEpoch={gameEpoch}
                disabled={isGameSelectorOpen}
                onOpenGallery={() => setIsGameSelectorOpen(true)}
                currentUser={currentUser}
              />
            </motion.div>
          )}

          {/* ═══ PESTAÑA: PERFIL ═══ */}
          {mainTab === "perfil" && (
            <motion.div
              key="tab-perfil"
              variants={fadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {isEffectiveGuest ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
                  <svg className="w-16 h-16 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <p className="text-white/40 text-sm max-w-xs">{t("authscreen.guest_login_prompt")}</p>
                  <button
                    onClick={() => setShowAuthScreen(true)}
                    className="px-6 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer active:scale-95 transition-all"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", boxShadow: "0 4px 20px rgba(6,182,212,0.3)" }}
                  >
                    {t("authscreen.guest_login_btn")}
                  </button>
                </div>
              ) : (
                <UserProfile
                  onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
                  onPlayGame={playGameDirectly}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </main>

        {/* ── Bottom Navigation Bar ── */}
        <BottomNavigationBar
          activeTab={mainTab}
          onTabChange={setMainTab}
          currentUser={currentUser}
        />
      </div>


      {/* Nuevo Bottom Sheet de selección de juego */}
      <GameSelectorSheet
        isOpen={isGameSelectorOpen}
        onClose={() => setIsGameSelectorOpen(false)}
        games={GAMES}
        onSelectGame={(idx) => {
          handleSelectGame(idx);
          setIsGameSelectorOpen(false);
        }}
        selectedGameId={selectedGameId}
      />

      {/* Modal de selección de avatar */}
      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentUser={currentUser}
        onAvatarChange={handleAvatarChange}
        onGoToShop={() => setMainTab("tienda")}
      />

      {/* Modal de créditos (accesible sin login) */}
      <CreditsModal isOpen={isCreditsOpen} onClose={() => setIsCreditsOpen(false)} />

      {/* Settings para invitados (idioma, sonido) */}
      {isEffectiveGuest && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onLogout={() => setShowAuthScreen(true)}
        />
      )}

      {/* AuthScreen overlay — se muestra bajo demanda */}
      {showAuthScreen && (
        <AuthScreen onClose={() => setShowAuthScreen(false)} />
      )}

      {/* ── Toast elegante ── */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-99 animate-fade-in-up pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md border border-white/15 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl max-w-xs text-center">
            {toast}
          </div>
        </div>
      )}

      {/* Vercel Analytics — omitido en builds nativos para evitar
          errores CORS desde http://localhost (origen del WebView) */}
      {import.meta.env.VITE_BUILD_TARGET !== 'native' && <Analytics />}
    </>
  );
}

export default App;
