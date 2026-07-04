/**
 * Global reactive store + tiny hash router shared by every view (no build step).
 * Feature files (dashboard, estimation, kanban, billing, documents, reports)
 * register their routes/components against window.CSApp before app.js mounts.
 */
(function () {
    'use strict';
    const { reactive } = Vue;

    const boot = window.__APP__ || {};

    const store = reactive({
        user: boot.user || null,
        appName: boot.appName || 'Construction SaaS',
        route: normalize(location.hash),
        params: {},
        flash: null,            // { type:'success'|'error', message }
        // shared lookups cached in-memory (never localStorage for app state)
        projects: [],
        activeProjectId: null,
    });

    function normalize(hash) {
        const h = (hash || '#/').replace(/^#/, '');
        return h.startsWith('/') ? h : '/' + h;
    }

    function isAuthed() { return !!store.user; }
    function role() { return store.user ? store.user.role : null; }
    function isSuperAdmin() { return role() === 'super_admin'; }

    function navigate(path) { location.hash = path; }

    function flash(type, message, ttl = 3500) {
        store.flash = { type, message };
        if (ttl) setTimeout(() => { store.flash = null; }, ttl);
    }

    window.addEventListener('hashchange', () => { store.route = normalize(location.hash); });

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
