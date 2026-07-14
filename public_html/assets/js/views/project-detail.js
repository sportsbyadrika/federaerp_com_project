/**
 * Project detail view (#/project/:id):
 *   - Details/Edit (with per-project Currency dropdown)
 *   - Floors picker
 *   - BOQ: item cards with a no-heading per-floor breakdown table (Floor Name /
 *     Quantity / Rate / Amount + totals row); Add/Edit via a wide modal.
 *   - Construction Stages: Phase / Details / Percentage / Amount grid with a
 *     grand total and the difference vs the project contract value.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    const FLOOR_CATALOG = [
        { code: 'B2', label: 'Basement 2', sort_order: -2 }, { code: 'B1', label: 'Basement 1', sort_order: -1 },
        { code: 'GF', label: 'Ground Floor', sort_order: 0 },
        { code: 'F1', label: '1st Floor', sort_order: 1 }, { code: 'F2', label: '2nd Floor', sort_order: 2 },
        { code: 'F3', label: '3rd Floor', sort_order: 3 }, { code: 'F4', label: '4th Floor', sort_order: 4 },
        { code: 'F5', label: '5th Floor', sort_order: 5 }, { code: 'F6', label: '6th Floor', sort_order: 6 },
        { code: 'F7', label: '7th Floor', sort_order: 7 }, { code: 'F8', label: '8th Floor', sort_order: 8 },
        { code: 'F9', label: '9th Floor', sort_order: 9 }, { code: 'F10', label: '10th Floor', sort_order: 10 },
    ];

    const ProjectDetailView = {
        setup() {
            const id = computed(() => parseInt(store.params.id, 10));
            const tab = ref('details');
            const loading = ref(true);
            const saving = ref(false);
            const project = reactive({});
            const clients = ref([]);
            const currencies = ref([]);
            const floors = ref([]);
            const selectedCodes = ref({});
            const entries = ref([]);
            const boqTotal = ref(0);
            const masterItems = ref([]);
            const stages = ref([]);

            // money in the PROJECT's currency (falls back to the tenant default)
            const nf = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
            const pmoney = (n) => (project.currency_symbol || (store.currency && store.currency.symbol) || '') + nf(n);

            // BOQ modal
            const showModal = ref(false);
            const editingId = ref(null);
            const form = reactive({ boq_item_master_id: null, item_code: '', item_head: '', description: '', unit: '' });
            const modalLines = ref([]);

            async function load() {
                loading.value = true;
                try {
                    const p = (await api.get('/api/projects/' + id.value)).data;
                    Object.assign(project, p);
                    clients.value = (await api.get('/api/clients')).data;
                    try { currencies.value = (await api.get('/api/currencies')).data; } catch (e) { currencies.value = []; }
                    floors.value = (await api.get('/api/projects/' + id.value + '/floors')).data;
                    const sel = {}; floors.value.forEach(f => { sel[f.code] = true; });
                    selectedCodes.value = sel;
                    await loadBoq();
                    await loadMaster();
                    await loadStages();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadBoq() { const b = (await api.get('/api/projects/' + id.value + '/boq')).data; entries.value = b.entries; boqTotal.value = b.total; }
            async function loadMaster() {
                const pt = project.project_type || 'new';
                masterItems.value = (await api.get('/api/boq-items')).data.filter(m => m.project_type === pt || m.project_type === 'any');
            }
            async function loadStages() {
                const s = (await api.get('/api/projects/' + id.value + '/stages')).data;
                stages.value = s.stages.map(x => ({ id: x.id, phase_no: +x.phase_no, details: x.details, percentage: +x.percentage, amount: +x.amount }));
            }
            onMounted(load);
            watch(id, load);
            watch(() => project.project_type, loadMaster);

            // currency dropdown -> keep symbol in sync
            function onCurrencyChange() {
                const c = currencies.value.find(x => x.code === project.currency_code);
                if (c) project.currency_symbol = c.symbol;
            }

            async function saveDetails() {
                saving.value = true;
                try {
                    await api.put('/api/projects/' + id.value, {
                        code: project.code, name: project.name, client_id: project.client_id || null,
                        project_type: project.project_type, contract_value: project.contract_value,
                        currency_code: project.currency_code, currency_symbol: project.currency_symbol,
                        site_address: project.site_address, status: project.status,
                        start_date: project.start_date, end_date: project.end_date, description: project.description,
                    });
                    CSApp.flash('success', 'Project updated');
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function saveFloors() {
                saving.value = true;
                try {
                    const chosen = FLOOR_CATALOG.filter(f => selectedCodes.value[f.code]);
                    floors.value = (await api.post('/api/projects/' + id.value + '/floors', { floors: chosen })).data;
                    CSApp.flash('success', 'Floors updated');
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            // ---- BOQ entry line totals (for the result cards) ----
            const lineSum = (lines, key) => lines.reduce((s, l) => s + (+l[key] || 0), 0);

            // ---- BOQ modal ----
            function floorRows(existingLines) {
                const byFloor = {};
                (existingLines || []).forEach(l => { byFloor[l.project_floor_id == null ? 'null' : l.project_floor_id] = l; });
                const rows = floors.value.map(f => {
                    const ex = byFloor[f.id];
                    return { project_floor_id: f.id, floor_label: f.label, unit: form.unit, quantity: ex ? +ex.quantity : 0, rate: ex ? +ex.rate : 0 };
                });
                const exWhole = byFloor['null'];
                rows.push({ project_floor_id: null, floor_label: 'Whole project', unit: form.unit, quantity: exWhole ? +exWhole.quantity : 0, rate: exWhole ? +exWhole.rate : 0 });
                return rows;
            }
            function openAdd() { editingId.value = null; Object.assign(form, { boq_item_master_id: null, item_code: '', item_head: '', description: '', unit: '' }); modalLines.value = floorRows([]); showModal.value = true; }
            function openEdit(entry) { editingId.value = entry.id; Object.assign(form, { boq_item_master_id: entry.boq_item_master_id, item_code: entry.item_code, item_head: entry.item_head, description: entry.description, unit: entry.unit }); modalLines.value = floorRows(entry.lines); showModal.value = true; }
            function onPickMaster() {
                const m = masterItems.value.find(x => String(x.id) === String(form.boq_item_master_id));
                if (m) { form.item_code = m.item_code; form.item_head = m.item_head; form.description = m.description; form.unit = m.unit; modalLines.value.forEach(r => { r.unit = m.unit; if (!r.rate) r.rate = +m.default_rate; }); }
            }
            const modalRowAmount = (r) => Math.round(((+r.quantity || 0) * (+r.rate || 0)) * 100) / 100;
            const modalTotal = computed(() => modalLines.value.reduce((s, r) => s + modalRowAmount(r), 0));
            async function saveEntry() {
                if (!form.item_head) { CSApp.flash('error', 'Item head is required'); return; }
                const lines = modalLines.value.filter(r => (+r.quantity || 0) > 0).map(r => ({ project_floor_id: r.project_floor_id, quantity: +r.quantity, rate: +r.rate }));
                if (!lines.length) { CSApp.flash('error', 'Enter a quantity for at least one floor'); return; }
                saving.value = true;
                try {
                    const payload = { boq_item_master_id: form.boq_item_master_id || null, item_code: form.item_code, item_head: form.item_head, description: form.description, unit: form.unit, lines };
                    if (editingId.value) await api.put('/api/boq-entries/' + editingId.value, payload);
                    else await api.post('/api/projects/' + id.value + '/boq', payload);
                    CSApp.flash('success', 'BOQ item saved'); showModal.value = false; await loadBoq();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function deleteEntry(entry) {
                if (!confirm('Delete BOQ item "' + entry.item_head + '"?')) return;
                try { await api.del('/api/boq-entries/' + entry.id); CSApp.flash('success', 'Deleted'); await loadBoq(); } catch (e) { CSApp.flash('error', e.message); }
            }

            // ---- Construction stages (modal-based add/edit) ----
            const stagesGrand = computed(() => stages.value.reduce((s, r) => s + (+r.amount || 0), 0));
            const stagesDiff = computed(() => (+project.contract_value || 0) - stagesGrand.value);
            const showStageModal = ref(false);
            const editingStageId = ref(null);
            const stageForm = reactive({ phase_no: 1, details: '', percentage: 0, amount: 0 });
            function openStageAdd() {
                editingStageId.value = null;
                Object.assign(stageForm, { phase_no: stages.value.length + 1, details: '', percentage: 0, amount: 0 });
                showStageModal.value = true;
            }
            function openStageEdit(s) {
                editingStageId.value = s.id;
                Object.assign(stageForm, { phase_no: s.phase_no, details: s.details, percentage: s.percentage, amount: s.amount });
                showStageModal.value = true;
            }
            // Entering a percentage derives the amount from the contract value.
            function onStagePercentChange() {
                const cv = +project.contract_value || 0;
                const pct = +stageForm.percentage || 0;
                stageForm.amount = Math.round(cv * pct / 100 * 100) / 100;
            }
            async function saveStage() {
                if (!stageForm.details) { CSApp.flash('error', 'Details are required'); return; }
                saving.value = true;
                try {
                    const payload = { phase_no: +stageForm.phase_no || 0, details: stageForm.details, percentage: +stageForm.percentage || 0, amount: +stageForm.amount || 0 };
                    if (editingStageId.value) await api.put('/api/stages/' + editingStageId.value, payload);
                    else await api.post('/api/projects/' + id.value + '/stages', payload);
                    CSApp.flash('success', 'Stage saved'); showStageModal.value = false; await loadStages();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function deleteStage(s) {
                if (!confirm('Delete phase ' + s.phase_no + '?')) return;
                try { await api.del('/api/stages/' + s.id); CSApp.flash('success', 'Deleted'); await loadStages(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            return { FLOOR_CATALOG, id, tab, loading, saving, project, clients, currencies, floors, selectedCodes, entries, boqTotal,
                masterItems, stages, nf, pmoney, lineSum, onCurrencyChange, saveDetails, saveFloors,
                showModal, editingId, form, modalLines, modalRowAmount, modalTotal, openAdd, openEdit, onPickMaster, saveEntry, deleteEntry,
                stagesGrand, stagesDiff, showStageModal, editingStageId, stageForm, openStageAdd, openStageEdit, saveStage, deleteStage, onStagePercentChange };
        },
        template: `
        <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading project…</div>
        <div v-else>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <a href="#/projects" class="text-sm text-brand hover:underline">← Projects</a>
                    <h1 class="text-xl font-semibold text-slate-800">{{ project.name }} <span class="text-sm font-normal text-slate-400">{{ project.code }}</span></h1>
                </div>
                <a :href="'#/board/' + id" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Open board</a>
            </div>

            <div class="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg text-sm mb-5 w-fit">
                <button @click="tab='details'" :class="tab==='details'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Details</button>
                <button @click="tab='floors'" :class="tab==='floors'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Floors</button>
                <button @click="tab='boq'" :class="tab==='boq'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">BOQ</button>
                <button @click="tab='stages'" :class="tab==='stages'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Construction Stages</button>
            </div>

            <!-- DETAILS / EDIT -->
            <div v-if="tab==='details'" class="bg-white rounded-xl border border-slate-200 p-6 max-w-3xl">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="project.code" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Project name</label><input v-model="project.name" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Client</label>
                        <select v-model="project.client_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option :value="null">— none —</option><option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Type of project</label>
                        <select v-model="project.project_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="new">New</option><option value="renovation">Renovation</option></select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Contract value</label><input v-model.number="project.contract_value" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Currency</label>
                        <select v-model="project.currency_code" @change="onCurrencyChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option v-for="c in currencies" :key="c.id" :value="c.code">{{ c.code }} ({{ c.symbol }})</option>
                        </select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="project.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Status</label>
                        <select v-model="project.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="project.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Target end date</label><input v-model="project.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Description</label><textarea v-model="project.description" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                </div>
                <div class="mt-4"><button @click="saveDetails" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save changes' }}</button></div>
            </div>

            <!-- FLOORS -->
            <div v-if="tab==='floors'" class="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
                <h2 class="font-medium text-slate-700 mb-1">Floors in this project</h2>
                <p class="text-sm text-slate-500 mb-4">Tick the floors this project has. BOQ items can then be split by floor.</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label v-for="f in FLOOR_CATALOG" :key="f.code" class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer" :class="selectedCodes[f.code] ? 'border-brand bg-blue-50' : 'border-slate-200'">
                        <input type="checkbox" v-model="selectedCodes[f.code]" class="accent-brand"> <span class="text-sm text-slate-700">{{ f.label }}</span>
                    </label>
                </div>
                <div class="mt-4"><button @click="saveFloors" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save floors' }}</button></div>
            </div>

            <!-- BOQ: item cards with per-floor breakdown table -->
            <div v-if="tab==='boq'">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-medium text-slate-700">Bill of Quantities</h2>
                    <div class="flex items-center gap-3">
                        <span class="text-sm text-slate-500">Total: <span class="font-semibold text-slate-800">{{ pmoney(boqTotal) }}</span></span>
                        <button @click="openAdd" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Add item</button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div v-for="e in entries" :key="e.id" class="bg-white rounded-xl border border-slate-200 p-4">
                        <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
                            <div>
                                <div class="text-sm"><span class="font-mono text-xs text-slate-400 mr-2">{{ e.item_code }}</span><span class="font-medium text-slate-800">{{ e.item_head }}</span> <span class="text-xs text-slate-400">· {{ e.unit }}</span></div>
                                <div class="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{{ e.description }}</div>
                            </div>
                            <div class="text-right whitespace-nowrap">
                                <div class="text-xs text-slate-400">Item Total</div>
                                <div class="font-semibold text-slate-800">{{ pmoney(e.entry_total) }}</div>
                                <div class="mt-1"><button @click="openEdit(e)" class="text-brand hover:underline text-xs mr-2">Edit</button><button @click="deleteEntry(e)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button></div>
                            </div>
                        </div>
                        <!-- no-heading floor breakdown table with a column-wise total row -->
                        <table class="w-full text-sm border-t border-slate-100">
                            <tbody>
                                <tr v-for="l in e.lines" :key="l.id" class="border-b border-slate-50">
                                    <td class="py-1.5 pr-3 text-slate-600">{{ l.floor_label || 'Whole project' }}</td>
                                    <td class="py-1.5 px-3 text-right text-slate-600">{{ l.quantity }}</td>
                                    <td class="py-1.5 px-3 text-right text-slate-600">{{ pmoney(l.rate) }}</td>
                                    <td class="py-1.5 pl-3 text-right text-slate-700">{{ pmoney(l.amount) }}</td>
                                </tr>
                                <tr class="border-t border-slate-200 font-medium">
                                    <td class="py-1.5 pr-3 text-slate-700">Total</td>
                                    <td class="py-1.5 px-3 text-right text-slate-700">{{ nf(lineSum(e.lines,'quantity')) }}</td>
                                    <td class="py-1.5 px-3"></td>
                                    <td class="py-1.5 pl-3 text-right text-slate-800">{{ pmoney(e.entry_total) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-if="!entries.length" class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">No BOQ items yet — click “+ Add item”.</div>
                </div>
            </div>

            <!-- CONSTRUCTION STAGES (table + modal add/edit) -->
            <div v-if="tab==='stages'" class="bg-white rounded-xl border border-slate-200 p-6">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-medium text-slate-700">Construction Stages</h2>
                    <button @click="openStageAdd" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Add stage</button>
                </div>
                <div class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 pr-2 w-24">Phase No.</th><th class="py-2 pr-2">Details</th><th class="py-2 pr-2 text-right w-28">Percentage</th><th class="py-2 pr-2 text-right w-40">Amount</th><th class="py-2 pr-2 text-right w-28"></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="s in stages" :key="s.id" class="border-b border-slate-50">
                                <td class="py-2 pr-2 text-slate-700">{{ s.phase_no }}</td>
                                <td class="py-2 pr-2 text-slate-700">{{ s.details }}</td>
                                <td class="py-2 pr-2 text-right text-slate-600">{{ nf(s.percentage) }}%</td>
                                <td class="py-2 pr-2 text-right text-slate-700">{{ pmoney(s.amount) }}</td>
                                <td class="py-2 pr-2 text-right whitespace-nowrap">
                                    <button @click="openStageEdit(s)" class="text-brand hover:underline text-xs mr-2">Edit</button>
                                    <button @click="deleteStage(s)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                </td>
                            </tr>
                            <tr v-if="!stages.length"><td colspan="5" class="py-6 text-center text-slate-400">No stages — click “+ Add stage”.</td></tr>
                        </tbody>
                        <tfoot>
                            <tr class="border-t border-slate-200 font-medium">
                                <td colspan="3" class="py-2 pr-2 text-right text-slate-600">Grand total</td>
                                <td class="py-2 pr-2 text-right text-slate-800">{{ pmoney(stagesGrand) }}</td><td></td>
                            </tr>
                            <tr>
                                <td colspan="3" class="py-1 pr-2 text-right text-slate-500">Contract value</td>
                                <td class="py-1 pr-2 text-right text-slate-600">{{ pmoney(project.contract_value) }}</td><td></td>
                            </tr>
                            <tr>
                                <td colspan="3" class="py-1 pr-2 text-right text-slate-500">Difference (contract − stages)</td>
                                <td class="py-1 pr-2 text-right font-semibold" :class="stagesDiff===0 ? 'text-emerald-600' : (stagesDiff>0 ? 'text-amber-600' : 'text-rose-600')">{{ pmoney(stagesDiff) }}</td><td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Construction stage Add/Edit modal -->
            <div v-if="showStageModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ editingStageId ? 'Edit stage' : 'Add stage' }}</h2>
                        <button @click="showStageModal=false" class="text-slate-400">✕</button>
                    </div>
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="block text-xs text-slate-500 mb-1">Phase No.</label><input v-model.number="stageForm.phase_no" type="number" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                            <div><label class="block text-xs text-slate-500 mb-1">Percentage (%)</label><input v-model.number="stageForm.percentage" @input="onStagePercentChange" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        </div>
                        <div><label class="block text-xs text-slate-500 mb-1">Details</label><textarea v-model="stageForm.details" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Amount <span class="text-slate-400">(auto from % × contract value {{ pmoney(project.contract_value) }})</span></label><input v-model.number="stageForm.amount" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showStageModal=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="saveStage" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save stage' }}</button>
                    </div>
                </div>
            </div>

            <!-- BOQ Add/Edit modal (wide) -->
            <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto">
                <div class="w-full max-w-5xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ editingId ? 'Edit BOQ item' : 'Add BOQ item' }}</h2>
                        <button @click="showModal=false" class="text-slate-400">✕</button>
                    </div>

                    <div class="mb-3">
                        <label class="block text-sm text-slate-600 mb-1">Item head <span class="text-xs text-slate-400">(from master, filtered by project type “{{ project.project_type }}”)</span></label>
                        <select v-model="form.boq_item_master_id" @change="onPickMaster" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option :value="null">— custom / type manually —</option>
                            <option v-for="m in masterItems" :key="m.id" :value="m.id">{{ m.item_head }} ({{ m.item_code }})</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div><label class="block text-xs text-slate-500 mb-1">Item code</label><input v-model="form.item_code" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="sm:col-span-2"><label class="block text-xs text-slate-500 mb-1">Item head</label><input v-model="form.item_head" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    </div>
                    <div class="mb-4">
                        <label class="block text-xs text-slate-500 mb-1">Description</label>
                        <textarea v-model="form.description" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                    </div>

                    <div class="table-scroll border border-slate-100 rounded-lg">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100 bg-slate-50">
                                <th class="py-2 px-3">Floor</th><th class="py-2 px-3">Unit</th><th class="py-2 px-3 text-right">Quantity</th><th class="py-2 px-3 text-right">Rate</th><th class="py-2 px-3 text-right">Amount</th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="(r,i) in modalLines" :key="i" class="border-b border-slate-50">
                                    <td class="py-1.5 px-3 text-slate-700">{{ r.floor_label }}</td>
                                    <td class="py-1.5 px-3"><input v-model="r.unit" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-16"></td>
                                    <td class="py-1.5 px-3 text-right"><input v-model.number="r.quantity" type="number" step="0.001" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-24 text-right"></td>
                                    <td class="py-1.5 px-3 text-right"><input v-model.number="r.rate" type="number" step="0.01" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-24 text-right"></td>
                                    <td class="py-1.5 px-3 text-right font-medium text-slate-700">{{ pmoney(modalRowAmount(r)) }}</td>
                                </tr>
                            </tbody>
                            <tfoot><tr class="border-t border-slate-200"><td colspan="4" class="py-2 px-3 text-right font-medium text-slate-600">Item total</td><td class="py-2 px-3 text-right font-semibold text-slate-800">{{ pmoney(modalTotal) }}</td></tr></tfoot>
                        </table>
                    </div>

                    <div class="flex justify-end gap-2 mt-4">
                        <button @click="showModal=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="saveEntry" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save item' }}</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/project/:id', 'ProjectDetailView', ProjectDetailView);
})();
