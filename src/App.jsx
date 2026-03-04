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
import AuthModal from "./components/AuthModal";
import AvatarSelectionModal from "./components/AvatarSelectionModal";
import Shop from "./components/Shop";
import UserProfile from "./components/UserProfile";

// Datos
import GAMES from "./data/games";

// Servicios
import { getTodayChallenges, getChallengeStatus } from "./services/challengeService";

// i18n
import { useLanguage } from "./i18n";

// Contexto de autenticación
import { useAuth } from "./context/AuthContext";

// Contexto de sonido (para toggle en LockScreen)
import { useSound } from "./context/SoundContext";

/**
 * Variants para fade entre pestañas principales.
 */
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ── Lock Screen Overlay ── */
const LockScreen = ({ title, description, benefits, ctaText, onAction, children }) => (
  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl px-8">
    <div className="flex flex-col items-center gap-4 max-w-sm text-center w-full">
      {/* Lock icon with glow */}
      <div className="relative mb-1">
        <div className="absolute -inset-4 bg-cyan-400/15 rounded-full blur-2xl" />
        <div className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <svg className="w-10 h-10 text-cyan-400/60" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      <h2 className="text-white text-xl font-bold leading-tight">{title}</h2>
      <p className="text-white/45 text-sm leading-relaxed">{description}</p>

      {/* Benefits list */}
      {benefits && benefits.length > 0 && (
        <div className="w-full mt-2 space-y-2 text-left">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/4 border border-white/5"
            >
              <span className="text-lg shrink-0 leading-none">{b.icon}</span>
              <span className="text-white/65 text-[13px] leading-snug">{b.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA button */}
      {onAction && ctaText && (
        <button
          onClick={onAction}
          className="mt-4 w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide text-white
            cursor-pointer active:scale-95 transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
            boxShadow: "0 8px 32px rgba(6,182,212,0.25), 0 2px 8px rgba(6,182,212,0.15)",
          }}
        >
          {ctaText}
        </button>
      )}

      {/* Extra content (e.g. sound toggle for logged-out users) */}
      {children}
    </div>
  </div>
);

function App() {
  const { currentUser, login, logout, updateUser } = useAuth();
  const { t } = useLanguage();
  const { isMuted, toggleMute } = useSound();
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [isGameSelectorOpen, setIsGameSelectorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [gameEpoch, setGameEpoch] = useState(0);

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

  // ── Escuchar evento global "open-auth" (emitido por DailyChallengesModal, etc.) ──
  useEffect(() => {
    const handler = () => setIsAuthOpen(true);
    window.addEventListener("open-auth", handler);
    return () => window.removeEventListener("open-auth", handler);
  }, []);

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
      if (e.key === "Escape" && isAuthOpen) {
        setIsAuthOpen(false);
      }
      if (e.key === "Escape" && isAvatarModalOpen) {
        setIsAvatarModalOpen(false);
      }
    },
    [isGameSelectorOpen, isAuthOpen, isAvatarModalOpen]
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

  /** Benefits shown on lock screens for non-logged-in users */
  const loginBenefits = [
    { icon: "🏆", text: t("lock.benefit_scores") },
    { icon: "🎨", text: t("lock.benefit_avatars") },
    { icon: "📈", text: t("lock.benefit_levels") },
  ];

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
              {/* Lock screen para Tienda sin login */}
              {!currentUser && (
                <LockScreen
                  title={t("lock.shop_title")}
                  description={t("lock.shop_desc")}
                  benefits={loginBenefits}
                  ctaText={t("lock.cta")}
                  onAction={() => setIsAuthOpen(true)}
                />
              )}

              <Shop
                coins={currentUser?.coins ?? 0}
                currentUser={currentUser}
                onCoinsChange={(newCoins) => updateUser({ coins: newCoins })}
              />
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
              />

              <GameFeed
                key="feed-all"
                games={GAMES}
                selectedGameId={selectedGameId}
                gameEpoch={gameEpoch}
                disabled={isGameSelectorOpen || isAuthOpen}
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
              {!currentUser ? (
                <LockScreen
                  title={t("profile.login_required_title")}
                  description={t("profile.login_required_desc")}
                  benefits={loginBenefits}
                  ctaText={t("lock.cta")}
                  onAction={() => setIsAuthOpen(true)}
                >
                  {/* ── Toggle de sonido accesible sin login ── */}
                  <button
                    onClick={toggleMute}
                    className="mt-2 w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10
                      hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {!isMuted ? (
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M23 9l-6 6" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9l6 6" />
                          </svg>
                        </div>
                      )}
                      <span className="text-white font-medium">{t("settings.sound")}</span>
                    </div>
                    <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ${
                      !isMuted ? "bg-violet-500" : "bg-white/10"
                    }`}>
                      <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
                        !isMuted ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </div>
                  </button>
                </LockScreen>
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

      {/* Modal de autenticación */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(user) => (user ? login(user) : logout())}
        currentUser={currentUser}
        onOpenAvatarModal={() => setIsAvatarModalOpen(true)}
      />

      {/* Modal de selección de avatar */}
      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentUser={currentUser}
        onAvatarChange={handleAvatarChange}
        onGoToShop={() => setMainTab("tienda")}
      />

      {/* ── Toast elegante ── */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-99 animate-fade-in-up pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md border border-white/15 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl max-w-xs text-center">
            {toast}
          </div>
        </div>
      )}

      {/* Vercel Analytics */}
      <Analytics />
    </>
  );
}

export default App;
