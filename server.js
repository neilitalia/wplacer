import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { CookieJar } from "tough-cookie";
import { Impit } from "impit";
import { Image, createCanvas } from "canvas";
import jwt from "jsonwebtoken";

// --- Setup Data Directory ---
const dataDir = "./data";
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

// --- Logging and Utility Functions ---
const log = async (id, name, data, error) => {
    const timestamp = new Date().toLocaleString();
    let identifier = `(${name}#${id})`;
    if (currentSettings.hideSensitiveLogs && id !== 'SYSTEM') {
        const idStr = String(id);
        identifier = `#${idStr.substring(idStr.length - 3)}`
    }
    if (error) {
        console.error(`[${timestamp}] ${identifier} ${data}:`, error);
        appendFileSync(path.join(dataDir, `errors.log`), `[${timestamp}] ${identifier} ${data}: ${error.stack || error.message}\n`);
    } else {
        console.log(`[${timestamp}] ${identifier} ${data}`);
        appendFileSync(path.join(dataDir, `logs.log`), `[${timestamp}] ${identifier} ${data}\n`);
    }
};

const duration = (durationMs) => {
    if (durationMs <= 0) return "0s";
    const totalSeconds = Math.floor(durationMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const basic_colors = { "transparent": 0, "0,0,0": 1, "60,60,60": 2, "120,120,120": 3, "210,210,210": 4, "255,255,255": 5, "96,0,24": 6, "237,28,36": 7, "255,127,39": 8, "246,170,9": 9, "249,221,59": 10, "255,250,188": 11, "14,185,104": 12, "19,230,123": 13, "135,255,94": 14, "12,129,110": 15, "16,174,166": 16, "19,225,190": 17, "40,80,158": 18, "64,147,228": 19, "96,247,242": 20, "107,80,246": 21, "153,177,251": 22, "120,12,153": 23, "170,56,185": 24, "224,159,249": 25, "203,0,122": 26, "236,31,128": 27, "243,141,169": 28, "104,70,52": 29, "149,104,42": 30, "248,178,119": 31 };
const premium_colors = { "170,170,170": 32, "165,14,30": 33, "250,128,114": 34, "228,92,26": 35, "214,181,148": 36, "156,132,49": 37, "197,173,49": 38, "232,212,95": 39, "74,107,58": 40, "90,148,74": 41, "132,197,115": 42, "15,121,159": 43, "187,250,242": 44, "125,199,255": 45, "77,49,184": 46, "74,66,132": 47, "122,113,196": 48, "181,174,241": 49, "219,164,99": 50, "209,128,81": 51, "255,197,165": 52, "155,82,73": 53, "209,128,120": 54, "250,182,164": 55, "123,99,82": 56, "156,132,107": 57, "51,57,65": 58, "109,117,141": 59, "179,185,209": 60, "109,100,63": 61, "148,140,107": 62, "205,197,158": 63 };
const pallete = { ...basic_colors, ...premium_colors };
const colorBitmapShift = Object.keys(basic_colors).length + 1;

// --- Charge cache (avoid logging in all users each cycle) ---
const ChargeCache = {
    _m: new Map(),
    REGEN_MS: 30_000,
    SYNC_MS: 8 * 60_000,
    _key(id) { return String(id); },

    has(id) { return this._m.has(this._key(id)); },
    stale(id, now = Date.now()) {
        const u = this._m.get(this._key(id)); if (!u) return true;
        return (now - u.lastSync) > this.SYNC_MS;
    },
    markFromUserInfo(userInfo, now = Date.now()) {
        if (!userInfo?.id || !userInfo?.charges) return;
        const k = this._key(userInfo.id);
        const base = Math.floor(userInfo.charges.count ?? 0);
        const max = Math.floor(userInfo.charges.max ?? 0);
        this._m.set(k, { base, max, lastSync: now });
    },
    predict(id, now = Date.now()) {
        const u = this._m.get(this._key(id)); if (!u) return null;
        const grown = Math.floor((now - u.lastSync) / this.REGEN_MS);
        const count = Math.min(u.max, u.base + Math.max(0, grown));
        return { count, max: u.max, cooldownMs: this.REGEN_MS };
    },
    consume(id, n = 1, now = Date.now()) {
        const k = this._key(id);
        const u = this._m.get(k); if (!u) return;
        const grown = Math.floor((now - u.lastSync) / this.REGEN_MS);
        const avail = Math.min(u.max, u.base + Math.max(0, grown));
        const newCount = Math.max(0, avail - n);
        u.base = newCount;
        u.lastSync = now - ((now - u.lastSync) % this.REGEN_MS);
        this._m.set(k, u);
    }
};


let loadedProxies = [];
const loadProxies = () => {
    const proxyPath = path.join(dataDir, "proxies.txt");
    if (!existsSync(proxyPath)) {
        writeFileSync(proxyPath, ""); // Create empty file if it doesn't exist
        console.log('[SYSTEM] `data/proxies.txt` not found, created an empty one.');
        loadedProxies = [];
        return;
    }

    const lines = readFileSync(proxyPath, "utf8").split('\n').filter(line => line.trim() !== '');
    const proxies = [];
    const proxyRegex = /^(http|https|socks4|socks5):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/;

    for (const line of lines) {
        const match = line.trim().match(proxyRegex);
        if (match) {
            proxies.push({
                protocol: match[1],
                username: match[2] || '',
                password: match[3] || '',
                host: match[4],
                port: parseInt(match[5], 10)
            });
        } else {
            console.log(`[SYSTEM] WARNING: Invalid proxy format skipped: "${line}"`);
        }
    }
    loadedProxies = proxies;
};


let nextProxyIndex = 0;
const getNextProxy = () => {
    const { proxyEnabled, proxyRotationMode } = currentSettings || {};
    if (!proxyEnabled || loadedProxies.length === 0) {
        return null;
    }

    let proxy;
    if (proxyRotationMode === 'random') {
        const randomIndex = Math.floor(Math.random() * loadedProxies.length);
        proxy = loadedProxies[randomIndex];
    } else { // Default to sequential
        proxy = loadedProxies[nextProxyIndex];
        nextProxyIndex = (nextProxyIndex + 1) % loadedProxies.length;
    }

    let proxyUrl = `${proxy.protocol}://`;
    if (proxy.username && proxy.password) {
        proxyUrl += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    proxyUrl += `${proxy.host}:${proxy.port}`;
    return proxyUrl;
};

// --- Suspension error (kept from new version) ---
class SuspensionError extends Error {
    constructor(message, durationMs) {
        super(message);
        this.name = "SuspensionError";
        this.durationMs = durationMs;
        this.suspendedUntil = Date.now() + durationMs;
    }
}

// --- WPlacer with old painting modes ported over ---
class WPlacer {
    constructor(template, coords, settings, templateName, autoFarm, paintTransparentPixels = false, initialBurstSeeds = null) {
        this.template = template;
        this.templateName = templateName;
        this.coords = coords;
        this.settings = settings;
        this.cookies = null;
        this.browser = null;
        this.userInfo = null;
        this.tiles = new Map();
        this.token = null;
        this.autoFarm = autoFarm;
        this._lastTilesAt = 0;
        this.paintTransparentPixels = !!paintTransparentPixels;

        // burst seeds persistence
        this._burstSeeds = Array.isArray(initialBurstSeeds) ? initialBurstSeeds.map(s => ({ gx: s.gx, gy: s.gy })) : null;
        this._activeBurstSeedIdx = null;
    };

    async login(cookies) {
        this.cookies = cookies;
        const jar = new CookieJar();
        for (const cookie of Object.keys(this.cookies)) {
            const value = `${cookie}=${this.cookies[cookie]}; Path=/`;
            jar.setCookieSync(value, "https://backend.wplace.live");
            jar.setCookieSync(value, "https://wplace.live");
        }

        const impitOptions = {
            cookieJar: jar,
            browser: "chrome",
            ignoreTlsErrors: true
        };

        const proxyUrl = getNextProxy();
        if (proxyUrl) {
            impitOptions.proxyUrl = proxyUrl;
            if (currentSettings.logProxyUsage) {
                log('SYSTEM', 'wplacer', `Using proxy: ${proxyUrl.split('@').pop()}`);
            }
        }

        this.browser = new Impit(impitOptions);
        await this.loadUserInfo();
        return this.userInfo;
    };

    async loadUserInfo() {
        const url = "https://backend.wplace.live/me";
        const me = await this.browser.fetch(url, {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": "https://wplace.live/"
            },
            redirect: "manual"
        });
        const status = me.status;
        const contentType = (me.headers.get("content-type") || "").toLowerCase();
        const bodyText = await me.text();

        if (status === 401 || status === 403) {
            throw new Error(`(401/403) Unauthorized: cookies are invalid or expired.`);
        }
        if (status === 429) {
            throw new Error("(1015) You are being rate-limited. Please wait a moment and try again.");
        }
        if (status === 502) {
            throw new Error(`(502) Bad Gateway: The server is temporarily unavailable. Please try again later.`);
        }
        if (status >= 300 && status < 400) {
            throw new Error(`(3xx) Redirected (likely to login). Cookies are invalid or expired.`);
        }

        if (contentType.includes("application/json")) {
            let userInfo;

            try {
                userInfo = JSON.parse(bodyText);
            } catch {
                throw new Error(`Failed to parse JSON from /me (status ${status}).`);
            }

            if (userInfo?.error) {
                throw new Error(`(500) Failed to authenticate: "${userInfo.error}". The cookie is likely invalid or expired.`);
            }

            if (userInfo?.id && userInfo?.name) {
                this.userInfo = userInfo;
                try { ChargeCache.markFromUserInfo(userInfo); } catch { }
                return true;
            }

            throw new Error(`Unexpected JSON from /me (status ${status}): ${JSON.stringify(userInfo).slice(0, 200)}...`);
        }

        const short = bodyText.substring(0, 200);

        if (/error\s*1015/i.test(bodyText) || /rate.?limit/i.test(bodyText)) {
            throw new Error("(1015) You are being rate-limited by the server. Please wait a moment and try again.");
        }
        if (/cloudflare|attention required|access denied/i.test(bodyText)) {
            throw new Error(`Cloudflare blocked the request (status ${status}). Consider proxy/rotate IP.`);
        }
        if (/<!doctype html>/i.test(bodyText) || /<html/i.test(bodyText)) {
            throw new Error(`Failed to parse server response (HTML, status ${status}). Likely a login page → cookies invalid or expired. Snippet: "${short}..."`);
        }

        throw new Error(`Failed to parse server response (status ${status}). Response: "${short}..."`);
    };

    async post(url, body) {
        const request = await this.browser.fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "text/plain;charset=UTF-8",
                Referer: "https://wplace.live/"
            },
            body: JSON.stringify(body),
            redirect: "manual"
        });
        const status = request.status;
        const contentType = (request.headers.get("content-type") || "").toLowerCase();
        const text = await request.text();
        if (!contentType.includes("application/json")) {
            const short = text.substring(0, 200);
            if (/error\s*1015/i.test(text) || /rate.?limit/i.test(text) || status === 429) {
                throw new Error("(1015) You are being rate-limited. Please wait a moment and try again.");
            }
            if (status === 502) {
                throw new Error(`(502) Bad Gateway: The server is temporarily unavailable. Please try again later.`);
            }
            if (status === 401 || status === 403) {
                return { status, data: { error: "Unauthorized" } };
            }
            return { status, data: { error: `Non-JSON response (status ${status}): ${short}...` } };
        }
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return { status, data: { error: `Invalid JSON (status ${status}).` } };
        }
        return { status, data };
    }

    async loadTiles() {
        this.tiles.clear();
        const [tx, ty, px, py] = this.coords;
        const endPx = px + this.template.width;
        const endPy = py + this.template.height;
        const endTx = tx + Math.floor(endPx / 1000);
        const endTy = ty + Math.floor(endPy / 1000);

        const tilePromises = [];
        for (let currentTx = tx; currentTx <= endTx; currentTx++) {
            for (let currentTy = ty; currentTy <= endTy; currentTy++) {
                const promise = new Promise((resolve) => {
                    const image = new Image();
                    image.crossOrigin = "Anonymous";
                    image.onload = () => {
                        const canvas = createCanvas(image.width, image.height);
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(image, 0, 0);
                        const tileData = { width: canvas.width, height: canvas.height, data: Array.from({ length: canvas.width }, () => []) };
                        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        for (let x = 0; x < canvas.width; x++) {
                            for (let y = 0; y < canvas.height; y++) {
                                const i = (y * canvas.width + x) * 4;
                                const [r, g, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
                                tileData.data[x][y] = a === 255 ? (pallete[`${r},${g},${b}`] || 0) : pallete["transparent"];
                            }
                        }
                        resolve(tileData);
                    };
                    image.onerror = () => resolve(null);
                    image.src = `https://backend.wplace.live/files/s0/tiles/${currentTx}/${currentTy}.png?t=${Date.now()}`;
                }).then(tileData => {
                    if (tileData) this.tiles.set(`${currentTx}_${currentTy}`, tileData);
                });
                tilePromises.push(promise);
            }
        }
        await Promise.all(tilePromises);
        return true;
    }

    hasColor(id) {
        if (id < colorBitmapShift) return true;
        return !!(this.userInfo.extraColorsBitmap & (1 << (id - colorBitmapShift)));
    }

    async _executePaint(tx, ty, body) {
        if (body.colors.length === 0) return { painted: 0, success: true };
        const response = await this.post(`https://backend.wplace.live/s0/pixel/${tx}/${ty}`, body);

        if (response.data.painted && response.data.painted === body.colors.length) {
            log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painted ${body.colors.length} pixels on tile ${tx}, ${ty}.`);
            return { painted: body.colors.length, success: true };
        } else if (response.status === 403 && (response.data.error === "refresh" || response.data.error === "Unauthorized")) {
            // token needs refresh; let TemplateManager handle it
            return { painted: 0, success: false, reason: "refresh" };
        } else if (response.status === 451 && response.data.suspension) {
            throw new SuspensionError(`Account is suspended.`, response.data.durationMs || 0);
        } else if (response.status === 500) {
            log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] ⏱️ Server error (500). Waiting 40s before retrying...`);
            await sleep(40000);
            return { painted: 0, success: false, reason: "ratelimit" };
        } else if (response.status === 429 || (response.data.error && response.data.error.includes("Error 1015"))) {
            throw new Error("(1015) You are being rate-limited. Please wait a moment and try again.");
        }
        throw new Error(`Unexpected response for tile ${tx},${ty}: ${JSON.stringify(response)}`);
    }

    // ----- Helpers for "old" painting logic -----
    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    _globalXY(p) {
        const [sx, sy] = this.coords;
        return { gx: (p.tx - sx) * 1000 + p.px, gy: (p.ty - sy) * 1000 + p.py };
    }

    _templateRelXY(p) {
        const [sx, sy, spx, spy] = this.coords;
        const gx = (p.tx - sx) * 1000 + p.px;
        const gy = (p.ty - sy) * 1000 + p.py;
        return { x: gx - spx, y: gy - spy };
    }

    _pickBurstSeeds(pixels, k = 2, topFuzz = 5) {
        if (!pixels?.length) return [];
        const pts = pixels.map((p) => this._globalXY(p));

        const seeds = [];
        const i0 = Math.floor(Math.random() * pts.length);
        seeds.push(pts[i0]);
        if (pts.length === 1) return seeds.map((s) => ({ gx: s.gx, gy: s.gy }));

        let far = 0, best = -1;
        for (let i = 0; i < pts.length; i++) {
            const dx = pts[i].gx - pts[i0].gx,
                dy = pts[i].gy - pts[i0].gy;
            const d2 = dx * dx + dy * dy;
            if (d2 > best) {
                best = d2;
                far = i;
            }
        }
        seeds.push(pts[far]);

        while (seeds.length < Math.min(k, pts.length)) {
            const ranked = pts
                .map((p, i) => ({
                    i,
                    d2: Math.min(...seeds.map((s) => (s.gx - p.gx) ** 2 + (s.gy - p.gy) ** 2))
                }))
                .sort((a, b) => b.d2 - a.d2);
            const pickFrom = Math.min(topFuzz, ranked.length);
            const chosen = ranked[Math.floor(Math.random() * pickFrom)].i;
            const cand = pts[chosen];
            if (!seeds.some((s) => s.gx === cand.gx && s.gy === cand.gy)) seeds.push(cand);
            else break;
        }

        return seeds.map((s) => ({ gx: s.gx, gy: s.gy }));
    }

    /**
     * Multi-source BFS ordering like in the old version.
     * seeds can be number (count) or array of {gx,gy}.
     */
    _orderByBurst(mismatchedPixels, seeds = 2) {
        if (mismatchedPixels.length <= 2) return mismatchedPixels;

        const [startX, startY] = this.coords;
        const byKey = new Map();
        for (const p of mismatchedPixels) {
            const gx = (p.tx - startX) * 1000 + p.px;
            const gy = (p.ty - startY) * 1000 + p.py;
            p._gx = gx;
            p._gy = gy;
            byKey.set(`${gx},${gy}`, p);
        }

        const useSeeds = Array.isArray(seeds) ? seeds.slice() : this._pickBurstSeeds(mismatchedPixels, seeds);

        // mark used for nearest search
        const used = new Set();
        const nearest = (gx, gy) => {
            let best = null,
                bestD = Infinity,
                key = null;
            for (const p of mismatchedPixels) {
                const k = `${p._gx},${p._gy}`;
                if (used.has(k)) continue;
                const dx = p._gx - gx,
                    dy = p._gy - gy;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestD) {
                    bestD = d2;
                    best = p;
                    key = k;
                }
            }
            if (best) used.add(key);
            return best;
        };

        const starts = useSeeds.map((s) => nearest(s.gx, s.gy)).filter(Boolean);

        const visited = new Set();
        const queues = [];
        const speeds = [];
        const prefs = [];

        const randDir = () => [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];

        for (const sp of starts) {
            const k = `${sp._gx},${sp._gy}`;
            if (!visited.has(k)) {
                visited.add(k);
                queues.push([sp]);
                speeds.push(0.7 + Math.random() * 1.1);
                prefs.push(randDir());
            }
        }

        const pickQueue = () => {
            const weights = speeds.map((s, i) => (queues[i].length ? s : 0));
            const sum = weights.reduce((a, b) => a + b, 0);
            if (!sum) return -1;
            let r = Math.random() * sum;
            for (let i = 0; i < weights.length; i++) {
                r -= weights[i];
                if (r <= 0) return i;
            }
            return weights.findIndex((w) => w > 0);
        };

        const orderNeighbors = (dir) => {
            const base = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            base.sort(
                (a, b) =>
                    b[0] * dir[0] +
                    b[1] * dir[1] +
                    (Math.random() - 0.5) * 0.2 -
                    (a[0] * dir[0] + a[1] * dir[1] + (Math.random() - 0.5) * 0.2)
            );
            return base;
        };

        const dash = (from, qi, dir) => {
            const dashChance = 0.45;
            const maxDash = 1 + Math.floor(Math.random() * 3);
            if (Math.random() > dashChance) return;
            let cx = from._gx,
                cy = from._gy;
            for (let step = 0; step < maxDash; step++) {
                const nx = cx + dir[0],
                    ny = cy + dir[1];
                const key = `${nx},${ny}`;
                if (!byKey.has(key) || visited.has(key)) break;
                visited.add(key);
                queues[qi].push(byKey.get(key));
                cx = nx;
                cy = ny;
            }
        };

        const out = [];

        while (true) {
            const qi = pickQueue();
            if (qi === -1) break;
            const cur = queues[qi].shift();
            out.push(cur);

            const neigh = orderNeighbors(prefs[qi]);
            let firstDir = null;
            let firstPt = null;

            for (const [dx, dy] of neigh) {
                const nx = cur._gx + dx,
                    ny = cur._gy + dy;
                const k = `${nx},${ny}`;
                if (byKey.has(k) && !visited.has(k)) {
                    visited.add(k);
                    const p = byKey.get(k);
                    queues[qi].push(p);
                    if (!firstDir) {
                        firstDir = [dx, dy];
                        firstPt = p;
                    }
                }
            }

            if (firstDir) {
                if (Math.random() < 0.85) prefs[qi] = firstDir;
                dash(firstPt, qi, prefs[qi]);
            }
        }

        // pick up isolated areas
        if (out.length < mismatchedPixels.length) {
            for (const p of mismatchedPixels) {
                const k = `${p._gx},${p._gy}`;
                if (!visited.has(k)) {
                    visited.add(k);
                    const q = [p];
                    while (q.length) {
                        const c = q.shift();
                        out.push(c);
                        for (const [dx, dy] of orderNeighbors(randDir())) {
                            const nx = c._gx + dx,
                                ny = c._gy + dy;
                            const kk = `${nx},${ny}`;
                            if (byKey.has(kk) && !visited.has(kk)) {
                                visited.add(kk);
                                q.push(byKey.get(kk));
                            }
                        }
                    }
                }
            }
        }

        // cleanup temp props
        for (const p of out) {
            delete p._gx;
            delete p._gy;
        }
        return out;
    }

    _getMismatchedPixels(currentSkip = 1) {
        const [startX, startY, startPx, startPy] = this.coords;
        const mismatched = [];
        for (let y = 0; y < this.template.height; y++) {
            for (let x = 0; x < this.template.width; x++) {
                if ((x + y) % currentSkip !== 0) continue;

                const templateColor = this.template.data[x][y];
                if (templateColor === 0 && !this.paintTransparentPixels) continue;
                if (templateColor === null) continue;

                const globalPx = startPx + x;
                const globalPy = startPy + y;
                const targetTx = startX + Math.floor(globalPx / 1000);
                const targetTy = startY + Math.floor(globalPy / 1000);
                const localPx = globalPx % 1000;
                const localPy = globalPy % 1000;

                const tile = this.tiles.get(`${targetTx}_${targetTy}`);
                if (!tile || !tile.data[localPx]) continue;

                const currentPaintedColor = tile.data[localPx][localPy];

                let shouldPaint = this.settings.skipPaintedPixels
                    ? currentPaintedColor === 0 // If skip mode is on, only paint if the tile is blank
                    : templateColor !== currentPaintedColor; // Otherwise, paint if the color is wrong


                if (this.autoFarm) {
                    mismatched.push({ tx: targetTx, ty: targetTy, px: localPx, py: localPy, color: templateColor, isEdge: false, localX: x, localY: y });
                }
                else if (templateColor === -1 && currentPaintedColor !== 0) {
                    const neighbors = [this.template.data[x - 1]?.[y], this.template.data[x + 1]?.[y], this.template.data[x]?.[y - 1], this.template.data[x]?.[y + 1]];
                    const isEdge = this.autoFarm ? true : neighbors.some(n => n === 0 || n === undefined);
                    mismatched.push({ tx: targetTx, ty: targetTy, px: localPx, py: localPy, color: 0, isEdge, localX: x, localY: y })
                }
                else if (templateColor >= 0 && shouldPaint && this.hasColor(templateColor)) {
                    const neighbors = [this.template.data[x - 1]?.[y], this.template.data[x + 1]?.[y], this.template.data[x]?.[y - 1], this.template.data[x]?.[y + 1]];
                    const isEdge = this.autoFarm ? true : neighbors.some(n => n === 0 || n === undefined);
                    mismatched.push({ tx: targetTx, ty: targetTy, px: localPx, py: localPy, color: templateColor, isEdge, localX: x, localY: y });
                }
            }
        }
        return mismatched;
    }

    async paint(currentSkip = 1, method = "linear") {
        await this.loadUserInfo();

        switch (method) {
            case "linear":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Top to Bottom)...`);
                break;
            case "linear-reversed":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Bottom to Top)...`);
                break;
            case "linear-ltr":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Left to Right)...`);
                break;
            case "linear-rtl":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Right to Left)...`);
                break;
            case "radial-inward":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎯 Painting (Radial inward)...`);
                break;
            case "radial-outward":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎯 Painting (Radial outward)...`);
                break;
            case "singleColorRandom":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Random Color)...`);
                break;
            case "colorByColor":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎨 Painting (Color by Color)...`);
                break;
            case "colors-burst-rare":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 💥 Painting (Colors burst, rare first)...`);
                break;
            case "random":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎲 Painting (Random Scatter)...`);
                break;
            case "burst":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 💥 Painting (Burst / Multi-source)...`);
                break;
            case "outline-then-burst":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🧱 Painting (Outline then Burst)...`);
                break;
            case "burst-mixed":
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🔀 Painting (Burst Mixed: burst/outline/rare)...`);
                break;
            default:
                throw new Error(`Unknown paint method: ${method}`);
        }

        while (true) {
            const nowTiles = Date.now();
            const TILES_CACHE_MS = 3000;
            if (nowTiles - this._lastTilesAt >= TILES_CACHE_MS || this.tiles.size === 0) {
                await this.loadTiles();
                this._lastTilesAt = Date.now();
            }
            if (!this.token) throw new Error("REFRESH_TOKEN"); // TokenManager must provide before calling

            let mismatchedPixels = this._getMismatchedPixels(currentSkip);
            if (mismatchedPixels.length === 0 && !this.autoFarm) return 0;

            log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] Found ${mismatchedPixels.length} mismatched pixels.`);

            let activeMethod = method;

            if (method === "burst-mixed") {
                const pool = ["outline-then-burst", "burst", "colors-burst-rare"];
                activeMethod = pool[Math.floor(Math.random() * pool.length)];
                log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎲 Mixed mode picked this turn: ${activeMethod}`);
            }

            switch (activeMethod) {
                case "linear-reversed":
                    mismatchedPixels.reverse();
                    break;

                case "linear-ltr": {
                    const [startX, startY] = this.coords;
                    mismatchedPixels.sort((a, b) => {
                        const aGlobalX = (a.tx - startX) * 1000 + a.px;
                        const bGlobalX = (b.tx - startX) * 1000 + b.px;
                        if (aGlobalX !== bGlobalX) return aGlobalX - bGlobalX;
                        return (a.ty - startY) * 1000 + a.py - ((b.ty - startY) * 1000 + b.py);
                    });
                    break;
                }

                case "linear-rtl": {
                    const [startX, startY] = this.coords;
                    mismatchedPixels.sort((a, b) => {
                        const aGlobalX = (a.tx - startX) * 1000 + a.px;
                        const bGlobalX = (b.tx - startX) * 1000 + b.px;
                        if (aGlobalX !== bGlobalX) return bGlobalX - aGlobalX;
                        return (a.ty - startY) * 1000 + a.py - ((b.ty - startY) * 1000 + b.py);
                    });
                    break;
                }

                case "radial-inward": {
                    const [sx, sy, spx, spy] = this.coords;
                    const cx = spx + (this.template.width - 1) / 2;
                    const cy = spy + (this.template.height - 1) / 2;
                    const r2 = (p) => {
                        const gx = (p.tx - sx) * 1000 + p.px;
                        const gy = (p.ty - sy) * 1000 + p.py;
                        const dx = gx - cx, dy = gy - cy;
                        return dx * dx + dy * dy;
                    };
                    const ang = (p) => {
                        const gx = (p.tx - sx) * 1000 + p.px;
                        const gy = (p.ty - sy) * 1000 + p.py;
                        return Math.atan2(gy - cy, gx - cx);
                    };
                    mismatchedPixels.sort((a, b) => {
                        const d = r2(b) - r2(a);
                        return d !== 0 ? d : (ang(a) - ang(b));
                    });
                    break;
                }

                case "radial-outward": {
                    const [sx, sy, spx, spy] = this.coords;
                    const cx = spx + (this.template.width - 1) / 2;
                    const cy = spy + (this.template.height - 1) / 2;
                    const r2 = (p) => {
                        const gx = (p.tx - sx) * 1000 + p.px;
                        const gy = (p.ty - sy) * 1000 + p.py;
                        const dx = gx - cx, dy = gy - cy;
                        return dx * dx + dy * dy;
                    };
                    const ang = (p) => {
                        const gx = (p.tx - sx) * 1000 + p.px;
                        const gy = (p.ty - sy) * 1000 + p.py;
                        return Math.atan2(gy - cy, gx - cx);
                    };
                    mismatchedPixels.sort((a, b) => {
                        const d = r2(a) - r2(b);
                        return d !== 0 ? d : (ang(a) - ang(b));
                    });
                    break;
                }

                case "singleColorRandom":
                case "colorByColor": {
                    const pixelsByColor = mismatchedPixels.reduce((acc, p) => {
                        if (!acc[p.color]) acc[p.color] = [];
                        acc[p.color].push(p);
                        return acc;
                    }, {});
                    const colors = Object.keys(pixelsByColor);
                    if (method === "singleColorRandom") {
                        for (let i = colors.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [colors[i], colors[j]] = [colors[j], colors[i]];
                        }
                    }
                    mismatchedPixels = colors.flatMap((color) => pixelsByColor[color]);
                    break;
                }

                case "colors-burst-rare": {
                    const byColor = mismatchedPixels.reduce((m, p) => {
                        (m[p.color] ||= []).push(p);
                        return m;
                    }, {});
                    const colorsAsc = Object.keys(byColor).sort((a, b) => byColor[a].length - byColor[b].length);
                    const desired = Math.max(1, Math.min(this.settings?.seedCount ?? 2, 16));
                    const out = [];
                    for (const c of colorsAsc) {
                        out.push(...this._orderByBurst(byColor[c], desired));
                    }
                    mismatchedPixels = out;
                    break;
                }

                case "random":
                    this._shuffle(mismatchedPixels);
                    break;

                case "burst": {
                    const desired = Math.max(1, Math.min(this.settings?.seedCount ?? 2, 16));
                    if (!this._burstSeeds || this._burstSeeds.length !== desired) {
                        this._burstSeeds = this._pickBurstSeeds(mismatchedPixels, desired);
                        log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 💥 Burst seeds (${desired}): ${JSON.stringify(this._burstSeeds)}`);
                    }
                    if (this._activeBurstSeedIdx == null || this._activeBurstSeedIdx >= this._burstSeeds.length) {
                        this._activeBurstSeedIdx = Math.floor(Math.random() * this._burstSeeds.length);
                        const s = this._burstSeeds[this._activeBurstSeedIdx];
                        log(this.userInfo.id, this.userInfo.name, `[${this.templateName}] 🎯 Using single seed this turn: ${JSON.stringify(s)} (#${this._activeBurstSeedIdx + 1}/${this._burstSeeds.length})`);
                    }
                    const seedForThisTurn = [this._burstSeeds[this._activeBurstSeedIdx]];
                    mismatchedPixels = this._orderByBurst(mismatchedPixels, seedForThisTurn);
                    break;
                }

                case "outline-then-burst": {
                    const desired = Math.max(1, Math.min(this.settings?.seedCount ?? 2, 16));
                    const outline = [];
                    const inside = [];

                    for (const p of mismatchedPixels) {
                        if (p.color === 0) { inside.push(p); continue; }
                        const { x, y } = this._templateRelXY(p);
                        const w = this.template.width, h = this.template.height;
                        const tcol = this.template.data[x][y];

                        let isOutline = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
                        if (!isOutline) {
                            const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                            for (const [dx, dy] of neigh) {
                                const nx = x + dx, ny = y + dy;
                                if (nx < 0 || ny < 0 || nx >= w || ny >= h) { isOutline = true; break; }
                                if (this.template.data[nx][ny] !== tcol) { isOutline = true; break; }
                            }
                        }
                        (isOutline ? outline : inside).push(p);
                    }

                    const pickRandomSeed = (arr) => {
                        const p = arr[Math.floor(Math.random() * arr.length)];
                        const { gx, gy } = this._globalXY(p);
                        return [{ gx, gy }];
                    };

                    const orderedOutline = outline.length ? this._orderByBurst(outline, desired) : [];
                    const orderedInside = inside.length ? this._orderByBurst(inside, pickRandomSeed(inside)) : [];

                    mismatchedPixels = orderedOutline.concat(orderedInside);
                    break;
                }
            }

            let pixelsToProcess = mismatchedPixels;
            let isOutlineTurn = false;

            // 1. Prioritize Outline Mode
            if (this.settings.outlineMode) {
                const edgePixels = mismatchedPixels.filter(p => p.isEdge);
                if (edgePixels.length > 0) {
                    pixelsToProcess = edgePixels;
                    isOutlineTurn = true;
                }
            }

            // 2. Base Directional Sort
            switch (this.settings.drawingDirection) {
                case 'btt': // Bottom to Top
                    pixelsToProcess.sort((a, b) => b.localY - a.localY);
                    break;
                case 'ltr': // Left to Right
                    pixelsToProcess.sort((a, b) => a.localX - b.localX);
                    break;
                case 'rtl': // Right to Left
                    pixelsToProcess.sort((a, b) => b.localX - a.localX);
                    break;
                case 'center_out': {
                    const centerX = this.template.width / 2;
                    const centerY = this.template.height / 2;
                    const distSq = (p) => Math.pow(p.localX - centerX, 2) + Math.pow(p.localY - centerY, 2);
                    pixelsToProcess.sort((a, b) => distSq(a) - distSq(b));
                    break;
                }
                case 'ttb': // Top to Bottom
                default:
                    pixelsToProcess.sort((a, b) => a.localY - b.localY);
                    break;
            }

            // 3. Apply Order Modification
            switch (this.settings.drawingOrder) {
                case 'random':
                    for (let i = pixelsToProcess.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [pixelsToProcess[i], pixelsToProcess[j]] = [pixelsToProcess[j], pixelsToProcess[i]];
                    }
                    break;
                case 'color':
                case 'randomColor': {
                    const pixelsByColor = pixelsToProcess.reduce((acc, p) => {
                        if (!acc[p.color]) acc[p.color] = [];
                        acc[p.color].push(p);
                        return acc;
                    }, {});
                    const colors = Object.keys(pixelsByColor);
                    if (this.settings.drawingOrder === 'randomColor') {
                        for (let i = colors.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [colors[i], colors[j]] = [colors[j], colors[i]];
                        }
                    }
                    pixelsToProcess = colors.flatMap(color => pixelsByColor[color]);
                    break;
                }
                case 'linear':
                default:
                    // Do nothing, keep the directional sort
                    break;
            }

            const allowedByCharges = Math.max(0, Math.floor(this.userInfo?.charges?.count || 0));
            const maxPerPass = Number.isFinite(this.settings?.maxPixelsPerPass) ? Math.max(0, Math.floor(this.settings.maxPixelsPerPass)) : 0;

            const limit = maxPerPass > 0 ? Math.min(allowedByCharges, maxPerPass) : allowedByCharges;
            if (limit <= 0) {
                // Нет зарядов — не тратим время дальше в этом проходе
                return 0;
            }

            // 4. Prepare and execute the paint job
            const pixelsToPaint = pixelsToProcess.slice(0, limit);

            const bodiesByTile = pixelsToPaint.reduce((acc, p) => {
                const key = `${p.tx},${p.ty}`;
                if (!acc[key]) acc[key] = { colors: [], coords: [] };
                acc[key].colors.push(p.color);
                acc[key].coords.push(p.px, p.py);
                return acc;
            }, {});

            let totalPainted = 0;
            let needsRetry = false;

            for (const tileKey in bodiesByTile) {
                const [tx, ty] = tileKey.split(",").map(Number);
                const body = { ...bodiesByTile[tileKey], t: this.token };
                const result = await this._executePaint(tx, ty, body);
                if (result.success) {
                    totalPainted += result.painted;
                } else {
                    // token refresh or temp error — let caller handle
                    needsRetry = true;
                    break;
                }
            }

            if (!needsRetry) {
                this._activeBurstSeedIdx = null; // next turn: pick a new seed
                return totalPainted;
            } else {
                // break and let manager refresh token
                throw new Error("REFRESH_TOKEN");
            }
        }
    }

    async buyProduct(productId, amount, variant) {
        const body = { product: { id: productId, amount } };
        if (typeof variant === "number") body.product.variant = variant;

        const response = await this.post(`https://backend.wplace.live/purchase`, body);

        if (response.status === 200 && response.data && response.data.success === true) {
            let msg = `🛒 Purchase successful for product #${productId} (amount: ${amount})`;
            if (productId === 80) msg = `🛒 Bought ${amount * 30} pixels for ${amount * 500} droplets`;
            else if (productId === 70) msg = `🛒 Bought ${amount} Max Charge Upgrade(s) for ${amount * 500} droplets`;
            else if (productId === 100 && typeof variant === "number") msg = `🛒 Bought color #${variant}`;
            log(this.userInfo?.id || "SYSTEM", this.userInfo?.name || "wplacer", `[${this.templateName}] ${msg}`);
            return true;
        }

        if (response.status === 403) {
            const err = new Error("FORBIDDEN_OR_INSUFFICIENT");
            err.code = 403;
            throw err;
        }

        if (response.status === 429 || (response.data?.error && response.data.error.includes("Error 1015"))) {
            throw new Error("(1015) You are being rate-limited while trying to make a purchase. Please wait.");
        }

        throw new Error(`Unexpected response during purchase: ${JSON.stringify(response)}`);
    };

    async pixelsLeft(currentSkip = 1) {
        await this.loadTiles();
        return this._getMismatchedPixels(currentSkip).length;
    };

    async pixelsLeftIgnoringOwnership() {
        await this.loadTiles();
        const [startX, startY, startPx, startPy] = this.coords;
        let count = 0;
        for (let y = 0; y < this.template.height; y++) {
            for (let x = 0; x < this.template.width; x++) {
                const templateColor = this.template.data[x][y];
                if (templateColor == null) continue;
                if (templateColor === 0 && !this.paintTransparentPixels) continue;
                const globalPx = startPx + x;
                const globalPy = startPy + y;
                const targetTx = startX + Math.floor(globalPx / 1000);
                const targetTy = startY + Math.floor(globalPy / 1000);
                const localPx = globalPx % 1000;
                const localPy = globalPy % 1000;
                const tile = this.tiles.get(`${targetTx}_${targetTy}`);
                if (!tile || !tile.data[localPx]) continue;
                const tileColor = tile.data[localPx][localPy];
                if (templateColor !== tileColor) count++;
            }
        }
        return count;
    }

    async mismatchesSummary() {
        await this.loadTiles();
        const [startX, startY, startPx, startPy] = this.coords;
        let total = 0, basic = 0, premium = 0;
        const premiumColors = new Set();
        for (let y = 0; y < this.template.height; y++) {
            for (let x = 0; x < this.template.width; x++) {
                const templateColor = this.template.data[x][y];
                if (templateColor == null) continue;
                if (templateColor === 0 && !this.paintTransparentPixels) continue;
                const globalPx = startPx + x;
                const globalPy = startPy + y;
                const targetTx = startX + Math.floor(globalPx / 1000);
                const targetTy = startY + Math.floor(globalPy / 1000);
                const localPx = globalPx % 1000;
                const localPy = globalPy % 1000;
                const tile = this.tiles.get(`${targetTx}_${targetTy}`);
                if (!tile || !tile.data[localPx]) continue;
                const tileColor = tile.data[localPx][localPy];
                if (templateColor !== tileColor || this.autoFarm) {
                    total++;
                    if (templateColor >= 32) { premium++; premiumColors.add(templateColor); }
                    else if (templateColor > 0) { basic++; }
                }
            }
        }
        return { total, basic, premium, premiumColors };
    }
}

