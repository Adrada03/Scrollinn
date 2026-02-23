/**
 * MentalMathGame.jsx — "Mental Math"
 *
 * Reflexive multiplication quiz with progressive difficulty.
 * Four multiple-choice answers using realistic "confusion" distractors.
 *
 * Flow:  IDLE → PLAYING → ENDED
 *
 * Timer: requestAnimationFrame + deltaTime (no setInterval).
 * Difficulty: time per round shrinks with score.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */

const MAX_GAME_WIDTH = 450;

const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

/** Time budget for the first question (seconds). */
const BASE_TIME = 5.0;
/** Minimum time budget (seconds). */
const MIN_TIME = 1.0;
/** Seconds removed per correct answer. */
const TIME_SHRINK = 0.15;

/** Calculate the max time allowed for the current score. */
function maxTimeForScore(score) {
  return Math.max(MIN_TIME, BASE_TIME - score * TIME_SHRINK);
}

/* ═══════════════════════════════════════════════════
   QUESTION GENERATOR
   ═══════════════════════════════════════════════════ */

/** Random int in [lo, hi] inclusive. */
function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Reverse digits of a number (56 → 65). */
function reverseDigits(n) {
  const s = String(n);
  if (s.length < 2) return n + randInt(1, 5); // single digit → fallback
  return parseInt(s.split("").reverse().join(""), 10);
}

/** Fisher-Yates shuffle (in place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a question object:
 *  { a, b, correct, options: number[4] }
 *
 * Distractors use "realistic confusion" strategies:
 *  - neighbour multiplication offsets
 *  - digit reversal
 *  - nearby ±2
 */
function generateQuestion() {
  const a = randInt(2, 10);
  const b = randInt(2, 10);
  const correct = a * b;

  const candidates = new Set();
  candidates.add(correct);

  // Strategy 1: a * (b ± 1)
  const s1a = a * (b + 1);
  const s1b = a * (b - 1);
  if (s1a !== correct && s1a > 0) candidates.add(s1a);
  if (s1b !== correct && s1b > 0) candidates.add(s1b);

  // Strategy 2: (a ± 1) * b
  const s2a = (a + 1) * b;
  const s2b = (a - 1) * b;
  if (s2a !== correct && s2a > 0) candidates.add(s2a);
  if (s2b !== correct && s2b > 0) candidates.add(s2b);

  // Strategy 3: reversed digits / sum / nearby
  if (correct > 10) {
    const rev = reverseDigits(correct);
    if (rev !== correct && rev > 0) candidates.add(rev);
  }
  candidates.add(a + b);
  candidates.add(correct + 2);
  candidates.add(correct - 2);

  // Remove correct from distractors pool, remove negatives/zero
  candidates.delete(correct);
  const pool = [...candidates].filter((v) => v > 0 && v !== correct);

  // Pick exactly 3 unique distractors
  shuffle(pool);
  const distractors = pool.slice(0, 3);

  // Safety: if we somehow have < 3, fill with random offsets
  while (distractors.length < 3) {
    const fallback = correct + randInt(-10, 10);
    if (fallback > 0 && fallback !== correct && !distractors.includes(fallback)) {
      distractors.push(fallback);
    }
  }

  const options = shuffle([correct, ...distractors]);
  return { a, b, correct, options };
}

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */

const MentalMathGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  /* ── State ── */
  const [phase, setPhase] = useState(STATES.IDLE);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null); // null | 'correct' | index of wrong
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);

  /* ── Refs ── */
  const phaseRef = useRef(STATES.IDLE);
  const scoreRef = useRef(0);
  const timeLeftRef = useRef(BASE_TIME);
  const maxTimeRef = useRef(BASE_TIME);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const scoreSubmitted = useRef(false);
  const feedbackTimeoutRef = useRef(null);

  // Direct DOM refs for the timer bar (bypass React for 60 fps updates)
  const barFillRef = useRef(null);
  const barTextRef = useRef(null);

  const { submit } = useSubmitScore(userId, GAME_IDS.MentalMathGame);

  /* ── RAF Timer Loop (direct DOM updates — no React re-renders) ── */
  const syncBarDOM = useCallback(() => {
    const pct = maxTimeRef.current > 0
      ? Math.max(0, timeLeftRef.current / maxTimeRef.current)
      : 0;

    // Update bar width
    if (barFillRef.current) {
      barFillRef.current.style.width = `${pct * 100}%`;

      // Color
      const grad =
        pct > 0.5
          ? "linear-gradient(90deg, #10b981, #34d399)"
          : pct > 0.25
            ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
            : "linear-gradient(90deg, #ef4444, #f87171)";
      barFillRef.current.style.background = grad;

      // Glow
      const glow =
        pct > 0.5
          ? "0 0 8px rgba(16,185,129,0.4)"
          : pct > 0.25
            ? "0 0 8px rgba(245,158,11,0.4)"
            : "0 0 10px rgba(239,68,68,0.5)";
      barFillRef.current.style.boxShadow = glow;
    }

    // Update time text
    if (barTextRef.current) {
      barTextRef.current.textContent = `${timeLeftRef.current.toFixed(2)}s`;
    }
  }, []);

  const startTimerLoop = useCallback(() => {
    lastFrameRef.current = performance.now();

    const tick = (now) => {
      if (phaseRef.current !== STATES.PLAYING) return;

      const dt = (now - lastFrameRef.current) / 1000; // seconds
      lastFrameRef.current = now;

      timeLeftRef.current -= dt;

      if (timeLeftRef.current <= 0) {
        timeLeftRef.current = 0;
        syncBarDOM();
        // Time's up → end game
        phaseRef.current = STATES.ENDED;
        setPhase(STATES.ENDED);
        return;
      }

      syncBarDOM();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [syncBarDOM]);

  const stopTimerLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /* ── Next Round ── */
  const nextRound = useCallback(
    (currentScore) => {
      const mt = maxTimeForScore(currentScore);
      maxTimeRef.current = mt;
      timeLeftRef.current = mt;
      setQuestion(generateQuestion());
      setFeedback(null);

      // Sync bar immediately for new round
      syncBarDOM();

      // Restart RAF
      lastFrameRef.current = performance.now();
    },
    [syncBarDOM]
  );

  /* ── Start Game ── */
  const startGame = useCallback(() => {
    scoreRef.current = 0;
    phaseRef.current = STATES.PLAYING;
    scoreSubmitted.current = false;

    setScore(0);
    setPhase(STATES.PLAYING);
    setRanking([]);
    setScoreMessage("");

    nextRound(0);
    startTimerLoop();
  }, [nextRound, startTimerLoop]);

  /* ── Handle Answer ── */
  const handleAnswer = useCallback(
    (value, index) => {
      if (phaseRef.current !== STATES.PLAYING || feedback !== null) return;

      stopTimerLoop();

      if (value === question.correct) {
        // Correct!
        setFeedback("correct");
        scoreRef.current += 1;
        setScore(scoreRef.current);

        // Brief flash then next round
        feedbackTimeoutRef.current = setTimeout(() => {
          if (phaseRef.current !== STATES.PLAYING) return;
          nextRound(scoreRef.current);
          startTimerLoop();
        }, 300);
      } else {
        // Wrong → end game
        setFeedback(index);
        feedbackTimeoutRef.current = setTimeout(() => {
          phaseRef.current = STATES.ENDED;
          setPhase(STATES.ENDED);
        }, 600);
      }
    },
    [question, feedback, nextRound, startTimerLoop, stopTimerLoop]
  );

  /* ── Auto-start when active ── */
  useEffect(() => {
    if (isActive && phase === STATES.IDLE) {
      startGame();
    }
  }, [isActive, phase, startGame]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      stopTimerLoop();
      clearTimeout(feedbackTimeoutRef.current);
    };
  }, [stopTimerLoop]);

  /* ── Score Submission ── */
  useEffect(() => {
    if (phase === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (phase === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [phase, score, submit, t]);

  /* ── Replay handler ── */
  const handleReplay = useCallback(() => {
    stopTimerLoop();
    clearTimeout(feedbackTimeoutRef.current);
    phaseRef.current = STATES.IDLE;
    setPhase(STATES.IDLE);
    setScore(0);
    setQuestion(null);
    setFeedback(null);
    timeLeftRef.current = BASE_TIME;
    maxTimeRef.current = BASE_TIME;
    if (onReplay) onReplay();
  }, [stopTimerLoop, onReplay]);

  /* ── Derived ── */
  const isPlaying = phase === STATES.PLAYING;
  const isEnded = phase === STATES.ENDED;

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */

  return (
    <div className="relative h-full w-full flex items-center justify-center select-none overflow-hidden bg-[#0b0f1a]">
      {/* ── Confined game area ── */}
      <div className="max-w-[450px] mx-auto w-full h-full relative flex flex-col items-center justify-center px-4">
        {/* ── Hint IDLE ── */}
        {phase === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-mentalmath.png"
                alt="Mental Math"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("desc.mental-math")}
              </span>
            </div>
          </div>
        )}

        {/* ── PLAYING screen ── */}
        {isPlaying && question && (
          <div className="w-full flex flex-col items-center gap-5">
            {/* Score */}
            <div className="w-full flex justify-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-2 border border-white/10">
                <span className="text-white/40 text-xs font-bold uppercase tracking-widest mr-2">
                  Score
                </span>
                <span
                  className="text-white text-2xl font-black tabular-nums"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {score}
                </span>
              </div>
            </div>

            {/* Question */}
            <div className="flex items-center justify-center py-4">
              <span className="text-white text-6xl sm:text-7xl font-black tracking-tight drop-shadow-lg">
                {question.a}
                <span className="text-white/40 mx-2">×</span>
                {question.b}
              </span>
            </div>

            {/* Timer Bar */}
            <div
              className="relative w-full overflow-hidden"
              style={{
                height: "14px",
                borderRadius: "7px",
                background: "rgba(15,23,42,0.85)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
              }}
            >
              {/* Fill bar — updated directly via ref in RAF loop */}
              <div
                ref={barFillRef}
                className="absolute top-0 left-0 bottom-0"
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  background: "linear-gradient(90deg, #10b981, #34d399)",
                  boxShadow: "0 0 8px rgba(16,185,129,0.4)",
                }}
              />
            </div>

            {/* Time remaining text — updated directly via ref in RAF loop */}
            <p
              ref={barTextRef}
              className="text-white/30 text-xs font-mono tabular-nums -mt-2"
            >
              {BASE_TIME.toFixed(2)}s
            </p>

            {/* Options Grid 2×2 */}
            <div className="w-full grid grid-cols-2 gap-4 mt-2">
              {question.options.map((opt, i) => {
                let btnClass =
                  "w-full py-5 rounded-2xl text-2xl sm:text-3xl font-black transition-all duration-150 border-2 ";

                if (feedback === "correct" && opt === question.correct) {
                  // Correct answer flash
                  btnClass +=
                    "bg-emerald-500/30 border-emerald-400 text-emerald-300 scale-105";
                } else if (feedback === i) {
                  // Wrong answer selected
                  btnClass +=
                    "bg-red-500/30 border-red-400 text-red-300 scale-95";
                } else if (
                  feedback !== null &&
                  feedback !== "correct" &&
                  opt === question.correct
                ) {
                  // Show correct when wrong was picked
                  btnClass +=
                    "bg-emerald-500/20 border-emerald-400/50 text-emerald-300/80";
                } else if (feedback !== null) {
                  // Dimmed during feedback
                  btnClass +=
                    "bg-white/5 border-white/5 text-white/20 pointer-events-none";
                } else {
                  // Normal interactive state
                  btnClass +=
                    "bg-white/10 border-white/10 text-white hover:bg-white/20 hover:border-white/20 active:scale-95 cursor-pointer";
                }

                return (
                  <button
                    key={i}
                    className={btnClass}
                    onClick={() => handleAnswer(opt, i)}
                    disabled={feedback !== null}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ENDED screen ── */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle="correct answers"
            onReplay={handleReplay}
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            isLoading={isRankingLoading}
          />
        )}
      </div>
    </div>
  );
};

export default MentalMathGame;
