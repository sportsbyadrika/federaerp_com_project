/**
 * Projects list (#/projects) — the landing page for Projects. Shows each project
 * with its expenditure (base/GST/total) and income (base/GST/total) rollup, a
 * balance (base income − base expense), column totals, and per-row actions:
 * Manage project, Add expenditure, Add income, Task list. Also creates projects.
 */
(function () {
    'use strict';
    const { ref, reactive, onMounted } = Vue;

    const ProjectsListView = {
        setup() {
            const projects = ref([]);
            const totals = ref({});
            const loading = ref(true);
            const clients = ref([]);

            const showNewProject = ref(false);
            const savingProject = ref(false);
            const newProject = reactive({ code: '', name: '', client_id: null, project_type: 'new', contract_value: 0, site_address: '', status: 'planning', start_date: '', end_date: '', description: '' });

            const fmt = (n) => CSApp.money(n);

            async function load() {
                loading.value = true;
                try {
                    const d = (await api.get('/api/project-financials')).data;
                    projects.value = d.projects; totals.value = d.totals;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadClients() { try { clients.value = (await api.get('/api/clients')).data; } catch (e) { clients.value = []; } }

            async function createProject() {
                if (!newProject.name.trim()) { CSApp.flash('error', 'Project name is required'); return; }
                savingProject.value = true;
                try {
                    const payload = { name: newProject.name.trim(), project_type: newProject.project_type, status: newProject.status };
                    if (newProject.code) payload.code = newProject.code;
                    if (newProject.client_id) payload.client_id = newProject.client_id;
                    if (newProject.contract_value) payload.contract_value = newProject.contract_value;
                    if (newProject.site_address) payload.site_address = newProject.site_address;
                    if (newProject.start_date) payload.start_date = newProject.start_date;
                    if (newProject.end_date) payload.end_date = newProject.end_date;
                    if (newProject.description) payload.description = newProject.description;
                    const created = (await api.post('/api/projects', payload)).data;
                    CSApp.flash('success', 'Project created: ' + created.name);
                    showNewProject.value = false;
                    Object.assign(newProject, { code: '', name: '', client_id: null, project_type: 'new', contract_value: 0, site_address: '', status: 'planning', start_date: '', end_date: '', description: '' });
                    await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { savingProject.value = false; }
            }

            onMounted(async () => { await loadClients(); await load(); });
            return { projects, totals, loading, clients, fmt, showNewProject, savingProject, newProject, createProject };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h1 class="text-xl font-semibold text-slate-800">Projects</h1>
                <button @click="showNewProject=true" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ New project</button>
            </div>
            <p class="text-sm text-slate-500 mb-5">Financial overview per project. Use the actions to manage a project, record expenditure/income, or open its task board.</p>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading projects…</div>
            <div v-else-if="!projects.length" class="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div class="text-slate-500 mb-1">No projects yet</div>
                <div class="text-sm text-slate-400 mb-4">Create your first project to get started.</div>
                <button @click="showNewProject=true" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Create project</button>
            </div>

            <div v-else class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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

            <!-- New project modal -->
            <div v-if="showNewProject" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">New project</h2><button @click="showNewProject=false" class="text-slate-400">✕</button></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="newProject.code" placeholder="auto if blank" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Project name *</label><input v-model="newProject.name" placeholder="e.g. Harbor Villa" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Client</label>
                            <select v-model="newProject.client_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option :value="null">— none —</option><option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                        </div>
                        <div><label class="block text-sm text-slate-600 mb-1">Type of project</label>
                            <select v-model="newProject.project_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="new">New</option><option value="renovation">Renovation</option></select>
                        </div>
                        <div><label class="block text-sm text-slate-600 mb-1">Contract value</label><input v-model.number="newProject.contract_value" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="newProject.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Status</label>
                            <select v-model="newProject.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select>
                        </div>
                        <div></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="newProject.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Target end date</label><input v-model="newProject.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Description</label><textarea v-model="newProject.description" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3">
                        <button @click="showNewProject=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="createProject" :disabled="savingProject" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ savingProject ? 'Creating…' : 'Create project' }}</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/projects', 'ProjectsListView', ProjectsListView);
})();
