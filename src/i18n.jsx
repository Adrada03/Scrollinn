/**
 * i18n.jsx — Sistema de internacionalización (ES/EN)
 *
 * Exporta:
 *  - t(key, params?)  — función standalone para traducir (funciona en cualquier sitio)
 *  - getLang()         — idioma actual
 *  - setLang(lang)     — cambiar idioma
 *  - LanguageProvider  — wrapper React que dispara re-renders al cambiar
 *  - useLanguage()     — hook: { lang, toggleLang, t }
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

// ─── Traducciones ────────────────────────────────────────────────────────────

const translations = {
  es: {
    // ── UI General ──────────────────────────────
    "ui.preparing":       "Preparando...",
    "ui.playing":         "En juego",
    "ui.like":            "Me gusta",
    "ui.my_account":      "Mi cuenta",
    "ui.register_aria":   "Registrarse",
    "ui.register_label":  "Registro",
    "ui.gallery_aria":    "Galería de juegos",
    "ui.games":           "Juegos",
    "ui.swipe_hint":      "Desliza para cambiar de juego",

    // ── Auth Modal ──────────────────────────────
    "auth.fill_both":      "Rellena ambos campos.",
    "auth.account_created":"¡Cuenta creada! Bienvenido, {{username}} 🎉",
    "auth.welcome_back":   "¡Hola de nuevo, {{username}}! 👋",
    "auth.connection_error":"No se pudo conectar con el servidor.",
    "auth.your_account":   "Tu cuenta",
    "auth.login_register": "Entrar / Registrarse",
    "auth.close":          "Cerrar",
    "auth.logout":         "Cerrar sesión",
    "auth.username":       "Nombre de usuario",
    "auth.username_ph":    "Tu nombre...",
    "auth.password":       "Contraseña",
    "auth.dont_forget":    "¡No olvides tu contraseña!",
    "auth.no_recovery":    "No hay forma de recuperarla. Si la pierdes, no podrás volver a acceder a tu cuenta.",
    "auth.connecting":     "Conectando...",
    "auth.continue":       "Continuar",
    "auth.auto_create":    "Si no tienes cuenta, se creará una automáticamente.",

    // ── Countdown ───────────────────────────────
    "countdown.how_to_play": "Cómo jugar",

    // ── Gallery Modal ───────────────────────────
    "gallery.choose":      "Elige un juego",

    // ── Game Over Panel ─────────────────────────
    "gameover.user":       "Usuario",
    "gameover.points":     "Puntos",
    "gameover.loading":    "Cargando ranking...",
    "gameover.next":       "Siguiente juego",

    // ── Services ────────────────────────────────
    "svc.username_required":  "Nombre de usuario y contraseña son obligatorios.",
    "svc.username_too_long":  "El nombre de usuario no puede tener más de 30 caracteres.",
    "svc.password_too_short": "La contraseña debe tener al menos 4 caracteres.",
    "svc.wrong_password":     "Contraseña incorrecta.",
    "svc.username_taken":     "Ese nombre de usuario ya está cogido.",
    "svc.db_error":           "Error de conexión con la base de datos.",
    "svc.login_required":     "Debes iniciar sesión para dar like",
    "svc.like_added":         "Like añadido",
    "svc.like_removed":       "Like eliminado",
    "svc.game_not_found":     "Juego no encontrado",
    "svc.score_saved":        "¡Puntuación registrada!",
    "svc.top5_made":          "¡Estás en el Top 5!",
    "svc.register_to_save":   "Regístrate para guardar tu puntuación",
    "svc.score_error":        "Error al enviar puntuación.",

    // ── Game Descriptions (games.js) ────────────
    "desc.tower-blocks":   "Toca en el momento justo para apilar los bloques",
    "desc.odd-one-out":    "Encuentra el color diferente antes de que se acabe el tiempo",
    "desc.circle-ninja":   "Desliza para cortar los círculos verdes, evita los rojos",
    "desc.color-match":    "Inunda el tablero de un solo color en pocos movimientos",
    "desc.circle-path":    "Toca en el momento justo para saltar al siguiente círculo",
    "desc.hextris":        "Gira el hexágono y combina bloques del mismo color",
    "desc.neon-tap":       "Toca el cuadrado iluminado antes de que desaparezca",
    "desc.stroop-effect":  "Toca el color de la tinta, no lo que dice la palabra",
    "desc.timer":          "Para el cronómetro exactamente en 09:999",
    "desc.traffic-light":  "Toca la pantalla cuando se ponga verde",
    "desc.sweet-spot":     "Detén la línea justo en la zona verde",
    "desc.dodge-rush":     "Esquiva los obstáculos el mayor tiempo posible",
    "desc.frenzy-tap":     "Machaca el botón lo más rápido posible en 10s",
    "desc.perfect-scale":  "Infla el globo hasta encajar en el círculo",
    "desc.swipe-sorter":   "Clasifica las cartas deslizando al lado correcto",
    "desc.math-rush":      "¿Verdadero o falso? Responde antes de que se agote el tiempo",
    "desc.stick-bridge":   "Mantén para hacer crecer el puente y cruza al otro lado",
    "desc.drop-the-box":   "Suelta la caja en el momento justo para apilar la torre",
    "desc.overheat":       "Haz el número exacto de taps sin sobrecalentar el motor",
    "desc.memory-loop":    "Memoriza la secuencia y repítela sin fallar",

    // ── CircleNinja ─────────────────────────────
    "circleninja.instruction":      "Desliza para cortar los verdes 🟢",
    "circleninja.too_many_escaped": "Se te escaparon demasiados",
    "circleninja.cut_red":          "¡Cortaste un rojo!",

    // ── CirclePath ──────────────────────────────
    "circlepath.instruction": "Toca para saltar al siguiente círculo",
    "circlepath.reached":     "Has alcanzado {{score}} {{unit}}",
    "circlepath.point":       "punto",
    "circlepath.points":      "puntos",

    // ── ColorMatch ──────────────────────────────
    "colormatch.moves":     "Movimientos",
    "colormatch.zone":      "Zona",
    "colormatch.victory":   "¡Victoria!",
    "colormatch.completed": "Completaste el tablero en {{moves}} movimientos",
    "colormatch.reached":   "Llegaste al {{progress}}% del tablero",

    // ── DodgeRush ───────────────────────────────
    "dodgerush.seconds":  "segundos",
    "dodgerush.subtitle": "sobrevividos",

    // ── DropTheBox ──────────────────────────────
    "dropthebox.instruction":  "Toca para soltar la caja",
    "dropthebox.tap_drop":     "Toca para soltar",
    "dropthebox.boxes_stacked":"cajas apiladas",
    "dropthebox.speed":        "Velocidad",

    // ── FrenzyTap ───────────────────────────────
    // (solo usa svc.score_error + subtitle "taps" que es universal)

    // ── Hextris ─────────────────────────────────
    "hextris.subtitle": "puntos",

    // ── MathRush ────────────────────────────────
    "mathrush.true":     "Verdadero",
    "mathrush.false":    "Falso",
    "mathrush.subtitle": "respuestas correctas",

    // ── NeonTap ─────────────────────────────────
    "neontap.instruction": "Toca el cuadrado iluminado",
    "neontap.subtitle":    "puntos",

    // ── OddOneOut ───────────────────────────────
    "oddoneout.level":       "Nivel {{level}}",
    "oddoneout.instruction": "Encuentra al infiltrado",
    "oddoneout.reached":     "Nivel alcanzado: {{level}}",

    // ── PerfectScale ────────────────────────────
    "perfectscale.perfect":       "¡PERFECTO!",
    "perfectscale.almost":        "¡Casi perfecto!",
    "perfectscale.great":         "¡Muy bien!",
    "perfectscale.not_bad":       "Nada mal",
    "perfectscale.keep_trying":   "Sigue intentando",
    "perfectscale.hold_inflate":  "Mantén pulsado para inflar",
    "perfectscale.release":       "¡Suelta para fijar!",
    "perfectscale.inflate_edge":  "Infla el globo hasta el borde",
    "perfectscale.px_diff":       "px de diferencia",
    "perfectscale.target":        "Objetivo",
    "perfectscale.your_balloon":  "Tu globo",
    "perfectscale.subtitle":      "de diferencia",

    // ── StickBridge ─────────────────────────────
    "stickbridge.instruction": "Mantén para hacer crecer el puente",
    "stickbridge.hold":        "Mantén pulsado",
    "stickbridge.subtitle":    "plataformas",

    // ── StroopEffect ────────────────────────────
    "stroop.red":         "ROJO",
    "stroop.blue":        "AZUL",
    "stroop.green":       "VERDE",
    "stroop.yellow":      "AMARILLO",
    "stroop.points":      "Puntos",
    "stroop.instruction": "Toca el color de la tinta, no la palabra",
    "stroop.subtitle":    "puntos",

    // ── SweetSpot ───────────────────────────────
    "sweetspot.tap_green":   "Toca cuando esté en verde",
    "sweetspot.consecutive": "aciertos seguidos",
    "sweetspot.instruction": "Detén la línea en la zona verde",
    "sweetspot.subtitle":    "aciertos",

    // ── SwipeSorter ─────────────────────────────
    "swipesorter.instruction": "Desliza al lado correcto",
    "swipesorter.subtitle":    "cartas clasificadas",
    "swipesorter.red":         "ROJA",
    "swipesorter.blue":        "AZUL",
    "swipesorter.left":        "← Izquierda",
    "swipesorter.right":       "Derecha →",

    // ── Timer ───────────────────────────────────
    "timer.perfect":    "¡PERFECTO! 🎯",
    "timer.incredible": "¡Increíble! 🔥",
    "timer.very_close": "¡Muy cerca! ⚡",
    "timer.good_try":   "¡Buen intento! 👏",
    "timer.not_bad":    "No está mal 🤔",
    "timer.can_improve":"Puedes mejorar 💪",
    "timer.keep_trying":"Sigue intentando 😅",
    "timer.target":     "Objetivo",
    "timer.tap_stop":   "¡Toca para parar!",
    "timer.difference": "Diferencia",
    "timer.instruction":"Para el cronómetro en 09:999",
    "timer.subtitle":   "de diferencia",
    "timer.title_amazing": "¡Increíble!",

    // ── TowerBlocks ─────────────────────────────
    "tower.instruction": "Toca en el momento justo para apilar los bloques",
    "tower.tap_play":    "Toca para jugar",
    "tower.tap_place":   "Toca para colocar el bloque",
    "tower.score":       "Puntuación: {{score}}",

    // ── TrafficLight ────────────────────────────
    "traffic.too_soon":       "¡Demasiado pronto! 🚫",
    "traffic.superhuman":     "¡Sobrehumano! ⚡",
    "traffic.incredible":     "¡Increíble! 🔥",
    "traffic.very_fast":      "¡Muy rápido! 🎯",
    "traffic.good_reflex":    "Buen reflejo 👏",
    "traffic.not_bad":        "No está mal 🤔",
    "traffic.faster":         "Puedes más rápido 💪",
    "traffic.wait":           "ESPERA...",
    "traffic.dont_touch":     "No toques aún",
    "traffic.tap":            "¡TOCA!",
    "traffic.milliseconds":   "milisegundos",
    "traffic.touched_early":  "Tocaste antes de que se pusiera verde",
    "traffic.tap_when_green": "Toca cuando se ponga verde",
    "traffic.title_early":    "¡Demasiado pronto!",
    "traffic.title_amazing":  "¡Increíble!",
    "traffic.penalty":        "penalización",
    "traffic.reaction":       "de reacción",

    // ── Memory Loop ─────────────────────────────
    "memoryloop.instruction": "Memoriza y repite la secuencia",
    "memoryloop.subtitle":    "rondas completadas",

    // ── Overheat ────────────────────────────────
    "overheat.round":     "Ronda",
    "overheat.score":     "Puntuación",
    "overheat.target":    "OBJETIVO",
    "overheat.remaining": "restantes",
    "overheat.rounds":    "rondas",
    "overheat.hold":      "¡NO TOQUES!",
  },

  en: {
    // ── UI General ──────────────────────────────
    "ui.preparing":       "Preparing...",
    "ui.playing":         "Playing",
    "ui.like":            "Like",
    "ui.my_account":      "My account",
    "ui.register_aria":   "Sign up",
    "ui.register_label":  "Sign up",
    "ui.gallery_aria":    "Game gallery",
    "ui.games":           "Games",
    "ui.swipe_hint":      "Swipe to change game",

    // ── Auth Modal ──────────────────────────────
    "auth.fill_both":      "Please fill in both fields.",
    "auth.account_created":"Account created! Welcome, {{username}} 🎉",
    "auth.welcome_back":   "Welcome back, {{username}}! 👋",
    "auth.connection_error":"Could not connect to the server.",
    "auth.your_account":   "Your account",
    "auth.login_register": "Log in / Sign up",
    "auth.close":          "Close",
    "auth.logout":         "Log out",
    "auth.username":       "Username",
    "auth.username_ph":    "Your name...",
    "auth.password":       "Password",
    "auth.dont_forget":    "Don't forget your password!",
    "auth.no_recovery":    "There is no way to recover it. If you lose it, you won't be able to access your account again.",
    "auth.connecting":     "Connecting...",
    "auth.continue":       "Continue",
    "auth.auto_create":    "If you don't have an account, one will be created automatically.",

    // ── Countdown ───────────────────────────────
    "countdown.how_to_play": "How to play",

    // ── Gallery Modal ───────────────────────────
    "gallery.choose":      "Choose a game",

    // ── Game Over Panel ─────────────────────────
    "gameover.user":       "User",
    "gameover.points":     "Points",
    "gameover.loading":    "Loading ranking...",
    "gameover.next":       "Next game",

    // ── Services ────────────────────────────────
    "svc.username_required":  "Username and password are required.",
    "svc.username_too_long":  "Username cannot be longer than 30 characters.",
    "svc.password_too_short": "Password must be at least 4 characters.",
    "svc.wrong_password":     "Wrong password.",
    "svc.username_taken":     "That username is already taken.",
    "svc.db_error":           "Database connection error.",
    "svc.login_required":     "You must log in to like",
    "svc.like_added":         "Like added",
    "svc.like_removed":       "Like removed",
    "svc.game_not_found":     "Game not found",
    "svc.score_saved":        "Score saved!",
    "svc.top5_made":          "You're in the Top 5!",
    "svc.register_to_save":   "Sign up to save your score",
    "svc.score_error":        "Error submitting score.",

    // ── Game Descriptions ───────────────────────
    "desc.tower-blocks":   "Tap at the right moment to stack the blocks",
    "desc.odd-one-out":    "Find the different color before time runs out",
    "desc.circle-ninja":   "Swipe to cut the green circles, avoid the red ones",
    "desc.color-match":    "Flood the board with a single color in few moves",
    "desc.circle-path":    "Tap at the right moment to jump to the next circle",
    "desc.hextris":        "Rotate the hexagon and match blocks of the same color",
    "desc.neon-tap":       "Tap the lit square before it disappears",
    "desc.stroop-effect":  "Tap the ink color, not what the word says",
    "desc.timer":          "Stop the timer exactly at 09:999",
    "desc.traffic-light":  "Tap the screen when it turns green",
    "desc.sweet-spot":     "Stop the line right in the green zone",
    "desc.dodge-rush":     "Dodge the obstacles as long as possible",
    "desc.frenzy-tap":     "Smash the button as fast as you can in 10s",
    "desc.perfect-scale":  "Inflate the balloon to fit inside the circle",
    "desc.swipe-sorter":   "Sort the cards by swiping to the correct side",
    "desc.math-rush":      "True or false? Answer before time runs out",
    "desc.stick-bridge":   "Hold to grow the bridge and cross to the other side",
    "desc.drop-the-box":   "Drop the box at the right moment to stack the tower",
    "desc.overheat":       "Tap the exact number without overheating the engine",
    "desc.memory-loop":    "Memorize the sequence and repeat it without mistakes",

    // ── CircleNinja ─────────────────────────────
    "circleninja.instruction":      "Swipe to cut the green ones 🟢",
    "circleninja.too_many_escaped": "Too many escaped",
    "circleninja.cut_red":          "You cut a red one!",

    // ── CirclePath ──────────────────────────────
    "circlepath.instruction": "Tap to jump to the next circle",
    "circlepath.reached":     "You reached {{score}} {{unit}}",
    "circlepath.point":       "point",
    "circlepath.points":      "points",

    // ── ColorMatch ──────────────────────────────
    "colormatch.moves":     "Moves",
    "colormatch.zone":      "Zone",
    "colormatch.victory":   "Victory!",
    "colormatch.completed": "Completed the board in {{moves}} moves",
    "colormatch.reached":   "You reached {{progress}}% of the board",

    // ── DodgeRush ───────────────────────────────
    "dodgerush.seconds":  "seconds",
    "dodgerush.subtitle": "survived",

    // ── DropTheBox ──────────────────────────────
    "dropthebox.instruction":  "Tap to drop the box",
    "dropthebox.tap_drop":     "Tap to drop",
    "dropthebox.boxes_stacked":"boxes stacked",
    "dropthebox.speed":        "Speed",

    // ── Hextris ─────────────────────────────────
    "hextris.subtitle": "points",

    // ── MathRush ────────────────────────────────
    "mathrush.true":     "True",
    "mathrush.false":    "False",
    "mathrush.subtitle": "correct answers",

    // ── NeonTap ─────────────────────────────────
    "neontap.instruction": "Tap the lit square",
    "neontap.subtitle":    "points",

    // ── OddOneOut ───────────────────────────────
    "oddoneout.level":       "Level {{level}}",
    "oddoneout.instruction": "Find the odd one",
    "oddoneout.reached":     "Level reached: {{level}}",

    // ── PerfectScale ────────────────────────────
    "perfectscale.perfect":       "PERFECT!",
    "perfectscale.almost":        "Almost perfect!",
    "perfectscale.great":         "Great!",
    "perfectscale.not_bad":       "Not bad",
    "perfectscale.keep_trying":   "Keep trying",
    "perfectscale.hold_inflate":  "Hold to inflate",
    "perfectscale.release":       "Release to lock!",
    "perfectscale.inflate_edge":  "Inflate the balloon to the edge",
    "perfectscale.px_diff":       "px difference",
    "perfectscale.target":        "Target",
    "perfectscale.your_balloon":  "Your balloon",
    "perfectscale.subtitle":      "difference",

    // ── StickBridge ─────────────────────────────
    "stickbridge.instruction": "Hold to grow the bridge",
    "stickbridge.hold":        "Hold",
    "stickbridge.subtitle":    "platforms",

    // ── StroopEffect ────────────────────────────
    "stroop.red":         "RED",
    "stroop.blue":        "BLUE",
    "stroop.green":       "GREEN",
    "stroop.yellow":      "YELLOW",
    "stroop.points":      "Points",
    "stroop.instruction": "Tap the ink color, not the word",
    "stroop.subtitle":    "points",

    // ── SweetSpot ───────────────────────────────
    "sweetspot.tap_green":   "Tap when it turns green",
    "sweetspot.consecutive": "consecutive hits",
    "sweetspot.instruction": "Stop the line in the green zone",
    "sweetspot.subtitle":    "hits",

    // ── SwipeSorter ─────────────────────────────
    "swipesorter.instruction": "Swipe to the correct side",
    "swipesorter.subtitle":    "cards sorted",
    "swipesorter.red":         "RED",
    "swipesorter.blue":        "BLUE",
    "swipesorter.left":        "← Left",
    "swipesorter.right":       "Right →",

    // ── Timer ───────────────────────────────────
    "timer.perfect":    "PERFECT! 🎯",
    "timer.incredible": "Incredible! 🔥",
    "timer.very_close": "So close! ⚡",
    "timer.good_try":   "Good try! 👏",
    "timer.not_bad":    "Not bad 🤔",
    "timer.can_improve":"You can improve 💪",
    "timer.keep_trying":"Keep trying 😅",
    "timer.target":     "Target",
    "timer.tap_stop":   "Tap to stop!",
    "timer.difference": "Difference",
    "timer.instruction":"Stop the timer at 09:999",
    "timer.subtitle":   "difference",
    "timer.title_amazing": "Incredible!",

    // ── TowerBlocks ─────────────────────────────
    "tower.instruction": "Tap at the right moment to stack the blocks",
    "tower.tap_play":    "Tap to play",
    "tower.tap_place":   "Tap to place the block",
    "tower.score":       "Score: {{score}}",

    // ── TrafficLight ────────────────────────────
    "traffic.too_soon":       "Too soon! 🚫",
    "traffic.superhuman":     "Superhuman! ⚡",
    "traffic.incredible":     "Incredible! 🔥",
    "traffic.very_fast":      "Very fast! 🎯",
    "traffic.good_reflex":    "Good reflex 👏",
    "traffic.not_bad":        "Not bad 🤔",
    "traffic.faster":         "You can be faster 💪",
    "traffic.wait":           "WAIT...",
    "traffic.dont_touch":     "Don't touch yet",
    "traffic.tap":            "TAP!",
    "traffic.milliseconds":   "milliseconds",
    "traffic.touched_early":  "You tapped before it turned green",
    "traffic.tap_when_green": "Tap when it turns green",
    "traffic.title_early":    "Too soon!",
    "traffic.title_amazing":  "Incredible!",
    "traffic.penalty":        "penalty",
    "traffic.reaction":       "reaction time",

    // ── Memory Loop ─────────────────────────────
    "memoryloop.instruction": "Memorize and repeat the sequence",
    "memoryloop.subtitle":    "rounds completed",

    // ── Overheat ────────────────────────────────
    "overheat.round":     "Round",
    "overheat.score":     "Score",
    "overheat.target":    "TARGET",
    "overheat.remaining": "left",
    "overheat.rounds":    "rounds",
    "overheat.hold":      "DON'T TOUCH!",
  },
};

// ─── Store reactivo (funciona fuera de React) ────────────────────────────────

let _lang = (() => {
  try { return localStorage.getItem("scrollinn-lang") || "es"; } catch { return "es"; }
})();

const _listeners = new Set();

export function getLang() { return _lang; }

export function setLang(lang) {
  _lang = lang;
  try { localStorage.setItem("scrollinn-lang", lang); } catch { /* SSR / privacy */ }
  _listeners.forEach((fn) => fn(lang));
}

function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Traduce una clave. Interpola {{param}} si se pasan params.
 * Usable dentro y fuera de React.
 */
export function t(key, params) {
  const val = translations[_lang]?.[key] ?? translations.es[key] ?? key;
  if (!params) return val;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
}

// ─── React Context ───────────────────────────────────────────────────────────

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(_lang);

  useEffect(() => {
    return subscribe((newLang) => setLangState(newLang));
  }, []);

  const toggleLang = useCallback(() => {
    setLang(_lang === "es" ? "en" : "es");
  }, []);

  // `t` es la función standalone, siempre lee _lang actual.
  // `lang` en el value fuerza re-render de consumidores al cambiar.
  const value = useMemo(() => ({ lang, toggleLang, t }), [lang, toggleLang]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be inside LanguageProvider");
  return ctx;
}
