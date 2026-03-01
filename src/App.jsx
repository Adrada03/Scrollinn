/**
 * App.jsx — Componente raíz de TikTok Games (Modo Inmersivo)
 *
 * Orquesta:
 *  1. GameFeed — Feed vertical infinito a pantalla completa
 *  2. GalleryModal — Modal de selección de juegos
 *  3. Estado de likes por juego (sincronizado con la BD)
 *  4. Pestañas: Todos | Favoritos | Tienda
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";

// Componentes
import TopNav from "./components/TopNav";
import GameFeed from "./components/Feed";
import GalleryModal from "./components/GalleryModal";
import AuthModal from "./components/AuthModal";
import AvatarSelectionModal from "./components/AvatarSelectionModal";
import Shop from "./components/Shop";

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
const emptyLikesMap = () => {
  const map = {};
  GAMES.forEach((game) => {
    map[game.id] = { count: 0, liked: false };
  });
  return map;
};

/**
 * Variants para la transición horizontal entre pestañas.
 * `custom` = slideDirection (+1 derecha, -1 izquierda).
 * Usar variants + custom permite que AnimatePresence pase la dirección
 * correcta al componente que está saliendo (exit), evitando glitches.
 */
const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? "40%" : "-40%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? "-40%" : "40%", opacity: 0 }),
};

/* ── Lock Screen Overlay ── */
const LockScreen = ({ icon, title, description }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md">
    <div className="flex flex-col items-center gap-5 max-w-xs text-center px-6">
      {/* Candado / icono */}
      <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        {icon || (
          <svg className="w-12 h-12 text-white/40" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <h2 className="text-white text-xl font-bold leading-tight">{title}</h2>
      <p className="text-white/60 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

function App() {
  const { currentUser, login, logout, updateUser } = useAuth();
  const { t } = useLanguage();
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [likesMap, setLikesMap] = useState(emptyLikesMap);
  const [gameEpoch, setGameEpoch] = useState(0);
  const likesLoaded = useRef(false);

  // ── Tab system ──
  const [activeTab, setActiveTab] = useState("all");
  const [userLikesCount, setUserLikesCount] = useState(0);
  const [slideDirection, setSlideDirection] = useState(0); // -1 izq, +1 der
  const prevTabRef = useRef("all");

  /** Orden de las pestañas para calcular dirección del slide */
  const TAB_ORDER = { all: 0, favorites: 1, shop: 2 };

  // ── Toast notification ──
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /**
   * Callback para cambio de pestaña desde TopNav.
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

  // Escape cierra la galería
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && isGalleryOpen) {
        setIsGalleryOpen(false);
      }
      if (e.key === "Escape" && isAuthOpen) {
        setIsAuthOpen(false);
      }
      if (e.key === "Escape" && isAvatarModalOpen) {
        setIsAvatarModalOpen(false);
      }
    },
    [isGalleryOpen, isAuthOpen, isAvatarModalOpen]
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
    setIsGalleryOpen(false);
  }, [activeTab, favoriteGames]);

  /**
   * Optimistic update del avatar equipado.
   * Se llama desde AvatarSelectionModal al guardar.
   */
  const handleAvatarChange = useCallback((newAvatarId) => {
    updateUser({ equipped_avatar_id: newAvatarId });
  }, [updateUser]);

  return (
    <>
      {/* Barra de navegación superior fija */}
      <TopNav
        onOpenAuth={() => setIsAuthOpen(true)}
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userLikesCount={userLikesCount}
      />

      {/* ── Contenido principal con transición horizontal ── */}
      <AnimatePresence mode="wait" initial={false} custom={slideDirection}>
        {activeTab !== "shop" ? (
          <motion.div
            key={activeTab}
            custom={slideDirection}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            className="h-dvh w-full"
          >
            {/* Lock screen para Favoritos */}
            {activeTab === "favorites" && !currentUser ? (
              <LockScreen
                title={t("lock.login_title")}
                description={t("lock.login_desc")}
              />
            ) : activeTab === "favorites" && currentUser && (userLikesCount ?? 0) < 5 ? (
              <LockScreen
                title={t("lock.fav_title")}
                description={t("lock.fav_desc", { count: userLikesCount ?? 0 })}
              />
            ) : (
              /* Feed principal (visible en pestañas "Todos" y "Favoritos") */
              <GameFeed
                key={`feed-${activeTab}`}
                games={activeTab === "favorites" ? favoriteGames : GAMES}
                selectedGameId={selectedGameId}
                gameEpoch={gameEpoch}
                disabled={isGalleryOpen || isAuthOpen}
                likesMap={likesMap}
                onToggleLike={handleToggleLike}
                onOpenGallery={() => setIsGalleryOpen(true)}
                currentUser={currentUser}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="shop"
            custom={slideDirection}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            className="h-dvh w-full"
          >
            {/* Lock screen para Tienda sin login */}
            {!currentUser && (
              <LockScreen
                title={t("lock.shop_title")}
                description={t("lock.shop_desc")}
              />
            )}

            {/* Pantalla de la Tienda */}
            <Shop
              coins={currentUser?.coins ?? 0}
              currentUser={currentUser}
              onCoinsChange={(newCoins) => updateUser({ coins: newCoins })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de galería (sobre todo) */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        games={activeGames}
        onSelectGame={handleSelectGame}
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
      />

      {/* ── Toast elegante ── */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-100 animate-fade-in-up pointer-events-none"
             style={{ bottom: 'calc(5rem + var(--sab))' }}>
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
