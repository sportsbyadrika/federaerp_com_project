/**
 * Setup / Master Data manager. Config-driven add/list/delete for the reference
 * data the app depends on: Construction Models, Base Rates, BOQ Item Master,
 * Unit Types, Currencies (with a default), Clients, Suppliers, Sub-contractors,
 * Materials. Backed by the tenant-scoped CRUD APIs.
 *
 * Field types: text, number, email, select (static or optionsFrom), textarea,
 * checkbox. Resources may declare `filter` (a query filter select) and
 * `rowActions` (per-row buttons, e.g. "Set default").
 */
(function () {
    'use strict';
    const { ref, reactive, onMounted } = Vue;

    const UNIT_OPTS = { optionsFrom: '/api/unit-types', optionLabel: 'name', optionValue: 'name' };

    const RESOURCES = {
        'construction-models': {
            label: 'Construction Models', endpoint: '/api/construction-models',
            columns: [{ key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Standard Residential Villa' },
                { key: 'category', label: 'Category', type: 'select', options: ['residential', 'commercial', 'industrial', 'infrastructure', 'other'] },
                { key: 'description', label: 'Description', type: 'text' },
            ],
            defaults: { category: 'residential' },
        },
        'boq-items': {
            label: 'BOQ Item Master', endpoint: '/api/boq-items',
            filter: { key: 'project_type', label: 'Project type', options: ['', 'new', 'renovation', 'any'] },
            columns: [
                { key: 'project_type', label: 'Type' }, { key: 'item_code', label: 'Code' },
                { key: 'item_head', label: 'Item head' }, { key: 'unit', label: 'Unit' }, { key: 'default_rate', label: 'Default rate' },
            ],
            fields: [
                { key: 'project_type', label: 'Project type', type: 'select', options: ['new', 'renovation', 'any'], required: true },
                { key: 'item_code', label: 'Item code', type: 'text', required: true, placeholder: 'e.g. CIV-01' },
                { key: 'item_head', label: 'Item head', type: 'text', required: true, placeholder: 'short name shown in dropdowns' },
                { key: 'description', label: 'Item description', type: 'textarea' },
                { key: 'unit', label: 'Default unit', type: 'select', ...UNIT_OPTS },
                { key: 'default_rate', label: 'Default rate', type: 'number' },
            ],
            defaults: { project_type: 'new', default_rate: 0 },
        },
        'unit-types': {
            label: 'Unit Types', endpoint: '/api/unit-types',
            columns: [{ key: 'name', label: 'Unit' }],
            fields: [{ key: 'name', label: 'Unit name', type: 'text', required: true, placeholder: 'e.g. cu.m, sq.m, nos' }],
        },
        'expenditure-types': {
            label: 'Expenditure Types', endpoint: '/api/expenditure-types',
            columns: [{ key: 'name', label: 'Type' }],
            fields: [{ key: 'name', label: 'Type name', type: 'text', required: true, placeholder: 'e.g. Materials, Labour, Fuel' }],
        },
        'currencies': {
            label: 'Currencies', endpoint: '/api/currencies',
            columns: [{ key: 'code', label: 'Code' }, { key: 'symbol', label: 'Symbol' }, { key: 'is_default', label: 'Default', boolean: true }],
            fields: [
                { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. INR' },
                { key: 'symbol', label: 'Symbol', type: 'text', required: true, placeholder: 'e.g. ₹' },
                { key: 'is_default', label: 'Set as default', type: 'checkbox' },
            ],
            rowActions: [{ label: 'Set default', hideWhen: (r) => +r.is_default === 1, call: (r, self) => self.post(self.def().endpoint + '/' + r.id + '/default') }],
        },
        'clients': {
            label: 'Clients', endpoint: '/api/clients',
            columns: [{ key: 'name', label: 'Name' }, { key: 'contact_person', label: 'Contact' }, { key: 'gst_number', label: 'GST' }, { key: 'pan', label: 'PAN' }, { key: 'phone', label: 'Phone' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'contact_person', label: 'Contact person', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'gst_number', label: 'GST number', type: 'text' }, { key: 'pan', label: 'PAN', type: 'text' },
                { key: 'address', label: 'Address', type: 'text' },
            ],
        },
        'suppliers': {
            label: 'Suppliers', endpoint: '/api/suppliers',
            columns: [{ key: 'name', label: 'Name' }, { key: 'contact_person', label: 'Contact' }, { key: 'gst_number', label: 'GST' }, { key: 'pan', label: 'PAN' }, { key: 'phone', label: 'Phone' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'contact_person', label: 'Contact person', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'gst_number', label: 'GST number', type: 'text' }, { key: 'pan', label: 'PAN', type: 'text' },
            ],
        },
        'subcontractors': {
            label: 'Sub-contractors', endpoint: '/api/subcontractors',
            columns: [{ key: 'name', label: 'Name' }, { key: 'trade', label: 'Trade' }, { key: 'gst_number', label: 'GST' }, { key: 'pan', label: 'PAN' }, { key: 'phone', label: 'Phone' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'trade', label: 'Trade', type: 'text', placeholder: 'e.g. Structural Steel' },
                { key: 'contact_person', label: 'Contact person', type: 'text' }, { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'gst_number', label: 'GST number', type: 'text' }, { key: 'pan', label: 'PAN', type: 'text' },
            ],
        },
        'materials': {
            label: 'Materials', endpoint: '/api/materials',
            columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'unit', label: 'Unit' }, { key: 'unit_price', label: 'Unit price' }, { key: 'reorder_level', label: 'Reorder level' }],
            fields: [
                { key: 'code', label: 'Code', type: 'text', required: true }, { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'category', label: 'Category', type: 'text' }, { key: 'unit', label: 'Unit', type: 'select', ...UNIT_OPTS },
                { key: 'unit_price', label: 'Unit price', type: 'number' }, { key: 'reorder_level', label: 'Reorder level', type: 'number' },
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
            const filterValue = ref('');
            const dynOptions = reactive({}); // endpoint -> [rows]

            function def() { return RESOURCES[active.value]; }

            async function ensureDynOptions() {
                for (const f of def().fields) {
                    if (f.optionsFrom && !dynOptions[f.optionsFrom]) {
                        try { dynOptions[f.optionsFrom] = (await api.get(f.optionsFrom)).data; } catch (e) { dynOptions[f.optionsFrom] = []; }
                    }
                }
            }
            function optionsFor(f) {
                if (f.options) return f.options.map(o => ({ v: o, l: o || '(all)' }));
                if (f.optionsFrom) return (dynOptions[f.optionsFrom] || []).map(r => ({ v: r[f.optionValue], l: r[f.optionLabel] }));
                return [];
            }

            function resetForm() {
                Object.keys(form).forEach(k => delete form[k]);
                const d = def();
                d.fields.forEach(f => { form[f.key] = (d.defaults && d.defaults[f.key] !== undefined) ? d.defaults[f.key] : (f.type === 'checkbox' ? false : ''); });
            }
            async function load() {
                loading.value = true; rows.value = [];
                try {
                    let url = def().endpoint;
                    if (def().filter && filterValue.value) url += '?' + def().filter.key + '=' + encodeURIComponent(filterValue.value);
                    rows.value = (await api.get(url)).data;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function selectTab(k) { active.value = k; filterValue.value = ''; resetForm(); await ensureDynOptions(); load(); }

            async function save() {
                const d = def();
                for (const f of d.fields) {
                    if (f.required && (form[f.key] === '' || form[f.key] === null || form[f.key] === undefined)) { CSApp.flash('error', f.label + ' is required'); return; }
                }
                saving.value = true;
                try {
                    const payload = {};
                    d.fields.forEach(f => { if (form[f.key] !== '' && form[f.key] !== null && form[f.key] !== undefined) payload[f.key] = f.type === 'checkbox' ? (form[f.key] ? 1 : 0) : form[f.key]; });
                    await api.post(d.endpoint, payload);
                    CSApp.flash('success', d.label.replace(/s$/, '') + ' added');
                    resetForm(); await load();
                    if (active.value === 'currencies') CSApp.loadCurrency();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function post(url) {
                try { await api.post(url, {}); CSApp.flash('success', 'Updated'); await load(); CSApp.loadCurrency(); }
                catch (e) { CSApp.flash('error', e.message); }
            }
            async function remove(row) {
                if (!confirm('Delete this ' + def().label.replace(/s$/, '').toLowerCase() + '?')) return;
                try { await api.del(def().endpoint + '/' + row.id); CSApp.flash('success', 'Deleted'); await load(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            onMounted(async () => { resetForm(); await ensureDynOptions(); load(); });
            return { RESOURCES, keys, active, rows, loading, saving, form, filterValue, def, selectTab, save, remove, post, optionsFor };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1">
                <h1 class="text-xl font-semibold text-slate-800">Setup</h1>
                <a href="#/institution" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">🏢 Institution settings</a>
            </div>
            <p class="text-sm text-slate-500 mb-5">Reference data used across the app. Construction models, base rates and BOQ items feed Estimation &amp; BOQ.</p>

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
                            <label v-if="f.type!=='checkbox'" class="block text-sm text-slate-600 mb-1">{{ f.label }}<span v-if="f.required" class="text-rose-500"> *</span></label>
                            <select v-if="f.type==='select'" v-model="form[f.key]" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="o in optionsFor(f)" :key="o.v" :value="o.v">{{ o.l }}</option>
                            </select>
                            <textarea v-else-if="f.type==='textarea'" v-model="form[f.key]" rows="3" :placeholder="f.placeholder||''" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                            <label v-else-if="f.type==='checkbox'" class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" v-model="form[f.key]" class="accent-brand"> {{ f.label }}</label>
                            <input v-else v-model="form[f.key]" :type="f.type==='number'?'number':(f.type==='email'?'email':'text')" :step="f.type==='number'?'any':null" :placeholder="f.placeholder||''"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <button @click="save" :disabled="saving" class="w-full py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : '+ Add' }}</button>
                    </div>
                </div>

                <!-- List -->
                <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="font-medium text-slate-700">{{ def().label }}</h2>
                        <div v-if="def().filter" class="flex items-center gap-2">
                            <span class="text-xs text-slate-400">{{ def().filter.label }}</span>
                            <select v-model="filterValue" @change="selectTab(active)" class="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                                <option v-for="o in def().filter.options" :key="o" :value="o">{{ o || 'All' }}</option>
                            </select>
                        </div>
                    </div>
                    <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                    <div v-else class="table-scroll">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                <th v-for="c in def().columns" :key="c.key" class="py-2 px-3">{{ c.label }}</th>
                                <th class="py-2 px-3"></th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="row in rows" :key="row.id" class="border-b border-slate-50">
                                    <td v-for="c in def().columns" :key="c.key" class="py-2 px-3 text-slate-700">
                                        <span v-if="c.boolean">{{ +row[c.key] === 1 ? '✓ default' : '' }}</span>
                                        <span v-else>{{ row[c.key] }}</span>
                                    </td>
                                    <td class="py-2 px-3 text-right whitespace-nowrap">
                                        <template v-for="a in (def().rowActions||[])" :key="a.label">
                                            <button v-if="!a.hideWhen || !a.hideWhen(row)" @click="a.call(row, { def, post })" class="text-brand hover:underline text-xs mr-2">{{ a.label }}</button>
                                        </template>
                                        <button @click="remove(row)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                    </td>
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
