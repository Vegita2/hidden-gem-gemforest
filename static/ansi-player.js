// ---------- Config ----------
const DEFAULT_FG = 0xd0d0d0, DEFAULT_BG = 0x000000;

// ---------- ANSI color helpers ----------
const ANSI16 = {
    30: 0x000000, 31: 0xcd0000, 32: 0x00cd00, 33: 0xcdcd00,
    34: 0x1e90ff, 35: 0xcd00cd, 36: 0x00cdcd, 37: 0xe5e5e5,
    90: 0x7f7f7f, 91: 0xff0000, 92: 0x00ff00, 93: 0xffff00,
    94: 0x5c5cff, 95: 0xff00ff, 96: 0x00ffff, 97: 0xffffff
};
function xterm256(n) {
    if (n < 16) {
        const map = [0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff];
        return map[n];
    }
    if (n <= 231) {
        const c = n - 16, r = Math.floor(c / 36), g = Math.floor((c % 36) / 6), b = c % 6;
        const step = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
        return (step[r] << 16) | (step[g] << 8) | step[b];
    }
    const level = 8 + (n - 232) * 10;
    return (level << 16) | (level << 8) | level;
}
function rgbToCss(v) { return `rgb(${v >> 16 & 255},${v >> 8 & 255},${v & 255})`; }

function lerp8(a, b, t) { return (a + (b - a) * t) | 0; }
function lerpRgb24(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (lerp8(ar, br, t) << 16) | (lerp8(ag, bg, t) << 8) | lerp8(ab, bb, t);
}

// Deep copy grid so we don’t mutate the cached base grid
function cloneGrid(grid) {
    return grid.map(row => row.map(c => ({ ...c })));
}

function hexToRgb24(hex) {
    const s = hex.startsWith('#') ? hex.slice(1) : hex;
    return parseInt(s, 16) & 0xFFFFFF;
}

function decodeArenaOverlayToMap(overlayObj, overlayPalette, arenaW) {
    if (!overlayObj || !overlayObj.data || !overlayObj.type) return null;
    if (!Number.isInteger(arenaW) || arenaW <= 0) return null;

    // palette index 0 = transparent, indices 1..N = "#RRGGBB"
    const pal = [...overlayPalette].map((c, i) => (i === 0 ? null : hexToRgb24(c)));
    const data = overlayObj.data;
    const type = overlayObj.type;

    const map = new Map(); // key: pos (y*arenaW + x) -> rgb24

    if (type === "sparse") {
        const count = data[0] | 0;
        let pos = 0, p = 1;
        for (let i = 0; i < count && p + 1 < data.length; i++) {
            pos += data[p++] | 0;
            const idx = data[p++] | 0;
            if (idx === 0) continue;
            const c = pal[idx];
            if (c == null) continue;
            map.set(pos, c);
        }
        return map;
    }

    if (type === "rle") {
        let pos = 0, p = 0;
        while (p + 1 < data.length) {
            let len = data[p++] | 0;
            const idx = data[p++] | 0;
            const c = (idx === 0) ? null : pal[idx];
            while (len-- > 0) {
                if (c != null) map.set(pos, c);
                pos++;
            }
        }
        return map;
    }

    return null;
}

function applyArenaOverlayFadeToGrid(grid, mapA, mapB, t, cols, rows, arenaW) {
    if (!Number.isInteger(arenaW) || arenaW <= 0) return grid;

    const headerRows = 1;  // arena starts below header
    const xScale = 2;      // each field is two cells wide
    const xOffset = 0;
    const yOffset = headerRows;

    const arenaColsCells = arenaW * xScale;

    // Build union of positions that are affected by either overlay
    const keys = new Set();
    if (mapA) for (const k of mapA.keys()) keys.add(k);
    if (mapB) for (const k of mapB.keys()) keys.add(k);

    for (const pos of keys) {
        const fieldY = (pos / arenaW) | 0;
        const fieldX = pos - fieldY * arenaW;

        const sx = xOffset + fieldX * xScale;
        const sy = yOffset + fieldY;

        if (sy < 0 || sy >= rows) continue;
        if (sx < 0 || sx >= cols) continue;
        if (sx >= xOffset + arenaColsCells) continue;

        // Base background from the already-parsed ANSI screen
        const base0 = grid[sy][sx].bg;

        // Start/end colors for fade:
        const start = mapA?.get(pos) ?? base0;
        const end   = mapB?.get(pos) ?? base0;

        const blended = lerpRgb24(start, end, t);

        grid[sy][sx].bg = blended;
        if (sx + 1 < cols && sx + 1 < xOffset + arenaColsCells) {
            grid[sy][sx + 1].bg = blended;
        }
    }

    return grid;
}


function applyArenaOverlayToGrid(grid, overlayObj, overlayPalette, frame, cols, rows, arenaWidthFields) {
    if (!overlayObj || !overlayObj.data || !overlayObj.type) return grid;

    const arenaW = arenaWidthFields;
    if (!Number.isInteger(arenaW) || arenaW <= 0) return grid;

    const headerRows = 1;     // arena starts below header
    const xScale = 2;         // each field is two cells wide
    const xOffset = 0;        // arena starts at col 0
    const yOffset = headerRows;

    const arenaColsCells = arenaW * xScale;

    // palette: indices 1..N, index 0 transparent
    const pal = [...overlayPalette].map((c, i) => (i === 0 ? null : hexToRgb24(c)));

    const type = overlayObj.type;
    const data = overlayObj.data;

    const paint = (fieldX, fieldY, idx) => {
        if (idx === 0) return;
        const c = pal[idx];
        if (c == null) return;

        const sx = xOffset + fieldX * xScale;
        const sy = yOffset + fieldY;

        if (sy < 0 || sy >= rows) return;
        if (sx < 0 || sx >= cols) return;

        // respect arena width
        if (sx >= xOffset + arenaColsCells) return;

        // color both cells of the tile
        grid[sy][sx].bg = c;
        if (sx + 1 < cols && sx + 1 < xOffset + arenaColsCells) {
            grid[sy][sx + 1].bg = c;
        }
    };

    if (type === "sparse") {
        const count = data[0] | 0;
        let pos = 0;
        let p = 1;
        for (let i = 0; i < count && p + 1 < data.length; i++) {
            pos += data[p++] | 0;
            const idx = data[p++] | 0;

            const y = (pos / arenaW) | 0;
            const x = pos - y * arenaW;
            paint(x, y, idx);
        }
        return grid;
    }

    if (type === "rle") {
        let x = 0, y = 0, p = 0;
        while (p + 1 < data.length) {
            let len = data[p++] | 0;
            const idx = data[p++] | 0;
            while (len-- > 0) {
                paint(x, y, idx);
                x++;
                if (x >= arenaW) { x = 0; y++; }
            }
        }
        return grid;
    }

    return grid;
}

