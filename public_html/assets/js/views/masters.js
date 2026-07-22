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
            label: 'Clients', endpoint: '/api/clients', partyLedger: 'client',
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
            label: 'Suppliers', endpoint: '/api/suppliers', partyLedger: 'supplier',
            columns: [{ key: 'name', label: 'Name' }, { key: 'contact_person', label: 'Contact' }, { key: 'gst_number', label: 'GST' }, { key: 'pan', label: 'PAN' }, { key: 'phone', label: 'Phone' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'contact_person', label: 'Contact person', type: 'text' },
                { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'gst_number', label: 'GST number', type: 'text' }, { key: 'pan', label: 'PAN', type: 'text' },
            ],
        },
        'subcontractors': {
            label: 'Sub-contractors', endpoint: '/api/subcontractors', partyLedger: 'subcontractor',
            columns: [{ key: 'name', label: 'Name' }, { key: 'trade', label: 'Trade' }, { key: 'gst_number', label: 'GST' }, { key: 'pan', label: 'PAN' }, { key: 'phone', label: 'Phone' }],
            fields: [
                { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'trade', label: 'Trade', type: 'text', placeholder: 'e.g. Structural Steel' },
                { key: 'contact_person', label: 'Contact person', type: 'text' }, { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'gst_number', label: 'GST number', type: 'text' }, { key: 'pan', label: 'PAN', type: 'text' },
            ],
        },
        'bank-accounts': {
            label: 'Bank Accounts', endpoint: '/api/bank-accounts', hasLedger: true,
            columns: [{ key: 'account_label', label: 'Label' }, { key: 'bank_name', label: 'Bank' }, { key: 'account_number', label: 'Account no.' }, { key: 'ifsc', label: 'IFSC' }, { key: 'opening_balance', label: 'Opening bal.' }],
            fields: [
                { key: 'account_label', label: 'Account label', type: 'text', required: true, placeholder: 'shown in dropdowns, e.g. Main Current A/c' },
                { key: 'bank_name', label: 'Bank name', type: 'text', required: true },
                { key: 'account_number', label: 'Account number', type: 'text', required: true },
                { key: 'ifsc', label: 'IFSC', type: 'text' },
                { key: 'branch_name', label: 'Branch name', type: 'text' },
                { key: 'opening_balance', label: 'Opening balance', type: 'number' },
                { key: 'opening_balance_date', label: 'Opening balance as-on date', type: 'date' },
            ],
            defaults: { opening_balance: 0 },
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
            // Deep-link support: #/setup?tab=clients selects that master.
            const initialTab = (store.query && store.query.tab && RESOURCES[store.query.tab]) ? store.query.tab : 'construction-models';
            const active = ref(initialTab);
            const rows = ref([]);
            const loading = ref(false);
            const saving = ref(false);
            const form = reactive({});
            const filterValue = ref('');
            const dynOptions = reactive({}); // endpoint -> [rows]
            const editingId = ref(null);

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
                editingId.value = null;
                Object.keys(form).forEach(k => delete form[k]);
                const d = def();
                d.fields.forEach(f => { form[f.key] = (d.defaults && d.defaults[f.key] !== undefined) ? d.defaults[f.key] : (f.type === 'checkbox' ? false : ''); });
            }
            function startEdit(row) {
                editingId.value = row.id;
                const d = def();
                d.fields.forEach(f => {
                    const v = row[f.key];
                    form[f.key] = f.type === 'checkbox' ? (+v === 1) : (v === null || v === undefined ? '' : v);
                });
            }
            function cancelEdit() { resetForm(); }
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
                    d.fields.forEach(f => {
                        if (f.type === 'checkbox') { payload[f.key] = form[f.key] ? 1 : 0; return; }
                        if (form[f.key] !== '' && form[f.key] !== null && form[f.key] !== undefined) payload[f.key] = form[f.key];
                        else if (editingId.value) payload[f.key] = null; // allow clearing on edit
                    });
                    const label = d.label.replace(/s$/, '');
                    if (editingId.value) {
                        await api.put(d.endpoint + '/' + editingId.value, payload);
                        CSApp.flash('success', label + ' updated');
                    } else {
                        await api.post(d.endpoint, payload);
                        CSApp.flash('success', label + ' added');
                    }
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

            // ---- Bank ledger (bank-accounts resource) ----
            const money = (n) => CSApp.money(n);
            const nf = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
            const escp = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const ledger = reactive({ open: false, loading: false, data: null });
            async function openLedger(row) {
                ledger.open = true; ledger.loading = true; ledger.data = null;
                try { ledger.data = (await api.get('/api/bank-accounts/' + row.id + '/ledger')).data; }
                catch (e) { CSApp.flash('error', e.message); ledger.open = false; }
                finally { ledger.loading = false; }
            }

            // ---- Party ledger (clients / suppliers / sub-contractors) ----
            const org = ref({});
            const pledger = reactive({ open: false, loading: false, data: null, label: '' });
            async function openPartyLedger(row) {
                const type = def().partyLedger;
                pledger.open = true; pledger.loading = true; pledger.data = null; pledger.label = def().label.replace(/s$/, '');
                if (!org.value.name) { try { org.value = (await api.get('/api/organisation')).data; } catch (e) { org.value = {}; } }
                try { pledger.data = (await api.get('/api/party-ledger/' + type + '/' + row.id)).data; }
                catch (e) { CSApp.flash('error', e.message); pledger.open = false; }
                finally { pledger.loading = false; }
            }
            function printPartyLedger() {
                if (!pledger.data) return;
                const html = buildPartyLedgerHtml(pledger.data, pledger.label, org.value);
                const w = window.open('', '_blank', 'width=900,height=1000');
                if (!w) { CSApp.flash('error', 'Please allow pop-ups to generate the PDF'); return; }
                w.document.open(); w.document.write(html); w.document.close();
            }
            function buildPartyLedgerHtml(d, kindLabel, o) {
                const m = (n) => (store.currency && store.currency.symbol || '') + nf(n);
                const instName = (o && (o.legal_name || o.name)) || (store.appName || 'Institution');
                const instAddr = (o && (o.letterhead_address || o.address)) || '';
                const rows = d.transactions.map(t =>
                    '<tr><td>' + escp((t.txn_date || '').slice(0, 10)) + '</td><td>' + escp(t.txn_type) + '</td><td>' + escp(t.project_name || '') + '</td><td>' + escp(t.reference || '') + '</td>' +
                    '<td class="r">' + (+t.income_amount ? m(t.income_amount) : '') + '</td><td class="r">' + (+t.expense_amount ? m(t.expense_amount) : '') + '</td></tr>'
                ).join('') || '<tr><td colspan="6" class="muted">No transactions.</td></tr>';
                return '<!doctype html><html><head><meta charset="utf-8"><title>' + escp(kindLabel) + ' ledger — ' + escp(d.party.name) + '</title>' +
                    '<style>@page{size:A4;margin:16mm;}*{box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;margin:0;}' +
                    '.sheet{max-width:180mm;margin:0 auto;}.hd{border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:12px;}' +
                    '.hd .name{font-size:19px;font-weight:bold;}.hd .meta{font-size:11px;color:#333;margin-top:2px;}' +
                    '.title{text-align:center;font-size:14px;font-weight:bold;text-transform:uppercase;margin:6px 0 12px;letter-spacing:.5px;}' +
                    '.party{font-size:12px;margin-bottom:12px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #999;padding:6px 8px;font-size:11px;}th{background:#f2f2f2;text-align:left;}' +
                    '.r{text-align:right;}.muted{color:#888;text-align:center;}tfoot td{font-weight:bold;background:#f7f7f7;}' +
                    '.net{margin-top:14px;border:2px solid #222;padding:8px 12px;display:flex;justify-content:space-between;font-weight:bold;font-size:14px;}</style>' +
                    '</head><body onload="window.focus();window.print();"><div class="sheet">' +
                    '<div class="hd"><div class="name">' + escp(instName) + '</div><div class="meta">' + (instAddr ? escp(instAddr).replace(/\\n/g, '<br>') : '') + '</div></div>' +
                    '<div class="title">' + escp(kindLabel) + ' Ledger</div>' +
                    '<div class="party"><strong>' + escp(d.party.name) + '</strong>' + (d.party.gst ? ' · GSTIN: ' + escp(d.party.gst) : '') + (d.party.phone ? ' · ' + escp(d.party.phone) : '') + '</div>' +
                    '<table><thead><tr><th>Date</th><th>Type</th><th>Project</th><th>Reference</th><th class="r">Income</th><th class="r">Expense</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                    '<tfoot><tr><td colspan="4" class="r">Totals</td><td class="r">' + m(d.income_total) + '</td><td class="r">' + m(d.expense_total) + '</td></tr></tfoot></table>' +
                    '<div class="net"><span>Net (income − expense)</span><span>' + m(d.net) + '</span></div>' +
                    '</div></body></html>';
            }

            onMounted(async () => { resetForm(); await ensureDynOptions(); load(); });
            return { RESOURCES, keys, active, rows, loading, saving, form, filterValue, editingId, def, selectTab, save, remove, post, optionsFor, startEdit, cancelEdit,
                money, nf, ledger, openLedger, pledger, openPartyLedger, printPartyLedger };
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
                <div class="bg-white rounded-xl border border-slate-200 p-5 h-fit" :class="editingId ? 'ring-2 ring-brand/40' : ''">
                    <h2 class="font-medium text-slate-700 mb-3">{{ editingId ? 'Edit' : 'Add' }} {{ def().label.replace(/s$/,'') }}</h2>
                    <div class="space-y-3">
                        <div v-for="f in def().fields" :key="f.key">
                            <label v-if="f.type!=='checkbox'" class="block text-sm text-slate-600 mb-1">{{ f.label }}<span v-if="f.required" class="text-rose-500"> *</span></label>
                            <select v-if="f.type==='select'" v-model="form[f.key]" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="o in optionsFor(f)" :key="o.v" :value="o.v">{{ o.l }}</option>
                            </select>
                            <textarea v-else-if="f.type==='textarea'" v-model="form[f.key]" rows="3" :placeholder="f.placeholder||''" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                            <label v-else-if="f.type==='checkbox'" class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" v-model="form[f.key]" class="accent-brand"> {{ f.label }}</label>
                            <input v-else v-model="form[f.key]" :type="f.type==='number'?'number':(f.type==='email'?'email':(f.type==='date'?'date':'text'))" :step="f.type==='number'?'any':null" :placeholder="f.placeholder||''"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div class="flex gap-2">
                            <button @click="save" :disabled="saving" class="flex-1 py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : (editingId ? 'Save changes' : '+ Add') }}</button>
                            <button v-if="editingId" @click="cancelEdit" class="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
                        </div>
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
                                        <button v-if="def().hasLedger" @click="openLedger(row)" class="text-emerald-600 hover:underline text-xs mr-2">Ledger</button>
                                        <button v-if="def().partyLedger" @click="openPartyLedger(row)" class="text-emerald-600 hover:underline text-xs mr-2">Ledger</button>
                                        <button @click="startEdit(row)" class="text-brand hover:underline text-xs mr-2">Edit</button>
                                        <button @click="remove(row)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                    </td>
                                </tr>
                                <tr v-if="!rows.length"><td :colspan="def().columns.length + 1" class="py-8 text-center text-slate-400">Nothing yet — add one on the left.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Bank ledger modal -->
            <div v-if="ledger.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-3xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">Bank ledger</h2>
                        <button @click="ledger.open=false" class="text-slate-400">✕</button>
                    </div>
                    <div v-if="ledger.loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                    <div v-else-if="ledger.data">
                        <!-- header -->
                        <div class="flex items-start justify-between flex-wrap gap-2 mb-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                            <div>
                                <div class="font-medium text-slate-800">{{ ledger.data.bank.bank_name }} <span class="text-slate-400 text-sm">· {{ ledger.data.bank.account_label }}</span></div>
                                <div class="text-xs text-slate-500">A/c {{ ledger.data.bank.account_number }}<span v-if="ledger.data.bank.ifsc"> · {{ ledger.data.bank.ifsc }}</span></div>
                            </div>
                            <div class="text-right text-sm">
                                <div class="text-slate-500">Opening balance</div>
                                <div class="font-semibold text-slate-800">{{ money(ledger.data.bank.opening_balance) }}</div>
                                <div v-if="ledger.data.bank.opening_balance_date" class="text-xs text-slate-400">as on {{ (ledger.data.bank.opening_balance_date||'').slice(0,10) }}</div>
                            </div>
                        </div>
                        <div class="table-scroll">
                            <table class="w-full text-sm">
                                <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                    <th class="py-2 px-3">Date</th><th class="py-2 px-3">Type</th><th class="py-2 px-3">Reference</th>
                                    <th class="py-2 px-3 text-right">Income</th><th class="py-2 px-3 text-right">Expense</th><th class="py-2 px-3 text-right">Balance</th>
                                </tr></thead>
                                <tbody>
                                    <tr class="border-b border-slate-50 bg-slate-50/40">
                                        <td class="py-2 px-3 text-slate-500" colspan="5">Opening balance</td>
                                        <td class="py-2 px-3 text-right text-slate-600">{{ money(ledger.data.bank.opening_balance) }}</td>
                                    </tr>
                                    <tr v-for="(t,i) in ledger.data.transactions" :key="i" class="border-b border-slate-50">
                                        <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (t.txn_date||'').slice(0,10) }}</td>
                                        <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="t.txn_type==='income'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'">{{ t.txn_type }}</span></td>
                                        <td class="py-2 px-3 text-slate-600">{{ t.reference || '—' }}</td>
                                        <td class="py-2 px-3 text-right text-emerald-700 whitespace-nowrap">{{ +t.income_amount ? money(t.income_amount) : '—' }}</td>
                                        <td class="py-2 px-3 text-right text-rose-600 whitespace-nowrap">{{ +t.expense_amount ? money(t.expense_amount) : '—' }}</td>
                                        <td class="py-2 px-3 text-right font-medium text-slate-800 whitespace-nowrap">{{ money(t.balance) }}</td>
                                    </tr>
                                    <tr v-if="!ledger.data.transactions.length"><td colspan="6" class="py-6 text-center text-slate-400">No transactions through this account yet.</td></tr>
                                </tbody>
                                <tfoot>
                                    <tr class="border-t-2 border-slate-200 font-semibold text-slate-700">
                                        <td class="py-2 px-3" colspan="3">Totals</td>
                                        <td class="py-2 px-3 text-right text-emerald-700">{{ money(ledger.data.income_total) }}</td>
                                        <td class="py-2 px-3 text-right text-rose-600">{{ money(ledger.data.expense_total) }}</td>
                                        <td class="py-2 px-3 text-right" :class="ledger.data.balance >= 0 ? 'text-emerald-700' : 'text-rose-600'">{{ money(ledger.data.balance) }}</td>
                                    </tr>
                                    <tr><td colspan="6" class="py-1 px-3 text-right text-xs text-slate-400">Balance = opening − expenditure + income</td></tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                    <div class="flex justify-end mt-4"><button @click="ledger.open=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Close</button></div>
                </div>
            </div>

            <!-- Party (client/supplier/sub-contractor) ledger modal -->
            <div v-if="pledger.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-3xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ pledger.label }} ledger</h2>
                        <div class="flex items-center gap-2">
                            <button v-if="pledger.data" @click="printPartyLedger" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">🖨 PDF</button>
                            <button @click="pledger.open=false" class="text-slate-400">✕</button>
                        </div>
                    </div>
                    <div v-if="pledger.loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                    <div v-else-if="pledger.data">
                        <div class="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                            <div class="font-medium text-slate-800">{{ pledger.data.party.name }}</div>
                            <div class="text-xs text-slate-500">
                                <span v-if="pledger.data.party.gst">GSTIN {{ pledger.data.party.gst }}</span>
                                <span v-if="pledger.data.party.pan"> · PAN {{ pledger.data.party.pan }}</span>
                                <span v-if="pledger.data.party.phone"> · {{ pledger.data.party.phone }}</span>
                            </div>
                        </div>
                        <div class="table-scroll">
                            <table class="w-full text-sm">
                                <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                    <th class="py-2 px-3">Date</th><th class="py-2 px-3">Type</th><th class="py-2 px-3">Project</th><th class="py-2 px-3">Reference</th>
                                    <th class="py-2 px-3 text-right">Income</th><th class="py-2 px-3 text-right">Expense</th>
                                </tr></thead>
                                <tbody>
                                    <tr v-for="(t,i) in pledger.data.transactions" :key="i" class="border-b border-slate-50">
                                        <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (t.txn_date||'').slice(0,10) }}</td>
                                        <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="t.txn_type==='income'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'">{{ t.txn_type }}</span></td>
                                        <td class="py-2 px-3 text-slate-600">{{ t.project_name || '—' }}</td>
                                        <td class="py-2 px-3 text-slate-600">{{ t.reference || '—' }}</td>
                                        <td class="py-2 px-3 text-right text-emerald-700 whitespace-nowrap">{{ +t.income_amount ? money(t.income_amount) : '—' }}</td>
                                        <td class="py-2 px-3 text-right text-rose-600 whitespace-nowrap">{{ +t.expense_amount ? money(t.expense_amount) : '—' }}</td>
                                    </tr>
                                    <tr v-if="!pledger.data.transactions.length"><td colspan="6" class="py-6 text-center text-slate-400">No income or expenses for this {{ pledger.label.toLowerCase() }} yet.</td></tr>
                                </tbody>
                                <tfoot>
                                    <tr class="border-t-2 border-slate-200 font-semibold text-slate-700">
                                        <td class="py-2 px-3" colspan="4">Totals</td>
                                        <td class="py-2 px-3 text-right text-emerald-700">{{ money(pledger.data.income_total) }}</td>
                                        <td class="py-2 px-3 text-right text-rose-600">{{ money(pledger.data.expense_total) }}</td>
                                    </tr>
                                    <tr><td colspan="6" class="py-1 px-3 text-right text-xs" :class="pledger.data.net >= 0 ? 'text-emerald-700' : 'text-rose-600'">Net (income − expense): {{ money(pledger.data.net) }}</td></tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                    <div class="flex justify-end mt-4"><button @click="pledger.open=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Close</button></div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/setup', 'SetupView', SetupView);
})();
