"use strict";
import {log} from "./log.js";
import {gameplay} from "./gameplay.js";
import {getAssets, drawCanvas} from "./render.js";

// Init variables
// ================================================================

const el_level = document.getElementById("level");
const canvas = document.getElementById("game");

let level = 0;
let levelData = getLevelData();

const TILE_SIZE = 64;
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
    drawCanvas(canvas, levelData, TILE_SIZE, assets, false);
}

function getCell(layer, x, y) {
    return (layer[y] ?? [])[x];
}

function setCell(layer, x, y, id) {
    layer[y][x] = id;
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
            // Reset uses current `level` index.
            resetLevel();
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

    if (level >= gameplay.length) {
        el_level.textContent = "Game completed!";
    } else {
        el_level.textContent = `Level ${(level + 1).toString()}`;
    }

    levelData = getLevelData();
    draw();
    updateLevelSelector();
}

function resetLevel() {
    if (!levelData) return;

    goToLevel(level);
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

// Actions
// ================================================================

function findPlayer() {
    const blocks = levelData?.blocks ?? [];
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < (blocks[y] ?? []).length; x++) {
            if (getCell(blocks, x, y) === "P") return [x, y];
        }
    }
}

function move(x, y) {
    if (!levelData) return;

    const blocks = levelData.blocks;
    const currPos = findPlayer();
    if (!currPos) return;

    const nextPos = addPos(currPos, [x, y]);
    const [nx, ny] = nextPos;

    const nextBlock = getCell(blocks, nx, ny);
    if (nextBlock === "B") {
        const boxPos = addPos(nextPos, [x, y]);
        const [bx, by] = boxPos;

        const boxBlock = getCell(blocks, bx, by);
        if (boxBlock !== ".") return;

        // Push
        setCell(blocks, bx, by, "B");
        setCell(blocks, nx, ny, "P");
        setCell(blocks, currPos[0], currPos[1], ".");
        draw();
    } else if (nextBlock === ".") {
        setCell(blocks, nx, ny, "P");
        setCell(blocks, currPos[0], currPos[1], ".");
        draw();
    } else {
        // ignore other block types
        return;
    }

    // Completion checks
    if (isGameCompleted()) {
        completedLevels.add(level);
        persistCompletedLevels();
        goToLevel(level + 1);
    }
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

bindButton("btn-reset", () => resetLevel());
