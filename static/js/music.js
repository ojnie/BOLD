(function () {
    var SRC     = '/static/audio/maui-wowie.mp3';
    var VOLUME  = 0.45;
    var XFADE   = 6;

    var KEY = 'bold-music';
    var a = new Audio(SRC), b = new Audio(SRC);
    [a, b].forEach(function (el) { el.preload = 'auto'; el.volume = 0; });
    var cur = a, other = b;

    var btn = document.getElementById('music-toggle');
    var muted = false, started = false;
    var suspended = false;
    var suspendList = [];
    var master = 0, masterTarget = 0;
    var resumeList = [];
    var resumeInfo = null;

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                muted: muted,
                t: cur.currentTime || 0,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function showState() {
        if (btn) btn.classList.toggle('is-on', started && !muted && !suspended);
    }

    function onEnded(el) {
        return function () {
            if (el === cur) { var t = cur; cur = other; other = t; }
        };
    }
    a.addEventListener('ended', onEnded(a));
    b.addEventListener('ended', onEnded(b));

    setInterval(function () {
        master += (masterTarget - master) * (masterTarget > master ? 0.1 : 0.15);
        if (Math.abs(masterTarget - master) < 0.002) master = masterTarget;

        [a, b].forEach(function (el) {
            if (el.paused) { el.volume = 0; return; }
            var d = el.duration, t = el.currentTime, g = 1;
            if (d) {
                if (el.xin && t < XFADE) g *= Math.sin((t / XFADE) * Math.PI / 2);
                var rem = d - t;
                if (rem < XFADE) g *= Math.cos((1 - rem / XFADE) * Math.PI / 2);
            }
            el.volume = Math.max(0, Math.min(1, VOLUME * master * g));
        });

        if (started && !cur.paused && cur.duration && cur.duration - cur.currentTime <= XFADE && other.paused) {
            other.currentTime = 0;
            other.xin = true;
            other.play().catch(function () {});
        }
    }, 50);

    setInterval(function () { if (started) save(); }, 500);
    window.addEventListener('pagehide', function () { if (started) save(); });

    function applyResume() {
        if (!resumeInfo || !a.duration) return;
        var t = resumeInfo.t + (Date.now() - resumeInfo.ts) / 1000;
        a.currentTime = t % a.duration;
        resumeInfo = null;
    }

    function tryPlay() {
        if (muted || suspended) return;
        cur.play().then(function () {
            started = true;
            masterTarget = 1;
            showState();
        }).catch(function () {
            var go = function () {
                document.removeEventListener('pointerdown', go);
                document.removeEventListener('keydown', go);
                applyResume();
                tryPlay();
            };
            document.addEventListener('pointerdown', go);
            document.addEventListener('keydown', go);
        });
    }

    function mute() {
        if (suspended) { muted = true; save(); showState(); return; }
        muted = true;
        masterTarget = 0;
        resumeList = [a, b].filter(function (el) { return !el.paused; });
        save();
        showState();
        setTimeout(function () {
            if (muted) { a.pause(); b.pause(); }
        }, 500);
    }

    function unmute() {
        muted = false;
        if (suspended) { save(); showState(); return; }
        started = true;
        masterTarget = 1;
        var list = resumeList.length ? resumeList : [cur];
        list.forEach(function (el) { el.play().catch(function () {}); });
        save();
        showState();
    }

    if (btn) {
        btn.addEventListener('click', function () { if (muted) unmute(); else mute(); });
    }

    function suspend() {
        if (suspended) return;
        suspended = true;
        masterTarget = 0;
        suspendList = [a, b].filter(function (el) { return !el.paused; });
        showState();
        setTimeout(function () {
            if (suspended) { a.pause(); b.pause(); }
        }, 450);
    }

    function release() {
        if (!suspended) return;
        suspended = false;
        showState();
        if (muted || !started) return;
        masterTarget = 1;
        var list = suspendList.length ? suspendList : [cur];
        list.forEach(function (el) { el.play().catch(function () {}); });
        suspendList = [];
    }

    window.BoldMusic = {
        enter: function () { if (!muted) tryPlay(); },
        suspend: suspend,
        release: release,
        state: function () {
            return { suspended: suspended, muted: muted, playing: !a.paused || !b.paused };
        }
    };

    var saved = load();
    muted = !!saved.muted;
    showState();

    var entered = false;
    try { entered = !!sessionStorage.getItem('bold-entered'); } catch (e) {}

    if (!muted) {
        resumeInfo = entered && saved.t ? { t: saved.t, ts: saved.ts || Date.now() } : null;
        a.addEventListener('loadedmetadata', function () {
            applyResume();
            tryPlay();
        }, { once: true });
    }

    function firstGesture() {
        document.removeEventListener('pointerdown', firstGesture);
        document.removeEventListener('keydown', firstGesture);
        try { sessionStorage.setItem('bold-entered', '1'); } catch (e) {}
        if (!muted && !suspended && !started) tryPlay();
    }
    document.addEventListener('pointerdown', firstGesture);
    document.addEventListener('keydown', firstGesture);
})();
