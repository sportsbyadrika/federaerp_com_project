/**
 * Batch 7 — Reporting layer. One reusable ReportWrapper (title, filters,
 * Print / Save-as-PDF / Download CSV toolbar, print header) that every report
 * reuses. Reports render in-page full-width & mobile responsive; the shared
 * print stylesheet (app.css) forces a white background and hides nav/controls.
 */
(function () {
    'use strict';
    const { ref, computed, onMounted } = Vue;

    const REPORTS = [
        { key: 'financial', label: 'Financial Summary' },
        { key: 'project_progress', label: 'Project Progress' },
        { key: 'inventory', label: 'Inventory Stock' },
        { key: 'compliance', label: 'Compliance Renewals' },
        { key: 'ra_bills', label: 'RA Bills' },
    ];

    // Reusable wrapper component.
    const ReportWrapper = {
        props: ['report'],
        setup(props) {
            const fmt = (v) => typeof v === 'number' ? new Intl.NumberFormat().format(v) : v;
            function printReport() { window.print(); }
            function downloadCsv() {
                if (!props.report) return;
                csv.download((props.report.title || 'report').replace(/\s+/g, '-').toLowerCase(),
                    props.report.rows, props.report.columns);
            }
            function serverCsv(key) { window.location.href = '/api/reports/' + key + '?format=csv'; }
            const now = new Date().toLocaleString();
            return { fmt, printReport, downloadCsv, serverCsv, now };
        },
        template: `
        <div class="report-print bg-white rounded-xl border border-slate-200 p-6">
            <!-- print-only header -->
            <div class="report-header">
                <h2 style="font-size:16px;font-weight:600">{{ store.appName }}</h2>
                <div style="font-size:13px">{{ report.title }}</div>
                <div style="font-size:11px;color:#555">Generated {{ now }}</div>
                <hr style="margin:8px 0">
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
                <h2 class="font-semibold text-slate-800">{{ report.title }}</h2>
                <div class="flex gap-2">
                    <button @click="downloadCsv" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Download CSV</button>
                    <button @click="printReport" class="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">Print / Save PDF</button>
                </div>
            </div>

            <div v-if="report.summary" class="flex flex-wrap gap-4 mb-4">
                <div v-for="(v,k) in report.summary" :key="k" class="px-4 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div class="text-xs text-slate-400">{{ k }}</div><div class="text-sm font-semibold text-slate-700">{{ fmt(v) }}</div>
                </div>
            </div>

            <div class="table-scroll">
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-slate-400 border-b border-slate-200">
                        <th v-for="c in report.columns" :key="c.key" class="py-2 px-3">{{ c.label }}</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="(row,i) in report.rows" :key="i" class="border-b border-slate-50">
                            <td v-for="c in report.columns" :key="c.key" class="py-2 px-3 text-slate-700">{{ fmt(row[c.key]) }}</td>
                        </tr>
                        <tr v-if="!report.rows.length"><td :colspan="report.columns.length" class="py-8 text-center text-slate-400">No data</td></tr>
                    </tbody>
                </table>
            </div>
        </div>`,
    };

    const ReportsView = {
        components: { ReportWrapper },
        setup() {
            const reports = REPORTS;
            const active = ref('financial');
            const data = ref(null);
            const loading = ref(false);

            async function load() {
                loading.value = true; data.value = null;
                try { data.value = (await api.get('/api/reports/' + active.value)).data; }
                catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            onMounted(load);
            function select(key) { active.value = key; load(); }
            return { reports, active, data, loading, select };
        },
        template: `
        <div>
            <h1 class="text-xl font-semibold text-slate-800 mb-4 print:hidden">Reports</h1>
            <div class="flex flex-wrap gap-2 mb-5 print:hidden">
                <button v-for="r in reports" :key="r.key" @click="select(r.key)"
                        :class="active===r.key?'bg-brand text-white border-brand':'bg-white text-slate-600 border-slate-300'"
                        class="px-3 py-1.5 text-sm rounded-lg border hover:bg-slate-50">{{ r.label }}</button>
            </div>
            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading report…</div>
            <report-wrapper v-else-if="data" :report="data"></report-wrapper>
        </div>`,
    };

    CSApp.route('/reports', 'ReportsView', ReportsView);
})();
