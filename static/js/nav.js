(function () {
    var main = document.querySelector('main');
    if (!main || !window.fetch || !window.DOMParser) return;

    var loading = false;

    function samePage(a) {
        return a.pathname === location.pathname && a.search === location.search;
    }

    function wantsLink(a, e) {
        if (e.defaultPrevented || e.button !== 0) return false;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
        if (a.target && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        if (a.origin !== location.origin) return false;
        if (a.pathname.indexOf('/static/') === 0) return false;
        if (samePage(a) && a.hash) return false;
        return true;
    }

    function show(html, url, mode) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var newMain = doc.querySelector('main');
        if (!newMain) return false;

        if (typeof window.__pageCleanup === 'function') {
            try { window.__pageCleanup(); } catch (err) {}
            window.__pageCleanup = null;
        }

        document.title = doc.title;

        var newNav = doc.querySelector('.site-header nav ul');
        var nav = document.querySelector('.site-header nav ul');
        if (newNav && nav) nav.innerHTML = newNav.innerHTML;

        main.innerHTML = newMain.innerHTML;

        main.querySelectorAll('script').forEach(function (old) {
            var s = document.createElement('script');
            for (var i = 0; i < old.attributes.length; i++) {
                s.setAttribute(old.attributes[i].name, old.attributes[i].value);
            }
            s.async = false;
            s.textContent = old.textContent;
            old.parentNode.replaceChild(s, old);
        });

        if (mode === 'push') history.pushState({}, '', url);
        else if (mode === 'replace') history.replaceState({}, '', url);

        var target = null;
        try { target = location.hash && document.querySelector(location.hash); } catch (err) {}
        if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
        return true;
    }

    function go(url, options, mode) {
        if (loading) return;
        loading = true;
        fetch(url, options || {})
            .then(function (res) {
                return res.text().then(function (text) { return { text: text, url: res.url }; });
            })
            .then(function (r) {
                var m = mode;
                if (m === 'push' && r.url === location.href) m = 'replace';
                if (!show(r.text, r.url, m)) location.href = url;
            })
            .catch(function () { location.href = url; })
            .then(function () { loading = false; });
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || !wantsLink(a, e)) return;
        e.preventDefault();
        go(a.href, {}, 'push');
    });

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (e.defaultPrevented) return;
        if ((form.method || 'get').toLowerCase() !== 'post') return;
        var action = new URL(form.getAttribute('action') || location.href, location.href);
        if (action.origin !== location.origin) return;

        var data;
        try { data = new FormData(form, e.submitter); }
        catch (err) { return; }

        e.preventDefault();
        go(action.href, { method: 'POST', body: data }, 'push');
    });

    window.addEventListener('popstate', function () {
        go(location.href, {}, 'none');
    });
})();