// --- Data Persistence ---
const loadJSON = (filename) => existsSync(path.join(dataDir, filename)) ? JSON.parse(readFileSync(path.join(dataDir, filename), "utf8")) : {};
const saveJSON = (filename, data) => writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 4));

const users = loadJSON("users.json");
const saveUsers = () => saveJSON("users.json", users);

const templates = {}; // In-memory store for active TemplateManager instances
const saveTemplates = () => {
    const templatesToSave = {};
    for (const id in templates) {
        const t = templates[id];
        templatesToSave[id] = {
            name: t.name,
            template: t.template,
            coords: t.coords,
            canBuyCharges: t.canBuyCharges,
            canBuyMaxCharges: t.canBuyMaxCharges,
            autoBuyNeededColors: !!t.autoBuyNeededColors,
            antiGriefMode: t.antiGriefMode,
            enableAutostart: t.enableAutostart,
            userIds: t.userIds,
            paintTransparentPixels: t.paintTransparentPixels,
            autoFarm: t.autoFarm,
            burstSeeds: t.burstSeeds || null
        };
    }
    saveJSON("templates.json", templatesToSave);
};

let currentSettings = {
    turnstileNotifications: false,
    accountCooldown: 20000,
    purchaseCooldown: 5000,
    keepAliveCooldown: 5000,
    dropletReserve: 0,
    antiGriefStandby: 600000,
    drawingDirection: 'ttb',
    drawingOrder: 'linear',
    drawingMethod: "linear",
    chargeThreshold: 0.5,
    alwaysDrawOnCharge: false,
    outlineMode: false,
    skipPaintedPixels: false,
    maxPixelsPerPass: 0,
    seedCount: 2,
    accountCheckCooldown: 1000,
    pixelSkip: 1,
    proxyEnabled: false,
    proxyRotationMode: 'sequential',
    logProxyUsage: false,
    tokenRequestCooldown: 5000,
    hideSensitiveLogs: true
};
if (existsSync(path.join(dataDir, "settings.json"))) {
    currentSettings = { ...currentSettings, ...loadJSON("settings.json") };
}
const saveSettings = () => {
    saveJSON("settings.json", currentSettings);
};

