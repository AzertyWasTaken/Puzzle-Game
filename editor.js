"use strict";
import {log} from "./log.js";
import {gameplay} from "./gameplay.js";
import {getAssets, drawCanvas, setCanvas} from "./render.js";

setCanvas("editor-canvas");

// Init variables
// ================================================================

const FLOOR_TILES = new Set([".", "T", "X"]);
const BLOCK_TILES = new Set([".", "#", "P", "B"]);

// Mutable gameplay layers (for editor canvas only)
let level = 0;
let editorFloor = getLayer("floor");
let editorBlocks = getLayer("blocks");
let editorTile = "#"; // palette char selection (either floor or blocks tile)

let lastRenderedAscii = "";

const LS_KEY_EDITOR_LAST_LEVEL = "game.editorLastLevel";

const el_levelSelector = document.getElementById("level-selector-editor");
const el_status = document.getElementById("editor-status");
const el_canvas = document.getElementById("editor-canvas");
const ctx = el_canvas.getContext("2d");
const el_text = document.getElementById("editor-text");

const el_gridWidth = document.getElementById("editor-grid-width");
const el_gridHeight = document.getElementById("editor-grid-height");
const el_btnResize = document.getElementById("btn-editor-resize");

const LS_KEY_EDITOR_GRID_DIMS = "game.editorGridDims";

// Helpers
// ================================================================

const TILE_SIZE = 64;

const assets = getAssets(draw);

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function draw() {
    drawCanvas({floor: editorFloor, blocks: editorBlocks}, assets, true, []);
}

function getLayer(layer) {
    return structuredClone(gameplay[level]?.[layer] ?? []);
}

function createEmptyLayer(w, h, fill = ".") {
    return Array.from({length: h}, () => Array.from({length: w}, () => fill));
}

function cloneLayer(layer) {
    return structuredClone(layer);
}

function clampInt(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) return min;
    n = Math.floor(n);
    return Math.min(max, Math.max(min, n));
}

function getGridWidth() {
    return editorFloor.length;
}

function getGridHeight() {
    return editorFloor[0].length;
}

// Load saved data
// ================================================================

function loadSavedGridDimsOrDefault() {
    let w = el_gridWidth ? clampInt(el_gridWidth.value, 1, 64) : 6;
    let h = el_gridHeight ? clampInt(el_gridHeight.value, 1, 64) : 4;

    try {
        const raw = localStorage.getItem(LS_KEY_EDITOR_GRID_DIMS);
        if (raw) {
            const obj = JSON.parse(raw);
            if (obj && Number.isFinite(obj.w) && Number.isFinite(obj.h)) {
                w = clampInt(obj.w, 1, 64);
                h = clampInt(obj.h, 1, 64);
            }
        }
    } catch {
        // ignore
    }

    if (el_gridWidth) el_gridWidth.value = String(w);
    if (el_gridHeight) el_gridHeight.value = String(h);

    return [w, h];
}

// Parser / unparser
// ================================================================
// Editor textbox format: {floor: [[...]], blocks: [[...]]}

function layerToAscii(layer) {
    return `[${layer.map((row) =>
        `[${row.map((cell) => `"${cell}"`).join(", ")}]`
    ).join(", ")}]`;
}

function editorStateToText(floor, blocks) {
    return `{
    floor: ${layerToAscii(floor)},
    blocks: ${layerToAscii(blocks)},
},`;
}

function parse2DArrayLiteral(objPart, {allowedChars, nameForError}) {
    const rowMatches = objPart.match(/\[\s*([^\[\]]*?)\s*\]/g);
    if (!rowMatches || rowMatches.length === 0) throw new Error(`${nameForError} must contain at least one row.`);

    const rows = rowMatches.map((rowStr, y) => {
        const cellMatches = rowStr.match(/"([^\\"]*)"/g);
        if (!cellMatches) throw new Error(`Row ${y + 1} has no cells in ${nameForError}.`);

        return cellMatches.map((m, x) => {
            const ch = m.slice(1, -1);
            if (!allowedChars.has(ch)) {
                throw new Error(`Invalid char '${ch}' in ${nameForError} at (x=${x}, y=${y}).`);
            }
            return ch;
        });
    });

    const w = rows[0].length;
    if (!Number.isInteger(w) || w <= 0) throw new Error(`${nameForError} must be a non-empty 2D array.`);
    for (let y = 0; y < rows.length; y++) {
        if (rows[y].length !== w) throw new Error(`${nameForError} row ${y + 1} is not width ${w}.`);
    }

    return rows;
}

