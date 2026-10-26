(function () {
    var stage = document.getElementById('game-stage');
    if (!stage) return;

    var canvas = document.getElementById('game-canvas');
    var ctx = canvas.getContext('2d');
    var catImg = document.getElementById('game-cat');
    var helpEl = document.getElementById('game-help');
    var tabs = document.querySelectorAll('.game-tab');

    var W = 720, H = 432;
    var CAT_RATIO = 232 / 320;
    var COLORS = ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'];
    var CYAN = '#19f0ff', MAGENTA = '#ff2bd6';

    (function setupCanvas() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    })();

    var sfxOn = true;
    try { sfxOn = localStorage.getItem('bold-sfx') !== 'off'; } catch (e) {}
    var ac = null;
    function audioInit() {
        if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
        if (ac && ac.state === 'suspended') ac.resume();
    }
    function blip(freq, dur, type, vol, slide, delay) {
        if (!sfxOn || !ac) return;
        var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
        g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    var Sfx = {
        flap: function () { blip(380, 0.12, 'triangle', 0.14, 760); },
        point: function () { blip(988, 0.07, 'square', 0.1); blip(1319, 0.14, 'square', 0.1, 0, 0.07); },
        die: function () { blip(300, 0.4, 'sawtooth', 0.16, 60); blip(120, 0.35, 'square', 0.12, 40, 0.1); },
        eat: function () { blip(520, 0.06, 'square', 0.12, 1040); blip(780, 0.1, 'triangle', 0.14, 1560, 0.05); },
        jump: function () { blip(260, 0.18, 'square', 0.11, 700); }
    };
    var sfxBtn = document.getElementById('sfx-toggle');
    function showSfx() {
        if (!sfxBtn) return;
        sfxBtn.classList.toggle('on', sfxOn);
        sfxBtn.textContent = sfxOn ? '\uD83D\uDD0A Sound FX: on' : '\uD83D\uDD07 Sound FX: off';
    }
    if (sfxBtn) sfxBtn.addEventListener('click', function () {
        sfxOn = !sfxOn; audioInit();
        try { localStorage.setItem('bold-sfx', sfxOn ? 'on' : 'off'); } catch (e) {}
        showSfx(); if (sfxOn) Sfx.point();
    });
    showSfx();

    function loadBest(key) { try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; } }
    function saveBest(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function placeCat(x, y, w, rot, flip) {
        var s = canvas.clientWidth / W;
        var h = w * CAT_RATIO;
        catImg.style.display = 'block';
        catImg.style.width = (w * s) + 'px';
        catImg.style.transform = 'translate(' + ((x - w / 2) * s) + 'px,' + ((y - h / 2) * s) + 'px)' +
                                 ' rotate(' + (rot || 0) + 'rad) scaleX(' + (flip ? -1 : 1) + ')';
    }

    function drawBackground(offset) {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#04050c');
        g.addColorStop(1, '#0a0716');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(25, 240, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = -(offset % 40); x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (var y = 0; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
    }

    function text(str, x, y, size, color, align) {
        ctx.font = '800 ' + size + 'px Orbitron, "Segoe UI", sans-serif';
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillText(str, x, y);
        ctx.shadowBlur = 0;
    }

    function hud(score, best, label) {
        text(label + ' ' + score, 18, 24, 16, '#ffffff', 'left');
        text('BEST ' + best, W - 18, 24, 16, '#8c93bd', 'right');
    }

    function overlay(title, sub, color) {
        ctx.fillStyle = 'rgba(3, 4, 10, 0.62)';
        ctx.fillRect(0, 0, W, H);
        text(title, W / 2, H / 2 - 24, 38, color);
        text(sub, W / 2, H / 2 + 28, 15, '#c9cffa');
    }

    function neonRect(x, y, w, h, color) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;
    }

    function updateTrail(trail, shift, ax, ay, maxLen) {
        for (var i = 0; i < trail.length; i++) trail[i].x -= shift;
        trail.push({ x: ax, y: ay });
        while (trail.length && trail[0].x < ax - maxLen) trail.shift();
    }

    function drawTrail(trail) {
        var sh = 4;
        ctx.lineWidth = sh + 0.6;
        ctx.lineCap = 'butt';
        for (var i = 1; i < trail.length; i++) {
            ctx.globalAlpha = (i / trail.length) * 0.95;
            for (var s = 0; s < COLORS.length; s++) {
                var off = (s - (COLORS.length - 1) / 2) * sh;
                ctx.strokeStyle = COLORS[s];
                ctx.beginPath();
                ctx.moveTo(trail[i - 1].x, trail[i - 1].y + off);
                ctx.lineTo(trail[i].x, trail[i].y + off);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function overlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function makeFlappy() {
        var X = 170, GRAVITY = 1500, FLAP = -430, SPEED = 190, GAP = 156, PW = 62, SPACING = 250;
        var BEST_KEY = 'bold-best-flappy';
        var g = { id: 'flappy', help: 'Click, tap or press Space to flap. Slip the cat through the neon gaps.' };
        var state, y, vy, pipes, trail, score, best = loadBest(BEST_KEY), bg, t, overAt, pipeCount;

        g.reset = function () {
            state = 'ready'; y = H / 2; vy = 0; pipes = []; trail = []; score = 0; bg = 0; t = 0; pipeCount = 0;
        };

        function spawn() {
            var gapY = 40 + GAP / 2 + Math.random() * (H - 80 - GAP);
            pipes.push({ x: W + 20, gapY: gapY, passed: false, color: pipeCount++ % 2 ? MAGENTA : CYAN });
        }

        function die(now) {
            Sfx.die();
            state = 'over'; overAt = now || performance.now();
            if (score > best) { best = score; saveBest(BEST_KEY, best); }
        }

        g.press = function () {
            var now = performance.now();
            if (state === 'over') { if (now - overAt < 350) return; g.reset(); }
            state = 'play';
            vy = FLAP;
            Sfx.flap();
        };
        g.key = function (code) {
            if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') g.press();
        };

        g.update = function (dt) {
            t += dt;
            if (state === 'ready') { y = H / 2 + Math.sin(t * 3) * 8; bg += 40 * dt; return; }
            if (state === 'over') return;

            bg += SPEED * dt;
            vy += GRAVITY * dt;
            y += vy * dt;

            if (!pipes.length || pipes[pipes.length - 1].x < W - SPACING) spawn();
            for (var i = 0; i < pipes.length; i++) pipes[i].x -= SPEED * dt;
            while (pipes.length && pipes[0].x < -PW - 20) pipes.shift();

            updateTrail(trail, SPEED * dt, X - 24, y, 150);

            var box = { x: X - 18, y: y - 12, w: 36, h: 24 };
            if (y < 12 || y > H - 12) { die(); return; }
            for (var j = 0; j < pipes.length; j++) {
                var p = pipes[j];
                if (!p.passed && p.x + PW < X) { p.passed = true; score++; Sfx.point(); }
                var top = { x: p.x, y: 0, w: PW, h: p.gapY - GAP / 2 };
                var bottom = { x: p.x, y: p.gapY + GAP / 2, w: PW, h: H - (p.gapY + GAP / 2) };
                if (overlap(box, top) || overlap(box, bottom)) { die(); return; }
            }
        };

        g.draw = function () {
            drawBackground(bg);
            pipes.forEach(function (p) {
                var topH = p.gapY - GAP / 2, botY = p.gapY + GAP / 2;
                neonRect(p.x, -4, PW, topH + 4, p.color);
                neonRect(p.x - 6, topH - 22, PW + 12, 22, p.color);
                neonRect(p.x, botY, PW, H - botY + 4, p.color);
                neonRect(p.x - 6, botY, PW + 12, 22, p.color);
            });
            drawTrail(trail);
            placeCat(X, y, 56, clamp(vy / 900, -0.35, 0.5), false);
            hud(score, best, 'SCORE');
            if (state === 'ready') overlay('FLAPPY NEON', 'Click or press SPACE to start', CYAN);
            if (state === 'over') overlay('GAME OVER', 'Score ' + score + '  |  Press SPACE to retry', MAGENTA);
        };

        g.playing = function () { return state === 'play'; };
        g.reset();
        return g;
    }

    function makeSnake() {
        var CELL = 24, COLS = 30, ROWS = 18;
        var BEST_KEY = 'bold-best-snake';
        var g = { id: 'snake', help: 'Arrow keys or WASD to steer (swipe on touch). Eat catmeals and your rainbow grows.' };
        var state, segs, dir, queue, food, score, best = loadBest(BEST_KEY), acc, stepMs, colorCounter,
            oldTail, ateLast, overAt, pulse;

        g.reset = function () {
            state = 'ready'; dir = { x: 1, y: 0 }; queue = []; score = 0; acc = 0; stepMs = 120;
            colorCounter = 0; oldTail = null; ateLast = false; pulse = 0;
            segs = [];
            for (var i = 0; i < 4; i++) segs.push({ x: 8 - i, y: 9, c: 0 });
            for (var k = segs.length - 1; k >= 0; k--) segs[k].c = colorCounter++ % 6;
            placeFood();
        };

        function placeFood() {
            var x, y, ok;
            do {
                x = Math.floor(Math.random() * COLS);
                y = Math.floor(Math.random() * ROWS);
                ok = !segs.some(function (s) { return s.x === x && s.y === y; });
            } while (!ok);
            food = { x: x, y: y };
        }

        function die() {
            Sfx.die();
            state = 'over'; overAt = performance.now();
            if (score > best) { best = score; saveBest(BEST_KEY, best); }
        }

        function step() {
            if (queue.length) dir = queue.shift();
            var head = segs[0];
            var nx = head.x + dir.x, ny = head.y + dir.y;
            var eating = nx === food.x && ny === food.y;

            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { die(); return; }
            var limit = eating ? segs.length : segs.length - 1;
            for (var i = 0; i < limit; i++) {
                if (segs[i].x === nx && segs[i].y === ny) { die(); return; }
            }

            segs.unshift({ x: nx, y: ny, c: colorCounter++ % 6 });
            if (eating) {
                score++; ateLast = true; oldTail = null; Sfx.eat();
                stepMs = Math.max(65, stepMs - 3);
                placeFood();
            } else {
                ateLast = false;
                oldTail = segs.pop();
            }
        }

        function turn(nd) {
            var base = queue.length ? queue[queue.length - 1] : dir;
            if (nd.x === -base.x && nd.y === -base.y) return;
            if (nd.x === base.x && nd.y === base.y) return;
            if (queue.length < 2) queue.push(nd);
        }

        g.press = function () {
            var now = performance.now();
            if (state === 'over') { if (now - overAt < 350) return; g.reset(); }
            if (state === 'ready' || state === 'over') state = 'play';
        };

        g.key = function (code) {
            var map = {
                ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
                ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
                ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
                ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 }
            };
            if (code === 'Space') { g.press(); return; }
            if (map[code]) {
                if (state === 'ready') state = 'play';
                if (state === 'play') turn(map[code]);
            }
        };

        g.swipe = function (dx, dy) {
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return false;
            if (state === 'ready') state = 'play';
            if (Math.abs(dx) > Math.abs(dy)) turn({ x: dx > 0 ? 1 : -1, y: 0 });
            else turn({ x: 0, y: dy > 0 ? 1 : -1 });
            return true;
        };

        g.update = function (dt) {
            pulse += dt;
            if (state !== 'play') return;
            acc += dt * 1000;
            while (acc >= stepMs && state === 'play') { acc -= stepMs; step(); }
        };

        function piece(x, y, w, h, color) {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.fillRect(x, y, w, h);
            ctx.shadowBlur = 0;
        }

        function drawCatmeal(cx, cy) {
            var bob = Math.sin(pulse * 4) * 1.5;
            ctx.save();
            ctx.translate(cx, cy + bob);
            ctx.scale(1.7, 1.7);
            ctx.shadowColor = MAGENTA; ctx.shadowBlur = 14;
            ctx.fillStyle = 'rgba(255, 43, 214, 0.35)';
            ctx.strokeStyle = MAGENTA; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, -1, 9, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.shadowColor = '#ffe27a';
            ctx.fillStyle = '#ffe27a';
            ctx.beginPath(); ctx.ellipse(0, -2, 8, 4, 0, Math.PI, 0); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff3c4';
            ctx.fillRect(-4, -5, 2, 2); ctx.fillRect(1, -6, 2, 2); ctx.fillRect(4, -4, 2, 2);
            ctx.restore();
        }

        g.draw = function () {
            drawBackground(0);
            var offX = (W - COLS * CELL) / 2, offY = (H - ROWS * CELL) / 2;
            ctx.save();
            ctx.translate(offX, offY);

            ctx.strokeStyle = 'rgba(25, 240, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.strokeRect(-1, -1, COLS * CELL + 2, ROWS * CELL + 2);

            drawCatmeal(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);

            var t = state === 'play' ? clamp(acc / stepMs, 0, 1) : 1;
            var n = segs.length;
            var inset = 1;

            if (oldTail && state === 'play') {
                var nt = segs[n - 1];
                var r = 1 - t;
                var dx = nt.x - oldTail.x, dy = nt.y - oldTail.y;
                var ox = oldTail.x * CELL, oy = oldTail.y * CELL, w = CELL, h = CELL;
                if (dx === 1) { ox += CELL * t; w = CELL * r; }
                else if (dx === -1) { w = CELL * r; }
                else if (dy === 1) { oy += CELL * t; h = CELL * r; }
                else if (dy === -1) { h = CELL * r; }
                piece(ox + inset, oy + inset, w - inset * 2 > 0 ? w - inset * 2 : 0, h - inset * 2 > 0 ? h - inset * 2 : 0, COLORS[oldTail.c]);
            }

            for (var i = n - 1; i >= 0; i--) {
                var s = segs[i], x = s.x * CELL, y = s.y * CELL, w2 = CELL, h2 = CELL;
                if (i === 0 && n > 1 && state === 'play') {
                    var hx = s.x - segs[1].x, hy = s.y - segs[1].y;
                    if (hx === 1) { w2 = CELL * t; }
                    else if (hx === -1) { x += CELL * (1 - t); w2 = CELL * t; }
                    else if (hy === 1) { h2 = CELL * t; }
                    else if (hy === -1) { y += CELL * (1 - t); h2 = CELL * t; }
                }
                piece(x + inset, y + inset, Math.max(0, w2 - inset * 2), Math.max(0, h2 - inset * 2), COLORS[s.c]);
            }

            var head = segs[0];
            var hcx = head.x * CELL + CELL / 2, hcy = head.y * CELL + CELL / 2;
            if (n > 1 && state === 'play') {
                var px = segs[1].x * CELL + CELL / 2, py = segs[1].y * CELL + CELL / 2;
                hcx = px + (hcx - px) * t;
                hcy = py + (hcy - py) * t;
            }
            ctx.restore();

            var rot = dir.y === -1 ? -0.45 : dir.y === 1 ? 0.45 : 0;
            placeCat(offX + hcx, offY + hcy, 46, rot, dir.x === -1);

            hud(score, best, 'CATMEALS');
            if (state === 'ready') overlay('NYAN SNAKE', 'Press SPACE or an arrow key to start', CYAN);
            if (state === 'over') overlay('GAME OVER', 'Catmeals ' + score + '  |  Press SPACE to retry', MAGENTA);
        };

        g.playing = function () { return state === 'play'; };
        g.reset();
        return g;
    }

    function makeHurdle() {
        var GROUND = H - 78, X = 120, CAT_W = 64, CAT_H = CAT_W * CAT_RATIO;
        var GRAV = 2600, JUMP = -860;
        var BEST_KEY = 'bold-best-hurdle';
        var g = { id: 'hurdle', help: 'Press Space, Up arrow or tap to jump. Clear the hurdles and keep running.' };
        var state, lift, vy, obstacles, trail, time, distance, speed, nextGap, best = loadBest(BEST_KEY), overAt, bg;

        g.reset = function () {
            state = 'ready'; lift = 0; vy = 0; obstacles = []; trail = [];
            time = 0; distance = 0; speed = 300; nextGap = 300; bg = 0;
        };

        function score() { return Math.floor(distance / 12); }

        function spawn() {
            var kind = Math.floor(Math.random() * 3), parts;
            if (kind === 0) parts = [{ dx: 0, w: 16, h: 42 }];
            else if (kind === 1) parts = [{ dx: 0, w: 18, h: 62 }];
            else parts = [{ dx: 0, w: 16, h: 42 }, { dx: 34, w: 16, h: 42 }];
            obstacles.push({ x: W + 20, parts: parts, color: kind === 1 ? CYAN : MAGENTA });
            nextGap = speed * 0.65 + 180 + Math.random() * 260;
        }

        function die() {
            Sfx.die();
            state = 'over'; overAt = performance.now();
            if (score() > best) { best = score(); saveBest(BEST_KEY, best); }
        }

        g.press = function () {
            var now = performance.now();
            if (state === 'over') { if (now - overAt < 350) return; g.reset(); }
            if (state === 'ready') state = 'play';
            if (lift <= 0) { vy = JUMP; lift = 0.001; Sfx.jump(); }
        };
        g.key = function (code) {
            if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') g.press();
        };

        g.update = function (dt) {
            if (state === 'ready') { bg += 60 * dt; return; }
            if (state === 'over') return;

            time += dt;
            speed = Math.min(720, 300 + time * 8);
            distance += speed * dt;
            bg += speed * dt;

            if (lift > 0) {
                vy += GRAV * dt;
                lift -= vy * dt;
                if (lift <= 0) { lift = 0; vy = 0; }
            }

            for (var i = 0; i < obstacles.length; i++) obstacles[i].x -= speed * dt;
            while (obstacles.length && obstacles[0].x < -120) obstacles.shift();
            var last = obstacles[obstacles.length - 1];
            if (!last || last.x < W - nextGap) spawn();

            var cy = GROUND - CAT_H / 2 + 4 - lift;
            updateTrail(trail, speed * dt, X - 26, cy, 150);

            var box = { x: X - 18, y: cy - 13, w: 36, h: 26 };
            for (var j = 0; j < obstacles.length; j++) {
                var o = obstacles[j];
                for (var k = 0; k < o.parts.length; k++) {
                    var p = o.parts[k];
                    if (overlap(box, { x: o.x + p.dx, y: GROUND - p.h, w: p.w, h: p.h })) { die(); return; }
                }
            }
        };

        g.draw = function () {
            drawBackground(bg * 0.4);

            ctx.strokeStyle = CYAN; ctx.lineWidth = 3; ctx.shadowColor = CYAN; ctx.shadowBlur = 14;
            ctx.beginPath(); ctx.moveTo(0, GROUND + 4); ctx.lineTo(W, GROUND + 4); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(25, 240, 255, 0.35)'; ctx.lineWidth = 2;
            ctx.beginPath();
            for (var x = -(bg % 60); x < W; x += 60) { ctx.moveTo(x, GROUND + 18); ctx.lineTo(x + 22, GROUND + 18); }
            ctx.stroke();

            obstacles.forEach(function (o) {
                o.parts.forEach(function (p) { neonRect(o.x + p.dx, GROUND - p.h, p.w, p.h, o.color); });
            });

            drawTrail(trail);

            var cy = GROUND - CAT_H / 2 + 4 - lift;
            placeCat(X, cy, CAT_W, lift > 0 ? clamp(vy / 4000, -0.25, 0.25) : 0, false);

            hud(score(), best, 'SCORE');
            if (state === 'ready') overlay('HURDLE CAT', 'Press SPACE or tap to run', CYAN);
            if (state === 'over') overlay('GAME OVER', 'Score ' + score() + '  |  Press SPACE to retry', MAGENTA);
        };

        g.playing = function () { return state === 'play'; };
        g.reset();
        return g;
    }

    var games = { flappy: makeFlappy(), snake: makeSnake(), hurdle: makeHurdle() };
    var current = games.flappy;

    function select(id) {
        current = games[id] || games.flappy;
        current.reset();
        helpEl.textContent = current.help;
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-game') === current.id);
        }
    }
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () { select(this.getAttribute('data-game')); });
    }
    select('flappy');

    var GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    function onKey(e) {
        audioInit();
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (GAME_KEYS.indexOf(e.code) !== -1) e.preventDefault();
        if (!e.repeat) current.key(e.code);
    }
    window.addEventListener('keydown', onKey);

    var touchStart = null;
    function onDown(e) { touchStart = { x: e.clientX, y: e.clientY }; }
    function onUp(e) {
        audioInit();
        if (!touchStart) return;
        var dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
        touchStart = null;
        if (current.swipe && current.swipe(dx, dy)) return;
        current.press();
    }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);

    var raf, last = performance.now();
    var wasPlaying = false;
    function syncMusic() {
        var p = current.playing();
        if (p === wasPlaying) return;
        wasPlaying = p;
        if (!window.BoldMusic) return;
        if (p) window.BoldMusic.suspend(); else window.BoldMusic.release();
    }
    function loop(now) {
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        current.update(dt);
        syncMusic();
        current.draw();
        raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    window.__pageCleanup = function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        if (window.BoldMusic) window.BoldMusic.release();
        if (ac) { try { ac.close(); } catch (e) {} ac = null; }
    };
})();
