/**
 * Project detail view (#/project/:id): edit project (incl. type New/Renovation),
 * manage floors (basement 2 … 10th floor), and capture the Bill of Quantities
 * with an optional per-floor split.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    // Standard floor catalogue (basements negative, GF 0, upper floors positive).
    const FLOOR_CATALOG = [
        { code: 'B2', label: 'Basement 2', sort_order: -2 },
        { code: 'B1', label: 'Basement 1', sort_order: -1 },
        { code: 'GF', label: 'Ground Floor', sort_order: 0 },
        { code: 'F1', label: '1st Floor', sort_order: 1 },
        { code: 'F2', label: '2nd Floor', sort_order: 2 },
        { code: 'F3', label: '3rd Floor', sort_order: 3 },
        { code: 'F4', label: '4th Floor', sort_order: 4 },
        { code: 'F5', label: '5th Floor', sort_order: 5 },
        { code: 'F6', label: '6th Floor', sort_order: 6 },
        { code: 'F7', label: '7th Floor', sort_order: 7 },
        { code: 'F8', label: '8th Floor', sort_order: 8 },
        { code: 'F9', label: '9th Floor', sort_order: 9 },
        { code: 'F10', label: '10th Floor', sort_order: 10 },
    ];

    const ProjectDetailView = {
        setup() {
            const id = computed(() => parseInt(store.params.id, 10));
            const tab = ref('details');
            const loading = ref(true);
            const saving = ref(false);
            const project = reactive({});
            const floors = ref([]);            // saved floors
            const selectedCodes = ref({});     // code -> bool (floor picker)
            const boq = ref([]);
            const fmt = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

            async function load() {
                loading.value = true;
                try {
                    const p = (await api.get('/api/projects/' + id.value)).data;
                    Object.assign(project, p);
                    floors.value = (await api.get('/api/projects/' + id.value + '/floors')).data;
                    const sel = {}; floors.value.forEach(f => { sel[f.code] = true; });
                    selectedCodes.value = sel;
                    const b = (await api.get('/api/projects/' + id.value + '/boq')).data;
                    boq.value = b.items.map(x => ({ project_floor_id: x.project_floor_id, item_code: x.item_code, description: x.description, unit: x.unit, quantity: +x.quantity, rate: +x.rate }));
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            onMounted(load);
            watch(id, load);

            async function saveDetails() {
                saving.value = true;
                try {
                    await api.put('/api/projects/' + id.value, {
                        name: project.name, project_type: project.project_type, code: project.code,
                        description: project.description, site_address: project.site_address,
                        contract_value: project.contract_value, start_date: project.start_date,
                        end_date: project.end_date, status: project.status,
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

            // BOQ grid
            function addRow() { boq.value.push({ project_floor_id: null, item_code: '', description: '', unit: '', quantity: 1, rate: 0 }); }
            function removeRow(i) { boq.value.splice(i, 1); }
            const rowAmount = (r) => Math.round(((+r.quantity || 0) * (+r.rate || 0)) * 100) / 100;
            const boqTotal = computed(() => boq.value.reduce((s, r) => s + rowAmount(r), 0));
            async function saveBoq() {
                saving.value = true;
                try {
                    const b = (await api.post('/api/projects/' + id.value + '/boq', { items: boq.value })).data;
                    CSApp.flash('success', 'BOQ saved (' + b.items.length + ' items)');
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            return { FLOOR_CATALOG, id, tab, loading, saving, project, floors, selectedCodes, boq, fmt,
                saveDetails, saveFloors, addRow, removeRow, rowAmount, boqTotal, saveBoq };
        },
        template: `
        <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading project…</div>
        <div v-else>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <a href="#/projects" class="text-sm text-brand hover:underline">← Projects</a>
                    <h1 class="text-xl font-semibold text-slate-800">{{ project.name }} <span class="text-sm font-normal text-slate-400">{{ project.code }}</span></h1>
                </div>
                <a :href="'#/projects'" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Open board</a>
            </div>

            <div class="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm mb-5 w-fit">
                <button @click="tab='details'" :class="tab==='details'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Details</button>
                <button @click="tab='floors'" :class="tab==='floors'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Floors</button>
                <button @click="tab='boq'" :class="tab==='boq'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">BOQ</button>
            </div>

            <!-- DETAILS / EDIT -->
            <div v-if="tab==='details'" class="bg-white rounded-xl border border-slate-200 p-6 max-w-3xl">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label class="block text-sm text-slate-600 mb-1">Project name</label><input v-model="project.name" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Type of project</label>
                        <select v-model="project.project_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="new">New</option>
                            <option value="renovation">Renovation</option>
                        </select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="project.code" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Status</label>
                        <select v-model="project.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Contract value</label><input v-model.number="project.contract_value" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="project.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="project.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Target end</label><input v-model="project.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
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

            <!-- BOQ -->
            <div v-if="tab==='boq'" class="bg-white rounded-xl border border-slate-200 p-6">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-medium text-slate-700">Bill of Quantities</h2>
                    <div class="text-sm text-slate-500">Total: <span class="font-semibold text-slate-800">{{ fmt(boqTotal) }}</span></div>
                </div>
                <p v-if="!floors.length" class="text-xs text-amber-600 mb-2">Tip: add floors first (Floors tab) if you want to split items by floor.</p>
                <div class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 pr-2">Floor</th><th class="py-2 pr-2">Code</th><th class="py-2 pr-2">Description</th><th class="py-2 pr-2">Unit</th>
                            <th class="py-2 pr-2 text-right">Qty</th><th class="py-2 pr-2 text-right">Rate</th><th class="py-2 pr-2 text-right">Amount</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="(r,i) in boq" :key="i" class="border-b border-slate-50">
                                <td class="py-1.5 pr-2">
                                    <select v-model="r.project_floor_id" class="rounded border border-slate-200 px-1.5 py-1 text-xs">
                                        <option :value="null">— whole project —</option>
                                        <option v-for="f in floors" :key="f.id" :value="f.id">{{ f.label }}</option>
                                    </select>
                                </td>
                                <td class="py-1.5 pr-2"><input v-model="r.item_code" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-20"></td>
                                <td class="py-1.5 pr-2"><input v-model="r.description" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-48"></td>
                                <td class="py-1.5 pr-2"><input v-model="r.unit" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-16"></td>
                                <td class="py-1.5 pr-2"><input v-model.number="r.quantity" type="number" step="0.001" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-20 text-right"></td>
                                <td class="py-1.5 pr-2"><input v-model.number="r.rate" type="number" step="0.01" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-24 text-right"></td>
                                <td class="py-1.5 pr-2 text-right font-medium text-slate-700">{{ fmt(rowAmount(r)) }}</td>
                                <td class="py-1.5 text-right"><button @click="removeRow(i)" class="text-rose-400 hover:text-rose-600">✕</button></td>
                            </tr>
                            <tr v-if="!boq.length"><td colspan="8" class="py-6 text-center text-slate-400">No BOQ items — add a row.</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="flex gap-2 mt-3">
                    <button @click="addRow" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">+ Add row</button>
                    <button @click="saveBoq" :disabled="saving" class="px-3 py-1.5 text-xs rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save BOQ' }}</button>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/project/:id', 'ProjectDetailView', ProjectDetailView);
})();