function asciiToEditorState(lines) {
    const text = String(lines ?? "").trim();
    if (!text) throw new Error("Text is empty.");

    // Expect: {floor: [[...]], blocks: [[...]]}
    if (!(text.includes("floor") && text.includes("blocks") && text.includes("[["))) {
        throw new Error("Invalid text format. Expected: {floor: [[...]], blocks: [[...]]}");
    }

    // Extract the first [[...]] after each key using a simple bracket matcher.
    function extractFirst2DArrayAfterKey(src, key) {
        const keyIdx = src.indexOf(key);
        if (keyIdx < 0) throw new Error(`Failed to find '${key}' array in object.`);

        // find first '[' after key
        const startBracket = src.indexOf("[[", keyIdx);
        if (startBracket < 0) throw new Error(`Failed to find '[[' for '${key}'.`);

        // bracket matching for the outermost array starting at startBracket
        let depth = 0;
        let endIdx = -1;
        for (let i = startBracket; i < src.length; i++) {
            const ch = src[i];
            if (ch === "[") depth++;
            else if (ch === "]") {
                depth--;
                if (depth === 0) {
                    endIdx = i;
                    break;
                }
            }
        }

        if (endIdx < 0) throw new Error(`Failed to parse '${key}' 2D array (unclosed brackets).`);
        return src.slice(startBracket, endIdx + 1);
    }

    const floorLiteral = extractFirst2DArrayAfterKey(text, "floor");
    const blocksLiteral = extractFirst2DArrayAfterKey(text, "blocks");

    const floor = parse2DArrayLiteral(floorLiteral, {
        allowedChars: FLOOR_TILES,
        nameForError: "floor",
    });

    const blocks = parse2DArrayLiteral(blocksLiteral, {
        allowedChars: BLOCK_TILES,
        nameForError: "blocks",
    });

    // Validate dimensions
    if (floor.length !== blocks.length) throw new Error("floor/blocks must have the same height.");
    for (let y = 0; y < floor.length; y++) {
        if (floor[y].length !== blocks[y].length) throw new Error("floor/blocks must have the same width.");
    }

    return {floor, blocks};
}

// Apply from text
// ================================================================

function setEditorState(newFloor, newBlocks) {
    editorFloor = structuredClone(newFloor);
    editorBlocks = structuredClone(newBlocks);

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;
    draw();
}

function applyFromText() {
    const state = asciiToEditorState(el_text.value);
    setEditorState(state.floor, state.blocks);
}

document.getElementById("btn-editor-apply").addEventListener("click", () => {
    try {
        applyFromText();
        el_status.textContent = "Applied from text.";
    } catch (err) {
        el_status.textContent = String(err?.message || err);
    }
});

// Remove row/column
// ================================================================

const el_removeRow = document.getElementById("editor-remove-row");
const el_removeCol = document.getElementById("editor-remove-col");

function removeRowFromLayer(layer, rowIdx0) {
    // layer: 2D array [h][w]
    if (!Array.isArray(layer) || layer.length === 0) return layer;
    if (rowIdx0 < 0 || rowIdx0 >= layer.length) return layer;
    return layer.filter((_, y) => y !== rowIdx0);
}

function removeColumnFromLayer(layer, colIdx0) {
    if (!Array.isArray(layer) || layer.length === 0) return layer;
    const h = layer.length;
    for (let y = 0; y < h; y++) {
        if (!Array.isArray(layer[y])) return layer;
    }

    const w = layer[0]?.length ?? 0;
    if (!Number.isInteger(w) || w <= 0) return layer;
    if (colIdx0 < 0 || colIdx0 >= w) return layer;

    const next = layer.map((row) => row.filter((_, x) => x !== colIdx0));
    return next;
}