// --- Server State ---
const activeBrowserUsers = new Set();
let activePaintingTasks = 0;

// Colors check job progress state
let colorsCheckJob = {
    active: false,
    total: 0,
    completed: 0,
    startedAt: 0,
    finishedAt: 0,
    lastUserId: null,
    lastUserName: null,
    report: []
};

const longWaiters = new Set();
const notifyTokenNeeded = () => {
    for (const fn of Array.from(longWaiters)) {
        try { fn(); } catch { }
    }
    longWaiters.clear();
};

// --- Token Management ---
const TokenManager = {
    tokenQueue: [], // Now stores objects: { token: string, receivedAt: number }
    tokenPromise: null,
    resolvePromise: null,
    isTokenNeeded: false,
    maxQueueSize: 8, // Maximum number of tokens to keep
    TOKEN_EXPIRATION_MS: 2 * 60 * 1000, // 2 minutes
    _lastNeededAt: 0,

    _purgeExpiredTokens() {
        const now = Date.now();
        let changed = false;
        const filtered = [];
        for (const item of this.tokenQueue) {
            if (item && typeof item === 'object' && item.token) {
                if (now - item.receivedAt < this.TOKEN_EXPIRATION_MS) filtered.push(item);
                else changed = true;
            } else {
                // backward compatibility: plain string token — keep but wrap
                filtered.push({ token: String(item), receivedAt: now });
                changed = true;
            }
        }
        if (changed) this.tokenQueue = filtered;
    },

    getToken() {
        this._purgeExpiredTokens();

        if (this.tokenQueue.length > 0) {
            const head = this.tokenQueue[0];
            return Promise.resolve(head && head.token ? head.token : head);
            // return Promise.resolve(this.tokenQueue[0].token);
        }

        if (!this.tokenPromise) {
            log('SYSTEM', 'wplacer', 'TOKEN_MANAGER: A task is waiting for a token. Flagging for clients.');
            this.isTokenNeeded = true;
            this._lastNeededAt = Date.now();
            notifyTokenNeeded();
            this.tokenPromise = new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        }
        return this.tokenPromise;
    },

    setToken(t) {
        // Add new token to the end
        this.tokenQueue.push(t);

        log('SYSTEM', 'wplacer', `✅ TOKEN_MANAGER: Token received. Queue size: ${this.tokenQueue.length + 1}`);

        // If queue exceeds max size, remove oldest tokens
        if (this.tokenQueue.length > this.maxQueueSize) {
            const removed = this.tokenQueue.splice(0, this.tokenQueue.length - this.maxQueueSize);
            log('SYSTEM', 'wplacer', `🔄 TOKEN_MANAGER: Queue limit reached. Removed ${removed.length} oldest tokens.`);
        }

        this.isTokenNeeded = false;
        this.tokenQueue.push({ token: t, receivedAt: Date.now() });

        if (this.resolvePromise) {
            const head = this.tokenQueue[0];
            this.resolvePromise(head && head.token ? head.token : head);
            this.tokenPromise = null;
            this.resolvePromise = null;
        }
    },

    getExpiration(user) {
        try {
            const decoded = jwt.decode(user.cookies.j);
            return new Date(decoded.exp).getTime();
        } catch {
            return null;
        }
    },

    invalidateToken() {
        this.tokenQueue.shift();
        log('SYSTEM', 'wplacer', `🔄 TOKEN_MANAGER: Invalidating token. ${this.tokenQueue.length} tokens remaining.`);
        if (this.tokenQueue.length === 0) {
            this.isTokenNeeded = true;
            this._lastNeededAt = Date.now();
            notifyTokenNeeded();
        }
    }
};

