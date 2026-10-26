(function () {
    var CAT_WIDTH   = 34;
    var TRAIL_LIFE  = 450;
    var SMOOTHNESS  = 35;
    var COLORS = ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'];

    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var catHeight = CAT_WIDTH * 232 / 320;
    var stripeH = CAT_WIDTH * 0.075;

    var hideStyle = document.createElement('style');
    hideStyle.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(hideStyle);

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

    var cat = document.createElement('img');
    cat.src = '/static/images/nyan-cat.gif';
    cat.alt = '';
    cat.draggable = false;
    cat.style.cssText = 'position:fixed;top:0;left:0;width:' + CAT_WIDTH + 'px;' +
                        'pointer-events:none;z-index:9999;display:none;' +
                        'image-rendering:pixelated;will-change:transform;';
    cat.onerror = function () {
        hideStyle.remove();
        cat.remove();
        canvas.remove();
        stopped = true;
    };
    document.body.appendChild(cat);

    var stopped = false;
    var mouseX = 0, mouseY = 0;
    var catX = 0, catY = 0;
    var started = false;
    var points = [];
    var suppressed = false;
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
        var dt = Math.min(now - lastTime, 50);
        lastTime = now;

        if (started) {
            var k = 1 - Math.exp(-dt / SMOOTHNESS);
            catX += (mouseX - catX) * k;
            catY += (mouseY - catY) * k;

            cat.style.display = suppressed ? 'none' : 'block';
            cat.style.transform = 'translate3d(' + (catX - CAT_WIDTH / 2) + 'px,' +
                                  (catY - catHeight / 2) + 'px,0)';

            var tailX = catX - CAT_WIDTH * 0.32;
            var tailY = catY - catHeight * 0.05;
            var last = points[points.length - 1];
            if (!suppressed && (!last || Math.abs(last.x - tailX) + Math.abs(last.y - tailY) > 0.3)) {
                points.push({ x: tailX, y: tailY, time: now });
            }
        }

        while (points.length && now - points[0].time > TRAIL_LIFE) points.shift();

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.lineWidth = stripeH + 0.6;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        for (var i = 2; i < points.length; i++) {
            var p0 = points[i - 2], p1 = points[i - 1], p2 = points[i];
            var sx = (p0.x + p1.x) / 2, sy = (p0.y + p1.y) / 2;
            var ex = (p1.x + p2.x) / 2, ey = (p1.y + p2.y) / 2;
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
