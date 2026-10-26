(function () {
    var stage = document.getElementById('fps-stage');
    if (!stage) return;

    function $(id) { return document.getElementById(id); }
    var canvas = $('fps-canvas'), ctx = canvas.getContext('2d');
    var mini = $('fps-minimap'), mctx = mini.getContext('2d');

    var RW = 512, RH = 288;
    var imgData = ctx.createImageData(RW, RH);
    var buf32 = new Uint32Array(imgData.data.buffer);
    var zBuf = new Float32Array(RW);

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function angDiff(a, b) {
        var d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return d;
    }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtTime(s) { s = Math.floor(s); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
    function load(key, def) { try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }
    function save(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

    var MAP_STR = [
        "111111111111111111111111",
        "100000000000000000000001",
        "100222000000000000222001",
        "100200000033300000002001",
        "100200000030300000002001",
        "100000000000000000000001",
        "100000440000000044000001",
        "100000400000000004000001",
        "100000000011110000000001",
        "100330000010010000033001",
        "100300000010010000003001",
        "100000000000000000000001",
        "100000000000000000000001",
        "100300000010010000003001",
        "100330000010010000033001",
        "100000000011110000000001",
        "100000400000000004000001",
        "100000440000000044000001",
        "100000000000000000000001",
        "100200000030300000002001",
        "100200000033300000002001",
        "100222000000000000222001",
        "100000000000000000000001",
        "111111111111111111111111"
    ];
    var MAP = MAP_STR.map(function (r) { return r.split('').map(Number); });
    var MW = 24, MH = 24;
    var WALLC = [null, [25, 240, 255], [255, 43, 214], [139, 92, 255], [61, 255, 176]];
    var OPEN = [];
    for (var yy = 0; yy < MH; yy++) for (var xx = 0; xx < MW; xx++) if (!MAP[yy][xx]) OPEN.push({ x: xx, y: yy });

    function cellType(cx, cy) { return (cx < 0 || cy < 0 || cx >= MW || cy >= MH) ? 1 : MAP[cy][cx]; }
    function isWall(x, y) { return cellType(Math.floor(x), Math.floor(y)) > 0; }
    function blocked(x, y, r) {
        return isWall(x - r, y - r) || isWall(x + r, y - r) || isWall(x - r, y + r) || isWall(x + r, y + r);
    }
    function hasLOS(x0, y0, x1, y1) {
        var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2);
        for (var i = 1; i < n; i++) {
            var t = i / n;
            if (isWall(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
        }
        return true;
    }
    function findPath(sx, sy, tx, ty) {
        sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
        if (cellType(tx, ty) > 0) return [];
        var prev = {}, q = [[sx, sy]], key = function (x, y) { return y * MW + x; };
        prev[key(sx, sy)] = -1;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], found = false;
        for (var qi = 0; qi < q.length && !found; qi++) {
            var cx = q[qi][0], cy = q[qi][1];
            for (var d = 0; d < 4; d++) {
                var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
                if (cellType(nx, ny) > 0 || prev[key(nx, ny)] !== undefined) continue;
                prev[key(nx, ny)] = key(cx, cy);
                if (nx === tx && ny === ty) { found = true; break; }
                q.push([nx, ny]);
            }
        }
        if (!found) return [];
        var path = [], k = key(tx, ty);
        while (k !== -1 && k !== key(sx, sy)) {
            path.push({ x: (k % MW) + 0.5, y: Math.floor(k / MW) + 0.5 });
            k = prev[k];
        }
        return path.reverse();
    }

    var DIFFS = {
        easy:   { label: 'EASY',   desc: '3 slow bots, poor aim, they react late.',               bots: 3, kills: 10, hp: 70,  speed: 1.0, acc: 0.18, interval: 1.25, react: 0.95, dmg: 5,  range: 9,  fov: 100, strafe: 0.15, hunt: 0,   turn: 3.5,  color: '#3dffb0' },
        medium: { label: 'MEDIUM', desc: '4 bots that strafe and fight back.',                    bots: 4, kills: 12, hp: 100, speed: 1.5, acc: 0.34, interval: 0.8,  react: 0.55, dmg: 7,  range: 12, fov: 120, strafe: 0.55, hunt: 12,  turn: 5.5,  color: '#ffe14d' },
        hard:   { label: 'HARD',   desc: '5 fast bots with good aim that hunt you down.',         bots: 5, kills: 15, hp: 100, speed: 2.0, acc: 0.55, interval: 0.5,  react: 0.3,  dmg: 9,  range: 16, fov: 160, strafe: 0.9,  hunt: 6,   turn: 8,    color: '#ff8a3d' },
        skull:  { label: '\uD83D\uDC80', desc: '6 relentless bots, near-perfect aim, 360 awareness. Good luck.', bots: 6, kills: 15, hp: 140, speed: 2.5, acc: 0.8,  interval: 0.26, react: 0.12, dmg: 12, range: 22, fov: 360, strafe: 1.0,  hunt: 3.5, turn: 14,   color: '#ff2b3d' }
    };
    var diffKey = load('bold-fps-diff', 'easy');
    if (!DIFFS[diffKey]) diffKey = 'easy';
    var D = DIFFS[diffKey];

    var MAG = 25, FIRE_INTERVAL = 0.105, RELOAD_TIME = 2.3;
    var DMG = { head: 160, body: 40, legs: 34 };

    var Sfx = (function () {
        var ac = null, master = null, noiseBuf = null, volume = parseFloat(load('bold-fps-vol', '0.7'));
        if (isNaN(volume)) volume = 0.7;

        function init() {
            if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ac = new AC();
            master = ac.createGain();
            master.gain.value = volume;
            master.connect(ac.destination);
            noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
            var d = noiseBuf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        function setVolume(v) { volume = v; if (master) master.gain.value = v; }
        function dest(pan) {
            if (pan && ac.createStereoPanner) {
                var p = ac.createStereoPanner();
                p.pan.value = clamp(pan, -1, 1);
                p.connect(master);
                return p;
            }
            return master;
        }
        function tone(freq, dur, type, vol, slideTo, delay, pan) {
            if (!ac) return;
            var t = ac.currentTime + (delay || 0);
            var o = ac.createOscillator(), g = ac.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(dest(pan));
            o.start(t); o.stop(t + dur + 0.02);
        }
        function noise(dur, ftype, freq, q, vol, delay, pan, freqEnd) {
            if (!ac) return;
            var t = ac.currentTime + (delay || 0);
            var s = ac.createBufferSource(); s.buffer = noiseBuf;
            var f = ac.createBiquadFilter(); f.type = ftype; f.Q.value = q || 1;
            f.frequency.setValueAtTime(freq, t);
            if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
            var g = ac.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            s.connect(f); f.connect(g); g.connect(dest(pan));
            s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
        }
        return {
            init: init, setVolume: setVolume,
            close: function () { if (ac) { try { ac.close(); } catch (e) {} ac = null; } },
            shoot: function () {
                noise(0.16, 'lowpass', 3200, 0.7, 0.9, 0, 0, 350);
                noise(0.04, 'highpass', 3500, 0.6, 0.45);
                tone(150, 0.13, 'sine', 0.9, 40);
            },
            botShoot: function (dist, pan) {
                var v = 0.55 / (1 + dist * 0.3);
                noise(0.14, 'lowpass', 1800, 0.7, v, 0, pan, 300);
                tone(110, 0.1, 'sine', v, 40, 0, pan);
            },
            reload: function () {
                noise(0.05, 'bandpass', 1800, 3, 0.5, 0.15); tone(220, 0.06, 'square', 0.12, 110, 0.15);
                noise(0.06, 'bandpass', 1200, 3, 0.6, 1.2);  tone(160, 0.08, 'square', 0.14, 80, 1.2);
                noise(0.07, 'bandpass', 2600, 4, 0.6, 2.05); tone(300, 0.05, 'square', 0.1, 150, 2.05);
            },
            empty: function () { noise(0.03, 'bandpass', 2500, 5, 0.35); tone(900, 0.03, 'square', 0.08); },
            hit: function () { tone(1500, 0.06, 'square', 0.16); },
            headshot: function () {
                tone(1760, 0.35, 'sine', 0.4); tone(2640, 0.25, 'sine', 0.22, 0, 0.02); tone(880, 0.3, 'triangle', 0.2);
            },
            kill: function () { tone(320, 0.28, 'sawtooth', 0.22, 70); noise(0.22, 'lowpass', 1000, 0.7, 0.3, 0, 0, 200); },
            hurt: function () { tone(95, 0.22, 'sine', 0.8, 45); noise(0.16, 'lowpass', 600, 0.7, 0.5, 0, 0, 200); },
            step: function () { noise(0.05, 'lowpass', 600, 0.7, 0.07); },
            start: function () { tone(523, 0.12, 'triangle', 0.3); tone(659, 0.12, 'triangle', 0.3, 0, 0.11); tone(784, 0.22, 'triangle', 0.3, 0, 0.22); },
            win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.3, 0, i * 0.13); }); },
            lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.35, 'sawtooth', 0.2, f * 0.8, i * 0.16); }); }
        };
    })();

    function makeBotTex(color, pose) {
        var c = document.createElement('canvas'); c.width = 64; c.height = 128;
        var g = c.getContext('2d');
        g.lineWidth = 2.5; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 6; g.fillStyle = '#0b0d1a';
        var off = pose === 0 ? 3 : pose === 1 ? -3 : 0;
        function box(x, y, w, h) { g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); }
        box(20, 80, 10, 42 + off); box(34, 80, 10, 42 - off);
        box(6, 32, 8, 40); box(50, 32, 8, 40);
        box(14, 28, 36, 52);
        g.fillStyle = color; g.globalAlpha = 0.8; g.fillRect(28, 38, 8, 26); g.globalAlpha = 1;
        g.fillStyle = '#0b0d1a';
        g.beginPath(); g.arc(32, 14, 10, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = color; g.fillRect(25, 12, 14, 4);
        if (pose === 2) {
            var gr = g.createRadialGradient(32, 58, 1, 32, 58, 20);
            gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#ffe27a'); gr.addColorStop(1, 'rgba(255,200,60,0)');
            g.shadowBlur = 0; g.fillStyle = gr; g.fillRect(8, 34, 48, 48);
        }
        if (pose === 3) {
            g.shadowBlur = 0; g.globalCompositeOperation = 'source-atop';
            g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(0, 0, 64, 128);
        }
        return c;
    }
    var TEX = [];
    function buildTex() { TEX = [0, 1, 2, 3].map(function (p) { return makeBotTex(D.color, p); }); }

    var state = 'menu';
    var P, bots = [], spawnTimers = [], stats, vis = [];
    var keys = {}, firing = false, scoped = false;
    var locked = false, noLock = false, lockWorked = false;
    var sens = parseFloat(load('bold-fps-sens2', '1')); if (isNaN(sens)) sens = 1;
    var tracer = null, kickT = 0, flashT = 0, hitT = 0, hurtVig = 0, dirT = 0, dirAng = 0, noiseT = 0, stepT = 0;
    var raf, lastT = performance.now(), menuSpin = 0;

    function newPlayer() {
        return { x: 2.5, y: 11.5, a: 0, pitch: 0, recoil: 0, hp: 100, ammo: MAG, reloading: false, reloadT: 0,
                 fireT: 0, bloom: 0, scopeT: 0, moveAmt: 0, walk: 0, time: 0, recoilIdle: 0 };
    }
    P = newPlayer();

    function startMatch() {
        D = DIFFS[diffKey];
        buildTex();
        Sfx.init();
        if (window.BoldMusic && window.BoldMusic.suspend) window.BoldMusic.suspend();
        P = newPlayer();
        bots = []; spawnTimers = []; vis = [];
        stats = { kills: 0, heads: 0, shots: 0, hits: 0 };
        $('fps-feed').innerHTML = '';
        firing = false; scoped = false; tracer = null;
        for (var i = 0; i < D.bots; i++) spawnBot(true);
        hide('fps-menu'); hide('fps-pause'); hide('fps-result');
        state = 'playing';
        setMatchMode(true);
        noLock = false;
        requestLock();
        Sfx.start();
    }

    function endMatch(win) {
        if (state !== 'playing') return;
        state = 'over';
        setMatchMode(false);
        firing = false; scoped = false;
        if (document.exitPointerLock) document.exitPointerLock();
        if (win) Sfx.win(); else Sfx.lose();
        if (window.BoldMusic && window.BoldMusic.release) window.BoldMusic.release();

        var acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
        var bestKey = 'bold-fps-best-' + diffKey, best = null;
        try { best = JSON.parse(load(bestKey, 'null')); } catch (e) {}
        var newBest = false;
        if (win && (!best || !best.time || P.time < best.time)) { best = { time: P.time, kills: stats.kills }; newBest = true; }
        else if (!win && (!best || stats.kills > (best.kills || 0)) && !(best && best.time)) { best = { kills: stats.kills }; }
        save(bestKey, JSON.stringify(best));

        $('fps-res-title').textContent = win ? 'VICTORY' : 'ELIMINATED';
        $('fps-res-title').className = 'fps-title ' + (win ? 'win' : 'lose');
        $('fps-res-stats').innerHTML =
            '<div><span>Kills</span><b>' + stats.kills + ' / ' + D.kills + '</b></div>' +
            '<div><span>Headshots</span><b>' + stats.heads + '</b></div>' +
            '<div><span>Accuracy</span><b>' + acc + '%</b></div>' +
            '<div><span>Time</span><b>' + fmtTime(P.time) + '</b></div>';
        $('fps-res-note').textContent = newBest ? 'New best time on ' + D.label + '!' : D.label + ' difficulty';
        show('fps-result');
        updateMenuBest();
    }

    function toMenu() {
        state = 'menu';
        setMatchMode(false);
        if (document.exitPointerLock) document.exitPointerLock();
        if (window.BoldMusic && window.BoldMusic.release) window.BoldMusic.release();
        hide('fps-result'); hide('fps-pause'); show('fps-menu');
    }

    function pauseGame() {
        if (state !== 'playing') return;
        state = 'paused'; firing = false; scoped = false;
        show('fps-pause');
    }
    function resumeGame() {
        if (state !== 'paused') return;
        hide('fps-pause');
        state = 'playing';
        if (!noLock) requestLock();
    }

    function setMatchMode(on) { document.body.classList.toggle('in-match', on); }
    function show(id) { $(id).classList.remove('hidden'); }
    function hide(id) { $(id).classList.add('hidden'); }

    function requestLock() {
        try {
            var r = canvas.requestPointerLock({ unadjustedMovement: true });
            if (r && r.catch) r.catch(function () {
                try { var r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch(onLockFail); } catch (e) { onLockFail(); }
            });
        } catch (e) {
            try { canvas.requestPointerLock(); } catch (e2) { onLockFail(); }
        }
    }
    function onLockFail() {
        if (state !== 'playing') return;
        if (!lockWorked) { noLock = true; }
        else { pauseGame(); }
    }
    function onLockChange() {
        locked = document.pointerLockElement === canvas;
        if (locked) lockWorked = true;
        else if (state === 'playing' && !noLock) pauseGame();
    }

    var botId = 0;
    function spawnBot(initial) {
        var tries = 0, c;
        do {
            c = OPEN[Math.floor(Math.random() * OPEN.length)];
            tries++;
        } while (tries < 60 && (Math.hypot(c.x + 0.5 - P.x, c.y + 0.5 - P.y) < (initial ? 9 : 10) ||
                 (!initial && hasLOS(c.x + 0.5, c.y + 0.5, P.x, P.y))));
        bots.push({
            id: ++botId, x: c.x + 0.5, y: c.y + 0.5, a: rand(0, 6.28), hp: D.hp, maxhp: D.hp,
            path: [], pathT: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.3, 1),
            react: -1, fireT: rand(0.5, 1.5), hurtT: 0, flashT: 0, phase: rand(0, 6),
            dead: false, dieT: 0, lastSeen: null, huntT: D.hunt ? rand(2, D.hunt) : 0, aware: false
        });
    }

    function moveBot(b, vx, vy, dt) {
        var nx = b.x + vx * dt, ny = b.y + vy * dt, r = 0.25;
        if (!blocked(nx, b.y, r)) b.x = nx;
        if (!blocked(b.x, ny, r)) b.y = ny;
        for (var i = 0; i < bots.length; i++) {
            var o = bots[i];
            if (o === b || o.dead) continue;
            var dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
            if (d < 0.55 && d > 0.001) {
                var push = (0.55 - d) * 0.5;
                if (!blocked(b.x + dx / d * push, b.y, r)) b.x += dx / d * push;
                if (!blocked(b.x, b.y + dy / d * push, r)) b.y += dy / d * push;
            }
        }
    }

    function updateBot(b, dt) {
        if (b.dead) { b.dieT += dt; return; }
        b.hurtT = Math.max(0, b.hurtT - dt);
        b.flashT = Math.max(0, b.flashT - dt);

        var dxp = P.x - b.x, dyp = P.y - b.y, dist = Math.hypot(dxp, dyp);
        var angP = Math.atan2(dyp, dxp);
        var diff = angDiff(b.a, angP);
        var los = dist < D.range && hasLOS(b.x, b.y, P.x, P.y);
        var inFov = Math.abs(diff) < (D.fov / 2) * Math.PI / 180;
        var heard = noiseT > 0 && dist < 12 && D.hunt > 0;
        var sees = los && (inFov || heard);

        var speed = 0;
        if (sees) {
            b.aware = true;
            if (b.react < 0) b.react = D.react * rand(0.8, 1.25);
            b.react -= dt;
            b.lastSeen = { x: P.x, y: P.y };
            b.a += clamp(diff, -D.turn * dt, D.turn * dt);

            b.strafeT -= dt;
            if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -b.strafeDir : b.strafeDir; b.strafeT = rand(0.35, 1.2); }
            var mx = -Math.sin(angP) * b.strafeDir * D.strafe, my = Math.cos(angP) * b.strafeDir * D.strafe;
            if (D.strafe > 0.5) {
                if (dist > 7) { mx += Math.cos(angP) * 0.8; my += Math.sin(angP) * 0.8; }
                else if (dist < 3.5) { mx -= Math.cos(angP) * 0.7; my -= Math.sin(angP) * 0.7; }
            }
            var ml = Math.hypot(mx, my);
            if (ml > 0.01) {
                var sp = D.speed * Math.min(1, ml);
                moveBot(b, mx / ml * sp, my / ml * sp, dt);
                speed = sp;
            }

            b.fireT -= dt;
            if (b.react <= 0 && b.fireT <= 0 && Math.abs(diff) < 0.3) botFire(b, dist);
        } else {
            b.react = -1;
            if (D.hunt) {
                b.huntT -= dt;
                if (b.huntT <= 0) {
                    b.huntT = D.hunt * rand(0.8, 1.3);
                    b.lastSeen = { x: P.x + rand(-2.5, 2.5), y: P.y + rand(-2.5, 2.5) };
                    b.path = [];
                }
            }
            b.pathT -= dt;
            if (!b.path.length || b.pathT <= 0) {
                var tx, ty;
                if (b.lastSeen && cellType(Math.floor(b.lastSeen.x), Math.floor(b.lastSeen.y)) === 0) { tx = b.lastSeen.x; ty = b.lastSeen.y; }
                else { b.lastSeen = null; var c = OPEN[Math.floor(Math.random() * OPEN.length)]; tx = c.x + 0.5; ty = c.y + 0.5; }
                b.path = findPath(b.x, b.y, tx, ty);
                b.pathT = 2.5;
                if (!b.path.length) b.lastSeen = null;
            }
            if (b.path.length) {
                var n = b.path[0], dx = n.x - b.x, dy = n.y - b.y, d = Math.hypot(dx, dy);
                if (d < 0.2) { b.path.shift(); if (!b.path.length) b.lastSeen = null; }
                else {
                    var sp2 = D.speed * (b.lastSeen ? 1 : 0.7);
                    b.a += clamp(angDiff(b.a, Math.atan2(dy, dx)), -D.turn * dt, D.turn * dt);
                    moveBot(b, dx / d * sp2, dy / d * sp2, dt);
                    speed = sp2;
                }
            }
        }
        b.phase += speed * dt * 3;
    }

    function botFire(b, dist) {
        b.fireT = D.interval * rand(0.85, 1.2);
        b.flashT = 0.09;
        var rel = angDiff(P.a, Math.atan2(b.y - P.y, b.x - P.x));
        Sfx.botShoot(dist, Math.sin(rel));
        var p = D.acc * clamp(1 - dist / D.range * 0.5, 0.3, 1) * (P.moveAmt > 0.6 ? 0.7 : 1) * (P.scopeT > 0.5 ? 0.9 : 1);
        if (Math.random() < p) hurtPlayer(Math.round(D.dmg * rand(0.8, 1.2)), b);
    }

    function hurtPlayer(dmg, from) {
        P.hp -= dmg;
        hurtVig = Math.min(1, hurtVig + 0.45 + dmg * 0.02);
        dirAng = angDiff(P.a, Math.atan2(from.y - P.y, from.x - P.x));
        dirT = 1.2;
        Sfx.hurt();
        if (P.hp <= 0) { P.hp = 0; endMatch(false); }
    }

    function killBot(b, head) {
        b.dead = true; b.dieT = 0;
        stats.kills++;
        if (head) stats.heads++;
        P.hp = Math.min(100, P.hp + 8);
        addFeed('YOU \u25B8 BOT-' + b.id + (head ? '  HEADSHOT' : ''), head ? 'head' : '');
        Sfx.kill();
        spawnTimers.push(2.0);
        if (stats.kills >= D.kills) endMatch(true);
    }

    function addFeed(text, cls) {
        var d = document.createElement('div');
        d.className = 'feed-item ' + (cls || '');
        d.textContent = text;
        var feed = $('fps-feed');
        feed.appendChild(d);
        while (feed.children.length > 4) feed.removeChild(feed.firstChild);
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3500);
    }

    function startReload() {
        if (P.reloading || P.ammo >= MAG) return;
        P.reloading = true; P.reloadT = RELOAD_TIME;
        Sfx.reload();
    }

    function pickTarget(ax, ay) {
        var best = null, bd = 1e9;
        for (var i = 0; i < vis.length; i++) {
            var v = vis[i];
            if (v.b.dead) continue;
            if (ax < v.left || ax > v.left + v.w || ay < v.top || ay > v.top + v.h) continue;
            var col = Math.floor(ax);
            if (col < 0 || col >= RW || v.depth >= zBuf[col]) continue;
            var u = Math.abs((ax - v.left) / v.w - 0.5), w2 = (ay - v.top) / v.h, zone = null;
            if (w2 < 0.215 && u < 0.17) zone = 'head';
            else if (w2 >= 0.2 && w2 < 0.62 && u < 0.34) zone = 'body';
            else if (w2 >= 0.62 && u < 0.24) zone = 'legs';
            if (zone && v.depth < bd) { bd = v.depth; best = { bot: v.b, zone: zone }; }
        }
        return best;
    }

    function spreadPx() {
        var move = P.moveAmt * 9;
        return (1.2 + P.bloom + move) * (1 - P.scopeT * 0.55);
    }

    function shoot() {
        P.ammo--; P.fireT = FIRE_INTERVAL; stats.shots++;
        var sp = spreadPx(), ang = rand(0, 6.283), r = sp * Math.sqrt(Math.random());
        var ax = RW / 2 + Math.cos(ang) * r, ay = RH / 2 + Math.sin(ang) * r;

        P.bloom = Math.min(34, P.bloom + 5);
        P.recoil = Math.min(0.16, P.recoil + 0.016 + Math.random() * 0.006);
        P.a += (Math.random() - 0.5) * 0.006;
        P.recoilIdle = 0.14;
        kickT = 1; flashT = 0.06; noiseT = 0.8;
        tracer = { x: ax, y: ay, t: 0.05 };
        Sfx.shoot();

        var t = pickTarget(ax, ay);
        if (t) {
            stats.hits++;
            hitT = 0.18;
            var head = t.zone === 'head';
            t.bot.hp -= DMG[t.zone];
            t.bot.hurtT = 0.1;
            t.bot.aware = true; t.bot.lastSeen = { x: P.x, y: P.y };
            var hm = $('fps-hit');
            hm.className = 'show ' + (head ? 'head' : '');
            if (t.bot.hp <= 0) { hm.className = 'show kill'; killBot(t.bot, head); }
            else if (head) Sfx.headshot(); else Sfx.hit();
        }
        if (P.ammo <= 0) startReload();
    }

    function update(dt) {
        if (state === 'menu') { menuSpin += dt * 0.12; P.a = menuSpin; return; }
        if (state !== 'playing') return;

        P.time += dt;

        if (keys.ArrowLeft) P.a -= 2.3 * dt;
        if (keys.ArrowRight) P.a += 2.3 * dt;
        if (keys.ArrowUp) P.pitch = clamp(P.pitch + 0.9 * dt, -0.32, 0.32);
        if (keys.ArrowDown) P.pitch = clamp(P.pitch - 0.9 * dt, -0.32, 0.32);

        var dirX = Math.cos(P.a), dirY = Math.sin(P.a);
        var fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
        var str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        var mx = dirX * fwd - dirY * str, my = dirY * fwd + dirX * str;
        var ml = Math.hypot(mx, my), walking = keys.ShiftLeft || keys.ShiftRight;
        var moving = ml > 0;
        if (moving) {
            var spd = (walking ? 1.7 : 3.4) * (P.scopeT > 0.5 ? 0.75 : 1);
            var nx = P.x + mx / ml * spd * dt, ny = P.y + my / ml * spd * dt;
            if (!blocked(nx, P.y, 0.24)) P.x = nx;
            if (!blocked(P.x, ny, 0.24)) P.y = ny;
            P.walk += spd * dt * 2.4;
            stepT -= dt;
            if (stepT <= 0 && !walking) { Sfx.step(); stepT = 0.36; }
        }
        P.moveAmt += ((moving ? (walking ? 0.45 : 1) : 0) - P.moveAmt) * Math.min(1, dt * 10);

        P.scopeT += ((scoped ? 1 : 0) - P.scopeT) * Math.min(1, dt * 14);
        P.fireT -= dt;
        P.bloom = Math.max(0, P.bloom - 55 * dt);
        P.recoilIdle -= dt;
        if (P.recoilIdle <= 0) P.recoil -= P.recoil * Math.min(1, 7 * dt);
        kickT = Math.max(0, kickT - dt * 9);
        flashT = Math.max(0, flashT - dt);
        hitT = Math.max(0, hitT - dt);
        noiseT = Math.max(0, noiseT - dt);
        hurtVig = Math.max(0, hurtVig - dt * 1.4);
        dirT = Math.max(0, dirT - dt);
        if (tracer) { tracer.t -= dt; if (tracer.t <= 0) tracer = null; }

        if (P.reloading) {
            P.reloadT -= dt;
            if (P.reloadT <= 0) { P.reloading = false; P.ammo = MAG; }
        }
        if (firing && !P.reloading && P.fireT <= 0) {
            if (P.ammo > 0) shoot();
            else { Sfx.empty(); P.fireT = 0.3; startReload(); }
        }

        for (var i = 0; i < bots.length; i++) updateBot(bots[i], dt);
        for (var j = bots.length - 1; j >= 0; j--) if (bots[j].dead && bots[j].dieT > 0.55) bots.splice(j, 1);
        for (var k = spawnTimers.length - 1; k >= 0; k--) {
            spawnTimers[k] -= dt;
            if (spawnTimers[k] <= 0) { spawnTimers.splice(k, 1); spawnBot(false); }
        }
    }

    function pack(r, g, b) { return (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0); }

    function render() {
        var dirX = Math.cos(P.a), dirY = Math.sin(P.a);
        var plane = lerp(0.66, 0.36, P.scopeT);
        var planeX = -dirY * plane, planeY = dirX * plane;
        var horizon = RH / 2 + (P.pitch + P.recoil) * RH;
        var px = P.x, py = P.y, half = RH * 0.5, x, y;

        for (y = 0; y < RH; y++) {
            var p = y - horizon, ap = Math.abs(p);
            var rowDist = half / (ap < 0.5 ? 0.5 : ap);
            var ri = y * RW;
            var isFloor = p > 0;
            if (rowDist > 30) {
                var dark = isFloor ? pack(5, 6, 14) : pack(3, 3, 9);
                for (x = 0; x < RW; x++) buf32[ri + x] = dark;
                continue;
            }
            var fog = 1 / (1 + rowDist * 0.25);
            var cA, cB, cL;
            if (isFloor) { cA = pack(10 * fog + 3, 12 * fog + 3, 26 * fog + 5); cB = pack(6 * fog + 3, 8 * fog + 3, 18 * fog + 5); cL = pack(25 * fog * 0.6 + 4, 240 * fog * 0.6 + 4, 255 * fog * 0.6 + 6); }
            else { cA = cB = pack(4 * fog + 2, 4 * fog + 2, 12 * fog + 4); cL = pack(255 * fog * 0.32 + 3, 43 * fog * 0.32 + 3, 214 * fog * 0.32 + 5); }
            var fx = px + rowDist * (dirX - planeX), fy = py + rowDist * (dirY - planeY);
            var sx = rowDist * 2 * planeX / RW, sy = rowDist * 2 * planeY / RW;
            for (x = 0; x < RW; x++) {
                var cx = Math.floor(fx), cy = Math.floor(fy), u = fx - cx, v = fy - cy;
                buf32[ri + x] = (u < 0.045 || v < 0.045) ? cL : (((cx + cy) & 1) ? cA : cB);
                fx += sx; fy += sy;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        for (x = 0; x < RW; x++) {
            var camX = 2 * x / RW - 1;
            var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
            var mapX = Math.floor(px), mapY = Math.floor(py);
            var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
            var stepX, stepY, sideX, sideY;
            if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
            if (rdy < 0) { stepY = -1; sideY = (py - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }
            var hit = 0, side = 0, guard = 0;
            while (!hit && guard++ < 64) {
                if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; }
                else { sideY += ddy; mapY += stepY; side = 1; }
                hit = cellType(mapX, mapY);
            }
            var perp = side === 0 ? sideX - ddx : sideY - ddy;
            if (perp < 0.05) perp = 0.05;
            zBuf[x] = perp;
            var lineH = RH / perp;
            var top = Math.floor(horizon - lineH / 2), hgt = Math.ceil(lineH);
            var wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
            wallX -= Math.floor(wallX);

            var col = WALLC[hit] || WALLC[1];
            var m = (1 / (1 + perp * 0.14)) * (side ? 0.78 : 1);
            var neon = 'rgb(' + ((col[0] * m) | 0) + ',' + ((col[1] * m) | 0) + ',' + ((col[2] * m) | 0) + ')';
            if (wallX < 0.04 || wallX > 0.96) {
                ctx.fillStyle = neon; ctx.fillRect(x, top, 1, hgt);
            } else {
                ctx.fillStyle = 'rgb(' + ((6 + col[0] * 0.09 * m) | 0) + ',' + ((7 + col[1] * 0.09 * m) | 0) + ',' + ((12 + col[2] * 0.12 * m) | 0) + ')';
                ctx.fillRect(x, top, 1, hgt);
                ctx.fillStyle = neon;
                var tr = Math.max(1, Math.round(lineH * 0.05));
                ctx.fillRect(x, top, 1, tr);
                ctx.fillRect(x, top + hgt - tr, 1, tr);
                ctx.globalAlpha = 0.55;
                ctx.fillRect(x, Math.round(top + lineH * 0.5), 1, Math.max(1, Math.round(lineH * 0.02)));
                ctx.globalAlpha = 1;
            }
        }

        vis = [];
        var inv = 1 / (planeX * dirY - dirX * planeY);
        for (var i = 0; i < bots.length; i++) {
            var b = bots[i];
            var dx = b.x - px, dy = b.y - py;
            var tx = inv * (dirY * dx - dirX * dy);
            var ty = inv * (-planeY * dx + planeX * dy);
            if (ty < 0.15) continue;
            var sxs = (RW / 2) * (1 + tx / ty);
            var lh = RH / ty, h = lh * 0.78, w = h * 0.5;
            var bottom = horizon + lh / 2;
            vis.push({ b: b, depth: ty, left: sxs - w / 2, w: w, top: bottom - h, h: h });
        }
        vis.sort(function (a, c) { return c.depth - a.depth; });
        for (var s = 0; s < vis.length; s++) {
            var vv = vis[s], bb = vv.b;
            var tex = bb.dead || bb.hurtT > 0 ? TEX[3] : bb.flashT > 0 ? TEX[2] : TEX[Math.floor(bb.phase) % 2];
            ctx.globalAlpha = bb.dead ? Math.max(0, 1 - bb.dieT / 0.5) : 1;
            var x0 = Math.max(0, Math.floor(vv.left)), x1 = Math.min(RW - 1, Math.floor(vv.left + vv.w));
            for (var sx2 = x0; sx2 <= x1; sx2++) {
                if (vv.depth >= zBuf[sx2]) continue;
                var texX = ((sx2 - vv.left) / vv.w * 64) | 0;
                if (texX < 0 || texX > 63) continue;
                ctx.drawImage(tex, texX, 0, 1, 128, sx2, vv.top, 1, vv.h);
            }
            ctx.globalAlpha = 1;
        }

        if (tracer) {
            ctx.strokeStyle = 'rgba(25,240,255,' + (tracer.t / 0.05).toFixed(2) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(RW * 0.62, RH - 30); ctx.lineTo(tracer.x, tracer.y); ctx.stroke();
        }
        drawGun();
        if (P.scopeT > 0.02) {
            var gr = ctx.createRadialGradient(RW / 2, RH / 2, RH * 0.25, RW / 2, RH / 2, RH * 0.85);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + (0.5 * P.scopeT).toFixed(2) + ')');
            ctx.fillStyle = gr; ctx.fillRect(0, 0, RW, RH);
        }
    }

    function drawGun() {
        var s = P.scopeT;
        var lower = P.reloading ? Math.sin((1 - P.reloadT / RELOAD_TIME) * Math.PI) : 0;
        var gx = lerp(RW * 0.66, RW * 0.5, s) + Math.cos(P.walk * 0.5) * 5 * P.moveAmt * (1 - s);
        var gy = RH + 8 + Math.abs(Math.sin(P.walk)) * 4 * P.moveAmt * (1 - s) + kickT * 7 + lower * 70 + s * 26;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(-0.05 - lower * 0.35 + kickT * 0.015);
        var k = lerp(1, 0.82, s);
        ctx.scale(k, k);
        ctx.shadowColor = '#19f0ff'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#0d1020'; ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 1.6;
        ctx.fillRect(-9, -112, 18, 74); ctx.strokeRect(-9, -112, 18, 74);
        ctx.fillRect(-3, -130, 6, 20); ctx.strokeRect(-3, -130, 6, 20);
        ctx.beginPath(); ctx.moveTo(-20, -44); ctx.lineTo(20, -44); ctx.lineTo(30, 10); ctx.lineTo(-30, 10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.shadowColor = '#ff2bd6'; ctx.fillStyle = '#ff2bd6'; ctx.fillRect(-1, -138, 2, 9);
        ctx.shadowColor = '#19f0ff'; ctx.globalAlpha = 0.75; ctx.fillStyle = '#19f0ff'; ctx.fillRect(-1.5, -100, 3, 50);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        if (flashT > 0) {
            var fl = ctx.createRadialGradient(0, -140, 1, 0, -140, 30);
            fl.addColorStop(0, '#ffffff'); fl.addColorStop(0.35, '#ffe27a'); fl.addColorStop(1, 'rgba(255,170,40,0)');
            ctx.fillStyle = fl; ctx.fillRect(-34, -176, 68, 70);
        }
        ctx.restore();
    }

    var miniBase = document.createElement('canvas'); miniBase.width = 120; miniBase.height = 120;
    (function () {
        var g = miniBase.getContext('2d'), c = 5;
        g.fillStyle = 'rgba(3,4,10,0.7)'; g.fillRect(0, 0, 120, 120);
        for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
            if (MAP[y][x]) { var col = WALLC[MAP[y][x]]; g.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.55)'; g.fillRect(x * c, y * c, c, c); }
        }
    })();

    function drawMinimap() {
        var c = 5;
        mctx.clearRect(0, 0, 120, 120);
        mctx.drawImage(miniBase, 0, 0);
        if (diffKey === 'easy' && state !== 'menu') {
            mctx.fillStyle = '#ff2b3d';
            bots.forEach(function (b) { if (!b.dead) mctx.fillRect(b.x * c - 2, b.y * c - 2, 4, 4); });
        }
        var x = P.x * c, y = P.y * c;
        mctx.fillStyle = 'rgba(25,240,255,0.18)';
        mctx.beginPath(); mctx.moveTo(x, y);
        mctx.arc(x, y, 22, P.a - 0.58, P.a + 0.58); mctx.closePath(); mctx.fill();
        mctx.fillStyle = '#19f0ff';
        mctx.beginPath(); mctx.arc(x, y, 3, 0, 6.283); mctx.fill();
    }

    var cache = {};
    function setText(id, val) { if (cache[id] !== val) { cache[id] = val; $(id).textContent = val; } }
    function updateHud() {
        setText('fps-diff-label', D.label);
        setText('fps-kills', stats ? stats.kills + ' / ' + D.kills : '0 / ' + D.kills);
        setText('fps-time', fmtTime(P.time));
        setText('fps-hp-num', String(Math.max(0, Math.ceil(P.hp))));
        var bar = $('fps-hp-bar'), pct = clamp(P.hp, 0, 100) + '%';
        if (cache.bar !== pct) { cache.bar = pct; bar.style.width = pct; bar.className = P.hp < 35 ? 'low' : ''; }
        setText('fps-ammo', P.reloading ? 'RELOADING' : P.ammo + ' / \u221E');

        var gap = Math.round(spreadPx() * (canvas.clientWidth / RW)) + 5;
        if (cache.gap !== gap) { cache.gap = gap; $('fps-cross').style.setProperty('--gap', gap + 'px'); }
        $('fps-cross').classList.toggle('scoped', P.scopeT > 0.5);

        var hm = $('fps-hit');
        if (hitT <= 0 && hm.classList.contains('show')) hm.className = '';
        $('fps-vignette').style.opacity = hurtVig.toFixed(2);
        var dir = $('fps-dir');
        dir.style.opacity = dirT > 0 ? Math.min(1, dirT).toFixed(2) : '0';
        dir.style.transform = 'rotate(' + dirAng + 'rad)';
    }

    function updateMenuBest() {
        var best = null;
        try { best = JSON.parse(load('bold-fps-best-' + diffKey, 'null')); } catch (e) {}
        var txt = 'No record yet';
        if (best && best.time) txt = 'Best time: ' + fmtTime(best.time);
        else if (best && best.kills) txt = 'Most kills: ' + best.kills;
        $('fps-best').textContent = txt;
        $('fps-diff-desc').textContent = DIFFS[diffKey].desc + ' First to ' + DIFFS[diffKey].kills + ' kills wins.';
    }

    var diffBtns = stage.querySelectorAll('.fps-diff');
    function selectDiff(k) {
        diffKey = DIFFS[k] ? k : 'easy';
        D = DIFFS[diffKey];
        save('bold-fps-diff', diffKey);
        for (var i = 0; i < diffBtns.length; i++) {
            diffBtns[i].classList.toggle('active', diffBtns[i].getAttribute('data-diff') === diffKey);
        }
        updateMenuBest();
    }
    for (var di = 0; di < diffBtns.length; di++) {
        diffBtns[di].addEventListener('click', function () { selectDiff(this.getAttribute('data-diff')); });
    }
    selectDiff(diffKey);

    var sensEl = $('fps-sens'), volEl = $('fps-vol');
    sensEl.value = sens; volEl.value = parseFloat(load('bold-fps-vol', '0.7'));
    $('fps-sens-val').textContent = sens.toFixed(2);
    sensEl.addEventListener('input', function () {
        sens = parseFloat(sensEl.value);
        $('fps-sens-val').textContent = sens.toFixed(2);
        save('bold-fps-sens2', String(sens));
    });
    volEl.addEventListener('input', function () { Sfx.setVolume(parseFloat(volEl.value)); save('bold-fps-vol', volEl.value); });

    $('fps-start').addEventListener('click', startMatch);
    $('fps-again').addEventListener('click', startMatch);
    $('fps-to-menu').addEventListener('click', toMenu);
    $('fps-resume').addEventListener('click', resumeGame);
    $('fps-quit').addEventListener('click', toMenu);
    var fsBtns = stage.querySelectorAll('.fps-fs');
    function toggleFs() {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (stage.requestFullscreen) stage.requestFullscreen();
    }
    for (var fi = 0; fi < fsBtns.length; fi++) fsBtns[fi].addEventListener('click', toggleFs);

    var BLOCK = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    function onKeyDown(e) {
        if (BLOCK[e.code] && (state === 'playing' || state === 'paused')) e.preventDefault();
        if (e.repeat) return;
        keys[e.code] = true;
        if (state === 'playing') {
            if (e.code === 'KeyR') startReload();
            if (e.code === 'Escape' && noLock) pauseGame();
        } else if (state === 'paused' && e.code === 'Escape' && noLock) resumeGame();
    }
    function onKeyUp(e) { keys[e.code] = false; }
    function onMouseMove(e) {
        if (state !== 'playing' || !locked) return;
        var k = sens * (1 - P.scopeT * 0.4);
        P.a += e.movementX * 0.0007 * k;
        P.pitch = clamp(P.pitch - e.movementY * 0.001 * k, -0.32, 0.32);
    }
    function inStage(t) { return t && t.closest && t.closest('#fps-stage'); }
    function onMouseDown(e) {
        if (state !== 'playing' || !inStage(e.target)) return;
        if (e.button === 0) firing = true;
        if (e.button === 2) scoped = true;
    }
    function onMouseUp(e) {
        if (e.button === 0) firing = false;
        if (e.button === 2) scoped = false;
    }
    function onBlur() { firing = false; scoped = false; keys = {}; }
    function onContext(e) { e.preventDefault(); }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    stage.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockFail);

    function loop(now) {
        var dt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;
        update(dt);
        render();
        drawMinimap();
        updateHud();
        raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    window.__pageCleanup = function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('pointerlockchange', onLockChange);
        document.removeEventListener('pointerlockerror', onLockFail);
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        Sfx.close();
        setMatchMode(false);
        if (window.BoldMusic && window.BoldMusic.release) window.BoldMusic.release();
    };
})();
