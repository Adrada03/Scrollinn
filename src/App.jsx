/**
 * App.jsx — Componente raíz de TikTok Games (Modo Inmersivo)
 *
 * Orquesta:
 *  1. GameFeed — Feed vertical infinito a pantalla completa
 *  2. GalleryModal — Modal de selección de juegos
 *  3. Estado de likes por juego (sincronizado con la BD)
 */

import { useState, useEffect, useCallback, useRef } from "react";

// Componentes
import GameFeed from "./components/Feed";
import GalleryModal from "./components/GalleryModal";
import AuthModal from "./components/AuthModal";

// Datos
import GAMES from "./data/games";

// Servicios Supabase
import { getLikesMap, toggleLike } from "./services/gameService";

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

function App() {
  const [currentIndex, setCurrentIndex] = useState(
    () => Math.floor(Math.random() * GAMES.length)
  );
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [likesMap, setLikesMap] = useState(emptyLikesMap);
  const likesLoaded = useRef(false);

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

  // Escape cierra la galería
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && isGalleryOpen) {
        setIsGalleryOpen(false);
      }
      if (e.key === "Escape" && isAuthOpen) {
        setIsAuthOpen(false);
      }
    },
    [isGalleryOpen, isAuthOpen]
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
   * Navega a un juego específico desde la galería.
   */
  const handleSelectGame = useCallback((index) => {
    setCurrentIndex(index);
    setIsGalleryOpen(false);
  }, []);

  return (
    <>
      {/* Feed principal a pantalla completa */}
      <GameFeed
        games={GAMES}
        currentIndex={currentIndex}
        onChangeIndex={setCurrentIndex}
        disabled={isGalleryOpen || isAuthOpen}
        likesMap={likesMap}
        onToggleLike={handleToggleLike}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        currentUser={currentUser}
      />

      {/* Modal de galería (sobre todo) */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        games={GAMES}
        onSelectGame={handleSelectGame}
      />

      {/* Modal de autenticación */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={setCurrentUser}
        currentUser={currentUser}
      />
    </>
  );
}

export default App;
