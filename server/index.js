/**
 * server/index.js — Backend API para Scrollinn
 *
 * Endpoints:
 *  POST /api/auth  — Login o registro automático
 *    body: { username, password }
 *    - Si el usuario existe → verifica contraseña (login)
 *    - Si no existe → crea cuenta nueva (registro)
 */

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "Scrollinn",
  user: "postgres",
  password: "root",
});

const app = express();
app.use(cors());
app.use(express.json());

// Protección contra crashes no capturados
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

const SALT_ROUNDS = 10;

/**
 * POST /api/auth
 *
 * Body: { username: string, password: string }
 *
 * Respuestas:
 *  201 — Cuenta creada   { ok: true, action: "registered", user: { id, username } }
 *  200 — Login correcto  { ok: true, action: "logged_in",  user: { id, username } }
 *  401 — Contraseña mal  { ok: false, error: "Contraseña incorrecta" }
 *  400 — Datos faltantes { ok: false, error: "..." }
 */
app.post("/api/auth", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Nombre de usuario y contraseña son obligatorios." });
    }

    if (username.length > 30) {
      return res.status(400).json({ ok: false, error: "El nombre de usuario no puede tener más de 30 caracteres." });
    }

    if (password.length < 4) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 4 caracteres." });
    }

    // Buscar si el usuario ya existe
    const existing = await pool.query(
      "SELECT id, username, password_hash FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      // === Usuario existe → verificar contraseña ===
      const user = existing.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

      if (!match) {
        return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
      }

      return res.json({
        ok: true,
        action: "logged_in",
        user: { id: user.id, username: user.username },
      });
    }

    // === Usuario nuevo → crear cuenta ===
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
      [username, hash]
    );

    const newUser = result.rows[0];
    return res.status(201).json({
      ok: true,
      action: "registered",
      user: { id: newUser.id, username: newUser.username },
    });
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }
});

// ==========================================
// LIKES — Endpoints
// ==========================================

/**
 * GET /api/games/likes
 * Devuelve { gameId: totalLikes } para todos los juegos.
 * Opcionalmente acepta ?userId=<uuid> para incluir qué juegos ha likeado ese usuario.
 */
app.get("/api/games/likes", async (req, res) => {
  try {
    const { userId } = req.query;

    // Total likes de cada juego
    const gamesResult = await pool.query("SELECT id, total_likes FROM games");
    const likesMap = {};
    for (const row of gamesResult.rows) {
      likesMap[row.id] = { count: Number(row.total_likes), liked: false };
    }

    // Si hay usuario logueado, marcamos cuáles ha likeado
    if (userId) {
      const userLikes = await pool.query(
        "SELECT game_id FROM user_likes WHERE user_id = $1",
        [userId]
      );
      for (const row of userLikes.rows) {
        if (likesMap[row.game_id]) {
          likesMap[row.game_id].liked = true;
        }
      }
    }

    return res.json({ ok: true, likesMap });
  } catch (err) {
    console.error("Likes fetch error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }
});

/**
 * POST /api/games/:gameId/like
 * Body: { userId?: string, delta?: number }
 *
 * - Si se envía userId → toggle en user_likes (el trigger actualiza total_likes)
 * - Si NO se envía userId → like anónimo, incrementa/decrementa total_likes directamente
 *   delta: 1 para sumar, -1 para restar
 *
 * Devuelve { ok, liked, totalLikes }
 */
app.post("/api/games/:gameId/like", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, delta } = req.body;

    let liked;

    console.log(`[LIKE] Petición recibida → gameId: ${gameId}, userId: ${userId || "anónimo"}, delta: ${delta}`);

    if (userId) {
      // === Usuario registrado: toggle en user_likes ===
      const existing = await pool.query(
        "SELECT 1 FROM user_likes WHERE user_id = $1 AND game_id = $2",
        [userId, gameId]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          "DELETE FROM user_likes WHERE user_id = $1 AND game_id = $2",
          [userId, gameId]
        );
        liked = false;
        console.log(`[LIKE] Usuario ${userId} QUITÓ like de ${gameId}`);
      } else {
        await pool.query(
          "INSERT INTO user_likes (user_id, game_id) VALUES ($1, $2)",
          [userId, gameId]
        );
        liked = true;
        console.log(`[LIKE] Usuario ${userId} DIO like a ${gameId}`);
      }
    } else {
      // === Anónimo: incrementar/decrementar directamente ===
      const d = delta === -1 ? -1 : 1;
      await pool.query(
        "UPDATE games SET total_likes = GREATEST(total_likes + $1, 0) WHERE id = $2",
        [d, gameId]
      );
      liked = d === 1;
      console.log(`[LIKE] Anónimo ${d > 0 ? "DIO" : "QUITÓ"} like de ${gameId} (delta: ${d})`);
    }

    // Leer el total actualizado
    const result = await pool.query(
      "SELECT total_likes FROM games WHERE id = $1",
      [gameId]
    );
    const totalLikes = result.rows[0] ? Number(result.rows[0].total_likes) : 0;

    console.log(`[LIKE] Resultado → liked: ${liked}, totalLikes: ${totalLikes}`);

    return res.json({ ok: true, liked, totalLikes });
  } catch (err) {
    console.error("Like toggle error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }
});