function applyAndRedraw(nextFloor, nextBlocks) {
    // Ensure floor/blocks dimensions are consistent.
    const newH = nextFloor.length;
    for (let y = 0; y < newH; y++) {
        if (nextBlocks[y]?.length !== nextFloor[y]?.length) {
            // Fallback: derive width from floor row.
            const w = nextFloor[y]?.length ?? 0;
            nextBlocks[y] = (nextBlocks[y] ?? []).slice(0, w);
            while (nextBlocks[y].length < w) nextBlocks[y].push(".");
        }
    }

    editorFloor = structuredClone(nextFloor);
    editorBlocks = structuredClone(nextBlocks);

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;
    draw();
}

function validateIndex(idx0, limit, msg) {
    if (!Number.isInteger(idx0)) {
        el_status.textContent = msg.integer;
        return false;
    }
    if (idx0 < 0 || idx0 >= limit) {
        el_status.textContent = msg.bounds;
        return false;
    }
    if (limit <= 1) {
        el_status.textContent = msg.last;
        return false;
    }
    return true;
}

function removeLine(text, dim, element, callback) {
    if (!dim) return;
    const lineId = Number(element?.value);

    const msg = {
        integer: `${capitalizeFirst(text)} index must be an integer (0-based).`,
        bounds: `${capitalizeFirst(text)} must be between 0 and ${dim - 1}.`,
        last: `Cannot remove the last ${text}.`,
    };

    if (!validateIndex(lineId, dim, msg)) return;

    const nextFloor = callback(editorFloor, lineId);
    const nextBlocks = callback(editorBlocks, lineId);
    applyAndRedraw(nextFloor, nextBlocks);

    el_status.textContent = `Removed ${text} ${lineId}.`;
}

document.getElementById("btn-editor-remove-row").addEventListener("click", () => {
    removeLine("row", getGridWidth(), el_removeRow, removeRowFromLayer);
});

document.getElementById("btn-editor-remove-col").addEventListener("click", () => {
    removeLine("column", getGridHeight(), el_removeCol, removeColumnFromLayer);
});

// Level selector
// ================================================================

function syncSelector() {
    if (!el_levelSelector) return;
    const buttons = el_levelSelector.querySelectorAll("button[data-level-index]");
    buttons.forEach((btn) => {
        const idx = Number(btn.dataset.levelIndex);
        btn.setAttribute("aria-current", idx === level ? "true" : "false");
    });
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
            if (!Number.isInteger(idx) || idx < 0 || idx >= gameplay.length) return;
            level = idx;
            try {
                localStorage.setItem(LS_KEY_EDITOR_LAST_LEVEL, String(level));
            } catch (e) {
                // ignore
            }
            syncSelector();
            resetEditor();
        });

        el_levelSelector.appendChild(btn);
    }
}

// Reset editor
// ================================================================

function resetEditor() {
    editorFloor = getLayer("floor");
    editorBlocks = getLayer("blocks");

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;
    draw();
}

document.getElementById("btn-editor-reset")?.addEventListener("click", () => {
    resetEditor();
    el_status.textContent = "Reset editor to current level.";
});

// Rotate grid
// ================================================================

function rotate90CWLayer(layer) {
    // layer: [h][w] -> [w][h]
    const h = layer?.length ?? 0;
    const w = h > 0 ? (layer[0]?.length ?? 0) : 0;
    if (!h || !w) return layer;

    const out = Array.from({length: w}, () => Array.from({length: h}, () => "."));

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // (x, y) -> (h-1-y, x) in [w][h] coordinates
            out[x][h - 1 - y] = layer[y][x];
        }
    }

    return out;
}

function rotateGrid90CW() {
    const nextFloor = rotate90CWLayer(editorFloor);
    const nextBlocks = rotate90CWLayer(editorBlocks);
    applyAndRedraw(nextFloor, nextBlocks);
    el_status.textContent = "Rotated grid 90° clockwise.";
}

document.getElementById("btn-editor-rotate90")?.addEventListener("click", () => {
    rotateGrid90CW();
});


// Export to clipboard
// ================================================================

async function exportToClipboard() {
    const text = el_text.value;
    try {
        await navigator.clipboard.writeText(text);
        el_status.textContent = "Copied ASCII to clipboard.";
        setTimeout(() => (el_status.textContent = "Canvas: click to place tile"), 1200);
    } catch (e) {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }
}

document.getElementById("btn-editor-export").addEventListener("click", () => {
    exportToClipboard();
});

// Place block
// ================================================================