// --- Error Handling ---
function logUserError(error, id, name, context) {
    const message = error?.message || "An unknown error occurred.";
    if (message.includes("(500)") || message.includes("(1015)") || message.includes("(502)") || error?.name === "SuspensionError") {
        log(id, name, `❌ Failed to ${context}: ${message}`);
    } else {
        log(id, name, `❌ Failed to ${context}`, error);
    }
}

// --- Template Management ---
class TemplateManager {
    constructor(name, templateData, coords, canBuyCharges, canBuyMaxCharges, antiGriefMode, enableAutostart, userIds, autoFarm, paintTransparentPixels) {
        this.name = name;
        this.template = templateData;
        this.coords = coords;
        this.canBuyCharges = !!canBuyCharges;
        this.canBuyMaxCharges = !!canBuyMaxCharges;
        this.autoBuyNeededColors = false;
        this.antiGriefMode = !!antiGriefMode;
        this.enableAutostart = enableAutostart;
        this.autoFarm = autoFarm;
        this.userIds = userIds;
        this.userQueue = [...userIds];
        // throttle for opportunistic resync
        this._lastResyncAt = 0;
        this._resyncCooldownMs = 3000;
        this.paintTransparentPixels = !!paintTransparentPixels; // NEW: per-template flag like old version
        this.burstSeeds = null; // persist across runs
        this.running = false;
        this.status = "Waiting to be started.";
        this.masterId = this.userIds[0];
        this.masterName = users[this.masterId]?.name || 'Unknown';
        this.sleepAbortController = null;
        this.totalPixels = (this.paintTransparentPixels || this.autoFarm) ? this.template.data.flat().length : this.template.data.flat().filter(p => p != 0).length;
        this.pixelsRemaining = this.totalPixels;
        this.currentPixelSkip = currentSettings.pixelSkip;

        // Exponential backoff state
        this.initialRetryDelay = 30 * 1000; // 30 seconds
        this.maxRetryDelay = 5 * 60 * 1000; // 5 minutes
        this.currentRetryDelay = this.initialRetryDelay;

        // premium colors in template cache
        this.templatePremiumColors = this._computeTemplatePremiumColors();

        // approximate per-user droplets projection
        this.userProjectedDroplets = {}; // userId -> number
        this._premiumsStopLogged = false;

        // Summary throttling to avoid heavy pre-check before every turn
        this._lastSummary = null;
        this._lastSummaryAt = 0;
        this._summaryMinIntervalMs = Math.max(2 * (currentSettings.accountCooldown || 15000), 20000);
        this._lastPaintedAt = 0;
        this._lastRunnerId = null;
        this._lastSwitchAt = 0;
        this._initialScanned = false;
    }

    _computeTemplatePremiumColors() {
        try {
            const set = new Set();
            const t = this.template;
            if (!t?.data) return set;
            for (let x = 0; x < t.width; x++) {
                for (let y = 0; y < t.height; y++) {
                    const id = t.data?.[x]?.[y] | 0;
                    if (id >= 32 && id <= 63) set.add(id);
                }
            }
            return set;
        } catch { return new Set(); }
    }

    _hasPremium(bitmap, cid) {
        if (cid < 32) return true;
        const bit = cid - 32;
        return ((bitmap | 0) & (1 << bit)) !== 0;
    }

    async _tryAutoBuyNeededColors() {
        if (!this.autoBuyNeededColors || !this.templatePremiumColors || this.templatePremiumColors.size === 0) return;

        const reserve = currentSettings.dropletReserve || 0;
        const purchaseCooldown = currentSettings.purchaseCooldown || 5000;
        const COLOR_COST = 2000; // per user note
        const dummyTemplate = { width: 0, height: 0, data: [] };
        const dummyCoords = [0, 0, 0, 0];

        // 1) gather current candidates deterministically with logging per each
        const candidates = [];
        for (const userId of this.userIds) {
            const u = users[userId]; if (!u) continue;
            if (activeBrowserUsers.has(userId)) continue;
            activeBrowserUsers.add(userId);
            const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, this.name);
            try {
                await w.login(u.cookies); await w.loadUserInfo();
                const rec = { id: userId, name: w.userInfo.name, droplets: Number(w.userInfo.droplets || 0), bitmap: Number(w.userInfo.extraColorsBitmap || 0) };
                candidates.push(rec);
            } catch (e) {
                logUserError(e, userId, u?.name || `#${userId}`, "autobuy colors: load info");
            } finally { activeBrowserUsers.delete(userId); }
        }

        if (candidates.length === 0) return;

