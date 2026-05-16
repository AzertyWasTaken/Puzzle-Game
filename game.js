"use strict";
import {log} from "./log.js";
import {gameplay} from "./gameplay.js";
import {getAssets, drawImage, drawCanvas, setCanvas} from "./render.js";

// Init variables
// ================================================================

setCanvas("game");
const el_level = document.getElementById("level");

let level = 0;
let levelData = getLevelData();
let isLevelCompleted = false;

const assets = getAssets(draw);

// Helpers
// ================================================================

function addPos(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
}

function getLevelData() {
    return structuredClone(gameplay[level] ?? []) ?? {};
}

function draw() {
    drawCanvas(levelData, assets, false, override);
}

function getCell(layer, x, y) {
    return (layer[y] ?? [])[x];
}

function setCell(layer, x, y, id) {
    layer[y][x] = id;
}

// Audio
// ================================================================

const SOUND_PATH = "./assets/"

function playSound(src, vol = 0.5) {
    try {
        const sound = new Audio(SOUND_PATH + src);
        sound.volume = vol;
        // Best-effort: ignore autoplay blocks (promises rejection) without breaking the game.
        const p = sound.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {
        // ignore
    }
}

// Animation
// ================================================================

const ANIM_DURATION_MS = 100;
let anim = [];
let override = [];
let canMove = true;

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function setOverride(x, y, state) {
    override[y] ??= [];
    override[y][x] = state;
}

function startAnimation(from, to, block) {
    setOverride(...to, true);

    anim.push({
        startMs: performance.now(),
        durationMs: ANIM_DURATION_MS,
        block: block === "P" ? assets.player : assets.box,
        from: from,
        to: to,
    });
}

function tickAnimation(nowMs) {
    draw();

    for (let i = anim.length - 1; i >= 0; i--) {
        const obj = anim[i];

        const elapsed = nowMs - obj.startMs;
        const t = Math.min(1, Math.max(0, elapsed / obj.durationMs));
        const k = easeOutCubic(t);

        const px = obj.from[0] + (obj.to[0] - obj.from[0]) * k;
        const py = obj.from[1] + (obj.to[1] - obj.from[1]) * k;

        if (t >= 1) {
            setOverride(...obj.to, false);
            anim.splice(i, 1);
            canMove = true;
            draw();
        } else {
            drawImage(px, py, obj.block);
        }
    }

    if (anim.length > 0) requestAnimationFrame(tickAnimation);
}

// Level selector
// ================================================================

// Level completion state (persisted)
const LS_KEY_COMPLETED = "game.completedLevels";
let completedLevels = new Set();

const el_levelSelector = document.getElementById("level-selector");

function loadCompletedLevels() {
    try {
        const raw = localStorage.getItem(LS_KEY_COMPLETED);
        if (!raw) return;

        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;

        completedLevels = new Set(arr.filter((n) =>
            Number.isInteger(n) && n >= 0 && n < gameplay.length
        ));
    } catch (e) {
        // ignore
    }
}

function persistCompletedLevels() {
    try {
        localStorage.setItem(LS_KEY_COMPLETED, JSON.stringify([...completedLevels]));
    } catch (e) {
        // ignore
    }
}

function createLevelSelector() {
    if (!el_levelSelector) return;
    el_levelSelector.innerHTML = "";
    const total = gameplay.length;

    for (let i = 0; i < total; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `${i + 1}`;
        btn.dataset.levelIndex = String(i);

        btn.addEventListener("click", () => {
            const idx = Number(btn.dataset.levelIndex);
            if (!Number.isInteger(idx)) return;
            if (idx < 0 || idx >= gameplay.length) return;

            // Optional: prevent jumping ahead past the current unlocked level.
            // If you want strict locking later, compute it from completedLevels.
            goToLevel(idx);
            playSound("select_level.wav", 1);
        });

        el_levelSelector.appendChild(btn);
    }
}

function updateLevelSelector() {
    if (!el_levelSelector) return;

    const buttons = el_levelSelector.querySelectorAll("button[data-level-index]");
    buttons.forEach((btn) => {
        const idx = Number(btn.dataset.levelIndex);
        const isCurrent = idx === level;
        const isCompleted = completedLevels.has(idx);

        btn.setAttribute("aria-current", isCurrent ? "true" : "false");
        btn.classList.toggle("completed", isCompleted);
    });
}

// Set level
// ================================================================

function goToLevel(n) {
    level = n;

    // Reset per-level one-time completion sound.
    isLevelCompleted = false;

    if (level >= gameplay.length) {
        el_level.textContent = "Game completed!";
    } else {
        el_level.textContent = `Level ${(level + 1).toString()}`;
    }

    levelData = getLevelData();
    override = [];
    anim = [];
    canMove = true;

    draw();
    updateLevelSelector();
}

loadCompletedLevels();
createLevelSelector();

// Initialize UI state for the initial level.
goToLevel(level);

// Level completion
// ================================================================

function countBoxTargets() {
    const floor = levelData?.floor ?? [];
    let c = 0;
    for (let y = 0; y < floor.length; y++) {
        for (let x = 0; x < (floor[y] ?? []).length; x++) {
            if (getCell(floor, x, y) === "X") c++;
        }
    }
    return c;
}

function isGameCompleted() {
    const boxes = [];
    const floor = levelData?.floor ?? [];
    const blocks = levelData?.blocks ?? [];

    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < (blocks[y] ?? []).length; x++) {
            const floorCell = getCell(floor, x, y);
            const blocksCell = getCell(blocks, x, y);

            if (floorCell === "T" && blocksCell !== "P") return false;
            if (floorCell === "X" && blocksCell !== "B") return false;
        }
    }
    return true;
}

