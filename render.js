"use strict";
const TILE_SIZE = 64;

let canvas, ctx
export function setCanvas(id) {
    canvas = document.getElementById(id);
    ctx = canvas.getContext("2d");
}

export function getAssets(callback) {
    function loadAsset(path, color) {
        const obj = {img: new Image(), loaded: false};
        obj.img.src = path;
        obj.color = color;

        obj.img.onload = () => {
            obj.loaded = true;
            // Redraw so sprites appear as soon as assets load.
            if (callback) callback();
        };
        return obj;
    }

    return {
        player: loadAsset("./assets/player.png", "#00A0FF"),
        playerTarget: loadAsset("./assets/player_target.png", "#FFE000"),
        box: loadAsset("./assets/box.png", "#A06000"),
        boxTarget: loadAsset("./assets/box_target.png", "#FF8000"),
    };
}

function getCell(layer, x, y) {
    return (layer[y] ?? [])[x];
}

function drawBlock(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

export function drawImage(x, y, img) {
    if (img.loaded) ctx.drawImage(img.img, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    else drawBlock(x, y, img.color);
}

export function drawCanvas(level, assets, grid, override) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const floor = level?.floor ?? [];
    const blocks = level?.blocks ?? [];

    if (!blocks?.length && !floor?.length) return;

    const h = blocks.length || floor.length;
    const w = (blocks[0]?.length ?? floor[0]?.length ?? 0);

    canvas.width = w * TILE_SIZE;
    canvas.height = h * TILE_SIZE;

    // Background
    ctx.fillStyle = "#606060";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor layer (targets)
    for (let y = 0; y < floor.length; y++) {
        for (let x = 0; x < floor[y].length; x++) {
            const tile = getCell(floor, x, y);

            if (tile === "T") drawImage(x, y, assets.playerTarget);
            else if (tile === "X") drawImage(x, y, assets.boxTarget);
        }
    }

    // Blocks layer
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < blocks[y].length; x++) {
            const block = getCell(blocks, x, y);

            // Hide moving objects during animation to avoid ghosting
            if (getCell(override, x, y)) continue;

            if (block === "#") drawBlock(x, y, "#181818");
            else if (block === "P") drawImage(x, y, assets.player);
            else if (block === "B") drawImage(x, y, assets.box);
        }
    }

    if (grid) {
        // Grid overlay (thin lines)
        ctx.strokeStyle = "rgb(255 255 255 / 15%)";
        ctx.lineWidth = 1;

        for (let x = 1; x < w; x++) {
            ctx.beginPath();
            ctx.moveTo(x * TILE_SIZE, 0);
            ctx.lineTo(x * TILE_SIZE, canvas.height);
            ctx.stroke();
        }

        for (let y = 1; y < h; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * TILE_SIZE);
            ctx.lineTo(canvas.width, y * TILE_SIZE);
            ctx.stroke();
        }
    }
}
