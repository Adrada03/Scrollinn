/**
 * TowerBlocksGame.jsx — Juego real de apilar bloques en 3D
 *
 * Adaptado del original TowerBlocks (Three.js + GSAP).
 * Se integra como componente React en el feed de Scrollinn.
 *
 * - Toca / clic / Espacio → colocar bloque
 * - Los bloques se van cortando según la precisión
 * - La velocidad aumenta progresivamente
 * - Game Over cuando fallas completamente
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import gsap from "gsap";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */

const BLOCK_STATES = { ACTIVE: "active", STOPPED: "stopped", MISSED: "missed" };
const GAME_STATES = {
  LOADING: "loading",
  READY: "ready",
  PLAYING: "playing",
  ENDED: "ended",
  RESETTING: "resetting",
};
const MOVE_AMOUNT = 12;

/* ─────────── Bloque ─────────── */

function createBlock(targetBlock) {
  const b = {
    targetBlock,
    index: (targetBlock ? targetBlock.index : 0) + 1,
    dimension: { width: 0, height: 0, depth: 0 },
    position: { x: 0, y: 0, z: 0 },
    state: null,
    speed: 0,
    direction: 0,
    colorOffset: 0,
    color: null,
    material: null,
    mesh: null,
    workingPlane: "",
    workingDimension: "",
  };

  b.workingPlane = b.index % 2 ? "x" : "z";
  b.workingDimension = b.index % 2 ? "width" : "depth";

  b.dimension.width = targetBlock ? targetBlock.dimension.width : 10;
  b.dimension.height = targetBlock ? targetBlock.dimension.height : 2;
  b.dimension.depth = targetBlock ? targetBlock.dimension.depth : 10;

  b.position.x = targetBlock ? targetBlock.position.x : 0;
  b.position.y = b.dimension.height * b.index;
  b.position.z = targetBlock ? targetBlock.position.z : 0;

  b.colorOffset = targetBlock
    ? targetBlock.colorOffset
    : Math.round(Math.random() * 100);

  if (!targetBlock) {
    b.color = new THREE.Color(0x333344);
  } else {
    const off = b.index + b.colorOffset;
    b.color = new THREE.Color(
      (Math.sin(0.3 * off) * 55 + 200) / 255,
      (Math.sin(0.3 * off + 2) * 55 + 200) / 255,
      (Math.sin(0.3 * off + 4) * 55 + 200) / 255
    );
  }

  b.state = b.index > 1 ? BLOCK_STATES.ACTIVE : BLOCK_STATES.STOPPED;

  b.speed = -0.1 - b.index * 0.005;
  if (b.speed < -4) b.speed = -4;
  b.direction = b.speed;

  const geo = new THREE.BoxGeometry(
    b.dimension.width,
    b.dimension.height,
    b.dimension.depth
  );
  geo.applyMatrix4(
    new THREE.Matrix4().makeTranslation(
      b.dimension.width / 2,
      b.dimension.height / 2,
      b.dimension.depth / 2
    )
  );

  b.material = new THREE.MeshLambertMaterial({
    color: b.color,
    flatShading: true,
  });
  b.mesh = new THREE.Mesh(geo, b.material);
  b.mesh.position.set(b.position.x, b.position.y, b.position.z);

  if (b.state === BLOCK_STATES.ACTIVE) {
    b.position[b.workingPlane] =
      Math.random() > 0.5 ? -MOVE_AMOUNT : MOVE_AMOUNT;
  }

  return b;
}

