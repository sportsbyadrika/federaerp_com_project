/**
 * Batch 5 — Project & Compliance Tracker grid. A responsive table of active
 * sites showing current milestone status and the next permit due, with
 * filter/sort; collapses to stacked cards on mobile. Reuses the report wrapper's
 * CSV helper. Pulls live compliance data from /api/compliance/alerts.
 */
(function () {
    'use strict';
    const { ref, computed, onMounted } = Vue;

    const ComplianceView = {
        setup() {
            const alerts = ref([]);
            const projects = ref([]);
            const loading = ref(true);
            const filter = ref('');
            const sortKey = ref('due_date');

            async function load() {
                loading.value = true;
                try {
                    alerts.value = (await api.get('/api/compliance/alerts?days=120')).data;
                    projects.value = (await api.get('/api/projects')).data;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            onMounted(load);

            const rows = computed(() => {
                let r = alerts.value.slice();
                if (filter.value) {
                    const f = filter.value.toLowerCase();
                    r = r.filter(a => (a.permit_name || '').toLowerCase().includes(f) || (a.authority || '').toLowerCase().includes(f));
                }
                r.sort((a, b) => {
                    if (sortKey.value === 'days_remaining') return a.days_remaining - b.days_remaining;
                    return String(a[sortKey.value] || '').localeCompare(String(b[sortKey.value] || ''));
                });
                return r;
            });

            function exportCsv() {
                csv.download('compliance-tracker', rows.value, [
                    { key: 'permit_name', label: 'Permit' }, { key: 'authority', label: 'Authority' },
                    { key: 'permit_number', label: 'Number' }, { key: 'due_date', label: 'Due date' },
                    { key: 'days_remaining', label: 'Days remaining' }, { key: 'urgency', label: 'Urgency' },
                ]);
            }
            const badge = (u) => u === 'overdue' ? 'bg-rose-50 text-rose-700' : (u === 'due_soon' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600');

            return { alerts, projects, loading, filter, sortKey, rows, exportCsv, badge };
        },
        template: `
        <div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h1 class="text-xl font-semibold text-slate-800">Compliance Tracker</h1>
                <div class="flex gap-2">
                    <input v-model="filter" placeholder="Filter…" class="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40">
                    <select v-model="sortKey" class="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="due_date">Sort: Due date</option><option value="days_remaining">Sort: Days left</option><option value="permit_name">Sort: Name</option></select>
                    <button @click="exportCsv" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Download CSV</button>
                </div>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading…</div>
            <div v-else>
                <!-- desktop table -->
                <div class="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div class="table-scroll"><table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100"><th class="py-3 px-4">Permit</th><th class="py-3 px-4">Authority</th><th class="py-3 px-4">Number</th><th class="py-3 px-4">Due</th><th class="py-3 px-4">Days left</th><th class="py-3 px-4">Status</th></tr></thead>
                        <tbody>
                            <tr v-for="a in rows" :key="a.deadline_id" class="border-b border-slate-50">
                                <td class="py-3 px-4 text-slate-700">{{ a.permit_name }}</td><td class="py-3 px-4 text-slate-500">{{ a.authority }}</td>
                                <td class="py-3 px-4 font-mono text-xs text-slate-500">{{ a.permit_number }}</td><td class="py-3 px-4">{{ a.due_date }}</td>
                                <td class="py-3 px-4">{{ a.days_remaining }}</td>
                                <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-xs" :class="badge(a.urgency)">{{ (a.urgency||'').replace('_',' ') }}</span></td>
                            </tr>
                            <tr v-if="!rows.length"><td colspan="6" class="py-8 text-center text-slate-400">No upcoming renewals</td></tr>
                        </tbody>
                    </table></div>
                </div>
                <!-- mobile cards -->
                <div class="sm:hidden space-y-3">
                    <div v-for="a in rows" :key="a.deadline_id" class="bg-white rounded-xl border border-slate-200 p-4">
                        <div class="flex justify-between items-start"><div class="font-medium text-slate-800">{{ a.permit_name }}</div><span class="px-2 py-0.5 rounded-full text-xs" :class="badge(a.urgency)">{{ (a.urgency||'').replace('_',' ') }}</span></div>
                        <div class="text-sm text-slate-500 mt-1">{{ a.authority }} · {{ a.permit_number }}</div>
                        <div class="text-sm text-slate-600 mt-1">Due {{ a.due_date }} ({{ a.days_remaining }} days)</div>
                    </div>
                    <div v-if="!rows.length" class="text-center text-slate-400 py-8">No upcoming renewals</div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/compliance', 'ComplianceView', ComplianceView);
})();
