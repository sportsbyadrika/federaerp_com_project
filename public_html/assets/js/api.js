/**
 * Shared API layer for the whole frontend.
 *  - api.*  : fetch wrapper that attaches the CSRF token, sends/receives the
 *             JSON envelope, and normalises errors.
 *  - csv.*  : client-side CSV export helper reused by every report.
 *  - printView() : trigger the browser print dialog (also "Save as PDF").
 *
 * No build step: this is a plain global script.
 */
(function () {
    'use strict';

    const state = window.__APP__ || {};
    let csrfToken = state.csrfToken || null;

    function setCsrf(token) {
        if (token) csrfToken = token;
    }

    async function request(method, url, body, opts = {}) {
        const headers = { 'Accept': 'application/json' };
        const init = { method, headers, credentials: 'same-origin' };

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            headers['X-CSRF-Token'] = csrfToken || '';
        }

        if (body instanceof FormData) {
            init.body = body; // let the browser set the multipart boundary
        } else if (body !== undefined && body !== null) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }

        let res, json;
        try {
            res = await fetch(url, init);
        } catch (networkErr) {
            throw { code: 'network_error', message: 'Network error — please check your connection.', status: 0 };
        }

        // Some endpoints (CSV/PDF/file streams) are not JSON.
        const ct = res.headers.get('Content-Type') || '';
        if (opts.raw || !ct.includes('application/json')) {
            if (!res.ok) throw { code: 'http_' + res.status, message: res.statusText, status: res.status };
            return res;
        }

        try {
            json = await res.json();
        } catch (e) {
            throw { code: 'bad_response', message: 'Malformed server response.', status: res.status };
        }

        if (!res.ok || (json && json.success === false)) {
            const err = (json && json.error) || { code: 'error', message: 'Request failed' };
            throw { ...err, status: res.status };
        }
        return json;
    }

    const api = {
        setCsrf,
        get: (url, opts) => request('GET', url, null, opts),
        post: (url, body, opts) => request('POST', url, body, opts),
        put: (url, body, opts) => request('PUT', url, body, opts),
        patch: (url, body, opts) => request('PATCH', url, body, opts),
        del: (url, body, opts) => request('DELETE', url, body, opts),
        /** Upload FormData (files). */
        upload: (url, formData) => request('POST', url, formData),
    };

    // ---- CSV export (client side, from in-memory rows) --------------------
    const csv = {
        escape(value) {
            if (value === null || value === undefined) return '';
            const s = String(value);
            if (/[",\n\r]/.test(s)) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        },
        /**
         * rows: array of objects. columns: [{key,label}] (optional; inferred
         * from the first row if omitted).
         */
        build(rows, columns) {
            if (!rows || !rows.length) return '';
            const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
            const header = cols.map(c => csv.escape(c.label)).join(',');
            const lines = rows.map(r => cols.map(c => csv.escape(r[c.key])).join(','));
            return [header, ...lines].join('\r\n');
        },
        download(filename, rows, columns) {
            const content = '﻿' + csv.build(rows, columns); // BOM for Excel
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename.endsWith('.csv') ? filename : filename + '.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        },
    };

    function printView() {
        window.print();
    }

    window.api = api;
    window.csv = csv;
    window.printView = printView;
})();
