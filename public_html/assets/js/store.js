/**
 * Global reactive store + tiny hash router shared by every view (no build step).
 * Feature files (dashboard, estimation, kanban, billing, documents, reports)
 * register their routes/components against window.CSApp before app.js mounts.
 */
(function () {
    'use strict';
    const { reactive } = Vue;

    const boot = window.__APP__ || {};

    const first = parseHash(location.hash);
    const store = reactive({
        user: boot.user || null,
        appName: boot.appName || 'Construction SaaS',
        route: first.path,
        query: first.query,     // parsed hash query params (e.g. #/reset?token=..)
        params: {},
        flash: null,            // { type:'success'|'error', message }
        config: { captcha_enabled: false, recaptcha_site_key: '', app_name: '' },
        // shared lookups cached in-memory (never localStorage for app state)
        projects: [],
        activeProjectId: null,
    });

    function parseHash(hash) {
        const h = (hash || '#/').replace(/^#/, '');
        const qi = h.indexOf('?');
        const rawPath = qi === -1 ? h : h.slice(0, qi);
        const qs = qi === -1 ? '' : h.slice(qi + 1);
        const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
        const query = {};
        if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
        return { path: path || '/', query };
    }
    function normalize(hash) { return parseHash(hash).path; }

    // Load public front-end config (reCAPTCHA site key, app name) once.
    async function loadConfig() {
        try {
            const r = await api.get('/api/config');
            store.config = r.data;
            if (r.data.app_name) store.appName = r.data.app_name;
            if (r.data.csrf_token) api.setCsrf(r.data.csrf_token);
        } catch (e) { /* keep defaults */ }
    }
    loadConfig();

    function isAuthed() { return !!store.user; }
    function role() { return store.user ? store.user.role : null; }
    function isSuperAdmin() { return role() === 'super_admin'; }

    function navigate(path) { location.hash = path; }

    function flash(type, message, ttl = 3500) {
        store.flash = { type, message };
        if (ttl) setTimeout(() => { store.flash = null; }, ttl);
    }

    window.addEventListener('hashchange', () => { const h = parseHash(location.hash); store.route = h.path; store.query = h.query; });

    // Route registry: path (string or regex) -> component name.
    const routes = [];
    const CSApp = {
        store, navigate, flash, isAuthed, role, isSuperAdmin,
        /** Register a route + its global component definition. */
        route(path, componentName, componentDef) {
            routes.push({ path, name: componentName });
            if (componentDef) this._pending.push([componentName, componentDef]);
        },
        _pending: [],
        routes,
        /** Match the current route to a component name (+ set params). */
        resolve(app) {
            const current = store.route;
            for (const r of routes) {
                if (typeof r.path === 'string') {
                    if (r.path === current) { store.params = {}; return r.name; }
                    // support "/estimates/:id"
                    const m = matchPattern(r.path, current);
                    if (m) { store.params = m; return r.name; }
                }
            }
            return null;
        },
        installPending(app) {
            this._pending.forEach(([name, def]) => app.component(name, def));
            this._pending = [];
        },
    };

    function matchPattern(pattern, path) {
        if (!pattern.includes(':')) return null;
        const pp = pattern.split('/'), cp = path.split('/');
        if (pp.length !== cp.length) return null;
        const params = {};
        for (let i = 0; i < pp.length; i++) {
            if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(cp[i]);
            else if (pp[i] !== cp[i]) return null;
        }
        return params;
    }

    window.store = store;
    window.CSApp = CSApp;
})();
