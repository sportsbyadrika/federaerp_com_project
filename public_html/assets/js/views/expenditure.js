/**
 * Expenditure (#/expenditure) — project-wise and institution-wise spend.
 * Table of expenditures with Edit/Delete actions; add/edit through a modal.
 * Fields: type (project/institutional), project, expenditure type, party
 * (supplier/sub-contractor), project task, amount and mode of payment.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const MODES = [
        { v: 'cash', l: 'Cash' }, { v: 'fund_transfer', l: 'Fund transfer' },
        { v: 'cheque', l: 'Cheque' }, { v: 'dd', l: 'DD' },
    ];
    const modeLabel = (v) => (MODES.find(m => m.v === v) || {}).l || v;

    const ExpenditureView = {
        setup() {
            const rows = ref([]);
            const total = ref(0);
            const loading = ref(true);
            const saving = ref(false);
            const filterScope = ref('');
            const projects = ref([]);
            const types = ref([]);
            const suppliers = ref([]);
            const subcontractors = ref([]);
            const tasks = ref([]);      // tasks for the currently selected project (in the modal)

            const fmt = (n) => CSApp.money(n);

            const showModal = ref(false);
            const editingId = ref(null);
            const form = reactive({
                scope: 'project', project_id: null, expenditure_type_id: null,
                party_type: 'none', party_id: null, task_id: null,
                amount: 0, mode: 'cash', reference: '', expense_date: new Date().toISOString().slice(0, 10), notes: '',
            });

            const partyOptions = computed(() => form.party_type === 'supplier' ? suppliers.value : (form.party_type === 'subcontractor' ? subcontractors.value : []));

            async function loadLists() {
                try { projects.value = (await api.get('/api/projects')).data; } catch (e) { projects.value = []; }
                try { types.value = (await api.get('/api/expenditure-types')).data; } catch (e) { types.value = []; }
                try { suppliers.value = (await api.get('/api/suppliers')).data; } catch (e) { suppliers.value = []; }
                try { subcontractors.value = (await api.get('/api/subcontractors')).data; } catch (e) { subcontractors.value = []; }
            }
            async function load() {
                loading.value = true;
                try {
                    let url = '/api/expenditures';
                    if (filterScope.value) url += '?scope=' + encodeURIComponent(filterScope.value);
                    const d = (await api.get(url)).data;
                    rows.value = d.items; total.value = d.total;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadTasks() {
                tasks.value = [];
                if (form.scope === 'project' && form.project_id) {
                    try { tasks.value = (await api.get('/api/projects/' + form.project_id + '/tasks')).data; } catch (e) { tasks.value = []; }
                }
            }
            function onScopeChange() { if (form.scope !== 'project') { form.project_id = null; form.task_id = null; tasks.value = []; } }
            function onProjectChange() { form.task_id = null; loadTasks(); }
            function onPartyTypeChange() { form.party_id = null; }

            function openAdd() {
                editingId.value = null;
                Object.assign(form, {
                    scope: 'project', project_id: null, expenditure_type_id: null,
                    party_type: 'none', party_id: null, task_id: null,
                    amount: 0, mode: 'cash', reference: '', expense_date: new Date().toISOString().slice(0, 10), notes: '',
                });
                tasks.value = [];
                showModal.value = true;
            }
            async function openEdit(r) {
                editingId.value = r.id;
                Object.assign(form, {
                    scope: r.scope, project_id: r.project_id, expenditure_type_id: r.expenditure_type_id,
                    party_type: r.party_type, party_id: r.party_id, task_id: r.task_id,
                    amount: +r.amount, mode: r.mode, reference: r.reference || '', expense_date: (r.expense_date || '').slice(0, 10), notes: r.notes || '',
                });
                await loadTasks();
                showModal.value = true;
            }
            async function save() {
                if (!(+form.amount > 0)) { CSApp.flash('error', 'Amount must be greater than zero'); return; }
                if (form.scope === 'project' && !form.project_id) { CSApp.flash('error', 'Select a project'); return; }
                saving.value = true;
                try {
                    const payload = {
                        scope: form.scope,
                        project_id: form.scope === 'project' ? (form.project_id || null) : null,
                        expenditure_type_id: form.expenditure_type_id || null,
                        party_type: form.party_type,
                        party_id: form.party_type === 'none' ? null : (form.party_id || null),
                        task_id: form.scope === 'project' ? (form.task_id || null) : null,
                        amount: +form.amount, mode: form.mode, reference: form.reference,
                        expense_date: form.expense_date, notes: form.notes,
                    };
                    if (editingId.value) await api.put('/api/expenditures/' + editingId.value, payload);
                    else await api.post('/api/expenditures', payload);
                    CSApp.flash('success', 'Expenditure saved'); showModal.value = false; await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function remove(r) {
                if (!confirm('Delete this expenditure?')) return;
                try { await api.del('/api/expenditures/' + r.id); CSApp.flash('success', 'Deleted'); await load(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            onMounted(async () => { await loadLists(); await load(); });
            return {
                rows, total, loading, saving, filterScope, projects, types, tasks, fmt, MODES, modeLabel,
                showModal, editingId, form, partyOptions, load, openAdd, openEdit, save, remove,
                onScopeChange, onProjectChange, onPartyTypeChange,
            };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h1 class="text-xl font-semibold text-slate-800">Expenditure</h1>
                <button @click="openAdd" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Add expenditure</button>
            </div>
            <p class="text-sm text-slate-500 mb-5">Project-wise and institution-wise spend.</p>

            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400">Scope</span>
                    <select v-model="filterScope" @change="load" class="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                        <option value="">All</option><option value="project">Project</option><option value="institutional">Institutional</option>
                    </select>
                </div>
                <div class="text-sm text-slate-500">Total: <span class="font-semibold text-rose-600">{{ fmt(total) }}</span></div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5">
                <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                <div v-else class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 px-3">Date</th><th class="py-2 px-3">Scope</th><th class="py-2 px-3">Project</th>
                            <th class="py-2 px-3">Type</th><th class="py-2 px-3">Party</th><th class="py-2 px-3">Task</th>
                            <th class="py-2 px-3 text-right">Amount</th><th class="py-2 px-3">Mode</th><th class="py-2 px-3"></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="r in rows" :key="r.id" class="border-b border-slate-50">
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (r.expense_date||'').slice(0,10) }}</td>
                                <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="r.scope==='project'?'bg-sky-50 text-sky-700':'bg-violet-50 text-violet-700'">{{ r.scope }}</span></td>
                                <td class="py-2 px-3 text-slate-700">{{ r.project_name || '—' }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ r.type_name || '—' }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ r.party_name || '—' }}</td>
                                <td class="py-2 px-3 text-slate-600">{{ r.task_title || '—' }}</td>
                                <td class="py-2 px-3 text-right font-medium text-slate-800 whitespace-nowrap">{{ fmt(r.amount) }}</td>
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ modeLabel(r.mode) }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap">
                                    <button @click="openEdit(r)" class="text-brand hover:underline text-xs mr-2">Edit</button>
                                    <button @click="remove(r)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                </td>
                            </tr>
                            <tr v-if="!rows.length"><td colspan="9" class="py-8 text-center text-slate-400">No expenditure yet — click “+ Add expenditure”.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Add/Edit modal -->
            <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ editingId ? 'Edit expenditure' : 'Add expenditure' }}</h2>
                        <button @click="showModal=false" class="text-slate-400">✕</button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Type</label>
                            <select v-model="form.scope" @change="onScopeChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option value="project">Project</option><option value="institutional">Institutional</option>
                            </select>
                        </div>
                        <div v-if="form.scope==='project'">
                            <label class="block text-xs text-slate-500 mb-1">Project</label>
                            <select v-model="form.project_id" @change="onProjectChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Expenditure type</label>
                            <select v-model="form.expenditure_type_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Party type</label>
                            <select v-model="form.party_type" @change="onPartyTypeChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option value="none">None</option><option value="supplier">Supplier</option><option value="subcontractor">Sub-contractor</option>
                            </select>
                        </div>
                        <div v-if="form.party_type!=='none'">
                            <label class="block text-xs text-slate-500 mb-1">{{ form.party_type==='supplier' ? 'Supplier' : 'Sub-contractor' }}</label>
                            <select v-model="form.party_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="p in partyOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div v-if="form.scope==='project'">
                            <label class="block text-xs text-slate-500 mb-1">Project task</label>
                            <select v-model="form.task_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— none —</option>
                                <option v-for="t in tasks" :key="t.id" :value="t.id">{{ t.title }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Amount</label>
                            <input v-model.number="form.amount" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Mode of payment</label>
                            <select v-model="form.mode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="m in MODES" :key="m.v" :value="m.v">{{ m.l }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Date</label>
                            <input v-model="form.expense_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Reference</label>
                            <input v-model="form.reference" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="cheque no. / txn ref">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs text-slate-500 mb-1">Notes</label>
                            <textarea v-model="form.notes" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showModal=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="save" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save' }}</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/expenditure', 'ExpenditureView', ExpenditureView);
})();
