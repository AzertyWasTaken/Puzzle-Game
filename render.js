"use strict";
export function getAssets(callback) {
    function loadAsset(path) {
        const obj = {img: new Image(), loaded: false};
        obj.img.src = path;

        obj.img.onload = () => {
            obj.loaded = true;
            // Redraw so sprites appear as soon as assets load.
            if (callback) callback();
        };
        return obj;
    }

    return {
        player: loadAsset("./assets/player.png"),
        playerTarget: loadAsset("./assets/player_target.png"),
        box: loadAsset("./assets/box.png"),
        boxTarget: loadAsset("./assets/box_target.png"),
    };
}

export function drawCanvas(canvas, level, tileSize, assets, grid) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const floor = level?.floor ?? [];
    const blocks = level?.blocks ?? [];

    if (!blocks?.length && !floor?.length) return;

    const h = blocks.length || floor.length;
    const w = (blocks[0]?.length ?? floor[0]?.length ?? 0);

    canvas.width = w * tileSize;
    canvas.height = h * tileSize;

    function getCell(layer, x, y) {
        return (layer[y] ?? [])[x];
    }

    function drawBlock(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }

    function drawImage(x, y, img, color) {
        if (img.loaded) ctx.drawImage(img.img, x * tileSize, y * tileSize, tileSize, tileSize);
        else drawBlock(x, y, color);
    }

    // Background
    ctx.fillStyle = "#606060";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor layer (targets)
    for (let y = 0; y < floor.length; y++) {
        for (let x = 0; x < floor[y].length; x++) {
            const tile = getCell(floor, x, y);

            if (tile === "T") drawImage(x, y, assets.playerTarget, "#FFE000");
            else if (tile === "X") drawImage(x, y, assets.boxTarget, "#FF8000");
        }
    }

    // Blocks layer
    for (let y = 0; y < blocks.length; y++) {
        for (let x = 0; x < blocks[y].length; x++) {
            const block = getCell(blocks, x, y);

            if (block === "#") drawBlock(x, y, "#181818");
            else if (block === "P") drawImage(x, y, assets.player, "#00A0FF");
            else if (block === "B") drawImage(x, y, assets.box, "#A06000");
        }
    }

    if (grid) {
        // Grid overlay (thin lines)
        ctx.strokeStyle = "rgb(255 255 255 / 15%)";
        ctx.lineWidth = 1;

        for (let x = 1; x < w; x++) {
            ctx.beginPath();
            ctx.moveTo(x * tileSize, 0);
            ctx.lineTo(x * tileSize, canvas.height);
            ctx.stroke();
        }

        for (let y = 1; y < h; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * tileSize);
            ctx.lineTo(canvas.width, y * tileSize);
            ctx.stroke();
        }
    }
}