function placeBlock(block) {
  block.state = BLOCK_STATES.STOPPED;

  let overlap =
    block.targetBlock.dimension[block.workingDimension] -
    Math.abs(
      block.position[block.workingPlane] -
        block.targetBlock.position[block.workingPlane]
    );

  const result = { plane: block.workingPlane, direction: block.direction };

  if (block.dimension[block.workingDimension] - overlap < 0.3) {
    overlap = block.dimension[block.workingDimension];
    result.bonus = true;
    block.position.x = block.targetBlock.position.x;
    block.position.z = block.targetBlock.position.z;
    block.dimension.width = block.targetBlock.dimension.width;
    block.dimension.depth = block.targetBlock.dimension.depth;
  }

  if (overlap > 0) {
    const chopped = {
      width: block.dimension.width,
      height: block.dimension.height,
      depth: block.dimension.depth,
    };
    chopped[block.workingDimension] -= overlap;
    block.dimension[block.workingDimension] = overlap;

    const pGeo = new THREE.BoxGeometry(
      block.dimension.width,
      block.dimension.height,
      block.dimension.depth
    );
    pGeo.applyMatrix4(
      new THREE.Matrix4().makeTranslation(
        block.dimension.width / 2,
        block.dimension.height / 2,
        block.dimension.depth / 2
      )
    );
    const placedMesh = new THREE.Mesh(pGeo, block.material);

    const cGeo = new THREE.BoxGeometry(chopped.width, chopped.height, chopped.depth);
    cGeo.applyMatrix4(
      new THREE.Matrix4().makeTranslation(
        chopped.width / 2,
        chopped.height / 2,
        chopped.depth / 2
      )
    );
    const choppedMesh = new THREE.Mesh(cGeo, block.material);

    const choppedPos = { x: block.position.x, y: block.position.y, z: block.position.z };

    if (
      block.position[block.workingPlane] <
      block.targetBlock.position[block.workingPlane]
    ) {
      block.position[block.workingPlane] =
        block.targetBlock.position[block.workingPlane];
    } else {
      choppedPos[block.workingPlane] += overlap;
    }

    placedMesh.position.set(block.position.x, block.position.y, block.position.z);
    choppedMesh.position.set(choppedPos.x, choppedPos.y, choppedPos.z);

    result.placed = placedMesh;
    if (!result.bonus) result.chopped = choppedMesh;
  } else {
    block.state = BLOCK_STATES.MISSED;
  }

  block.dimension[block.workingDimension] = overlap;
  return result;
}

function tickBlock(block) {
  if (block.state === BLOCK_STATES.ACTIVE) {
    const val = block.position[block.workingPlane];
    if (val > MOVE_AMOUNT || val < -MOVE_AMOUNT) {
      block.direction = block.direction > 0 ? block.speed : Math.abs(block.speed);
    }
    block.position[block.workingPlane] += block.direction;
    block.mesh.position[block.workingPlane] = block.position[block.workingPlane];
  }
}

/* ─────────── Motor del juego ─────────── */

class TowerBlocksEngine {
  constructor(container, callbacks) {
    this.container = container;
    this.onScoreChange = callbacks.onScoreChange;
    this.onStatusChange = callbacks.onStatusChange;

    this.state = GAME_STATES.LOADING;
    this.blocks = [];
    this.animFrameId = null;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor("#D0CBC7", 1);
    this._resize();
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera (ortho isometric)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 1000);
    this.camera.position.set(2, 2, 2);
    this.lookAtTarget = new THREE.Vector3(0, 0, 0);
    this.camera.lookAt(this.lookAtTarget);
    this._updateCamera();