        // sort by current number of premium colors asc
        const premiumCount = (bitmap) => {
            let c = 0; for (let i = 0; i <= 31; i++) if ((bitmap & (1 << i)) !== 0) c++; return c;
        };

        // 2) for each required premium color in ascending order
        const neededColors = Array.from(this.templatePremiumColors).sort((a, b) => a - b);
        let purchasedAny = false;
        const bought = [];
        for (const cid of neededColors) {
            // skip if at least one user already has color (so template can be painted with assignments)
            const someoneHas = candidates.some(c => this._hasPremium(c.bitmap, cid));
            if (someoneHas) continue;

            const ordered = candidates
                .filter(c => (c.droplets - reserve) >= COLOR_COST)
                .sort((a, b) => premiumCount(a.bitmap) - premiumCount(b.bitmap) || (a.droplets - b.droplets));

            if (ordered.length === 0) {
                const needTotal = COLOR_COST + reserve;
                log("SYSTEM", "wplacer", `[${this.name}] ⏭️ Skip auto-buy color #${cid}: insufficient droplets on all assigned accounts (need ${COLOR_COST} + ${reserve}(reserve) = ${needTotal}).`);
                continue; // no funds now → defer
            }

            // try purchase on the most "underprivileged" user
            const buyer = ordered[0];
            if (activeBrowserUsers.has(buyer.id)) continue;
            activeBrowserUsers.add(buyer.id);
            const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, this.name);

            try {
                await w.login(users[buyer.id].cookies);
                await w.loadUserInfo();

                const before = Number(w.userInfo.droplets || 0);

                if ((before - reserve) < COLOR_COST) { /* just in case */ throw new Error("insufficient_droplets"); }
                // if already has (race), skip
                if (this._hasPremium(Number(w.userInfo.extraColorsBitmap || 0), cid)) {
                    log(buyer.id, w.userInfo.name, `[${this.name}] ⏭️ Skip auto-buy color #${cid}: account already owns this color.`);
                    continue;
                }

                await w.buyProduct(100, 1, cid);
                await sleep(purchaseCooldown);
                await w.loadUserInfo().catch(() => { });

                log(buyer.id, w.userInfo.name, `[${this.name}] 🛒 Auto-bought premium color #${cid}. Droplets ${before} → ${w.userInfo?.droplets}`);

                // reflect in candidates for subsequent colors
                buyer.bitmap = Number(w.userInfo.extraColorsBitmap || (buyer.bitmap | (1 << (cid - 32))));
                buyer.droplets = Number(w.userInfo?.droplets || (before - COLOR_COST));
                purchasedAny = true;
                bought.push(cid);
            } catch (e) {
                logUserError(e, buyer.id, users[buyer.id].name, `auto-purchase color #${cid}`);
            } finally {
                activeBrowserUsers.delete(buyer.id);
            }
        }
        return { purchased: purchasedAny, bought };
    }

    sleep(ms) {
        return new Promise((resolve) => {
            if (this.sleepAbortController) {
                this.sleepAbortController.abort();
            }
            this.sleepAbortController = new AbortController();
            const signal = this.sleepAbortController.signal;

            const timeout = setTimeout(() => {
                this.sleepAbortController = null;
                resolve();
            }, ms);

            signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                this.sleepAbortController = null;
                resolve(); // Resolve on abort so the await continues
            });
        });
    }

    interruptSleep() {
        if (this.sleepAbortController) {
            log('SYSTEM', 'wplacer', `[${this.name}] ⚙️ Settings changed, waking up.`);
            this.sleepAbortController.abort();
        }
    }

    async handleUpgrades(wplacer) {
        if (!this.canBuyMaxCharges) return;
        await wplacer.loadUserInfo();
        const affordableDroplets = wplacer.userInfo.droplets - currentSettings.dropletReserve;
        const amountToBuy = Math.floor(affordableDroplets / 500);
        if (amountToBuy > 0) {
            log(wplacer.userInfo.id, wplacer.userInfo.name, `💰 Attempting to buy ${amountToBuy} max charge upgrade(s).`);
            try {
                await wplacer.buyProduct(70, amountToBuy);
                await this.sleep(currentSettings.purchaseCooldown);
                await wplacer.loadUserInfo();
                broadcastUpdate({
                    template: this.name,
                    user: wplacer.userInfo,
                    pixelsPainted: 0,
                    pixelsRemaining: this.pixelsRemaining,
                    timestamp: Date.now(),
                    expirationDate: TokenManager.getExpiration(users[wplacer.userInfo.id])
                });
            } catch (error) {
                logUserError(error, wplacer.userInfo.id, wplacer.userInfo.name, "purchase max charge upgrades");
            }
        }
    }

    async _performPaintTurn(wplacer) {
        let paintingComplete = false;
        while (!paintingComplete && this.running) {
            try {
                wplacer.token = await TokenManager.getToken();
                const pixelsPainted = await wplacer.paint(this.currentPixelSkip, currentSettings.drawingMethod);

                // save back burst seeds if used
                this.burstSeeds = wplacer._burstSeeds ? wplacer._burstSeeds.map((s) => ({ gx: s.gx, gy: s.gy })) : null;
                saveTemplates();

                // Broadcast paint update
                broadcastUpdate({
                    template: this.name,
                    user: wplacer.userInfo,
                    pixelsPainted,
                    pixelsRemaining: this.pixelsRemaining,
                    timestamp: Date.now(),
                    expirationDate: TokenManager.getExpiration(users[wplacer.userInfo.id])
                });
                paintingComplete = true;
                return pixelsPainted
            } catch (error) {
                if (error.name === "SuspensionError") {
                    const suspendedUntilDate = new Date(error.suspendedUntil).toLocaleString();
                    log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] 🛑 Account suspended from painting until ${suspendedUntilDate}.`);
                    users[wplacer.userInfo.id].suspendedUntil = error.suspendedUntil;
                    saveUsers();
                    throw error; // RE-THROW THE ERROR to be caught by the main loop
                }
                if (error.message === 'REFRESH_TOKEN') {
                    log(wplacer.userInfo.id, wplacer.userInfo.name, `[${this.name}] 🔄 Token expired or invalid. Trying next token in ${currentSettings.accountCooldown / 1000}s...`);
                    TokenManager.invalidateToken();
                    await this.sleep(currentSettings.accountCooldown);
                } else {
                    // Re-throw other errors to be handled by the main loop
                    throw error;
                }
            }
        }
    }

    async start() {
        this.running = true;
        this.status = "Started.";
        log('SYSTEM', 'wplacer', `▶️ Starting template "${this.name}"...`);
        activePaintingTasks++;

        try {
            let usersChecked = false;
            let pixelsChecked = false;
            let localUserStates = [];

            if (!this._initialScanned) {
                const cooldown = Math.max(0, Number(currentSettings.accountCheckCooldown || 0));
                log("SYSTEM", "wplacer", `[${this.name}] 🔍 Initial scan: starting (${this.userIds.length} accounts). Cooldown=${cooldown}ms`);
                for (const uid of this.userIds) {
                    const rec = users[uid]; if (!rec) continue;
                    if (rec.suspendedUntil && Date.now() < rec.suspendedUntil) continue;
                    if (activeBrowserUsers.has(uid)) continue;
                    activeBrowserUsers.add(uid);
                    const w = new WPlacer(this.template, this.coords, currentSettings, this.name, this.autoFarm, this.paintTransparentPixels, this.burstSeeds);
                    try {
                        await w.login(rec.cookies); await w.loadUserInfo();
                        const cnt = Math.floor(Number(w.userInfo?.charges?.count || 0));
                        const mx = Math.floor(Number(w.userInfo?.charges?.max || 0));
                        log(w.userInfo.id, w.userInfo.name, `[${this.name}] 🔁 Cache update: charges ${cnt}/${mx}`);
                        const lastChecked = Date.now()
                        const expirationDate = TokenManager.getExpiration(users[w.userInfo.id])
                        broadcastUpdate({
                            template: this.name,
                            user: w.userInfo,
                            pixelsPainted: 0,
                            pixelsRemaining: this.pixelsRemaining,
                            timestamp: lastChecked,
                            expirationDate,
                            lastChecked
                        });
                    }
                    catch (e) { logUserError(e, uid, rec?.name || `#${uid}`, "initial user scan"); }
                    finally { activeBrowserUsers.delete(uid); }
                    if (cooldown > 0) await sleep(cooldown);
                }
                log("SYSTEM", "wplacer", `[${this.name}] ✅ Initial scan finished.`);
                this._initialScanned = true;
            }

            while (this.running) {
                // Throttled check of remaining pixels using the master account
                let summaryForTurn = null;
                const needFreshSummary = !this._lastSummary || (Date.now() - this._lastSummaryAt) >= this._summaryMinIntervalMs;

                if (needFreshSummary) {
                    const checkWplacer = new WPlacer(this.template, this.coords, currentSettings, this.name, this.autoFarm, this.paintTransparentPixels, this.burstSeeds);
                    try {
                        await checkWplacer.login(users[this.masterId].cookies);
                        const summary = await checkWplacer.mismatchesSummary();

                        summaryForTurn = summary;
                        this._lastSummary = summary;
                        this._lastSummaryAt = Date.now();
                        this.pixelsRemaining = this.autoFarm ? this.totalPixels : summary.total;
                        if (this.autoBuyNeededColors) {
                            if (summary.total === 0) {
                                // nothing to do
                            } else if (summary.basic === 0 && summary.premium > 0) {
                                // only premium remain — check funds and stop if none can buy
                                // first, try auto-buy immediately to avoid false stop
                                let autoRes = { purchased: false, bought: [] };
                                try { autoRes = await this._tryAutoBuyNeededColors() || autoRes; } catch (_) { }

                                // re-evaluate ability to buy / own after purchases
                                const reserve = currentSettings.dropletReserve || 0;
                                const dummyTemplate = { width: 0, height: 0, data: [] };
                                const dummyCoords = [0, 0, 0, 0];
                                let anyCanBuy = false;
                                let anyOwnsRemaining = false;

                                for (const uid of this.userIds) {
                                    if (activeBrowserUsers.has(uid)) continue;
                                    activeBrowserUsers.add(uid);
                                    const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, this.name);
                                    try {
                                        await w.login(users[uid].cookies); await w.loadUserInfo();
                                        if ((Number(w.userInfo.droplets || 0) - reserve) >= 2000) { anyCanBuy = true; }
                                        const bitmap = Number(w.userInfo.extraColorsBitmap || 0);
                                        for (const cid of Array.from(summary.premiumColors)) {
                                            if (cid >= 32 && ((bitmap & (1 << (cid - 32))) !== 0)) { anyOwnsRemaining = true; break; }
                                        }
                                    }
                                    catch { } finally { activeBrowserUsers.delete(uid); }
                                    if (anyCanBuy) break;
                                }

                                if (anyOwnsRemaining) {
                                    log("SYSTEM", "wplacer", `[${this.name}] ℹ️ Only premium pixels remain, but some are already owned. Proceeding to paint owned premium while waiting for funds to buy others.`);
                                } else if (!anyCanBuy) {
                                    const list = Array.from(summary.premiumColors).sort((a, b) => a - b).join(', ');
                                    const reserve2 = currentSettings.dropletReserve || 0;
                                    const needTotal = 2000 + reserve2;
                                    log("SYSTEM", "wplacer", `[${this.name}] ⛔ Template stopped: Only premium pixels remain (${summary.premium} px, colors: ${list}), and none of assigned accounts have enough droplets to purchase (need 2000 + ${reserve2}(reserve) = ${needTotal}).`);
                                    this.status = "Finished.";
                                    this.running = false;
                                    break;
                                }
                                if (autoRes.purchased) {
                                    this.pixelsRemaining = Math.max(1, summary.premium);
                                } else {
                                    this.pixelsRemaining = summary.premium;
                                }
                            }
                        }
                    } catch (error) {
                        logUserError(error, this.masterId, this.masterName, "check pixels left");
                        await sleep(60000);
                        continue;
                    }
                } else {
                    summaryForTurn = this._lastSummary;
                    this.pixelsRemaining = summaryForTurn?.total ?? this.pixelsRemaining;
                    if (this.autoFarm) {
                        this.pixelsRemaining = this.totalPixels
                    }
                }


                if (this.pixelsRemaining === 0) {
                    // Special log: when only premium pixels remain and no funds to auto-buy
                    if (this.autoBuyNeededColors && this.templatePremiumColors && this.templatePremiumColors.size > 0) {
                        const hasAnyBasic = (() => {
                            try {
                                const t = this.template;
                                for (let x = 0; x < t.width; x++) {
                                    for (let y = 0; y < t.height; y++) {
                                        const id = t.data?.[x]?.[y] | 0; if (id > 0 && id < 32) return true;
                                    }
                                }
                            } catch { }
                            return false;
                        })();

                        if (!hasAnyBasic) {
                            const reserve = currentSettings.dropletReserve || 0;
                            const dummyTemplate = { width: 0, height: 0, data: [] };
                            const dummyCoords = [0, 0, 0, 0];
                            let anyCanBuy = false;
                            for (const uid of this.userIds) {
                                if (activeBrowserUsers.has(uid)) continue;
                                activeBrowserUsers.add(uid);
                                const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, this.name);
                                try { await w.login(users[uid].cookies); await w.loadUserInfo(); if ((Number(w.userInfo.droplets || 0) - reserve) >= 2000) { anyCanBuy = true; } }
                                catch { } finally { activeBrowserUsers.delete(uid); }
                                if (anyCanBuy) break;
                            }
                            if (!anyCanBuy) {
                                log("SYSTEM", "wplacer", `[${this.name}] ⛔ Stopping: Only premium pixels remain and none of assigned accounts have enough droplets to purchase required colors.`);
                            }
                        }
                    }

                    if (this.autoFarm) {
                        log("SYSTEM", "wplacer", `[${this.name}] 🖼 Farming cycle complete. Initiating next cycle`);
                        this.pixelsRemaining = this.totalPixels
                        await sleep(1000);
                        // await sleep(currentSettings.antiGriefStandby * 2);
                        continue;
                    } else if (this.antiGriefMode) {
                        this.status = "Monitoring for changes.";
                        log("SYSTEM", "wplacer", `[${this.name}] 🖼 Template complete. Monitoring... Next check in ${currentSettings.antiGriefStandby / 60000} min.`);
                        await sleep(currentSettings.antiGriefStandby);
                        continue;
                    } else {
                        log("SYSTEM", "wplacer", `[${this.name}] 🖼 Template finished!`);
                        this.status = "Finished.";
                        this.running = false;
                        break;
                    }
                }

                // Prediction-driven selection: выбрать готового аккаунта с наибольшим количеством зарядов
                if (this.userQueue.length === 0) this.userQueue = [...this.userIds];

                let resyncScheduled = false;
                const nowSel = Date.now();
                let bestUserId = null;
                let bestPredicted = null;

                // Предварительно отсортируем кандидатов по предсказанному количеству зарядов (убывает)
                // После первичного сканирования предсказания будут максимально точными
                const candidates = this.userIds
                    .filter((uid) => {
                        const rec = users[uid];
                        if (!rec) return false;
                        if (rec.suspendedUntil && nowSel < rec.suspendedUntil) return false;
                        if (activeBrowserUsers.has(uid)) return false;
                        return true;
                    })
                    .map((uid) => ({ uid, pred: ChargeCache.predict(uid, nowSel) }))
                    .map((o) => ({ uid: o.uid, count: Math.floor(o.pred?.count || 0), max: Math.floor(o.pred?.max || 0) }))
                    .sort((a, b) => b.count - a.count || b.max - a.max);

                if (candidates.length) {
                    const top = candidates.slice(0, Math.min(3, candidates.length)).map(c => `${c.uid}:${c.count}/${c.max}`).join(', ');
                    log("SYSTEM", "wplacer", `[${this.name}] 📊 Queue preview (top): ${top}`);
                } else {
                    log("SYSTEM", "wplacer", `[${this.name}] 📊 Queue preview: empty candidates.`);
                }

                for (const { uid: userId } of candidates) {
                    const rec = users[userId];
                    if (!rec) continue;
                    if (rec.suspendedUntil && nowSel < rec.suspendedUntil) continue;
                    if (activeBrowserUsers.has(userId)) continue;

                    if (!resyncScheduled && ChargeCache.stale(userId, nowSel) && (nowSel - this._lastResyncAt) >= this._resyncCooldownMs) {
                        resyncScheduled = true;
                        this._lastResyncAt = nowSel;
                        activeBrowserUsers.add(userId);
                        const w = new WPlacer(this.template, this.coords, currentSettings, this.name);
                        log(userId, rec.name, `[${this.name}] 🔄 Background resync started.`);
                        w.login(rec.cookies)
                            .then(() => { try { log(userId, rec.name, `[${this.name}] ✅ Background resync finished.`); } catch { } })
                            .catch((e) => { logUserError(e, userId, rec.name, "opportunistic resync"); try { log(userId, rec.name, `[${this.name}] ❌ Background resync finished (error).`); } catch { } })
                            .finally(() => activeBrowserUsers.delete(userId));
                    }

                    const p = ChargeCache.predict(userId, nowSel);
                    if (!p) continue;
                    const threshold = currentSettings.alwaysDrawOnCharge ? 1 : Math.max(1, Math.floor(p.max * currentSettings.chargeThreshold));
                    if (Math.floor(p.count) >= threshold) {
                        if (!bestPredicted || Math.floor(p.count) > Math.floor(bestPredicted.count)) {
                            bestPredicted = p; bestUserId = userId;
                        }
                    }
                }

                const foundUserForTurn = bestUserId;

                if (foundUserForTurn) {
                    if (activeBrowserUsers.has(foundUserForTurn)) {
                        await sleep(500);
                        continue;
                    }
                    // соблюдаем Account Turn Cooldown только при смене аккаунта
                    const nowRun = Date.now();
                    if (this._lastRunnerId && this._lastRunnerId !== foundUserForTurn) {
                        const passed = nowRun - this._lastSwitchAt;
                        const ac = currentSettings.accountCooldown || 0;
                        if (passed < ac) {
                            const remain = ac - passed;
                            log("SYSTEM", "wplacer", `[${this.name}] ⏱️ Switching account cooldown: waiting ${duration(remain)}.`);
                            await sleep(remain);
                        }
                    }

                    activeBrowserUsers.add(foundUserForTurn);
                    const wplacer = new WPlacer(this.template, this.coords, currentSettings, this.name, this.autoFarm, this.paintTransparentPixels, this.burstSeeds);
                    try {
                        const { id, name } = await wplacer.login(users[foundUserForTurn].cookies);
                        this.status = `Running user ${name}#${id}`;
                        const pred = ChargeCache.predict(foundUserForTurn, Date.now());
                        if (pred) log(id, name, `[${this.name}] ▶️ Start turn with predicted ${Math.floor(pred.count)}/${pred.max} charges.`);
                        const paintedNow = await this._performPaintTurn(wplacer);
                        if (typeof paintedNow === 'number' && paintedNow > 0) {
                            try { ChargeCache.consume(foundUserForTurn, paintedNow); } catch { }
                            this._lastPaintedAt = Date.now();
                            if (this._lastSummary) {
                                this._lastSummary.total = Math.max(0, (this._lastSummary.total | 0) - paintedNow);
                            }
                            log(id, name, `[${this.name}] ✅ Painted ${paintedNow} px. Cache adjusted.`);
                        }
                        // cache any new seeds
                        this.burstSeeds = wplacer._burstSeeds ? wplacer._burstSeeds.map((s) => ({ gx: s.gx, gy: s.gy })) : this.burstSeeds;
                        saveTemplates();
                        await this.handleUpgrades(wplacer);
                    } catch (error) {
                        logUserError(error, foundUserForTurn, users[foundUserForTurn]?.name || `#${foundUserForTurn}`, "perform paint turn");
                    } finally {
                        activeBrowserUsers.delete(foundUserForTurn);
                    }
                    // зафиксировать последнего исполнителя и время возможной смены
                    if (this._lastRunnerId !== foundUserForTurn) {
                        this._lastRunnerId = foundUserForTurn;
                        this._lastSwitchAt = Date.now();
                    }
                } else {
                    // Optional: attempt auto-buy before waiting (без задержек)
                    try { if (this.autoBuyNeededColors) { await this._tryAutoBuyNeededColors(); } } catch { }

                    // Buy charges if allowed (master only)
                    if (this.canBuyCharges && !activeBrowserUsers.has(this.masterId)) {
                        activeBrowserUsers.add(this.masterId);
                        const chargeBuyer = new WPlacer(this.template, this.coords, currentSettings, this.name, this.autoFarm, this.paintTransparentPixels, this.burstSeeds);
                        try {
                            await chargeBuyer.login(users[this.masterId].cookies);
                            const affordableDroplets = chargeBuyer.userInfo.droplets - currentSettings.dropletReserve;
                            if (affordableDroplets >= 500) {
                                const amountToBuy = Math.min(Math.ceil(this.pixelsRemaining / 30), Math.floor(affordableDroplets / 500));
                                if (amountToBuy > 0) {
                                    log(this.masterId, this.masterName, `[${this.name}] 💰 Attempting to buy pixel charges...`);
                                    await chargeBuyer.buyProduct(80, amountToBuy);
                                    await sleep(currentSettings.purchaseCooldown);
                                }
                            }
                        } catch (error) {
                            logUserError(error, this.masterId, this.masterName, "attempt to buy pixel charges");
                        } finally { activeBrowserUsers.delete(this.masterId); }
                    }

                    // Predict minimal wait time до порога; ограничим верхнюю границу, чтобы не копить лишнюю задержку
                    const now2 = Date.now();
                    const waits = this.userQueue.map((uid) => {
                        const p = ChargeCache.predict(uid, now2);
                        if (!p) return 15_000;
                        const threshold = currentSettings.alwaysDrawOnCharge ? 1 : Math.max(1, Math.floor(p.max * currentSettings.chargeThreshold));
                        const deficit = Math.max(0, threshold - Math.floor(p.count));
                        return deficit * (p.cooldownMs || 30_000);
                    });
                    let waitTime = (waits.length ? Math.min(...waits) : 10_000) + 800;
                    // верхний лимит ожидания: не больше 1.5x accountCooldown, чтобы реже уходить в 45-50 секунд
                    const maxWait = Math.max(10_000, Math.floor((currentSettings.accountCooldown || 15000) * 1.5));
                    waitTime = Math.min(waitTime, maxWait);
                    this.status = `Waiting for charges.`;
                    log("SYSTEM", "wplacer", `[${this.name}] ⏳ No users ready. Waiting for ${duration(waitTime)}.`);
                    await sleep(waitTime);
                }
            }
        } finally {
            activePaintingTasks--;
            if (this.status !== "Finished.") {
                this.status = "Stopped.";
            }
        }
    }
}