// ==========================================
// SCORES — Endpoints
// ==========================================

/**
 * POST /api/scores
 * Body: { userId: string, gameId: string, score: number }
 *
 * Flujo:
 *  1. Valida que el usuario exista (autenticación obligatoria)
 *  2. Consulta is_lower_better del juego
 *  3. Obtiene el Top 20 de HOY para ese juego
 *  4. Si hay menos de 20, inserta directamente
 *  5. Si hay 20+, compara con el "corte" (puesto 20)
 *  6. Solo inserta si la puntuación supera el corte
 *
 * Devuelve { ok, saved, message, ranking[] }
 */
app.post("/api/scores", async (req, res) => {
  try {
    const { userId, gameId, score } = req.body;

    if (!userId || !gameId || score === undefined || score === null) {
      return res.status(400).json({ ok: false, error: "userId, gameId y score son obligatorios." });
    }

    // 1. Verificar que el usuario existe
    const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(401).json({ ok: false, saved: false, message: "Debes registrarte para entrar al ranking." });
    }

    // 2. Obtener is_lower_better del juego
    const gameCheck = await pool.query("SELECT id, is_lower_better FROM games WHERE id = $1", [gameId]);
    if (gameCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Juego no encontrado." });
    }
    const isLowerBetter = gameCheck.rows[0].is_lower_better;

    // 3. Obtener rango de HOY (desde medianoche UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const orderDir = isLowerBetter ? "ASC" : "DESC";

    let saved = false;
    let message = "";

    // 3a. ¿El usuario ya tiene entrada hoy para este juego?
    const existingResult = await pool.query(
      `SELECT id, score FROM scores
       WHERE user_id = $1 AND game_id = $2 AND achieved_at >= $3
       LIMIT 1`,
      [userId, gameId, todayISO]
    );

    if (existingResult.rows.length > 0) {
      // Ya tiene entrada → solo actualizar si mejora
      const current = existingResult.rows[0];
      const isBetter = isLowerBetter ? score < current.score : score > current.score;

      if (isBetter) {
        await pool.query(
          "UPDATE scores SET score = $1, achieved_at = NOW() WHERE id = $2",
          [score, current.id]
        );
        saved = true;
        message = "¡Nueva mejor marca de hoy!";
      } else {
        message = "No has superado tu mejor marca de hoy. ¡Sigue intentando!";
      }
    } else {
      // No tiene entrada → comprobar Top 20 (una por usuario)
      const top20Result = await pool.query(
        `SELECT sub.score FROM (
           SELECT DISTINCT ON (s.user_id) s.score
           FROM scores s
           WHERE s.game_id = $1 AND s.achieved_at >= $2
           ORDER BY s.user_id, s.score ${orderDir}
         ) sub
         ORDER BY sub.score ${orderDir}
         LIMIT 20`,
        [gameId, todayISO]
      );

      const top20 = top20Result.rows;

      if (top20.length < 20) {
        await pool.query(
          "INSERT INTO scores (user_id, game_id, score) VALUES ($1, $2, $3)",
          [userId, gameId, score]
        );
        saved = true;
        message = "¡Puntuación guardada!";
      } else {
        const cutoffScore = top20[top20.length - 1].score;
        const beatsCutoff = isLowerBetter ? score < cutoffScore : score > cutoffScore;

        if (beatsCutoff) {
          await pool.query(
            "INSERT INTO scores (user_id, game_id, score) VALUES ($1, $2, $3)",
            [userId, gameId, score]
          );
          saved = true;
          message = "¡Has entrado en el Top 20 de hoy!";
        } else {
          message = "No has superado el Top 20 de hoy. ¡Sigue intentando!";
        }
      }
    }

    // Incrementar total_plays siempre que se juega
    await pool.query("UPDATE games SET total_plays = total_plays + 1 WHERE id = $1", [gameId]);

    // ────────────────────────────────────────────────────────────────────────
    // 5. PROGRESO DE RETOS DIARIOS
    //
    // Tras cada partida, comprobamos si hay retos activos hoy que apliquen a
    // este juego (o a "cualquier juego" si target_game_id IS NULL).
    // Solo cuenta como "partida válida" si score >= target_score del reto.
    // Incrementamos current_progress hasta target_plays (nunca más allá).
    // No tocamos retos ya reclamados (is_claimed = true).
    // ────────────────────────────────────────────────────────────────────────
    try {
      const todayDate = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

      // 5a. Buscar retos activos hoy que apliquen a este juego (o a cualquier juego).
      //     La condición de score depende de is_lower_better:
      //       - Normal (higher is better): score >= target_score
      //       - Invertido (lower is better, ej: Timer): score <= target_score
      //     Si target_score = 0 (reto tipo "solo juega"), siempre se cumple.
      const scoreCondition = isLowerBetter
        ? "$2 <= target_score OR target_score = 0"
        : "$2 >= target_score";

      const challengesResult = await pool.query(
        `SELECT id, target_score, target_plays
         FROM daily_challenges
         WHERE active_date = $1
           AND (${scoreCondition})
           AND (target_game_id = $3 OR target_game_id IS NULL)`,
        [todayDate, score, gameId]
      );

      const matchingChallenges = challengesResult.rows;

      if (matchingChallenges.length > 0) {
        for (const challenge of matchingChallenges) {
          // 5b. Upsert en user_challenge_progress:
          //     - INSERT si no existe fila → current_progress = 1
          //     - UPDATE si existe, aún no reclamado y no ha llegado al objetivo
          //       → current_progress + 1 (sin superar target_plays)
          await pool.query(
            `INSERT INTO user_challenge_progress (user_id, challenge_id, current_progress, is_claimed, updated_at)
             VALUES ($1, $2, 1, false, NOW())
             ON CONFLICT (user_id, challenge_id) DO UPDATE
               SET current_progress = LEAST(
                     user_challenge_progress.current_progress + 1,
                     $3
                   ),
                   updated_at = NOW()
             WHERE user_challenge_progress.is_claimed = false
               AND user_challenge_progress.current_progress < $3`,
            [userId, challenge.id, challenge.target_plays]
          );
        }

        console.log(
          `[CHALLENGES] Usuario ${userId} — ${matchingChallenges.length} reto(s) evaluado(s) para ${gameId} (score: ${score})`
        );
      }
    } catch (challengeErr) {
      // No bloquear la respuesta si falla la lógica de retos
      console.warn("[CHALLENGES] Error al actualizar progreso:", challengeErr.message);
    }

    // 6. Devolver el ranking actualizado de hoy (1 entrada por usuario)
    const rankingResult = await pool.query(
      `SELECT sub.score, sub.username, sub.achieved_at FROM (
         SELECT DISTINCT ON (s.user_id) s.score, u.username, s.achieved_at
         FROM scores s
         JOIN users u ON u.id = s.user_id
         WHERE s.game_id = $1 AND s.achieved_at >= $2
         ORDER BY s.user_id, s.score ${orderDir}
       ) sub
       ORDER BY sub.score ${orderDir}
       LIMIT 20`,
      [gameId, todayISO]
    );

    const ranking = rankingResult.rows.map((r, i) => ({
      pos: i + 1,
      user: r.username,
      score: r.score,
    }));

    return res.json({ ok: true, saved, message, ranking });
  } catch (err) {
    console.error("Score submit error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }
});

/**
 * GET /api/scores/:gameId/today
 * Devuelve el Top 20 de hoy para un juego.
 */
app.get("/api/scores/:gameId/today", async (req, res) => {
  try {
    const { gameId } = req.params;

    // Obtener is_lower_better
    const gameCheck = await pool.query("SELECT is_lower_better FROM games WHERE id = $1", [gameId]);
    if (gameCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Juego no encontrado." });
    }
    const isLowerBetter = gameCheck.rows[0].is_lower_better;
    const orderDir = isLowerBetter ? "ASC" : "DESC";

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await pool.query(
      `SELECT sub.score, sub.username, sub.achieved_at FROM (
         SELECT DISTINCT ON (s.user_id) s.score, u.username, s.achieved_at
         FROM scores s
         JOIN users u ON u.id = s.user_id
         WHERE s.game_id = $1 AND s.achieved_at >= $2
         ORDER BY s.user_id, s.score ${orderDir}
       ) sub
       ORDER BY sub.score ${orderDir}
       LIMIT 20`,
      [gameId, todayStart.toISOString()]
    );

    const ranking = result.rows.map((r, i) => ({
      pos: i + 1,
      user: r.username,
      score: r.score,
    }));

    return res.json({ ok: true, ranking });
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    return res.status(500).json({ ok: false, error: "Error interno del servidor." });
  }
});

// Test de conexión a PostgreSQL al arrancar + auto-seed de juegos
pool.query("SELECT NOW()")
  .then(async (res) => {
    console.log("✅ PostgreSQL conectado:", res.rows[0].now);

    // Auto-seed: asegurar que todos los juegos existen en la tabla games
    try {
      await pool.query(`
        INSERT INTO games (id, name, is_lower_better) VALUES
          ('tower-blocks',  'Tower Blocks',   false),
          ('odd-one-out',   'Odd One Out',    false),
          ('circle-ninja',  'Circle Ninja',   false),
          ('color-match',   'Color Match',    true),
          ('circle-path',   'Circle Path',    false),
          ('neon-tap',      'Neon Tap',       false),
          ('stroop-effect', 'Stroop Effect',  false),
          ('timer',         'Timer',          true),
          ('traffic-light', 'Traffic Light',  true),
          ('sweet-spot',    'Sweet Spot',     false),
          ('dodge-rush',    'Dodge Rush',     false),
          ('frenzy-tap',    'Frenzy Tap',     false),
          ('perfect-scale', 'Perfect Scale',  true),
          ('swipe-sorter',  'Swipe Sorter',   false),
          ('math-rush',     'Math Rush',      false)
        ON CONFLICT (id) DO UPDATE SET
          name            = EXCLUDED.name,
          is_lower_better = EXCLUDED.is_lower_better
      `);
      console.log("✅ Juegos sincronizados en la BD");
    } catch (seedErr) {
      console.warn("⚠️  No se pudieron sincronizar los juegos:", seedErr.message);
    }
  })
  .catch((err) => {
    console.error("❌ No se pudo conectar a PostgreSQL:");
    console.error(`   Host: ${pool.options.host}:${pool.options.port}`);
    console.error(`   Database: ${pool.options.database}`);
    console.error(`   User: ${pool.options.user}`);
    console.error(`   Error: ${err.message}`);
    console.error("\n   Asegúrate de que:");
    console.error("   1. PostgreSQL está corriendo (pgAdmin → servicios)");
    console.error("   2. La base de datos existe: CREATE DATABASE \"Scrollinn\";");
    console.error("   3. Las tablas están creadas (ejecutar database/bd.sql)");
    console.error("   4. Usuario/contraseña son correctos\n");
  });

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Scrollinn API corriendo en http://localhost:${PORT}`);
});