    // Lights
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 499, 0);
    this.scene.add(dirLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Groups
    this.newBlocks = new THREE.Group();
    this.placedBlocks = new THREE.Group();
    this.choppedBlocks = new THREE.Group();
    this.scene.add(this.newBlocks);
    this.scene.add(this.placedBlocks);
    this.scene.add(this.choppedBlocks);

    // Base block + start tick
    this._addBlock();
    this._tick();

    this._updateState(GAME_STATES.READY);

    // Responsive
    this.resizeObserver = new ResizeObserver(() => {
      this._resize();
      this._updateCamera();
    });
    this.resizeObserver.observe(container);
  }

  /* ── helpers ── */

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
  }

  _updateCamera() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const vs = 30;
    this.camera.left = w / -vs;
    this.camera.right = w / vs;
    this.camera.top = h / vs;
    this.camera.bottom = h / -vs;
    this.camera.updateProjectionMatrix();
  }

  _setCamera(y, speed = 0.3) {
    gsap.to(this.camera.position, {
      duration: speed,
      y: y + 4,
      ease: "power1.inOut",
    });
    gsap.to(this.lookAtTarget, {
      duration: speed,
      y: y,
      ease: "power1.inOut",
    });
  }

  _updateState(s) {
    this.state = s;
    this.onStatusChange(s);
  }

  /* ── game flow ── */

  autoStart() {
    if (this.state === GAME_STATES.READY) this.startGame();
  }

  onAction() {
    switch (this.state) {
      case GAME_STATES.PLAYING:
        this._placeBlock();
        break;
      case GAME_STATES.ENDED:
        this._restartGame();
        break;
      default:
        break;
    }
  }

  startGame() {
    if (this.state === GAME_STATES.PLAYING) return;
    this.onScoreChange(0);
    this._updateState(GAME_STATES.PLAYING);
    this._addBlock();
  }

  _placeBlock() {
    const cur = this.blocks[this.blocks.length - 1];
    const result = placeBlock(cur);

    this.newBlocks.remove(cur.mesh);

    if (result.placed) this.placedBlocks.add(result.placed);

    if (result.chopped) {
      this.choppedBlocks.add(result.chopped);

      const rotateRand = 10;
      const posParams = {
        duration: 1,
        y: "-=30",
        ease: "power1.in",
        onComplete: () => this.choppedBlocks.remove(result.chopped),
      };
      const rotParams = {
        duration: 1,
        delay: 0.05,
        x:
          result.plane === "z"
            ? Math.random() * rotateRand - rotateRand / 2
            : 0.1,
        z:
          result.plane === "x"
            ? Math.random() * rotateRand - rotateRand / 2
            : 0.1,
        y: Math.random() * 0.1,
      };

      if (
        result.chopped.position[result.plane] >
        result.placed.position[result.plane]
      ) {
        posParams[result.plane] = "+=" + 40 * Math.abs(result.direction);
      } else {
        posParams[result.plane] = "-=" + 40 * Math.abs(result.direction);
      }

      gsap.to(result.chopped.position, posParams);
      gsap.to(result.chopped.rotation, rotParams);
    }

    this._addBlock();
  }

  _addBlock() {
    const last = this.blocks[this.blocks.length - 1];

    if (last && last.state === BLOCK_STATES.MISSED) {
      return this._endGame();
    }

    const score = this.blocks.length - 1;
    this.onScoreChange(score);

    const newBlock = createBlock(last);
    this.newBlocks.add(newBlock.mesh);
    this.blocks.push(newBlock);

    this._setCamera(this.blocks.length * 2);
  }

  _endGame() {
    this._updateState(GAME_STATES.ENDED);
  }

  _restartGame() {
    this._updateState(GAME_STATES.RESETTING);

    const oldBlocks = this.placedBlocks.children;
    const removeSpeed = 0.2;
    const delayAmount = 0.02;

    for (let i = 0; i < oldBlocks.length; i++) {
      gsap.to(oldBlocks[i].scale, {
        duration: removeSpeed,
        x: 0,
        y: 0,
        z: 0,
        delay: (oldBlocks.length - i) * delayAmount,
        ease: "power1.in",
        onComplete: () => this.placedBlocks.remove(oldBlocks[i]),
      });
      gsap.to(oldBlocks[i].rotation, {
        duration: removeSpeed,
        y: 0.5,
        delay: (oldBlocks.length - i) * delayAmount,
        ease: "power1.in",
      });
    }

    const cameraMoveSpeed = removeSpeed * 2 + oldBlocks.length * delayAmount;
    this._setCamera(2, cameraMoveSpeed);

    const countdown = { value: this.blocks.length - 1 };
    gsap.to(countdown, {
      duration: cameraMoveSpeed,
      value: 0,
      onUpdate: () => this.onScoreChange(Math.round(countdown.value)),
    });

    this.blocks = this.blocks.slice(0, 1);

    setTimeout(() => this.startGame(), cameraMoveSpeed * 1000);
  }

  /* ── animation loop ── */

  _tick() {
    this.animFrameId = requestAnimationFrame(() => this._tick());

    if (this.blocks.length > 0) {
      tickBlock(this.blocks[this.blocks.length - 1]);
    }

    this.camera.lookAt(this.lookAtTarget);
    this.renderer.render(this.scene, this.camera);
  }

  /* ── cleanup ── */

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();

    // Kill GSAP tweens
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.lookAtTarget);
    [...this.placedBlocks.children].forEach((c) => {
      gsap.killTweensOf(c.scale);
      gsap.killTweensOf(c.rotation);
    });
    [...this.choppedBlocks.children].forEach((c) => {
      gsap.killTweensOf(c.position);
      gsap.killTweensOf(c.rotation);
    });

    // Dispose Three.js
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/* ─────────── Componente React ─────────── */

const TowerBlocksGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState(GAME_STATES.LOADING);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);
  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.TowerBlocksGame);

  // Inicializar motor 3D
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const engine = new TowerBlocksEngine(el, {
      onScoreChange: setScore,
      onStatusChange: setStatus,
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Enviar puntuación al terminar la partida
  useEffect(() => {
    if (status === GAME_STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => {
          setScoreMessage(t("svc.score_error"));
        })
        .finally(() => {
          setIsRankingLoading(false);
        });
    }
    // Reset flag cuando el juego vuelve a estado READY (nueva partida)
    if (status === GAME_STATES.READY) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [status, score, submit]);

  // No auto-start — el jugador clickea para empezar

  // Teclado: Espacio
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === "Space" && engineRef.current?.state !== GAME_STATES.ENDED) {
        e.preventDefault();
        engineRef.current?.onAction();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Handler unificado para click/tap — NO permite reiniciar
  const handlePointerDown = useCallback((e) => {
    e.stopPropagation();
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.state === GAME_STATES.ENDED) return;
    if (eng.state === GAME_STATES.READY) {
      eng.startGame();
    } else {
      eng.onAction();
    }
  }, []);

  const isPlaying = status === GAME_STATES.PLAYING;
  const isEnded = status === GAME_STATES.ENDED;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Canvas container */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        style={{ touchAction: "manipulation" }}
      />

      {/* Pantalla de inicio: "Toca para jugar" */}
      {status === GAME_STATES.READY && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[3] pointer-events-none">
          <p className="text-sm font-bold text-[#333344]/70 text-center mb-1 max-w-xs leading-snug">
            {t("tower.instruction")}
          </p>
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <img src="/logo-towerblocks.png" alt="Tower Blocks" className="w-20 h-20 object-contain drop-shadow-lg" draggable={false} />
            <span className="text-lg font-bold text-[#333344] bg-white/40 backdrop-blur-sm px-6 py-3 rounded-2xl shadow-lg">
              {t("tower.tap_play")}
            </span>
          </div>
        </div>
      )}

      {/* Gradientes para legibilidad de la UI de Scrollinn */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-[1]" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none z-[1]" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black/15 to-transparent pointer-events-none z-[1]" />

      {/* Score */}
      {(isPlaying || isEnded || status === GAME_STATES.RESETTING) && (
        <div className="absolute inset-x-0 top-16 text-center pointer-events-none z-[2]">
          <span
            className="text-[12vh] font-black leading-none text-[#333344] opacity-70 drop-shadow-sm"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* Instrucciones al inicio */}
      {isPlaying && score === 0 && (
        <div className="absolute inset-x-0 top-[30vh] text-center pointer-events-none z-[2] animate-pulse">
          <span className="text-sm font-medium text-[#333344]/70 bg-white/30 backdrop-blur-sm px-4 py-2 rounded-full">
            {t("tower.tap_place")}
          </span>
        </div>
      )}

      {/* Game Over */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("tower.score", { score })}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default TowerBlocksGame;