// --- Express App Setup ---
const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json({ limit: Infinity }));

// --- Autostartup Templates Array ---
const autostartedTemplates = [];

// --- API: tokens ---
app.get("/token-needed/long", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    let done = false;
    const finish = (needed) => { if (done) return; done = true; res.end(JSON.stringify({ needed })); };
    const timer = setTimeout(() => finish(false), 60000);
    const fn = () => { clearTimeout(timer); finish(true); };
    longWaiters.add(fn);
    req.on("close", () => { longWaiters.delete(fn); clearTimeout(timer); });
    if (TokenManager.isTokenNeeded) fn();
});

// --- API: users ---
const getJwtExp = (j) => {
    try {
        const p = j.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
        return typeof json.exp === 'number' ? json.exp : null;
    } catch {
        return null;
    }
};

// --- API Endpoints ---
app.get("/token-needed", (req, res) => {
    res.json({ needed: TokenManager.isTokenNeeded });
});

app.post("/t", (req, res) => {
    const { t } = req.body;
    if (!t) return res.sendStatus(400);
    TokenManager.setToken(t);
    res.sendStatus(200);
});

app.get("/users", (_, res) => {
    const out = JSON.parse(JSON.stringify(users));
    for (const id of Object.keys(out)) {
        if (!out[id].expirationDate && out[id].cookies?.j) {
            const exp = getJwtExp(out[id].cookies.j);
            if (exp) out[id].expirationDate = exp;
        }
    }
    res.json(out);
});

app.post("/user", async (req, res) => {
    if (!req.body.cookies || !req.body.cookies.j) return res.sendStatus(400);
    const wplacer = new WPlacer();
    try {
        const userInfo = await wplacer.login(req.body.cookies);
        const exp = getJwtExp(req.body.cookies.j);
        users[userInfo.id] = {
            name: userInfo.name,
            cookies: req.body.cookies,
            expirationDate: exp || users[userInfo.id]?.expirationDate || null
        };
        saveUsers();
        res.json(userInfo);
    } catch (error) {
        logUserError(error, "NEW_USER", "N/A", "add new user");
        res.status(500).json({ error: error.message });
    }
});