function overlayForFrame(frame, botIndex1Based) {
    const dbg = frame.highlight;
    if (!dbg) return null;

    if (Array.isArray(dbg)) return dbg[botIndex1Based - 1] ?? null;
    if (typeof dbg === 'object') return dbg[String(botIndex1Based)] ?? dbg[botIndex1Based] ?? null;
    return null;
}

// ---------- Grapheme + width ----------
const graphemes = (s) => {
    if ('Segmenter' in Intl) {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(seg.segment(s), x => x.segment);
    }
    return Array.from(s);
};

const reEmojiPresentation = (() => {
  try { return /\p{Emoji_Presentation}/u; }
  catch { return null; }
})();

function wcwidthGrapheme(g, emojiWidths) {
    const cp = g.codePointAt(0);
    if (cp == null) return 0;
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return 0;

    if (emojiWidths) {
        if (Object.prototype.hasOwnProperty.call(emojiWidths, g)) {
            const w = emojiWidths[g];
            if (Number.isInteger(w)) return w;
        }
        const base = g.replace(/\uFE0F/g, '');
        if (base !== g && Object.prototype.hasOwnProperty.call(emojiWidths, base)) {
            const w = emojiWidths[base];
            if (Number.isInteger(w)) return w;
        }
    }

    const hasVS16 = g.includes('\uFE0F');
    const hasVS15 = g.includes('\uFE0E');

    const isEmojiPresentation =
        !hasVS15 && (
            hasVS16 ||
            (reEmojiPresentation && reEmojiPresentation.test(g))
        );

    const eastWide = (cp >= 0x1100 && (
        cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe10 && cp <= 0xfe19) ||
        (cp >= 0xfe30 && cp <= 0xfe6f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6)
    ));

    return (eastWide || isEmojiPresentation) ? 2 : 1;
}

// ---------- ANSI → Grid (same API, allocation-light) ----------
function ansiToGrid(ansi, opts = {}) {
    const COLS = Number.isInteger(opts.cols) ? opts.cols : 80;
    const ROWS = Number.isInteger(opts.rows) ? opts.rows : 21;
    const defFG = opts.defaultFg ?? DEFAULT_FG;
    const defBG = opts.defaultBg ?? DEFAULT_BG;
    const emojiWidths = opts.emojiWidths || null;

    const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({
        ch: ' ', fg: defFG, bg: defBG, bold: false, width: 1
    })));
    let style = { fg: defFG, bg: defBG, bold: false };
    let r = 0, c = 0;

    function applySGR(params) {
        if (params.length === 0) { style = { fg: defFG, bg: defBG, bold: false }; return; }
        for (let i = 0; i < params.length; i++) {
            const p = params[i];
            if (p === 0) { style = { fg: defFG, bg: defBG, bold: false }; }
            else if (p === 1) { style.bold = true; }
            else if (p === 22) { style.bold = false; }
            else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) { style.fg = ANSI16[p] ?? style.fg; }
            else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) {
                const bgCode = p - 10 + ((p >= 100) ? -60 : 0);
                style.bg = ANSI16[bgCode] ?? style.bg;
            }
            else if (p === 38 || p === 48) {
                const isFG = (p === 38); const mode = params[++i];
                if (mode === 5) { const idx = params[++i]; if (idx != null) { const v = xterm256(idx); isFG ? style.fg = v : style.bg = v; } }
                else if (mode === 2) {
                    const rr = params[++i], gg = params[++i], bb = params[++i];
                    if ([rr, gg, bb].every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
                        const v = (rr << 16) | (gg << 8) | bb; isFG ? style.fg = v : style.bg = v;
                    }
                }
            }
        }
    }

    function writeText(txt) {
        const lines = txt.split(/\r?\n/);
        for (let li = 0; li < lines.length; li++) {
            for (const g of graphemes(lines[li])) {
                const w = wcwidthGrapheme(g, emojiWidths);
                if (w === 0) continue;
                if (c >= COLS) { r++; c = 0; }
                if (r >= ROWS) return;
                if (w === 2 && c === COLS - 1) { c++; continue; }
                const cell = grid[r][c];
                cell.ch = g; cell.fg = style.fg; cell.bg = style.bg; cell.bold = style.bold; cell.width = w;
                if (w === 2) {
                    const follower = grid[r][c + 1];
                    follower.ch = ''; follower.fg = style.fg; follower.bg = style.bg; follower.bold = style.bold; follower.width = 0;
                }
                c += w;
            }
            if (li < lines.length - 1) { r++; c = 0; if (r >= ROWS) return; }
        }
    }

    const re = /\x1b\[([0-9;]*)m/g;
    let i = 0, m;
    while ((m = re.exec(ansi)) !== null) {
        if (m.index > i) writeText(ansi.slice(i, m.index));
        const params = m[1] === '' ? [] : m[1].split(';').map(n => parseInt(n, 10));
        applySGR(params);
        i = re.lastIndex;
        if (r >= ROWS) break;
    }
    if (i < ansi.length && r < ROWS) writeText(ansi.slice(i));
    return grid;
}

