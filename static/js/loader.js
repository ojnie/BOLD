// Intro screen: the ENTER button hides it and starts the music
// (browsers only allow sound after the visitor clicks something).
(function () {
    var loader = document.getElementById('loader');
    var btn = document.getElementById('enter-btn');
    if (!loader || !btn) return;

    function enter() {
        try { sessionStorage.setItem('bold-entered', '1'); } catch (e) {}
        if (window.BoldMusic) window.BoldMusic.enter();
        loader.classList.add('done');
        setTimeout(function () { loader.remove(); }, 800);
    }

    btn.addEventListener('click', enter);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && document.body.contains(loader)) enter();
    });
})();