app.delete("/user/:id", async (req, res) => {
    const userIdToDelete = req.params.id;
    if (!userIdToDelete || !users[userIdToDelete]) return res.sendStatus(400);

    const deletedUserName = users[userIdToDelete].name;
    delete users[userIdToDelete];
    saveUsers();
    log('SYSTEM', 'Users', `Deleted user ${deletedUserName}#${userIdToDelete}.`);

    let templatesModified = false;
    for (const templateId in templates) {
        const template = templates[templateId];
        const initialUserCount = template.userIds.length;
        template.userIds = template.userIds.filter(id => id !== userIdToDelete);

        if (template.userIds.length < initialUserCount) {
            templatesModified = true;
            log('SYSTEM', 'Templates', `Removed user ${deletedUserName}#${userIdToDelete} from template "${template.name}".`);
            if (template.masterId === userIdToDelete) {
                template.masterId = template.userIds[0] || null;
                template.masterName = template.masterId ? users[template.masterId].name : null;
            }
            if (template.userIds.length === 0 && template.running) {
                template.running = false;
                log('SYSTEM', 'wplacer', `[${template.name}] 🛑 Template stopped because it has no users left.`);
            }
        }
    }
    if (templatesModified) saveTemplates();
    res.sendStatus(200);
});

app.get("/user/status/:id", async (req, res) => {
    const { id } = req.params;
    if (!users[id] || activeBrowserUsers.has(id)) return res.sendStatus(409);
    activeBrowserUsers.add(id);
    const wplacer = new WPlacer();
    try {
        const userInfo = await wplacer.login(users[id].cookies);
        const expirationDate = TokenManager.getExpiration(users[id]);
        res.status(200).json({ ...userInfo, expirationDate });
    } catch (error) {
        logUserError(error, id, users[id].name, "validate cookie");
        res.status(500).json({ error: error.message });
    } finally {
        activeBrowserUsers.delete(id);
    }
});

app.post("/users/status", async (req, res) => {
    const userIds = Object.keys(users);
    const results = {};
    const concurrencyLimit = 5; // Number of checks to run in parallel

    const checkUser = async (id) => {
        if (activeBrowserUsers.has(id)) {
            results[id] = { success: false, error: "User is busy." };
            return;
        }
        activeBrowserUsers.add(id);
        const wplacer = new WPlacer();
        try {
            const userInfo = await wplacer.login(users[id].cookies);
            const expirationDate = TokenManager.getExpiration(users[id]);
            userInfo.expirationDate = expirationDate;
            results[id] = { success: true, data: userInfo };
        } catch (error) {
            logUserError(error, id, users[id].name, "validate cookie in bulk check");
            results[id] = { success: false, error: error.message };
        } finally {
            activeBrowserUsers.delete(id);
        }
    };

    const queue = [...userIds];
    const workers = Array(concurrencyLimit).fill(null).map(async () => {
        while (queue.length > 0) {
            const userId = queue.shift();
            if (userId) {
                await checkUser(userId);
            }
        }
    });

    await Promise.all(workers);
    res.json(results);
});


// --- API: update user profile (name/discord/showLastPixel) ---
app.put("/user/:id/update-profile", async (req, res) => {
    const { id } = req.params;
    if (!users[id] || activeBrowserUsers.has(id)) return res.sendStatus(409);

    // Always send all fields to backend, but validate here
    const name = typeof req.body?.name === "string" ? String(req.body.name).trim() : "";
    const discord = typeof req.body?.discord === "string" ? String(req.body.discord).trim() : "";
    const showLastPixel = typeof req.body?.showLastPixel === "boolean" ? !!req.body.showLastPixel : !!users[id]?.showLastPixel;

    if (name && name.length > 15) return res.status(400).json({ error: "Name must be at most 15 characters" });
    if (discord && discord.length > 15) return res.status(400).json({ error: "Discord must be at most 15 characters" });

    activeBrowserUsers.add(id);
    const wplacer = new WPlacer();
    try {
        await wplacer.login(users[id].cookies);
        const payload = { name, discord, showLastPixel };

        const { status, data } = await wplacer.post("https://backend.wplace.live/me/update", payload);
        if (status === 200 && data && data.success) {
            if (typeof name === "string" && name.length) { users[id].name = name; }
            users[id].discord = discord;
            users[id].showLastPixel = !!showLastPixel;
            saveUsers();
            res.status(200).json({ success: true });
            log(id, users[id].name, `Updated profile (${Object.keys(payload).join(", ") || "no changes"}).`);
        } else {
            res.status(status || 500).json(data || { error: "Unknown error" });
        }
    } catch (error) {
        logUserError(error, id, users[id].name, "update profile");
        res.status(500).json({ error: error.message });
    } finally {
        activeBrowserUsers.delete(id);
    }
});

app.post("/users/buy-max-upgrades", async (req, res) => {
    const report = [];
    const cooldown = currentSettings.purchaseCooldown || 5000;

    const dummyTemplate = { width: 0, height: 0, data: [] };
    const dummyCoords = [0, 0, 0, 0];

    const userIds = Object.keys(users);

    for (const userId of userIds) {
        const urec = users[userId];
        if (!urec) continue;

        if (activeBrowserUsers.has(userId)) {
            report.push({ userId, name: urec.name, skipped: true, reason: "busy" });
            continue;
        }

        activeBrowserUsers.add(userId);
        const wplacer = new WPlacer(dummyTemplate, dummyCoords, currentSettings, "AdminPurchase");

        try {
            await wplacer.login(urec.cookies);
            await wplacer.loadUserInfo();

            const beforeDroplets = wplacer.userInfo.droplets;
            const reserve = currentSettings.dropletReserve || 0;
            const affordable = Math.max(0, beforeDroplets - reserve);
            const amountToBuy = Math.floor(affordable / 500); // #70 = 500 droplets

            if (amountToBuy > 0) {
                await wplacer.buyProduct(70, amountToBuy);
                await sleep(cooldown);
                report.push({
                    userId,
                    name: wplacer.userInfo.name,
                    amount: amountToBuy,
                    beforeDroplets,
                    afterDroplets: beforeDroplets - amountToBuy * 500
                });
            } else {
                report.push({
                    userId,
                    name: wplacer.userInfo.name,
                    amount: 0,
                    skipped: true,
                    reason: "insufficient_droplets_or_reserve"
                });
            }
        } catch (error) {
            logUserError(error, userId, urec.name, "bulk buy max charge upgrades");
            report.push({ userId, name: urec.name, error: error?.message || String(error) });
        } finally {
            activeBrowserUsers.delete(userId);
        }
    }

    res.json({ ok: true, cooldownMs: cooldown, reserve: currentSettings.dropletReserve || 0, report });
});

app.post("/users/purchase-color", async (req, res) => {
    try {
        const { colorId, userIds } = req.body || {};
        const cid = Number(colorId);
        if (!Number.isFinite(cid) || cid < 32 || cid > 63) {
            return res.status(400).json({ error: "colorId must be a premium color id (32..63)" });
        }
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: "userIds must be a non-empty array" });
        }

        const cooldown = currentSettings.purchaseCooldown || 5000;
        const reserve = currentSettings.dropletReserve || 0;

        const dummyTemplate = { width: 0, height: 0, data: [] };
        const dummyCoords = [0, 0, 0, 0];

        const report = [];

        const hasColor = (bitmap, colorId) => {
            const bit = colorId - 32;
            return (bitmap & (1 << bit)) !== 0;
        };

        for (let idx = 0; idx < userIds.length; idx++) {
            const uid = String(userIds[idx]);
            const urec = users[uid];

            if (!urec) {
                report.push({ userId: uid, name: `#${uid}`, skipped: true, reason: "unknown_user" });
                continue;
            }

            if (activeBrowserUsers.has(uid)) {
                report.push({ userId: uid, name: urec.name, skipped: true, reason: "busy" });
                continue;
            }

            activeBrowserUsers.add(uid);
            const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, "ColorPurchase");

            try {
                await w.login(urec.cookies);
                await w.loadUserInfo();

                const name = w.userInfo.name;
                const beforeBitmap = Number(w.userInfo.extraColorsBitmap || 0);
                const beforeDroplets = Number(w.userInfo.droplets || 0);

                if (hasColor(beforeBitmap, cid)) {
                    report.push({ userId: uid, name, skipped: true, reason: "already_has_color" });
                } else {
                    try {
                        await w.buyProduct(100, 1, cid);
                        await sleep(cooldown);
                        await w.loadUserInfo().catch(() => { });
                        report.push({
                            userId: uid,
                            name,
                            ok: true,
                            success: true,
                            beforeDroplets,
                            afterDroplets: w.userInfo?.droplets
                        });
                    } catch (err) {
                        if (err?.code === 403 || /FORBIDDEN_OR_INSUFFICIENT/i.test(err?.message)) {
                            report.push({ userId: uid, name, skipped: true, reason: "forbidden_or_insufficient_droplets" });
                        } else if (/(1015)/.test(err?.message)) {
                            report.push({ userId: uid, name, error: "rate_limited" });
                        } else {
                            report.push({ userId: uid, name, error: err?.message || "purchase_failed" });
                        }
                    }
                }
            } catch (e) {
                logUserError(e, uid, urec.name, "purchase color");
                report.push({ userId: uid, name: urec.name, error: e?.message || "login_failed" });
            } finally {
                activeBrowserUsers.delete(uid);
            }

            if (idx < userIds.length - 1 && cooldown > 0) {
                await sleep(cooldown);
            }
        }

        res.json({ colorId: cid, cooldownMs: cooldown, reserve, report });
    } catch (e) {
        console.error("purchase-color failed:", e);
        res.status(500).json({ error: "Internal error" });
    }
});

// --- API: users colors check (sequential with cooldown) ---
app.post("/users/colors-check", async (req, res) => {
    try {
        if (colorsCheckJob.active) {
            return res.status(409).json({ error: "colors_check_in_progress" });
        }

        const cooldown = currentSettings.accountCheckCooldown || 0;

        const dummyTemplate = { width: 0, height: 0, data: [] };
        const dummyCoords = [0, 0, 0, 0];

        const ids = Object.keys(users);
        colorsCheckJob = {
            active: true,
            total: ids.length,
            completed: 0,
            startedAt: Date.now(),
            finishedAt: 0,
            lastUserId: null,
            lastUserName: null,
            report: []
        };

        console.log(`[ColorsCheck] Started: ${ids.length} accounts. Cooldown=${cooldown}ms`);

        for (let i = 0; i < ids.length; i++) {
            const uid = String(ids[i]);
            const urec = users[uid];
            if (!urec) { continue; }

            colorsCheckJob.lastUserId = uid;
            colorsCheckJob.lastUserName = urec?.name || `#${uid}`;
            console.log(`[ColorsCheck] ${i + 1}/${ids.length}: ${colorsCheckJob.lastUserName} (#${uid})`);

            if (activeBrowserUsers.has(uid)) {
                colorsCheckJob.report.push({ userId: uid, name: urec.name, skipped: true, reason: "busy" });
                colorsCheckJob.completed++;
                continue;
            }

            activeBrowserUsers.add(uid);
            const w = new WPlacer(dummyTemplate, dummyCoords, currentSettings, "ColorsCheck");

            try {
                await w.login(urec.cookies);
                await w.loadUserInfo();

                const u = w.userInfo || {};
                const charges = {
                    count: Math.floor(Number(u?.charges?.count || 0)),
                    max: Number(u?.charges?.max || 0)
                };
                const levelNum = Number(u?.level || 0);
                const level = Math.floor(levelNum);
                const progress = Math.round((levelNum % 1) * 100);

                colorsCheckJob.report.push({
                    userId: uid,
                    name: u?.name || urec.name,
                    extraColorsBitmap: Number(u?.extraColorsBitmap || 0),
                    droplets: Number(u?.droplets || 0),
                    charges,
                    level,
                    progress
                });
            } catch (e) {
                logUserError(e, uid, urec.name, "colors check");
                colorsCheckJob.report.push({ userId: uid, name: urec.name, error: e?.message || "login_failed" });
            } finally {
                activeBrowserUsers.delete(uid);
                colorsCheckJob.completed++;
            }

            if (i < ids.length - 1 && cooldown > 0) {
                await sleep(cooldown);
            }
        }

        colorsCheckJob.active = false;
        colorsCheckJob.finishedAt = Date.now();
        console.log(`[ColorsCheck] Finished: ${colorsCheckJob.completed}/${colorsCheckJob.total} in ${duration(colorsCheckJob.finishedAt - colorsCheckJob.startedAt)}.`);

        res.json({ ok: true, ts: colorsCheckJob.finishedAt || Date.now(), cooldownMs: cooldown, report: colorsCheckJob.report });
    } catch (e) {
        colorsCheckJob.active = false;
        colorsCheckJob.finishedAt = Date.now();
        console.error("colors-check failed:", e);
        res.status(500).json({ error: "Internal error" });
    }
});

