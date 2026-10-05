// Nyan cat cursor: replaces the normal cursor, follows the mouse smoothly,
// and leaves a rainbow trail that fades away.
(function () {
    // ---------- settings you can change ----------
    var CAT_WIDTH   = 34;    // cat size in pixels (a normal cursor is about 20-32)
    var TRAIL_LIFE  = 450;   // how long the rainbow stays, in milliseconds
    var SMOOTHNESS  = 35;    // follow delay in ms: lower = tighter, higher = floatier
    var COLORS = ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'];
    // ---------------------------------------------

    // skip on touch screens and for people who prefer less motion
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var catHeight = CAT_WIDTH * 232 / 320;      // keeps the GIF's proportions
    var stripeH = CAT_WIDTH * 0.075;            // rainbow stripe thickness scales with the cat

    // hide the real cursor everywhere (links, buttons, text boxes too)
    var hideStyle = document.createElement('style');
    hideStyle.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(hideStyle);

    // canvas for the rainbow
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
                           'pointer-events:none;z-index:9998;';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    function resize() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // the cat
    var cat = document.createElement('img');
    cat.src = '/static/images/nyan-cat.gif';
    cat.alt = '';
    cat.draggable = false;
    cat.style.cssText = 'position:fixed;top:0;left:0;width:' + CAT_WIDTH + 'px;' +
                        'pointer-events:none;z-index:9999;display:none;' +
                        'image-rendering:pixelated;will-change:transform;';
    // if the image can't load, give the normal cursor back
    cat.onerror = function () {
        hideStyle.remove();
        cat.remove();
        canvas.remove();
        stopped = true;
    };
    document.body.appendChild(cat);

    var stopped = false;
    var mouseX = 0, mouseY = 0;     // real mouse position
    var catX = 0, catY = 0;         // smoothed position the cat is drawn at
    var started = false;
    var points = [];               // the trail: {x, y, time}
    var suppressed = false;        // true while the mouse is over a game
    var lastTime = performance.now();

    document.addEventListener('pointermove', function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        suppressed = !!(e.target && e.target.closest && e.target.closest('.no-cat-cursor'));
        if (!started) {
            catX = mouseX;
            catY = mouseY;
            started = true;
            cat.style.display = 'block';
        }
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', function () {
        cat.style.display = 'none';
        started = false;
    });

    function frame(now) {
        if (stopped) return;
        var dt = Math.min(now - lastTime, 50);   // ms since last frame (capped)
        lastTime = now;

        if (started) {
            // smooth follow that feels the same at 60, 120 or 144 fps
            var k = 1 - Math.exp(-dt / SMOOTHNESS);
            catX += (mouseX - catX) * k;
            catY += (mouseY - catY) * k;

            // the cat is centered on the pointer so clicks land where you aim
            cat.style.display = suppressed ? 'none' : 'block';
            cat.style.transform = 'translate3d(' + (catX - CAT_WIDTH / 2) + 'px,' +
                                  (catY - catHeight / 2) + 'px,0)';

            // the rainbow starts at the back of the cat's body
            var tailX = catX - CAT_WIDTH * 0.32;
            var tailY = catY - catHeight * 0.05;
            var last = points[points.length - 1];
            if (!suppressed && (!last || Math.abs(last.x - tailX) + Math.abs(last.y - tailY) > 0.3)) {
                points.push({ x: tailX, y: tailY, time: now });
            }
        }

        // forget trail points that are too old
        while (points.length && now - points[0].time > TRAIL_LIFE) points.shift();

        // draw the trail as smooth curves
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.lineWidth = stripeH + 0.6;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        for (var i = 2; i < points.length; i++) {
            var p0 = points[i - 2], p1 = points[i - 1], p2 = points[i];
            var sx = (p0.x + p1.x) / 2, sy = (p0.y + p1.y) / 2;   // curve start
            var ex = (p1.x + p2.x) / 2, ey = (p1.y + p2.y) / 2;   // curve end
            ctx.globalAlpha = Math.max(0, 1 - (now - p1.time) / TRAIL_LIFE);
            for (var s = 0; s < COLORS.length; s++) {
                var off = (s - (COLORS.length - 1) / 2) * stripeH;
                ctx.strokeStyle = COLORS[s];
                ctx.beginPath();
                ctx.moveTo(sx, sy + off);
                ctx.quadraticCurveTo(p1.x, p1.y + off, ex, ey + off);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