function isFloorTile(ch) {
    return FLOOR_TILES.has(ch);
}

function isBlockTile(ch) {
    return BLOCK_TILES.has(ch);
}

function placeAt(x, y) {
    const h = editorFloor.length || editorBlocks.length;
    const w = (editorFloor[0]?.length ?? editorBlocks[0]?.length ?? 0);

    if (!h || !w) return;
    if (y < 0 || y >= h) return;
    if (x < 0 || x >= w) return;

    // '.' clears both layers
    if (editorTile === ".") {
        editorFloor[y][x] = ".";
        editorBlocks[y][x] = ".";
    }
    else if (isFloorTile(editorTile)) {
        editorFloor[y][x] = editorTile;
    }
    else if (isBlockTile(editorTile)) {
        editorBlocks[y][x] = editorTile;
    }

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;
    draw();
}

el_canvas.addEventListener("click", (e) => {
    const rect = el_canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const x = Math.floor(mx / TILE_SIZE);
    const y = Math.floor(my / TILE_SIZE);

    placeAt(x, y);
});

// Select block
// ================================================================

function syncPalette() {
    document.querySelectorAll(".block-selector[data-tile]").forEach((btn) => {
        const t = btn.dataset.tile;
        btn.classList.toggle("selected", t === editorTile);
    });
}

document.querySelectorAll(".block-selector[data-tile]").forEach((btn) => {
    btn.addEventListener("click", () => {
        editorTile = btn.dataset.tile;
        syncPalette();
        el_status.textContent = `Selected tile: ${editorTile}`;
    });
});

// Resize grid
// ================================================================

function resizeGrid(newW, newH) {
    newW = clampInt(newW, 1, 64);
    newH = clampInt(newH, 1, 64);

    const hasState = Array.isArray(editorFloor) && editorFloor.length > 0 && Array.isArray(editorBlocks) && editorBlocks.length > 0;

    if (!hasState) {
        editorFloor = createEmptyLayer(newW, newH, ".");
        editorBlocks = createEmptyLayer(newW, newH, ".");
        lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
        el_text.value = lastRenderedAscii;
        draw();
        return;
    }

    const currH = editorFloor.length;
    const currW = editorFloor[0].length;

    const nextFloor = createEmptyLayer(newW, newH, ".");
    const nextBlocks = createEmptyLayer(newW, newH, ".");

    for (let y = 0; y < newH; y++) {
        for (let x = 0; x < newW; x++) {
            if (y < currH && x < currW) {
                nextFloor[y][x] = editorFloor[y][x];
                nextBlocks[y][x] = editorBlocks[y][x];
            }
        }
    }

    editorFloor = nextFloor;
    editorBlocks = nextBlocks;

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;
    draw();
}

function getSelectedDims() {
    const w = clampInt(el_gridWidth?.value, 1, 64);
    const h = clampInt(el_gridHeight?.value, 1, 64);
    return [w, h];
}

function bindResizeUI() {
    if (!el_btnResize) return;

    const handler = () => {
        const [w, h] = getSelectedDims();
        persistGridDims(w, h);
        resizeGrid(w, h);
        el_status.textContent = `Resized grid to ${w}×${h}.`;
    };

    el_btnResize.addEventListener("click", (e) => {
        e.preventDefault();
        handler();
    });

    // Also resize on Enter in inputs
    el_gridWidth?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handler();
    });
    el_gridHeight?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handler();
    });
}

// Init
// ================================================================

function persistGridDims(w, h) {
    try {
        localStorage.setItem(LS_KEY_EDITOR_GRID_DIMS, JSON.stringify({w, h}));
    } catch {
        // ignore
    }
}

function loadLevelData() {
    const raw = localStorage.getItem(LS_KEY_EDITOR_LAST_LEVEL);
    const idx = Number(raw);

    if (Number.isInteger(idx) && idx >= 0 && idx < gameplay.length) {
        level = idx;
        resetEditor();
    }
}

function init() {
    loadSavedGridDimsOrDefault();
    loadLevelData();

    createLevelSelector();
    syncSelector();

    lastRenderedAscii = editorStateToText(editorFloor, editorBlocks);
    el_text.value = lastRenderedAscii;

    syncPalette();
    bindResizeUI();

    draw();
};

init();