// progress endpoint for colors-check
app.get("/users/colors-check/progress", (req, res) => {
    const { active, total, completed, startedAt, finishedAt, lastUserId, lastUserName } = colorsCheckJob;
    res.json({ active, total, completed, startedAt, finishedAt, lastUserId, lastUserName });
});


app.get("/templates", (_, res) => {
    const sanitizedTemplates = {};
    for (const id in templates) {
        const t = templates[id];
        sanitizedTemplates[id] = {
            name: t.name,
            template: t.template,
            coords: t.coords,
            canBuyCharges: t.canBuyCharges,
            canBuyMaxCharges: t.canBuyMaxCharges,
            autoBuyNeededColors: !!t.autoBuyNeededColors,
            antiGriefMode: t.antiGriefMode,
            enableAutostart: t.enableAutostart,
            paintTransparentPixels: t.paintTransparentPixels,
            userIds: t.userIds,
            running: t.running,
            status: t.status,
            pixelsRemaining: t.pixelsRemaining,
            totalPixels: t.totalPixels,
            autoFarm: t.autoFarm,
        };
    }
    res.json(sanitizedTemplates);
});

app.post("/template", async (req, res) => {
    const { templateName, template, coords, userIds, canBuyCharges, canBuyMaxCharges, antiGriefMode, enableAutostart, autoFarm, paintTransparentPixels, autoBuyNeededColors } = req.body;
    if (!templateName || !template || !coords || !userIds || !userIds.length) return res.sendStatus(400);
    if (Object.values(templates).some(t => t.name === templateName)) {
        return res.status(409).json({ error: "A template with this name already exists." });
    }
    const templateId = Date.now().toString();
    templates[templateId] = new TemplateManager(
        templateName,
        template,
        coords,
        canBuyCharges,
        canBuyMaxCharges,
        antiGriefMode,
        enableAutostart,
        userIds,
        autoFarm,
        paintTransparentPixels,
        autoBuyNeededColors
    );
    saveTemplates();
    res.status(200).json({ id: templateId });
});

app.delete("/template/:id", async (req, res) => {
    const { id } = req.params;
    if (!id || !templates[id] || templates[id].running) return res.sendStatus(400);
    delete templates[id];
    saveTemplates();
    res.sendStatus(200);
});

app.put("/template/edit/:id", async (req, res) => {
    const { id } = req.params;
    if (!templates[id]) return res.sendStatus(404);
    const manager = templates[id];
    const { templateName, coords, userIds, canBuyCharges, canBuyMaxCharges, antiGriefMode, enableAutostart, template, autoFarm, paintTransparentPixels } = req.body;
    const prevCoords = manager.coords;
    const prevTemplateStr = JSON.stringify(manager.template);
    manager.name = templateName;
    manager.coords = coords;
    manager.userIds = userIds;
    manager.canBuyCharges = canBuyCharges;
    manager.canBuyMaxCharges = canBuyMaxCharges;
    manager.antiGriefMode = antiGriefMode;
    manager.enableAutostart = enableAutostart;
    manager.autoFarm = autoFarm;
    manager.paintTransparentPixels = paintTransparentPixels

    if (typeof req.body.autoBuyNeededColors !== 'undefined') {
        manager.autoBuyNeededColors = !!req.body.autoBuyNeededColors;
        if (manager.autoBuyNeededColors) {
            manager.canBuyCharges = false;
            manager.canBuyMaxCharges = false;
        }
    }

    if (template) {
        manager.template = template;
        manager.totalPixels = manager.template.data.flat().filter(p => p > 0).length;
    }
    manager.masterId = manager.userIds[0];
    manager.masterName = users[manager.masterId]?.name || "Unknown";

    // reset seeds if image or coords changed
    if (template || JSON.stringify(prevCoords) !== JSON.stringify(manager.coords)) {
        manager.burstSeeds = null;
    }

    // recompute totals
    manager.totalPixels = manager.template?.data
        ? manager.template.data.flat().filter((p) => (manager.paintTransparentPixels ? p >= 0 : p > 0)).length
        : 0;

    // reset remaining counter if template definition changed or totals differ
    try {
        if (!manager.running) {
            manager.pixelsRemaining = manager.totalPixels;
            manager.status = "Waiting to be started.";
        }
    } catch (_) { }

    saveTemplates();
    res.sendStatus(200);
});

app.put("/template/:id", async (req, res) => {
    const { id } = req.params;
    if (!id || !templates[id]) return res.sendStatus(400);
    const manager = templates[id];
    if (req.body.running && !manager.running) {
        manager.start().catch(error => log(id, manager.masterName, "Error starting template", error));
    } else {
        if (manager.running && req.body.running === false) {
            log("SYSTEM", "wplacer", `[${manager.name}] ⏹️ Template manually stopped by user.`);
        }
        manager.running = false;
    }
    res.sendStatus(200);
});

app.get('/settings', (_, res) => {
    res.json({ ...currentSettings, proxyCount: loadedProxies.length });
});

app.post("/reload-proxies", (_, res) => {
    loadProxies();
    res.status(200).json({ success: true, count: loadedProxies.length });
});

app.put('/settings', (req, res) => {
    const patch = { ...req.body };

    // sanitize seedCount like in old version
    if (typeof patch.seedCount !== "undefined") {
        let n = Number(patch.seedCount);
        if (!Number.isFinite(n)) n = 2;
        n = Math.max(1, Math.min(16, Math.floor(n)));
        patch.seedCount = n;
    }

    // sanitize chargeThreshold
    if (typeof patch.chargeThreshold !== "undefined") {
        let t = Number(patch.chargeThreshold);
        if (!Number.isFinite(t)) t = 0.5;
        t = Math.max(0, Math.min(1, t));
        patch.chargeThreshold = t;
    }

    // sanitize maxPixelsPerPass (0 = unlimited)
    if (typeof patch.maxPixelsPerPass !== "undefined") {
        let m = Number(patch.maxPixelsPerPass);
        if (!Number.isFinite(m)) m = 0;
        m = Math.max(0, Math.floor(m));
        patch.maxPixelsPerPass = m;
    }

    const oldSettings = { ...currentSettings };
    currentSettings = { ...currentSettings, ...patch };
    saveSettings();

    // if cooldown/threshold changed — refresh runtime timers without restart
    const accountCooldownChanged = oldSettings.accountCooldown !== currentSettings.accountCooldown;
    const thresholdChanged = oldSettings.chargeThreshold !== currentSettings.chargeThreshold;

    if (accountCooldownChanged || thresholdChanged) {
        for (const id in templates) {
            const m = templates[id]; if (!m) continue;
            if (typeof m._summaryMinIntervalMs === 'number') {
                const ac = currentSettings.accountCooldown || 0;
                m._summaryMinIntervalMs = Math.max(2 * ac, 5000);
            }
            if (m.running && typeof m.interruptSleep === 'function') m.interruptSleep();
        }
    }

    res.sendStatus(200);
});

app.get("/canvas", async (req, res) => {
    const { tx, ty } = req.query;
    if (isNaN(parseInt(tx)) || isNaN(parseInt(ty))) return res.sendStatus(400);
    try {
        const url = `https://backend.wplace.live/files/s0/tiles/${tx}/${ty}.png`;
        const response = await fetch(url);
        if (!response.ok) return res.sendStatus(response.status);
        const buffer = Buffer.from(await response.arrayBuffer());
        res.json({ image: `data:image/png;base64,${buffer.toString('base64')}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API: version check ---
app.get("/version", async (_req, res) => {
    try {
        const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
        const local = String(pkg.version || "0.0.0");
        let latest = local;
        try {
            const r = await fetch("https://raw.githubusercontent.com/lllexxa/wplacer/main/package.json", { cache: "no-store" });
            if (r.ok) {
                const remote = await r.json();
                latest = String(remote.version || latest);
            }
        } catch (_) { }

        const cmp = (a, b) => {
            const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
            const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const da = pa[i] || 0, db = pb[i] || 0;
                if (da !== db) return da - db;
            }
            return 0;
        };
        const outdated = cmp(local, latest) < 0;
        res.json({ local, latest, outdated });
    } catch (e) {
        res.status(500).json({ error: "version_check_failed" });
    }
});

// --- API: changelog (local + remote) ---
app.get("/changelog", async (_req, res) => {
    try {
        let local = "";
        try { local = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8"); } catch (_) { }
        let remote = "";
        try {
            const r = await fetch("https://raw.githubusercontent.com/lllexxa/wplacer/main/CHANGELOG.md", { cache: "no-store" });
            if (r.ok) remote = await r.text();
        } catch (_) { }
        res.json({ local, remote });
    } catch (e) {
        res.status(500).json({ error: "changelog_fetch_failed" });
    }
});

// --- Keep-Alive (kept from new version) ---
const keepAlive = async () => {
    if (activeBrowserUsers.size > 0) {
        log("SYSTEM", "wplacer", "⚙️ Deferring keep-alive check: a browser operation is active.");
        return;
    }
    log("SYSTEM", "wplacer", "⚙️ Performing periodic cookie keep-alive check for all users...");
    for (const userId of Object.keys(users)) {
        if (activeBrowserUsers.has(userId)) {
            log(userId, users[userId].name, "⚠️ Skipping keep-alive check: user is currently busy.");
            continue;
        }
        activeBrowserUsers.add(userId);
        const wplacer = new WPlacer();
        try {
            await wplacer.login(users[userId].cookies);
            log(userId, users[userId].name, "✅ Cookie keep-alive successful.");
        } catch (error) {
            logUserError(error, userId, users[userId].name, "perform keep-alive check");
        } finally {
            activeBrowserUsers.delete(userId);
        }
        await sleep(currentSettings.keepAliveCooldown);
    }
    log("SYSTEM", "wplacer", "✅ Keep-alive check complete.");
};

// --- Server Startup ---
(async () => {
    console.clear();
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    console.log(`\n--- wplacer v${version} by luluwaffless and jinx ---\n`);

    // Load Templates from templates.json
    const loadedTemplates = loadJSON("templates.json");

    // Loop through loaded templates and check validity
    for (const id in loadedTemplates) {
        const t = loadedTemplates[id];

        if (t.userIds?.every(uid => users[uid])) {
            const tm = new TemplateManager(
                t.name,
                t.template,
                t.coords,
                t.canBuyCharges,
                t.canBuyMaxCharges,
                t.antiGriefMode,
                t.enableAutostart,
                t.userIds,
                t.autoFarm,
                !!t.paintTransparentPixels,
            );
            tm.burstSeeds = t.burstSeeds || null;
            tm.autoBuyNeededColors = !!t.autoBuyNeededColors;
            templates[id] = tm;

            // Check autostart flag
            if (t.enableAutostart) {
                templates[id].start().catch(error =>
                    log(id, templates[id].masterName, "Error starting autostarted template", error)
                );
                autostartedTemplates.push({ id, name: t.name });
            }
        } else {
            console.warn(`⚠️ Template "${t.name}" was not loaded because its assigned user(s) no longer exist.`);
        }
    }

    // Load proxies 
    loadProxies();

    console.log(`✅ Loaded ${Object.keys(templates).length} templates, ${Object.keys(users).length} users and ${loadedProxies.length} proxies.`);

    const port = Number(process.env.PORT) || 80;
    const host = "0.0.0.0";
    app.listen(port, host, (error) => {
        console.log(`✅ Server listening on http://localhost:${port}`);
        console.log(`   Open the web UI in your browser to start!`);
        setInterval(keepAlive, 20 * 60 * 1000); // every 20 minutes
        if (error) {
            console.error("\n" + error);
        }
    });
})();

// Track SSE clients
const clients = new Set();

// Add SSE endpoint
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection confirmation
    res.write('event: connected\ndata: Connected to paint events\n\n');

    // Add client to set
    clients.add(res);

    // Remove client on connection close
    req.on('close', () => {
        clients.delete(res);
    });
});

// Helper function to broadcast paint updates
function broadcastUpdate(data) {
    const eventData = `event: paint\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => {
        client.write(eventData);
    });
}