// ---------- Drawing (cached metrics + run-batched) ----------
function makeCanvasDrawer(canvas, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const pad = opts.pad ?? 8;
    const fontSize = opts.fontSize ?? 16;
    const lineH = opts.lineHeight ?? 1.15;
    const baseFont = `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
    const fontNormal = `${fontSize}px ${baseFont}`;
    const fontBold = `bold ${fontSize}px ${baseFont}`;

    // measure once
    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = fontNormal;
    const cellW = mctx.measureText('M').width;
    const cellH = fontSize * lineH;

    let sizedFor = { cols: -1, rows: -1 };

    function ensureSize(cols, rows) {
        if (sizedFor.cols === cols && sizedFor.rows === rows) return;
        sizedFor = { cols, rows };
        const innerW = cols * cellW, innerH = rows * cellH;
        canvas.width = Math.ceil((innerW + pad * 2) * dpr);
        canvas.height = Math.ceil((innerH + pad * 2) * dpr);
        canvas.style.aspectRatio = ((innerW + pad * 2) / (innerH + pad * 2)).toString();
        canvas.style.background = '#000';
        ctx.reset?.();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'top';
    }

    function drawGrid(grid) {
        const ROWS = grid.length;
        const COLS = ROWS ? grid[0].length : 0;
        ensureSize(COLS, ROWS);

        // clear black
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        // background runs (skip default)
        for (let y = 0; y < ROWS; y++) {
            let x = 0;
            while (x < COLS) {
                const bg = grid[y][x].bg;
                if (bg === DEFAULT_BG) { x++; continue; }
                let len = 1;
                while (x + len < COLS && grid[y][x + len].bg === bg) len++;
                ctx.fillStyle = rgbToCss(bg);
                ctx.fillRect(pad + x * cellW, pad + y * cellH, len * cellW + 1, cellH + 1);
                x += len;
            }
        }

        // glyphs: batch by (bold, fg) per row
        for (let y = 0; y < ROWS; y++) {
            let x = 0;
            while (x < COLS) {
                // skip empties
                while (x < COLS && !grid[y][x].ch) x++;
                if (x >= COLS) break;

                const startX = x;
                const s = grid[y][x];
                const runBold = s.bold, runFG = s.fg;

                // extend run while visible and same style
                let endX = x;
                while (endX < COLS) {
                    const c = grid[y][endX];
                    if (!c.ch || c.bold !== runBold || c.fg !== runFG) break;
                    endX++;
                }

                ctx.font = runBold ? fontBold : fontNormal;
                ctx.fillStyle = rgbToCss(runFG);
                for (let i = startX; i < endX; i++) {
                    const cell = grid[y][i];
                    if (!cell.ch) continue;
                    ctx.fillText(cell.ch, pad + i * cellW, pad + y * cellH + (cellH - fontSize) * 0.5 - fontSize * 0.0);
                }

                x = endX;
            }
        }
    }

    return { drawGrid, cellW, cellH, pad };
}

// ---------- Tiny LRU cache for parsed grids ----------
class LRU {
    constructor(limit = 64) { this.limit = limit; this.map = new Map(); }
    get(k) {
        const v = this.map.get(k);
        if (v === undefined) return undefined;
        this.map.delete(k); this.map.set(k, v); return v;
    }
    set(k, v) {
        if (this.map.has(k)) this.map.delete(k);
        this.map.set(k, v);
        if (this.map.size > this.limit) {
            const firstKey = this.map.keys().next().value;
            this.map.delete(firstKey);
        }
    }
    clear() { this.map.clear(); }
}

// ---------- Grid → Canvas (compat wrapper) ----------
function drawGridToCanvas(grid, canvas, opts = {}, drawerCache = new WeakMap()) {
    let drawer = drawerCache.get(canvas);
    if (!drawer) {
        drawer = makeCanvasDrawer(canvas, opts);
        drawerCache.set(canvas, drawer);
    }
    drawer.drawGrid(grid);
}

// ---------- Index-based player (unchanged API; minor internals) ----------
class IndexPlayer {
    constructor({ frameCount, fps = 15, render, onFrame = () => { }, loop = false, cols = 80, rows = 21, arenaWidthFields = null }) {
        if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error('frameCount > 0 required');
        if (typeof render !== 'function') throw new Error('render(frameIndex) is required');
        this.n = frameCount; this.render = render; this.onFrame = onFrame; this.loop = loop;
        this.arenaWidthFields = arenaWidthFields;
        this.cols = cols; this.rows = rows;
        this.index = 0; this.playing = false; this.disposed = false;
        this._fps = fps; this._dt = 1000 / fps; this._acc = 0; this._last = 0; this._raf = 0; this._tick = null;
        this._manualCooldown = 0.5 * 1000 / fps; this._nextManualAt = 0;
    }
    setFPS(fps) { if (this.disposed) return; this._fps = fps; this._dt = 1000 / fps; this._manualCooldown = 0.5 * this._dt; }
    setResolution(cols, rows) { if (this.disposed) return; if (Number.isInteger(cols) && cols > 0) this.cols = cols; if (Number.isInteger(rows) && rows > 0) this.rows = rows; }
    play() {
        if (this.disposed || this.playing) return;
        this.playing = true; this._last = performance.now();
        this._tick = (t) => {
            if (!this.playing || this.disposed) return;
            const elapsed = t - this._last; this._last = t; this._acc += elapsed;
            let steps = 0; while (this._acc >= this._dt && steps < 5) { this._acc -= this._dt; this._advance(); steps++; }
            this._raf = requestAnimationFrame(this._tick);
        };
        this._raf = requestAnimationFrame(this._tick);
    }
    pause() { if (this.disposed || !this.playing) return; this.playing = false; cancelAnimationFrame(this._raf); this._raf = 0; }
    step(delta = 1) {
        if (this.disposed) return;
        const now = performance.now(); if (now < this._nextManualAt) return;
        this._nextManualAt = now + this._manualCooldown;
        if ((delta > 0) && (this.index < this.n - 1)) this.next();
        else if ((delta < 0) && (this.index > 0)) this.prev();
    }
    toggle() { if (!this.disposed) (this.playing ? this.pause() : this.play()); }
    seek(i) { if (this.disposed) return; const clamped = Math.max(0, Math.min(i, this.n - 1)); this.index = clamped; this._acc = 0; this._draw(); }
    next() { if (this.disposed) return; if (this.index + 1 >= this.n) { if (this.loop) this.index = 0; else { this.pause(); return; } } else this.index++; this._draw(); }
    prev() { if (this.disposed) return; if (this.index === 0) this.index = this.loop ? this.n - 1 : 0; else this.index--; this._draw(); }
    dispose({ clearCanvas } = {}) { if (this.disposed) return; this.pause(); this.disposed = true; this.render = () => { }; this.onFrame = () => { }; this._tick = null; if (typeof clearCanvas === 'function') { try { clearCanvas(); } catch { } } }
    _advance() { this.next(); }
    _draw() { this.render(this.index, this); this.onFrame(this.index, this); }
}

window.ansiPlayerWidgets = {};
window.currentAnsiPlayerWidget = null;

class AnsiPlayerWidget {
    constructor(options = {}) {
        this.uuid = crypto.randomUUID();
        this.options = options;
        this.poster_url = options.url.replace('.json.gz', '-poster.json.gz');
        this.screenDiv = options.element.querySelector('.ansi-player-screen');
        this.screenDiv.classList.add('idle');
        this.jsonDiv = options.element.querySelector('.ansi-player-json');
        this.canvas = document.createElement('canvas');
        const busy = document.createElement('div'); busy.classList.add('busy');
        this.screenDiv.appendChild(busy); this.screenDiv.appendChild(this.canvas);

        this.playIcon = document.createElement('i'); this.playIcon.className = 'bi bi-ansi-center bi-play-fill hide';
        this.pauseIcon = document.createElement('i'); this.pauseIcon.className = 'bi bi-ansi-center bi-pause-fill hide';
        this.loadIcon = document.createElement('i'); this.loadIcon.className = 'bi bi-ansi-center bi-circle hide';
        this.screenDiv.appendChild(this.playIcon); this.screenDiv.appendChild(this.pauseIcon); this.screenDiv.appendChild(this.loadIcon);

        this.overlayBot = 0;          // target (what user chose)
        this._overlayFrom = 0;        // previous
        this._overlayFadeT0 = 0;      // fade start time
        this._overlayFadeMs = 180;    // tweak to taste
        this._overlayFadeRaf = 0;

        this._overlayMapCache = new Map(); // key: `${frame}:${bot}` -> Map(pos->rgb24)

        // --- Controls (progress + fullscreen) ---
        this.controls = document.createElement('div');
        this.controls.className = 'ansi-controls';

        this.progress = document.createElement('div');
        this.progress.className = 'ansi-progress';

        this.progressFill = document.createElement('div');
        this.progressFill.className = 'ansi-progress-fill';
        this.progress.appendChild(this.progressFill);

        this.fsBtn = document.createElement('button');
        this.fsBtn.className = 'ansi-fs-btn';
        this.fsBtn.innerHTML = '<i class="bi bi-fullscreen" style="margin-right: 0; padding: 0 3px;"></i>';

        this.dlBtn = document.createElement('button');
        this.dlBtn.className = 'ansi-dl-btn';
        this.dlBtn.innerHTML = '<i class="bi bi-download" style="margin-right: 0; padding: 0 3px;"></i>';

        this.controls.appendChild(this.progress);
        this.controls.appendChild(this.dlBtn);
        this.controls.appendChild(this.fsBtn);
        this.screenDiv.appendChild(this.controls);

        this.dlBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            let self = this;
            if (e.shiftKey) {
                api_call('/api/convert_replay', { url: this.options.url}, function(data) {
                    if (data.success) {
                        self.dlBtn.innerHTML = '<i class="bi bi-check-lg" style="margin-right: 0; padding: 0 3px;"></i>';
                        setTimeout(() => {
                            self.dlBtn.innerHTML = '<i class="bi bi-download" style="margin-right: 0; padding: 0 3px;"></i>';
                        }, 1000);
                    }
                });
                return;
            }
            await this._activateAndEnsureLoaded();
            await this._downloadRecordingGz();
        });

        this._histBound = false;
        this._histZoomPushed = false;
        this._histCinemaPushed = false;

        this._onPopState = (e) => {
            // Close active overlays instead of navigating away
            if (this._zoomActive) this._zoomExit({ fromHistory: true });
            if (this._cinema) this.exitCinema({ fromHistory: true });
        };

        this.jsonViewer = null;
        if (this.jsonDiv) {
            this.jsonViewer = new CollapsibleJSONViewer(this.jsonDiv, {
                collapsed: true, previewMaxLen: 10, showRootBraces: true,
                inlinePairPaths: ['bot', 'wall.*', 'floor.*', 'visible_gems.*'],
            });
        }

        // cache: parsed grids and a drawer per canvas
        this.gridCache = new LRU(96);
        this.drawerCache = new WeakMap();

        this.player = null;
        fetch(this.poster_url).then(r => r.json()).then(posterData => {
            const key = `poster:${posterData.width}x${posterData.height}`;
            let grid = this.gridCache.get(key);
            if (!grid) { grid = ansiToGrid(posterData.frames[0].screen, {
                cols: posterData.width,
                rows: posterData.height,
                emojiWidths: posterData.emoji_widths || null
            });
            this.gridCache.set(key, grid); }
            drawGridToCanvas(grid, this.canvas, { fontSize: 24, lineHeight: 1.25, pad: 0 }, this.drawerCache);
            if (this.jsonViewer) this.jsonViewer.render(posterData.frames[0].stdin);
        }).catch(() => { });

        const widget = this;
        this.screenDiv.onclick = async (e) => {
            await this._activateAndEnsureLoaded();

            if (this.player.playing) {
                this.player.pause();
                this.pauseIcon.classList.remove('hide');
                setTimeout(() => this.pauseIcon.classList.add('hide'), 500);
            } else {
                if (this.player.index === this.player.n - 1) {
                    this.player.seek(0);
                }
                this.player.play();
                this.playIcon.classList.remove('hide');
                setTimeout(() => this.playIcon.classList.add('hide'), 500);
            }
        };

        // create head dot
        this.progressHead = document.createElement('div');
        this.progressHead.className = 'ansi-progress-head';
        this.progress.appendChild(this.progressHead);

        // block clicks from toggling playback
        this.progress.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        const scrubTo = (clientX) => {
            if (!this.player) return;
            const rect = this.progress.getBoundingClientRect();
            const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const i = Math.round(t * (this.player.n - 1));
            this.player.seek(i);
            this.updateProgress(i, rect); // pass rect so we can place the head precisely without reflow
        };

        let scrubbing = false;

        // block clicks from toggling playback
        this.progress.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        // unified pointer scrubbing (mouse/touch/pen)
        this.progress.addEventListener('pointerdown', async (e) => {
            e.stopPropagation();
            e.preventDefault();              // stops mobile from generating a scroll
            await this._activateAndEnsureLoaded();
            this._scrubStart(e);
        }, { passive: false });


        this._zoomActive = false;
        this._zoomOverlay = null;
        this._zoomPlaceholder = null;
        this._zoomOrigParent = null;
        this._onResizeBound = null;

        this.fsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this._activateAndEnsureLoaded();
            this._zoomActive ? this._zoomExit() : this._zoomEnter();
        });

        // --- Auto-hide controls after idle (mouse or tap) ---
        this._idleTimer = null;
        const hideNow = () => {
            this.screenDiv.classList.add("idle");
        };

        const resetIdle = () => {
            // show controls on interaction
            this.screenDiv.classList.remove("idle");
            clearTimeout(this._idleTimer);

            // don't autohide while scrubbing
            if (this.progress.classList.contains("scrubbing")) return;

            this._idleTimer = setTimeout(() => {
                hideNow();
            }, 2000);
        };

        // interaction resets the idle timer
        ["mousemove", "pointermove", "pointerdown", "keydown"]
            .forEach(ev => this.screenDiv.addEventListener(ev, resetIdle));

        // immediate hide when leaving player
        this.screenDiv.addEventListener("mouseleave", hideNow);
    }

    _setOverlayBotFade(newBot) {
        newBot = Number(newBot) | 0;
        if (newBot === this.overlayBot) return;

        // current visual state becomes "from"
        const now = performance.now();
        const t = this._overlayFadeProgress(now);
        const visualBot = (t < 1) ? this.overlayBot /* we were fading already; treat current target as visual */ : this.overlayBot;

        this._overlayFrom = visualBot;
        this.overlayBot = newBot;
        this._overlayFadeT0 = now;

        // Clear only rendered grids (we cache base grids separately below)
        this.gridCache.clear();

        // Kick an animation loop so fade updates even while paused
        if (this._overlayFadeRaf) cancelAnimationFrame(this._overlayFadeRaf);
        const tick = () => {
            if (!this.player) return;
            this.show_frame(this.player.index);
            if (this._overlayFadeProgress(performance.now()) < 1) {
                this._overlayFadeRaf = requestAnimationFrame(tick);
            } else {
                this._overlayFadeRaf = 0;
            }
        };
        this._overlayFadeRaf = requestAnimationFrame(tick);
    }

    _overlayFadeProgress(now) {
        if (!this._overlayFadeT0) return 1;
        const dt = now - this._overlayFadeT0;
        const t = Math.max(0, Math.min(1, dt / this._overlayFadeMs));
        // nice easing (optional)
        return t * t * (3 - 2 * t); // smoothstep
    }

    _scrubToClientX(clientX) {
        if (!this.player) return;
        const rect = this.progress.getBoundingClientRect();
        const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const i = Math.round(t * (this.player.n - 1));
        this.player.seek(i);
        this.updateProgress(i, rect);
    }

    _scrubStart(e) {
        // unify: only left mouse OR any touch/pen
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        this.scrubbing = true;
        this.progress.classList.add('scrubbing');
        this.wasPlayingBeforeScrub = !!this.player?.playing;
        if (this.player?.playing) this.player.pause();

        // capture to keep receiving moves even if finger leaves the bar a bit
        try { this.progress.setPointerCapture(e.pointerId); } catch { }

        // first position
        this._scrubToClientX(e.clientX);

        const onMove = (ev) => {
            if (!this.scrubbing) return;
            ev.preventDefault();
            this._scrubToClientX(ev.clientX);
        };

        const onEnd = (ev) => {
            this.scrubbing = false;
            this.progress.classList.remove('scrubbing');
            try { this.progress.releasePointerCapture(ev.pointerId); } catch { }
            this.progress.removeEventListener('pointermove', onMove);
            this.progress.removeEventListener('pointerup', onEnd);
            this.progress.removeEventListener('pointercancel', onEnd);
            if (this.wasPlayingBeforeScrub && this.player && !this.player.playing) this.player.play();
            this.screenDiv.classList.remove('ansi-controls-force');
        };

        // attach (non-passive so preventDefault works on mobile)
        this.progress.addEventListener('pointermove', onMove, { passive: false });
        this.progress.addEventListener('pointerup', onEnd, { passive: false });
        this.progress.addEventListener('pointercancel', onEnd, { passive: false });

        // keep controls visible while scrubbing
        this.screenDiv.classList.add('ansi-controls-force');
    }


    // Make this widget the active one and dispose others (same logic you had)
    _activate() {
        window.currentAnsiPlayerWidget = this;
        for (const uuid in window.ansiPlayerWidgets) {
            if (uuid === this.uuid) continue;
            const other = window.ansiPlayerWidgets[uuid];
            if (other.player && other.player.playing) other.player.pause();
            if (other.player) {
                other.lastFrameShown = other.player.index;
                other.player.dispose();
                other.player = null;
                other.ansi_log = null;
                other.gridCache?.clear?.();
            }
        }
    }

    // Ensure this widget is loaded (shows spinner while loading)
    async _ensureLoaded() {
        if (this.player) return;
        this.loadIcon.classList.remove('hide');
        try {
            await this.load();
        } finally {
            this.loadIcon.classList.add('hide');
        }
    }

    // Convenience: do both, in order
    async _activateAndEnsureLoaded() {
        this._activate();
        await this._ensureLoaded();
    }


    // Fit a box with given aspect into maxW x maxH, preserving aspect ratio
    _fitInto(aspect, maxW, maxH) {
        // aspect = width / height
        let width = maxW, height = maxW / aspect;
        if (height > maxH) { height = maxH; width = height * aspect; }
        return { width, height };
    }

    // Compute the target rect centered in viewport (90% of viewport by default)
    _computeTargetRect() {
        const vw = window.innerWidth, vh = window.innerHeight;
        const maxW = vw * 0.9, maxH = vh * 0.9;

        // Prefer the canvas aspect (most accurate). Fallback to current box.
        const canvas = this.canvas;
        const cw = canvas.clientWidth || canvas.width || 640;
        const ch = canvas.clientHeight || canvas.height || 360;
        const aspect = cw / ch;

        const { width, height } = this._fitInto(aspect, maxW, maxH);
        const left = Math.round((vw - width) / 2);
        const top = Math.round((vh - height) / 2);
        return { left, top, width, height };
    }

    _zoomEnter() {
        if (this._zoomActive) return;
        this._zoomActive = true;

        // Create overlay once (reused). Start hidden to ensure fade-in transition.
        if (!this._zoomOverlay) {
            this._zoomOverlay = document.createElement('div');
            this._zoomOverlay.className = 'ansi-zoom-overlay';
            this._zoomOverlay.style.opacity = '0';
            this._zoomOverlay.style.pointerEvents = 'none';
            document.body.appendChild(this._zoomOverlay);
            this._zoomOverlay.addEventListener('click', () => this._zoomExit());
        }

        // FIRST
        const first = this.screenDiv.getBoundingClientRect();

        // Move to body with placeholder
        this._zoomOrigParent = this.screenDiv.parentNode;
        this._zoomPlaceholder = document.createComment('ansi-zoom-placeholder');
        this._zoomOrigParent.insertBefore(this._zoomPlaceholder, this.screenDiv.nextSibling);
        document.body.appendChild(this.screenDiv);

        // LAST (fixed box preserving aspect)
        const target = this._computeTargetRect();
        Object.assign(this.screenDiv.style, {
            position: 'fixed',
            left: `${target.left}px`,
            top: `${target.top}px`,
            width: `${target.width}px`,
            height: `${target.height}px`,
        });
        this.screenDiv.classList.add('ansi-zooming');

        // INVERT
        const last = this.screenDiv.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = first.width / (last.width || 1);
        const sy = first.height / (last.height || 1);

        this.screenDiv.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
        this.screenDiv.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

        // Fade overlay IN (ensure transition runs)
        document.body.classList.add('ansi-zoom-active');
        requestAnimationFrame(() => {
            this._zoomOverlay.style.opacity = '1';
            this._zoomOverlay.style.pointerEvents = 'auto';
        });

        // Reflow and PLAY
        void this.screenDiv.getBoundingClientRect();
        this.screenDiv.style.transform = 'translate(0,0) scale(1,1)';

        // Listeners
        this._onResizeBound = () => this._zoomRelayout();
        window.addEventListener('resize', this._onResizeBound);

        this._onKeydownBound = (e) => { if (e.key === 'Escape') this._zoomExit(); };
        window.addEventListener('keydown', this._onKeydownBound);

        // History: allow Android/iOS back to close zoom
        if (!this._histBound) {
            window.addEventListener('popstate', this._onPopState);
            this._histBound = true;
        }
        if (!this._histZoomPushed) {
            history.pushState({ ansiZoom: true, uuid: this.uuid }, "");
            this._histZoomPushed = true;
        }
    }

    _zoomRelayout() {
        if (!this._zoomActive) return;
        // Update target rect and apply FLIP to new target smoothly
        const prev = this.screenDiv.getBoundingClientRect();
        const target = this._computeTargetRect();
        Object.assign(this.screenDiv.style, {
            left: `${target.left}px`,
            top: `${target.top}px`,
            width: `${target.width}px`,
            height: `${target.height}px`
        });
        const next = this.screenDiv.getBoundingClientRect();

        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        const sx = prev.width / (next.width || 1);
        const sy = prev.height / (next.height || 1);

        // Jump to inverted and animate to identity (quick relayout)
        this.screenDiv.style.transition = 'none';
        this.screenDiv.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        this.screenDiv.getBoundingClientRect(); // reflow
        this.screenDiv.style.transition = ''; // restore CSS transition
        this.screenDiv.style.transform = 'translate(0,0) scale(1,1)';
    }

    _zoomExit() {
        if (!this._zoomActive) return;
        this._zoomActive = false;

        // Clear any pending overlay cleanup timers
        if (this._overlayKillTimer) {
            clearTimeout(this._overlayKillTimer);
            this._overlayKillTimer = null;
        }

        // FROM (while fixed)
        const from = this.screenDiv.getBoundingClientRect();

        // Put element back to original DOM spot
        if (this._zoomOrigParent && this._zoomPlaceholder) {
            this._zoomOrigParent.insertBefore(this.screenDiv, this._zoomPlaceholder);
            this._zoomPlaceholder.remove();
            this._zoomPlaceholder = null;
        }

        // Let it take natural layout
        this.screenDiv.classList.remove('ansi-zooming');
        this.screenDiv.style.position = '';
        this.screenDiv.style.left = '';
        this.screenDiv.style.top = '';
        this.screenDiv.style.width = '';
        this.screenDiv.style.height = '';

        // TO (natural flow)
        const to = this.screenDiv.getBoundingClientRect();

        // FLIP back
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const sx = from.width / (to.width || 1);
        const sy = from.height / (to.height || 1);

        this.screenDiv.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
        this.screenDiv.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

        // Reflow then animate to identity
        void this.screenDiv.getBoundingClientRect();
        this.screenDiv.style.transform = 'translate(0,0) scale(1,1)';

        // Fade overlay OUT immediately and remove when done (with fallback)
        document.body.classList.remove('ansi-zoom-active');
        if (this._zoomOverlay) {
            const overlay = this._zoomOverlay;
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';

            const removeOverlay = () => {
                overlay.removeEventListener('transitionend', removeOverlay);
                // It might already have been removed; guard DOM ops
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (this._zoomOverlay === overlay) this._zoomOverlay = null;
            };
            overlay.addEventListener('transitionend', removeOverlay);

            // Fallback in case the transitionend doesn’t fire (e.g., browser quirk)
            this._overlayKillTimer = setTimeout(removeOverlay, 400);
        }

        const cleanup = () => {
            this.screenDiv.removeEventListener('transitionend', cleanup);
            this.screenDiv.style.transition = '';
            this.screenDiv.style.transform = '';
        };
        this.screenDiv.addEventListener('transitionend', cleanup);

        // Listener cleanup
        if (this._onResizeBound) window.removeEventListener('resize', this._onResizeBound);
        if (this._onKeydownBound) window.removeEventListener('keydown', this._onKeydownBound);
        this._onResizeBound = null;
        this._onKeydownBound = null;

        if (this._histZoomPushed) {
            this._histZoomPushed = false;
            // if (!fromHistory) history.back(); // pop our state without leaving page
        }

        if (!this._zoomActive && !this._cinema && this._histBound) {
            window.removeEventListener('popstate', this._onPopState);
            this._histBound = false;
        }

    }

    enterCinema() {
        if (this._cinema) return;
        this._cinema = true;

        // Create backdrop once and attach exit handlers
        if (!this._overlay) {
            this._overlay = document.createElement('div');
            this._overlay.className = 'ansi-cinema-overlay';
            document.body.appendChild(this._overlay);
            this._overlay.addEventListener('click', () => this.exitCinema());
        }

        // Remember original spot and move the screenDiv to <body>
        this._origParent = this.screenDiv.parentNode;
        this._placeholder = document.createComment('ansi-cinema-placeholder');
        this._origParent.insertBefore(this._placeholder, this.screenDiv.nextSibling);
        document.body.appendChild(this.screenDiv);

        // Style as centered 80% “theater” box and reveal overlay
        this.screenDiv.classList.add('ansi-cinema-active');
        this._overlay.style.opacity = '1';
        this._overlay.style.pointerEvents = 'auto';

        // Optional: change icon
        this.fsBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';

        // History: allow back to close cinema
        if (!this._histBound) {
            window.addEventListener('popstate', this._onPopState);
            this._histBound = true;
        }
        if (!this._histCinemaPushed) {
            history.pushState({ ansiCinema: true, uuid: this.uuid }, "");
            this._histCinemaPushed = true;
        }
    }

    exitCinema({ fromHistory = false } = {}) {
        if (!this._cinema) return;
        this._cinema = false;

        // Restore to original position
        this.screenDiv.classList.remove('ansi-cinema-active');
        if (this._origParent && this._placeholder) {
            this._origParent.insertBefore(this.screenDiv, this._placeholder);
            this._placeholder.remove();
            this._placeholder = null;
        }

        // Hide overlay
        if (this._overlay) {
            this._overlay.style.opacity = '0';
            this._overlay.style.pointerEvents = 'none';
        }

        // Optional: restore icon
        this.fsBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';

        if (this._histCinemaPushed) {
            this._histCinemaPushed = false;
            if (!fromHistory) history.back();
        }

        if (!this._zoomActive && !this._cinema && this._histBound) {
            window.removeEventListener('popstate', this._onPopState);
            this._histBound = false;
        }

    }


    updateProgress(n, rect = null) {
        if (!this.player || this.player.n <= 1) return;
        const pct = (n / (this.player.n - 1)) * 100;
        this.progressFill.style.width = `${pct}%`;

        // place head by percentage; CSS translates -50% to center it
        this.progressHead.style.left = `${pct}%`;
    }

    _gridForFrame(n) {
        const log = this.ansi_log;
        const baseKey = `base:${n}:${log.width}x${log.height}`;

        let base = this.gridCache.get(baseKey);
        if (!base) {
            base = ansiToGrid(log.frames[n].screen, {
                cols: log.width,
                rows: log.height,
                emojiWidths: log.emoji_widths || null
            });
            this.gridCache.set(baseKey, base);
        }

        // No overlay at all
        if (this.overlayBot === 0 && this._overlayFrom === 0) return base;

        // We’ll render into a copy so the cached base stays pristine
        const grid = cloneGrid(base);

        const arenaW = this.player?.arenaWidthFields ?? null;
        const pal = log.index_to_color ?? null;
        if (!pal || !arenaW) return grid;

        const now = performance.now();
        const t = this._overlayFadeProgress(now);

        const botA = (t < 1) ? this._overlayFrom : this.overlayBot;
        const botB = this.overlayBot;

        const mapFor = (bot) => {
            if (!bot) return null;
            const k = `${n}:${bot}`;
            let m = this._overlayMapCache.get(k);
            if (m === undefined) {
                const overlay = overlayForFrame(log.frames[n], bot);
                m = overlay ? decodeArenaOverlayToMap(overlay, pal, arenaW) : null;
                this._overlayMapCache.set(k, m);
            }
            return m;
        };

        const mapA = mapFor(botA);
        const mapB = mapFor(botB);

        // If no fade in progress, just apply the target overlay as a hard set (fast path)
        if (t >= 1 || botA === botB) {
            if (mapB) {
                applyArenaOverlayFadeToGrid(grid, null, mapB, 1, log.width, log.height, arenaW);
            }
            return grid;
        }

        // Crossfade
        applyArenaOverlayFadeToGrid(grid, mapA, mapB, t, log.width, log.height, arenaW);
        return grid;
    }

    show_frame(n) {
        if (this.jsonViewer) {
            this.jsonViewer.render(this.ansi_log.frames[n].stdin);
        }
        const grid = this._gridForFrame(n);
        drawGridToCanvas(grid, this.canvas, { fontSize: 24, lineHeight: 1.25, pad: 0 }, this.drawerCache);
        this.updateProgress(n);
    }

    async load() {
        if (this.player != null) return;
        const widget = this;
        await fetch(widget.options.url)
            .then(response => response.text())
            .then(data => {
                widget.ansi_log = JSON.parse(data);
                widget.player = new IndexPlayer({
                    frameCount: widget.ansi_log.frames.length,
                    fps: 15,
                    loop: false,
                    cols: widget.ansi_log.width,
                    rows: widget.ansi_log.height,
                    render: () => { },
                    onFrame: (i) => widget.show_frame(i),
                    arenaWidthFields: widget.ansi_log?.frames?.[0]?.stdin?.config?.width ?? null,
                });
                widget.player.seek(widget.lastFrameShown ?? 0);
                this.updateProgress(this.player.index);
            });
    }

    async _downloadRecordingGz() {
        // Pick a filename from the URL
        const url = this.options.url;
        const base = (url.split('?')[0].split('#')[0].split('/').pop() || 'recording.json.gz');
        const filename = base.endsWith('.json.gz') ? base : (base.endsWith('.json') ? (base + '.gz') : (base + '.json.gz'));

        // Safety: make sure we have data
        if (!this.ansi_log) throw new Error('No recording loaded');

        // Build JSON bytes
        const json = JSON.stringify(this.ansi_log);
        const inputBytes = new TextEncoder().encode(json);

        // Prefer native gzip (CompressionStream)
        let blob;
        if ('CompressionStream' in window) {
            const cs = new CompressionStream('gzip');
            const compressedStream = new Blob([inputBytes]).stream().pipeThrough(cs);
            blob = await new Response(compressedStream).blob(); // -> application/gzip-ish
        } else {
            // Fallback: still let the user save something usable locally
            // (either wire up pako later, or accept plain JSON download)
            blob = new Blob([inputBytes], { type: 'application/json' });
        }

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ('CompressionStream' in window) ? filename : filename.replace(/\.gz$/i, '');
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Cleanup
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
}

function launchAnsiPlayer(options) {
    if (options.element == null) return;
    const widget = new AnsiPlayerWidget(options);
    window.ansiPlayerWidgets[widget.uuid] = widget;
    if (options.autoPlay) {
        for (const uuid in window.ansiPlayerWidgets) {
            if (uuid !== widget.uuid) {
                const other = window.ansiPlayerWidgets[uuid];
                if (other.player && other.player.playing) other.player.pause();
                if (other.player) { other.lastFrameShown = other.player.index; other.player.dispose(); other.player = null; other.ansi_log = null; other.gridCache?.clear?.(); }
            }
        }
        widget.load().then(() => widget.player.play());
        window.currentAnsiPlayerWidget = widget;
    }
    return widget;
}

// ---------- Keyboard controls (unchanged) ----------
window.addEventListener('keydown', (e) => {
    if (window.currentAnsiPlayerWidget == null) return;
    const widget = window.currentAnsiPlayerWidget;

    if (e.key === 'Escape') {
        if (widget._cinema) {
            e.preventDefault();
            widget.exitCinema();
            return;
        }
        // NEW: close zoom mode (which, for popups, triggers _destroyEphemeral)
        if (widget._zoomActive) {
            e.preventDefault();
            widget._zoomExit();
            return;
        }
    }

    if (!widget.player) return;

    if (e.code === 'Space') { e.preventDefault(); widget.player.toggle(); }
    else if (e.code === 'ArrowRight' || e.code === 'Period') { e.preventDefault(); widget.player.step(1); }
    else if (e.code === 'ArrowLeft' || e.code === 'Comma') { e.preventDefault(); widget.player.step(-1); }
    else if (e.code === 'Home') { e.preventDefault(); widget.player.seek(0); }
    else if (e.code === 'End') { e.preventDefault(); widget.player.seek(widget.ansi_log.frames.length - 1); }
    else if (e.key === '0' || e.key === '1' || e.key === '2') {
        e.preventDefault();
        widget._setOverlayBotFade(e.key.charCodeAt(0) - 48);
    }
});


window.wasPlayingOnHide = false;
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        const w = window.currentAnsiPlayerWidget;
        if (w?.player?.playing) { window.wasPlayingOnHide = true; w.player.pause(); } else { window.wasPlayingOnHide = false; }
    } else if (window.wasPlayingOnHide) {
        const w = window.currentAnsiPlayerWidget;
        if (w?.player && window.wasPlayingOnHide) w.player.play();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // automatically find all ansi-player-auto-pickup divs
    let firstAutoplay = true;
    for (let el of document.querySelectorAll('.ansi-player-auto-pickup')) {
        let url = el.dataset.url;
        let autoplay = el.dataset.autoplay === 'true';
        if (autoplay && !firstAutoplay) autoplay = false;
        launchAnsiPlayer({ element: el, url: url, autoPlay: autoplay });
        if (autoplay) firstAutoplay = false;
    }
});

// Open a temporary "fullscreen" ansi player using the existing zoom mode.
// Root is hidden while loading, then we zoom in one smooth step and
// destroy the popup when zoom closes.
window.openAnsiPopupPlayer = function (url, { autoPlay = true } = {}) {
    // --- Root container (offscreen/hidden while loading) ---
    const root = document.createElement('div');
    root.className = 'ansi-player-popup-root';
    Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: '9999',
        visibility: 'hidden'   // <- hide initial black box & first frame
    });

    // Only the screen; no JSON panel for the popup
    root.innerHTML = `<div class="ansi-player-screen"></div>`;
    document.body.appendChild(root);

    // Normal widget init
    const widget = new AnsiPlayerWidget({ element: root, url });
    window.ansiPlayerWidgets[widget.uuid] = widget;
    window.currentAnsiPlayerWidget = widget;

    // Mark as ephemeral so we know it's temporary
    widget._ephemeralPopup = true;
    widget._popupRoot = root;

    // Central destroy function
    widget._destroyEphemeral = function () {
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        this.ansi_log = null;
        this.gridCache?.clear?.();

        if (window.currentAnsiPlayerWidget === this) {
            window.currentAnsiPlayerWidget = null;
        }
        delete window.ansiPlayerWidgets[this.uuid];

        if (this._popupRoot && this._popupRoot.parentNode) {
            this._popupRoot.parentNode.removeChild(this._popupRoot);
        }
    };

    // Hook zoom exit so when the overlay fades out, we destroy everything
    const originalZoomExit = widget._zoomExit;
    widget._zoomExit = function (...args) {
        if (this._ephemeralPopup && this._zoomOverlay) {
            const overlay = this._zoomOverlay;
            const onEnd = () => {
                overlay.removeEventListener('transitionend', onEnd);
                this._destroyEphemeral();
            };
            overlay.addEventListener('transitionend', onEnd);
        }
        return originalZoomExit.call(this, ...args);
    };

    // Load frames; first frame gets drawn while root is invisible.
    // Then we enter zoom (now with correct aspect ratio) and show it.
    widget.load().then(() => {
        widget._zoomEnter();
        root.style.visibility = 'visible'; // by now screenDiv lives in <body>, but harmless

        if (autoPlay && widget.player) widget.player.play();
    });

    return widget;
};
