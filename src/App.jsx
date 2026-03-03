// Utilidad: mapa de likes vacío para inicializar estado
function emptyLikesMap() {
  const map = {};
  GAMES.forEach((game) => {
    map[game.id] = { count: 0, liked: false };
  });
  return map;
}

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
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

// Servicios Supabase
import { getLikesMap, toggleLike, getUserLikesCount } from "./services/gameService";

// i18n
import { useLanguage } from "./i18n";

// Contexto de autenticación
import { useAuth } from "./context/AuthContext";

/**
 * Estado inicial vacío — se rellena al cargar desde la BD.
 * Mientras carga, cada juego muestra 0 likes.
 */



/**
 * Variants para fade entre pestañas principales.
 */
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Variants para la transición horizontal entre sub-pestañas del feed.
 * `custom` = slideDirection (+1 derecha, -1 izquierda).
 */
const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? "40%" : "-40%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? "-40%" : "40%", opacity: 0 }),
};

/* ── Lock Screen Overlay ── */
const LockScreen = ({ title, description, benefits, ctaText, onAction }) => (
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
    </div>
  </div>
);

function App() {
  const { currentUser, login, logout, updateUser } = useAuth();
  const { t } = useLanguage();
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [isGameSelectorOpen, setIsGameSelectorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [likesMap, setLikesMap] = useState(emptyLikesMap);
  const [gameEpoch, setGameEpoch] = useState(0);
  const likesLoaded = useRef(false);
  const [activeGameName, setActiveGameName] = useState("");

  // ── Bottom Navigation Tab system ──
  const [mainTab, setMainTab] = useState("jugar"); // 'tienda' | 'jugar' | 'perfil'

  // ── Feed sub-tabs (Todos | Favoritos) ──
  const [activeTab, setActiveTab] = useState("all");
  const [userLikesCount, setUserLikesCount] = useState(0);
  const [slideDirection, setSlideDirection] = useState(0); // -1 izq, +1 der
  const prevTabRef = useRef("all");

  /** Orden de las sub-pestañas del feed para calcular dirección del slide */
  const TAB_ORDER = { all: 0, favorites: 1 };

  // ── Toast notification ──
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /**
   * Callback para cambio de sub-pestaña del feed desde TopNav.
   * Si recibe "__toast__", muestra un toast en vez de cambiar la tab.
   */
  const handleTabChange = useCallback((tab, message) => {
    if (tab === "__toast__") {
      showToast(message);
      return;
    }
    const dir = TAB_ORDER[tab] > TAB_ORDER[prevTabRef.current] ? 1 : -1;
    setSlideDirection(dir);
    prevTabRef.current = tab;
    setActiveTab(tab);
  }, [showToast]);

  /**
   * Carga likes desde la BD. Si hay usuario, también carga cuáles ha likeado.
   */
  const fetchLikes = useCallback(async (userId) => {
    try {
      const likesMapData = await getLikesMap(userId);
      setLikesMap((prev) => {
        const merged = { ...prev };
        for (const [gameId, info] of Object.entries(likesMapData)) {
          merged[gameId] = info;
        }
        return merged;
      });
    } catch (err) {
      console.warn("No se pudieron cargar los likes desde la BD:", err.message);
    }
  }, []);

  // Cargar likes al montar la app
  useEffect(() => {
    if (!likesLoaded.current) {
      likesLoaded.current = true;
      fetchLikes(currentUser?.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-cargar likes cuando el usuario cambia (login/logout) para marcar sus likes
  useEffect(() => {
    if (likesLoaded.current) {
      fetchLikes(currentUser?.id);
    }
  }, [currentUser, fetchLikes]);

  // ── Actualizar el conteo de likes del usuario (para desbloqueo de Favoritos) ──
  useEffect(() => {
    if (currentUser?.id) {
      getUserLikesCount(currentUser.id).then(setUserLikesCount);
    } else {
      setUserLikesCount(0);
      // Si el usuario cierra sesión, volver a "Todos"
      setActiveTab("all");
    }
  }, [currentUser, likesMap]); // likesMap como dep para recalcular tras toggle

  /**
   * Juegos filtrados para la pestaña "Favoritos":
   * solo aquellos cuyo id tenga liked === true en el likesMap.
   */
  const favoriteGames = useMemo(() => {
    if (activeTab !== "favorites") return GAMES;
    return GAMES.filter((g) => likesMap[g.id]?.liked);
  }, [activeTab, likesMap]);

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
   * Toggle like de un juego — llama a la API si hay usuario logueado.
   * Si no hay usuario, abre el modal de auth.
   */
  const handleToggleLike = useCallback(
    async (gameId) => {
      // Optimistic update local
      setLikesMap((prev) => {
        const current = prev[gameId];
        return {
          ...prev,
          [gameId]: {
            count: current.liked ? current.count - 1 : current.count + 1,
            liked: !current.liked,
          },
        };
      });

      // Sincronizar con Supabase
      try {
        const result = await toggleLike(currentUser?.id, gameId);
        if (result.success) {
          setLikesMap((prev) => ({
            ...prev,
            [gameId]: { count: result.totalLikes, liked: result.liked },
          }));
        }
      } catch (err) {
        console.warn("Error al sincronizar like con la BD:", err.message);
      }
    },
    [currentUser]
  );

  /**
   * Lista de juegos activa según la pestaña (para la galería).
   */
  const activeGames = activeTab === "favorites" ? favoriteGames : GAMES;

  /**
   * Navega a un juego específico desde la galería.
   */
  const handleSelectGame = useCallback((index) => {
    const list = activeTab === "favorites" ? favoriteGames : GAMES;
    setSelectedGameId(list[index].id);
    setGameEpoch((e) => e + 1);
    setIsGameSelectorOpen(false);
  }, [activeTab, favoriteGames]);

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
   * Garantiza que el cambio de pestaña y subpestaña se complete antes de lanzar el juego.
   */
  const launchGameFromProfile = useCallback((gameId) => {
    setActiveTab("all");
    setMainTab("jugar");
    setPendingProfileGameId(gameId);
  }, []);

  // Efecto: cuando pendingProfileGameId está seteado y la pestaña es la correcta, lanza el juego
  useEffect(() => {
    if (pendingProfileGameId && mainTab === "jugar" && activeTab === "all") {
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
  }, [pendingProfileGameId, mainTab, activeTab, handleSelectGame]);

  /** Benefits shown on lock screens for non-logged-in users */
  const loginBenefits = [
    { icon: "🏆", text: t("lock.benefit_scores") },
    { icon: "🎨", text: t("lock.benefit_avatars") },
    { icon: "📈", text: t("lock.benefit_levels") },
    { icon: "❤️", text: t("lock.benefit_favorites") },
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
              {/* Top Nav simplificada: solo Todos | Favoritos */}
              <TopNav
                onOpenAuth={() => setIsAuthOpen(true)}
                currentUser={currentUser}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                userLikesCount={userLikesCount}
                onSearchClick={() => setIsGameSelectorOpen(true)}
                activeGameName={activeGameName}
              />

              {/* Sub-contenido con transición slide */}
              <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
                <motion.div
                  key={activeTab}
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                  className="h-full w-full"
                >
                  {/* Lock screen para Favoritos */}
                  {activeTab === "favorites" && !currentUser ? (
                    <LockScreen
                      title={t("lock.login_title")}
                      description={t("lock.login_desc")}
                      benefits={loginBenefits}
                      ctaText={t("lock.cta")}
                      onAction={() => setIsAuthOpen(true)}
                    />
                  ) : activeTab === "favorites" && currentUser && (userLikesCount ?? 0) < 5 ? (
                    <LockScreen
                      title={t("lock.fav_title")}
                      description={t("lock.fav_desc", { count: userLikesCount ?? 0 })}
                    />
                  ) : (
                    <GameFeed
                      key={`feed-${activeTab}`}
                      games={activeTab === "favorites" ? favoriteGames : GAMES}
                      selectedGameId={selectedGameId}
                      gameEpoch={gameEpoch}
                      disabled={isGameSelectorOpen || isAuthOpen}
                      likesMap={likesMap}
                      onToggleLike={handleToggleLike}
                      onOpenGallery={() => setIsGameSelectorOpen(true)}
                      currentUser={currentUser}
                      onActiveGameChange={setActiveGameName}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
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
                />
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
        games={activeGames}
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
