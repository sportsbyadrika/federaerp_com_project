/**
 * Setup / Master Data manager. One config-driven screen to add, list and delete
 * the reference data the rest of the app depends on — Construction Models and
 * Base Rates (used by the Estimation workspace), plus Clients, Suppliers and
 * Materials. Backed by the generic tenant-scoped CRUD API (MasterDataController).
 */
(function () {
    'use strict';
    const { ref, reactive, onMounted } = Vue;

    // resource key -> definition. `endpoint` matches MasterDataController routes.
    const RESOURCES = {
        'construction-models': {
            label: 'Construction Models',
            endpoint: '/api/construction-models',
            columns: [
                { key: 'name', label: 'Name' },
                { key: 'category', label: 'Category' },
                { key: 'description', label: 'Description' },
            ],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Standard Residential Villa' },
                { key: 'category', label: 'Category', type: 'select', options: ['residential', 'commercial', 'industrial', 'infrastructure', 'other'] },
                { key: 'description', label: 'Description', type: 'text' },
            ],
            defaults: { category: 'residential' },
        },
        'base-rates': {
            label: 'Base Rates',
            endpoint: '/api/base-rates',
            columns: [
                { key: 'rate_type', label: 'Type' },
                { key: 'item_code', label: 'Code' },
                { key: 'item_name', label: 'Item' },
                { key: 'unit', label: 'Unit' },
                { key: 'base_rate', label: 'Rate' },
                { key: 'wastage_percent', label: 'Waste %' },
            ],
            fields: [
                { key: 'rate_type', label: 'Rate type', type: 'select', options: ['material', 'labour'], required: true },
                { key: 'item_code', label: 'Item code', type: 'text', required: true, placeholder: 'e.g. CEM01' },
                { key: 'item_name', label: 'Item name', type: 'text', required: true, placeholder: 'e.g. Cement (OPC)' },
                { key: 'unit', label: 'Unit', type: 'text', required: true, placeholder: 'bag / kg / hour' },
                { key: 'base_rate', label: 'Base rate', type: 'number', required: true },
                { key: 'wastage_percent', label: 'Wastage %', type: 'number' },
            ],
            defaults: { rate_type: 'material', wastage_percent: 0 },
        },
        'clients': {
            label: 'Clients',
            endpoint: '/api/clients',
            columns: [
                { key: 'name', label: 'Name' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
            ],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'contact_person', label: 'Contact person', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'address', label: 'Address', type: 'text' },
            ],
        },
        'suppliers': {
            label: 'Suppliers',
            endpoint: '/api/suppliers',
            columns: [
                { key: 'name', label: 'Name' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'phone', label: 'Phone' },
            ],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'contact_person', label: 'Contact person', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'text' },
            ],
        },
        'materials': {
            label: 'Materials',
            endpoint: '/api/materials',
            columns: [
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Name' },
                { key: 'unit', label: 'Unit' },
                { key: 'unit_price', label: 'Unit price' },
                { key: 'reorder_level', label: 'Reorder level' },
            ],
            fields: [
                { key: 'code', label: 'Code', type: 'text', required: true },
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'category', label: 'Category', type: 'text' },
                { key: 'unit', label: 'Unit', type: 'text', required: true },
                { key: 'unit_price', label: 'Unit price', type: 'number' },
                { key: 'reorder_level', label: 'Reorder level', type: 'number' },
            ],
        },
    };

    const SetupView = {
        setup() {
            const keys = Object.keys(RESOURCES);
            const active = ref('construction-models');
            const rows = ref([]);
            const loading = ref(false);
            const saving = ref(false);
            const form = reactive({});

            function def() { return RESOURCES[active.value]; }

            function resetForm() {
                Object.keys(form).forEach(k => delete form[k]);
                const d = def();
                d.fields.forEach(f => { form[f.key] = (d.defaults && d.defaults[f.key] !== undefined) ? d.defaults[f.key] : ''; });
            }

            async function load() {
                loading.value = true; rows.value = [];
                try { rows.value = (await api.get(def().endpoint)).data; }
                catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }

            function selectTab(k) { active.value = k; resetForm(); load(); }

            async function save() {
                const d = def();
                for (const f of d.fields) {
                    if (f.required && (form[f.key] === '' || form[f.key] === null || form[f.key] === undefined)) {
                        CSApp.flash('error', f.label + ' is required'); return;
                    }
                }
                saving.value = true;
                try {
                    const payload = {};
                    d.fields.forEach(f => { if (form[f.key] !== '' && form[f.key] !== null) payload[f.key] = form[f.key]; });
                    await api.post(d.endpoint, payload);
                    CSApp.flash('success', d.label.replace(/s$/, '') + ' added');
                    resetForm();
                    await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            async function remove(row) {
                if (!confirm('Delete this ' + def().label.replace(/s$/, '').toLowerCase() + '?')) return;
                try { await api.del(def().endpoint + '/' + row.id); CSApp.flash('success', 'Deleted'); await load(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            onMounted(() => { resetForm(); load(); });
            return { RESOURCES, keys, active, rows, loading, saving, form, def, selectTab, save, remove };
        },
        template: `
        <div>
            <h1 class="text-xl font-semibold text-slate-800 mb-1">Setup</h1>
            <p class="text-sm text-slate-500 mb-5">Reference data used across the app. Add construction models &amp; base rates here — they appear in the Estimation workspace.</p>

            <div class="flex flex-wrap gap-2 mb-5">
                <button v-for="k in keys" :key="k" @click="selectTab(k)"
                        :class="active===k ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-300'"
                        class="px-3 py-1.5 text-sm rounded-lg border hover:bg-slate-50">{{ RESOURCES[k].label }}</button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Add form -->
                <div class="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                    <h2 class="font-medium text-slate-700 mb-3">Add {{ def().label.replace(/s$/,'') }}</h2>
                    <div class="space-y-3">
                        <div v-for="f in def().fields" :key="f.key">
                            <label class="block text-sm text-slate-600 mb-1">{{ f.label }}<span v-if="f.required" class="text-rose-500"> *</span></label>
                            <select v-if="f.type==='select'" v-model="form[f.key]" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
                            </select>
                            <input v-else v-model="form[f.key]" :type="f.type==='number' ? 'number' : (f.type==='email' ? 'email' : 'text')"
                                   :step="f.type==='number' ? 'any' : null" :placeholder="f.placeholder || ''"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <button @click="save" :disabled="saving" class="w-full py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : '+ Add' }}</button>
                    </div>
                </div>

                <!-- List -->
                <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">{{ def().label }}</h2>
                    <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                    <div v-else class="table-scroll">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                <th v-for="c in def().columns" :key="c.key" class="py-2 px-3">{{ c.label }}</th>
                                <th class="py-2 px-3"></th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="row in rows" :key="row.id" class="border-b border-slate-50">
                                    <td v-for="c in def().columns" :key="c.key" class="py-2 px-3 text-slate-700">{{ row[c.key] }}</td>
                                    <td class="py-2 px-3 text-right"><button @click="remove(row)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button></td>
                                </tr>
                                <tr v-if="!rows.length"><td :colspan="def().columns.length + 1" class="py-8 text-center text-slate-400">Nothing yet — add one on the left.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/setup', 'SetupView', SetupView);
})();
