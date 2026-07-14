/**
 * Projects list (#/projects) — the landing page for Projects. Shows each project
 * with its expenditure (base/GST/total) and income (base/GST/total) rollup, a
 * balance (base income − base expense), column totals, and per-row actions:
 * Manage project, Add expenditure, Add income, Task list. Also creates projects.
 */
(function () {
    'use strict';
    const { ref, computed, onMounted } = Vue;

    const ProjectsListView = {
        setup() {
            const allProjects = ref([]);
            const loading = ref(true);
            const clients = ref([]);
            const clientFilter = ref('');
            const search = ref('');

            const fmt = (n) => CSApp.money(n);

            async function load() {
                loading.value = true;
                try {
                    const d = (await api.get('/api/project-financials')).data;
                    allProjects.value = d.projects;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadClients() { try { clients.value = (await api.get('/api/clients')).data; } catch (e) { clients.value = []; } }

            // Client dropdown + free-text project search (default: all).
            const projects = computed(() => {
                const q = search.value.trim().toLowerCase();
                return allProjects.value.filter(p => {
                    if (clientFilter.value && String(p.client_id) !== String(clientFilter.value)) return false;
                    if (q && !((p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))) return false;
                    return true;
                });
            });
            // Totals reflect the filtered rows on screen.
            const totals = computed(() => {
                const t = { exp_base: 0, exp_gst: 0, exp_total: 0, inc_base: 0, inc_gst: 0, inc_total: 0, balance: 0 };
                projects.value.forEach(p => {
                    ['exp_base', 'exp_gst', 'exp_total', 'inc_base', 'inc_gst', 'inc_total', 'balance'].forEach(k => { t[k] += +p[k] || 0; });
                });
                Object.keys(t).forEach(k => { t[k] = Math.round(t[k] * 100) / 100; });
                return t;
            });

            const hasAny = computed(() => allProjects.value.length > 0);
            onMounted(async () => { await loadClients(); await load(); });
            return { projects, totals, loading, clients, clientFilter, search, hasAny, fmt };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h1 class="text-xl font-semibold text-slate-800">Projects</h1>
                <a href="#/projects/new" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ New project</a>
            </div>
            <p class="text-sm text-slate-500 mb-5">Financial overview per project. Use the actions to manage a project, record expenditure/income, or open its task board.</p>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading projects…</div>
            <div v-else-if="!hasAny" class="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div class="text-slate-500 mb-1">No projects yet</div>
                <div class="text-sm text-slate-400 mb-4">Create your first project to get started.</div>
                <a href="#/projects/new" class="inline-block px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Create project</a>
            </div>

            <template v-else>
            <div class="flex items-center gap-3 mb-4 flex-wrap">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400">Client</span>
                    <select v-model="clientFilter" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                        <option value="">All clients</option>
                        <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                    </select>
                </div>
                <input v-model="search" placeholder="Search project name or code…" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-64">
                <span class="text-xs text-slate-400">{{ projects.length }} project(s)</span>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="table-scroll">
                    <table class="w-full text-sm" style="min-width:70rem">
                        <thead>
                            <tr class="text-slate-500 bg-slate-50 border-b border-slate-200">
                                <th rowspan="2" class="text-left py-2 px-3 align-bottom">Code</th>
                                <th rowspan="2" class="text-left py-2 px-3 align-bottom">Project</th>
                                <th rowspan="2" class="text-left py-2 px-3 align-bottom">Client</th>
                                <th colspan="3" class="text-center py-2 px-3 border-l border-slate-200 text-rose-600">Expenditure</th>
                                <th colspan="3" class="text-center py-2 px-3 border-l border-slate-200 text-emerald-600">Income</th>
                                <th rowspan="2" class="text-right py-2 px-3 align-bottom border-l border-slate-200">Balance</th>
                                <th rowspan="2" class="text-center py-2 px-3 align-bottom border-l border-slate-200">Actions</th>
                            </tr>
                            <tr class="text-slate-400 bg-slate-50 border-b border-slate-200 text-xs">
                                <th class="text-right py-1.5 px-3 border-l border-slate-200">Base</th>
                                <th class="text-right py-1.5 px-3">GST</th>
                                <th class="text-right py-1.5 px-3">Total</th>
                                <th class="text-right py-1.5 px-3 border-l border-slate-200">Base</th>
                                <th class="text-right py-1.5 px-3">GST</th>
                                <th class="text-right py-1.5 px-3">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="p in projects" :key="p.id" class="border-b border-slate-50 hover:bg-slate-50/50">
                                <td class="py-2 px-3 font-mono text-xs text-slate-500">{{ p.code || '—' }}</td>
                                <td class="py-2 px-3 text-slate-800">{{ p.name }}<span v-if="p.project_type" class="text-xs text-slate-400"> ({{ p.project_type }})</span></td>
                                <td class="py-2 px-3 text-slate-600">{{ p.client_name || '—' }}</td>
                                <td class="py-2 px-3 text-right text-slate-600 whitespace-nowrap border-l border-slate-100">{{ fmt(p.exp_base) }}</td>
                                <td class="py-2 px-3 text-right text-slate-500 whitespace-nowrap">{{ fmt(p.exp_gst) }}</td>
                                <td class="py-2 px-3 text-right font-medium text-rose-600 whitespace-nowrap">{{ fmt(p.exp_total) }}</td>
                                <td class="py-2 px-3 text-right text-slate-600 whitespace-nowrap border-l border-slate-100">{{ fmt(p.inc_base) }}</td>
                                <td class="py-2 px-3 text-right text-slate-500 whitespace-nowrap">{{ fmt(p.inc_gst) }}</td>
                                <td class="py-2 px-3 text-right font-medium text-emerald-600 whitespace-nowrap">{{ fmt(p.inc_total) }}</td>
                                <td class="py-2 px-3 text-right font-semibold whitespace-nowrap border-l border-slate-100" :class="p.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'">{{ fmt(p.balance) }}</td>
                                <td class="py-2 px-3 border-l border-slate-100">
                                    <div class="flex flex-wrap items-center justify-center gap-1">
                                        <a :href="'#/project/' + p.id" class="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100">Manage</a>
                                        <a :href="'#/expenditure?project_id=' + p.id + '&add=1'" class="text-xs px-2 py-1 rounded border border-slate-200 text-rose-600 hover:bg-rose-50">+ Expenditure</a>
                                        <a :href="'#/income?project_id=' + p.id + '&add=1'" class="text-xs px-2 py-1 rounded border border-slate-200 text-emerald-600 hover:bg-emerald-50">+ Income</a>
                                        <a :href="'#/board/' + p.id" class="text-xs px-2 py-1 rounded border border-slate-200 text-brand hover:bg-brand/5">Task list</a>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!projects.length"><td colspan="11" class="py-8 text-center text-slate-400">No projects match the filter.</td></tr>
                        </tbody>
                        <tfoot>
                            <tr class="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
                                <td class="py-2 px-3" colspan="3">Total ({{ projects.length }} projects)</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap border-l border-slate-200">{{ fmt(totals.exp_base) }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap">{{ fmt(totals.exp_gst) }}</td>
                                <td class="py-2 px-3 text-right text-rose-600 whitespace-nowrap">{{ fmt(totals.exp_total) }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap border-l border-slate-200">{{ fmt(totals.inc_base) }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap">{{ fmt(totals.inc_gst) }}</td>
                                <td class="py-2 px-3 text-right text-emerald-600 whitespace-nowrap">{{ fmt(totals.inc_total) }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap border-l border-slate-200" :class="(totals.balance||0) >= 0 ? 'text-emerald-700' : 'text-rose-700'">{{ fmt(totals.balance) }}</td>
                                <td class="border-l border-slate-200"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            </template>
        </div>`,
    };

    CSApp.route('/projects', 'ProjectsListView', ProjectsListView);
})();