function checkCompletion() {
    if (isGameCompleted()) {
        playSound("level_complete.wav", 0.25);

        completedLevels.add(level);
        persistCompletedLevels();
        isLevelCompleted = true

        setTimeout(() => {
            goToLevel(level + 1);
        }, 250);
    }
}

// Move
// ================================================================

function findPlayer() {
    const blocks = levelData?.blocks ?? [];
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < (blocks[y] ?? []).length; x++) {
            if (getCell(blocks, x, y) === "P") return [x, y];
        }
    }
}

function slide(layer, from, to) {
    const block = getCell(layer, ...from);

    setCell(layer, ...to, block);
    setCell(layer, ...from, ".");

    startAnimation(from, to, block);
}

function move(x, y) {
    if (isLevelCompleted || !canMove || !levelData) return;

    const blocks = levelData.blocks;
    const currPos = findPlayer();
    if (!currPos) return;

    const nextPos = addPos(currPos, [x, y]);
    const nextBlock = getCell(blocks, ...nextPos);

    if (nextBlock === ".") {
        // Simple move
        slide(blocks, currPos, nextPos);
        requestAnimationFrame(tickAnimation);
        playSound("move_player.wav", 0.15);
        canMove = false;
    }
    else if (nextBlock === "B") {
        // Push move
        const boxPos = addPos(nextPos, [x, y]);
        const boxBlock = getCell(blocks, ...boxPos);
        if (boxBlock !== ".") return;

        // Push
        slide(blocks, nextPos, boxPos);
        slide(blocks, currPos, nextPos);
        requestAnimationFrame(tickAnimation);
        playSound("move_player.wav", 0.15);
        canMove = false;
    }
    else {
        // Ignore other block types
        return;
    }

    checkCompletion();
}

// Controls
// ================================================================

function bindButton(id, func) {
    const btn = document.getElementById(id);
    if (!btn) return;

    const handler = (e) => {
        // Prevent touch from triggering focus/scroll behaviors on some devices.
        e.preventDefault();
        func();
    };

    btn.addEventListener("click", handler);
    btn.addEventListener("touchstart", handler, {passive: false});
}

bindButton("btn-up", () => move(0, -1));
bindButton("btn-down", () => move(0, 1));
bindButton("btn-left", () => move(-1, 0));
bindButton("btn-right", () => move(1, 0));

document.addEventListener("keydown", (e) => {
    e.preventDefault();

    if (e.key === "ArrowUp") move(0, -1);
    if (e.key === "ArrowDown") move(0, 1);
    if (e.key === "ArrowLeft") move(-1, 0);
    if (e.key === "ArrowRight") move(1, 0);
});

bindButton("btn-reset", () => goToLevel(level));
