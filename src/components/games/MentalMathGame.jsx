/**
 * MentalMathGame.jsx — "Mental Math"
 *
 * Reflexive multiplication quiz with progressive difficulty.
 * Light-mode "Modern Clean / Playful" aesthetic (Kahoot / Duolingo style).
 *
 * Flow:  IDLE → PLAYING → ENDED
 *
 * Timer: requestAnimationFrame + deltaTime (no setInterval).
 * Difficulty: numbers scale with score, time shrinks progressively.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */

const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

const BASE_TIME = 10.0;
const MIN_TIME = 3.5;
const TIME_SHRINK = 0.25;

function maxTimeForScore(score) {
  return Math.max(MIN_TIME, BASE_TIME - score * TIME_SHRINK);
}

/* ═══════════════════════════════════════════════════
   CSS KEYFRAMES (injected once)
   ═══════════════════════════════════════════════════ */

const STYLE_ID = "mm-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes mm-pop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.25); }
      70%  { transform: scale(0.95); }
      100% { transform: scale(1); }
    }
    @keyframes mm-shake {
      0%, 100% { transform: translateX(0); }
      15%  { transform: translateX(-6px); }
      30%  { transform: translateX(6px); }
      45%  { transform: translateX(-5px); }
      60%  { transform: translateX(5px); }
      75%  { transform: translateX(-3px); }
      90%  { transform: translateX(3px); }
    }
    @keyframes mm-fade-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes mm-pulse-low {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.5; }
    }
    .mm-pop    { animation: mm-pop 0.35s cubic-bezier(.36,1.2,.5,1) forwards; }
    .mm-shake  { animation: mm-shake 0.45s ease-in-out; }
    .mm-fade-in { animation: mm-fade-in 0.3s ease-out both; }
    .mm-pulse-low { animation: mm-pulse-low 0.4s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════
   QUESTION GENERATOR (Escalable)
   ═══════════════════════════════════════════════════ */

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function reverseDigits(n) {
  const s = String(n);
  if (s.length < 2) return n + randInt(1, 5);
  return parseInt(s.split("").reverse().join(""), 10);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Scalable question generator:
 *  Score  0-5 : simple tables (2-9 × 2-9)
 *  Score  6-15: 1 digit × 2 low digits (2-9 × 10-19)
 *  Score 16+  : 2 digits × 2 digits (10-19 × 10-25)
 */
function generateQuestion(score = 0) {
  let a, b;

  if (score <= 5) {
    a = randInt(2, 9);
    b = randInt(2, 9);
  } else if (score <= 15) {
    a = randInt(2, 9);
    b = randInt(10, 19);
  } else {
    a = randInt(10, 19);
    b = randInt(10, 25);
  }

  // Randomly swap so the display varies
  if (Math.random() > 0.5) [a, b] = [b, a];

  const correct = a * b;
  const candidates = new Set();

  // Neighbour strategies
  candidates.add(a * (b + 1));
  candidates.add(a * (b - 1));
  candidates.add((a + 1) * b);
  candidates.add((a - 1) * b);

  // Reversed digits
  if (correct > 10) {
    const rev = reverseDigits(correct);
    if (rev !== correct && rev > 0) candidates.add(rev);
  }

  // Close offsets
  candidates.add(correct + randInt(1, 3));
  candidates.add(correct - randInt(1, 3));
  candidates.add(correct + randInt(4, 8));
  candidates.add(a + b); // common mistake: addition instead of mult

  // Cleanup
  candidates.delete(correct);
  const pool = [...candidates].filter((v) => v > 0 && v !== correct);
  shuffle(pool);
  const distractors = pool.slice(0, 3);

  // Safety fill
  let guard = 0;
  while (distractors.length < 3 && guard++ < 20) {
    const fb = correct + randInt(-12, 12);
    if (fb > 0 && fb !== correct && !distractors.includes(fb)) {
      distractors.push(fb);
    }
  }

  // ── Hard mode (score > 5): ensure at least one distractor shares the last digit ──
  // This prevents the shortcut of only computing the units digit mentally.
  if (score > 10) {
    const lastDigit = correct % 10;
    const hasSameEnding = distractors.some((d) => d % 10 === lastDigit);
    if (!hasSameEnding) {
      // Generate a tricky distractor: same last digit, different value
      let tricky = 0;
      let tries = 0;
      while (tries++ < 30) {
        // Offset by ±10, ±20, ±30 keeps same last digit but different tens
        const offset = (randInt(1, 4)) * 10 * (Math.random() > 0.5 ? 1 : -1);
        const candidate = correct + offset;
        if (candidate > 0 && candidate !== correct && !distractors.includes(candidate)) {
          tricky = candidate;
          break;
        }
      }
      if (tricky > 0) {
        // Replace the distractor that is furthest from correct (least suspicious)
        let maxDist = 0, replaceIdx = 0;
        for (let i = 0; i < distractors.length; i++) {
          const dist = Math.abs(distractors[i] - correct);
          if (dist > maxDist) { maxDist = dist; replaceIdx = i; }
        }
        distractors[replaceIdx] = tricky;
      }
    }
  }

  return { a, b, correct, options: shuffle([correct, ...distractors]) };
}

/* ═══════════════════════════════════════════════════
   ACCENT COLORS for answer buttons (Kahoot-style)
   ═══════════════════════════════════════════════════ */

const BTN_ACCENTS = [
  { bg: "bg-blue-500",   border: "border-blue-600",   hover: "hover:bg-blue-400",   text: "text-white" },
  { bg: "bg-amber-500",  border: "border-amber-600",  hover: "hover:bg-amber-400",  text: "text-white" },
  { bg: "bg-rose-500",   border: "border-rose-600",   hover: "hover:bg-rose-400",   text: "text-white" },
  { bg: "bg-violet-500", border: "border-violet-600", hover: "hover:bg-violet-400", text: "text-white" },
];

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */

const MentalMathGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  /* ── State ── */
  const [phase, setPhase] = useState(STATES.IDLE);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null);   // null | 'correct' | index
  const [scorePop, setScorePop] = useState(false);   // triggers pop anim
  const [questionKey, setQuestionKey] = useState(0);  // triggers fade-in
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
  const popTimeoutRef = useRef(null);

  // Direct DOM refs for the timer bar
  const barFillRef = useRef(null);
  const barTextRef = useRef(null);
  const barContainerRef = useRef(null);

  const { submit } = useSubmitScore(userId, GAME_IDS.MentalMathGame);

  /* ── RAF Timer Loop (direct DOM — 60 fps, no re-renders) ── */
  const syncBarDOM = useCallback(() => {
    const pct = maxTimeRef.current > 0
      ? Math.max(0, timeLeftRef.current / maxTimeRef.current)
      : 0;

    if (barFillRef.current) {
      barFillRef.current.style.width = `${pct * 100}%`;

      // Color transitions: blue → amber → red
      const bg =
        pct > 0.5
          ? "#3b82f6"    // blue-500
          : pct > 0.25
            ? "#f59e0b"  // amber-500
            : "#ef4444"; // red-500
      barFillRef.current.style.backgroundColor = bg;

      // Blink at low time
      barFillRef.current.classList.toggle("mm-pulse-low", pct <= 0.25);
    }

    if (barTextRef.current) {
      barTextRef.current.textContent = `${timeLeftRef.current.toFixed(1)}s`;
      barTextRef.current.style.color =
        pct > 0.5 ? "#64748b" : pct > 0.25 ? "#b45309" : "#dc2626";
    }
  }, []);

  const startTimerLoop = useCallback(() => {
    lastFrameRef.current = performance.now();
    const tick = (now) => {
      if (phaseRef.current !== STATES.PLAYING) return;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      timeLeftRef.current -= dt;

      if (timeLeftRef.current <= 0) {
        timeLeftRef.current = 0;
        syncBarDOM();
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
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  /* ── Next Round ── */
  const nextRound = useCallback((currentScore) => {
    const mt = maxTimeForScore(currentScore);
    maxTimeRef.current = mt;
    timeLeftRef.current = mt;
    setQuestion(generateQuestion(currentScore));
    setQuestionKey((k) => k + 1);
    setFeedback(null);
    syncBarDOM();
    lastFrameRef.current = performance.now();
  }, [syncBarDOM]);

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
  const handleAnswer = useCallback((value, index) => {
    if (phaseRef.current !== STATES.PLAYING || feedback !== null) return;
    stopTimerLoop();

    if (value === question.correct) {
      setFeedback("correct");
      scoreRef.current += 1;
      setScore(scoreRef.current);
      // Score pop animation
      setScorePop(true);
      clearTimeout(popTimeoutRef.current);
      popTimeoutRef.current = setTimeout(() => setScorePop(false), 400);

      feedbackTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current !== STATES.PLAYING) return;
        nextRound(scoreRef.current);
        startTimerLoop();
      }, 450);
    } else {
      setFeedback(index);
      feedbackTimeoutRef.current = setTimeout(() => {
        phaseRef.current = STATES.ENDED;
        setPhase(STATES.ENDED);
      }, 900);
    }
  }, [question, feedback, nextRound, startTimerLoop, stopTimerLoop]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && phase === STATES.IDLE) startGame();
  }, [isActive, phase, startGame]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    stopTimerLoop();
    clearTimeout(feedbackTimeoutRef.current);
    clearTimeout(popTimeoutRef.current);
  }, [stopTimerLoop]);

  /* ── Score Submission ── */
  useEffect(() => {
    if (phase === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((r) => { setRanking(r?.data?.ranking || []); setScoreMessage(r?.message || ""); })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (phase === STATES.IDLE) { scoreSubmitted.current = false; setRanking([]); setScoreMessage(""); }
  }, [phase, score, submit, t]);

  /* ── Replay ── */
  const handleReplay = useCallback(() => {
    stopTimerLoop();
    clearTimeout(feedbackTimeoutRef.current);
    clearTimeout(popTimeoutRef.current);
    phaseRef.current = STATES.IDLE;
    setPhase(STATES.IDLE);
    setScore(0);
    setQuestion(null);
    setFeedback(null);
    setScorePop(false);
    timeLeftRef.current = BASE_TIME;
    maxTimeRef.current = BASE_TIME;
    if (onReplay) onReplay();
  }, [stopTimerLoop, onReplay]);

  const isPlaying = phase === STATES.PLAYING;
  const isEnded = phase === STATES.ENDED;

  /* ═══════════════════════════════════════════════════
     RENDER — Light Mode "Playful" Aesthetic
     ═══════════════════════════════════════════════════ */

  return (
    <div
      className="relative h-full w-full flex items-center justify-center select-none overflow-hidden"
      style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f1f5f9 50%, #faf5ff 100%)" }}
    >
      {/* Subtle decorative blobs */}
      <div className="absolute top-[-15%] right-[-10%] w-[60vw] h-[60vw] max-w-[400px] max-h-[400px] rounded-full opacity-30 pointer-events-none"
        style={{ background: "radial-gradient(circle, #bfdbfe 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] max-w-[350px] max-h-[350px] rounded-full opacity-25 pointer-events-none"
        style={{ background: "radial-gradient(circle, #ddd6fe 0%, transparent 70%)" }} />

      {/* Bottom gradient for text legibility */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />

      {/* ── Confined game area ── */}
      <div className="max-w-[450px] mx-auto w-full h-full relative flex flex-col items-center justify-center px-4 z-[1]">

        {/* ── IDLE ── */}
        {phase === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img src="/logo-mentalmath.png" alt="Mental Math"
                className="w-16 h-16 object-contain drop-shadow-lg" draggable={false} />
              <span className="text-xs font-semibold text-slate-600 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl shadow-sm border border-slate-200/60">
                {t("desc.mental-math")}
              </span>
            </div>
          </div>
        )}

        {/* ── PLAYING ── */}
        {isPlaying && question && (
          <div
            key={questionKey}
            className="w-full flex flex-col items-center gap-4 mm-fade-in"
          >
            {/* Card container */}
            <div className="w-full bg-white rounded-3xl shadow-xl shadow-slate-200/60 px-5 py-6 flex flex-col items-center gap-4">

              {/* Score badge */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  Score
                </span>
                <span
                  className={`text-slate-800 text-3xl font-black tabular-nums ${scorePop ? "mm-pop" : ""}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {score}
                </span>
              </div>

              {/* Question display */}
              <div className="flex items-center justify-center py-2">
                <span className="text-slate-800 text-6xl sm:text-7xl font-black tracking-tight">
                  {question.a}
                  <span className="text-blue-500 mx-2">×</span>
                  {question.b}
                </span>
              </div>

              {/* Timer bar — pill style */}
              <div className="w-full flex flex-col items-center gap-1.5">
                <div
                  ref={barContainerRef}
                  className="w-full overflow-hidden"
                  style={{ height: "12px", borderRadius: "6px", background: "#e2e8f0" }}
                >
                  <div
                    ref={barFillRef}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "6px",
                      backgroundColor: "#3b82f6",
                      transition: "background-color 0.3s",
                    }}
                  />
                </div>
                <span
                  ref={barTextRef}
                  className="text-xs font-bold tabular-nums"
                  style={{ color: "#64748b", fontFeatureSettings: "'tnum'" }}
                >
                  {BASE_TIME.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Options Grid 2×2 — Kahoot-style colored buttons */}
            <div className="w-full grid grid-cols-2 gap-3 mt-1">
              {question.options.map((opt, i) => {
                const accent = BTN_ACCENTS[i];
                let cls, extraStyle = {};

                if (feedback === "correct" && opt === question.correct) {
                  // ✅ Correct: solid green, pop
                  cls = "bg-emerald-500 border-b-4 border-emerald-700 text-white mm-pop";
                } else if (feedback === i) {
                  // ❌ Wrong: solid red, shake
                  cls = "bg-red-500 border-b-4 border-red-700 text-white mm-shake";
                } else if (feedback !== null && feedback !== "correct" && opt === question.correct) {
                  // Show correct when wrong was picked
                  cls = "bg-emerald-500 border-b-4 border-emerald-700 text-white";
                } else if (feedback !== null) {
                  // Dimmed
                  cls = `${accent.bg} border-b-4 ${accent.border} ${accent.text} opacity-30 pointer-events-none`;
                } else {
                  // Normal
                  cls = `${accent.bg} border-b-4 ${accent.border} ${accent.text} ${accent.hover} active:border-b-0 active:mt-1 cursor-pointer`;
                }

                return (
                  <button
                    key={i}
                    className={`w-full py-5 rounded-2xl text-2xl sm:text-3xl font-black transition-all duration-100 ${cls}`}
                    style={extraStyle}
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

        {/* ── ENDED ── */}
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
