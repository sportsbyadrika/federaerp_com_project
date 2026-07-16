/**
 * Income (#/income) — receipts of money from customer projects. Table with
 * Edit/Delete actions and a modal for add/edit. Each row can print an A4
 * receipt; before printing the user is asked whether to show GST or not.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const MODES = [
        { v: 'cash', l: 'Cash' }, { v: 'fund_transfer', l: 'Fund transfer' },
        { v: 'cheque', l: 'Cheque' }, { v: 'dd', l: 'DD' },
    ];
    const modeLabel = (v) => (MODES.find(m => m.v === v) || {}).l || v;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const IncomeView = {
        setup() {
            const rows = ref([]);
            const total = ref(0);
            const gstTotal = ref(0);
            const baseTotal = ref(0);
            const loading = ref(true);
            const saving = ref(false);
            const projects = ref([]);
            const clients = ref([]);
            const org = ref({});
            const filterProjectId = ref('');

            const fmt = (n) => CSApp.money(n);
            const nf = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
            const sym = () => (store.currency && store.currency.symbol) || '';

            const banks = ref([]);
            const showModal = ref(false);
            const editingId = ref(null);
            const form = reactive({
                project_id: null, client_id: null, amount: 0, gst_percent: 18, total: 0,
                mode: 'fund_transfer', bank_account_id: null, reference: '', income_date: new Date().toISOString().slice(0, 10), notes: '',
            });
            const needsBank = computed(() => ['fund_transfer', 'cheque', 'dd'].includes(form.mode));
            const gstAmount = computed(() => Math.round((+form.amount || 0) * (+form.gst_percent || 0) / 100 * 100) / 100);
            const round2 = (n) => Math.round((+n || 0) * 100) / 100;
            // Two-way base <-> total, linked by the GST %.
            function recalcFromBase() { form.total = round2((+form.amount || 0) * (1 + (+form.gst_percent || 0) / 100)); }
            function recalcFromTotal() { form.amount = round2((+form.total || 0) / (1 + (+form.gst_percent || 0) / 100)); }

            // receipt prompt
            const showReceiptAsk = ref(false);
            const receiptRow = ref(null);

            async function loadLists() {
                try { projects.value = (await api.get('/api/projects')).data; } catch (e) { projects.value = []; }
                try { clients.value = (await api.get('/api/clients')).data; } catch (e) { clients.value = []; }
                try { banks.value = (await api.get('/api/bank-accounts')).data; } catch (e) { banks.value = []; }
                try { org.value = (await api.get('/api/organisation')).data; } catch (e) { org.value = {}; }
            }
            async function load() {
                loading.value = true;
                try {
                    let url = '/api/incomes';
                    if (filterProjectId.value) url += '?project_id=' + encodeURIComponent(filterProjectId.value);
                    const d = (await api.get(url)).data;
                    rows.value = d.items; total.value = d.total; gstTotal.value = d.gst || 0; baseTotal.value = d.base || 0;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            function onProjectChange() {
                const p = projects.value.find(x => String(x.id) === String(form.project_id));
                if (p && p.client_id) form.client_id = p.client_id;
            }

            function openAdd() {
                editingId.value = null;
                Object.assign(form, { project_id: null, client_id: null, amount: 0, gst_percent: 18, total: 0, mode: 'fund_transfer', bank_account_id: null, reference: '', income_date: new Date().toISOString().slice(0, 10), notes: '' });
                showModal.value = true;
            }
            function openEdit(r) {
                editingId.value = r.id;
                Object.assign(form, {
                    project_id: r.project_id, client_id: r.client_id, amount: +r.amount, gst_percent: +r.gst_percent, total: +r.total_amount,
                    mode: r.mode, bank_account_id: r.bank_account_id || null, reference: r.reference || '', income_date: (r.income_date || '').slice(0, 10), notes: r.notes || '',
                });
                showModal.value = true;
            }
            async function save() {
                if (!form.project_id) { CSApp.flash('error', 'Select a project'); return; }
                if (!(+form.amount > 0)) { CSApp.flash('error', 'Amount must be greater than zero'); return; }
                saving.value = true;
                try {
                    const payload = {
                        project_id: form.project_id, client_id: form.client_id || null,
                        amount: +form.amount, gst_percent: +form.gst_percent || 0,
                        mode: form.mode, bank_account_id: needsBank.value ? (form.bank_account_id || null) : null,
                        reference: form.reference, income_date: form.income_date, notes: form.notes,
                    };
                    if (editingId.value) await api.put('/api/incomes/' + editingId.value, payload);
                    else await api.post('/api/incomes', payload);
                    CSApp.flash('success', 'Income saved'); showModal.value = false; await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function remove(r) {
                if (!confirm('Delete this income record?')) return;
                try { await api.del('/api/incomes/' + r.id); CSApp.flash('success', 'Deleted'); await load(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            // ---- Receipt printing (A4, with/without GST) ----
            function askReceipt(r) { receiptRow.value = r; showReceiptAsk.value = true; }
            async function printReceipt(withGst) {
                showReceiptAsk.value = false;
                const id = receiptRow.value && receiptRow.value.id;
                if (!id) return;
                let rec;
                try { rec = (await api.get('/api/incomes/' + id)).data; }
                catch (e) { CSApp.flash('error', e.message); return; }
                const html = buildReceiptHtml(rec, withGst, org.value);
                const w = window.open('', '_blank', 'width=800,height=900');
                if (!w) { CSApp.flash('error', 'Please allow pop-ups to print the receipt'); return; }
                w.document.open(); w.document.write(html); w.document.close();
            }
            function buildReceiptHtml(rec, withGst, o) {
                const s = sym();
                const money = (n) => s + nf(n);
                const logoUrl = o && o.has_logo ? (location.origin + '/api/organisation/logo') : '';
                const instName = (o && (o.legal_name || o.name)) || (store.appName || 'Institution');
                const instAddr = (o && (o.letterhead_address || o.address)) || '';
                const rowsHtml = [];
                rowsHtml.push('<tr><td>Base amount</td><td class="r">' + money(rec.amount) + '</td></tr>');
                if (withGst && (+rec.gst_percent > 0)) {
                    rowsHtml.push('<tr><td>GST @ ' + nf(rec.gst_percent) + '%</td><td class="r">' + money(rec.gst_amount) + '</td></tr>');
                }
                const grand = withGst ? rec.total_amount : rec.amount;
                const gstLine = (withGst && o && o.gst_number) ? ('<div>GSTIN: ' + esc(o.gst_number) + '</div>') : '';
                const panLine = (o && o.pan) ? ('<div>PAN: ' + esc(o.pan) + '</div>') : '';
                const clientGst = (withGst && rec.client_gst) ? ('<div>GSTIN: ' + esc(rec.client_gst) + '</div>') : '';
                return '<!doctype html><html><head><meta charset="utf-8"><title>Receipt ' + esc(rec.receipt_no) + '</title>' +
                    '<style>' +
                    '@page{size:A4;margin:18mm;} *{box-sizing:border-box;}' +
                    'body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0;padding:0;font-size:13px;}' +
                    '.sheet{width:100%;max-width:180mm;margin:0 auto;}' +
                    '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:18px;}' +
                    '.hd .name{font-size:20px;font-weight:bold;}' +
                    '.hd .meta{font-size:12px;color:#333;margin-top:4px;line-height:1.5;}' +
                    '.hd img{max-height:64px;max-width:180px;object-fit:contain;}' +
                    '.title{text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px;margin:8px 0 18px;text-transform:uppercase;}' +
                    '.meta-row{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;}' +
                    '.party{margin-bottom:16px;font-size:12px;line-height:1.6;}' +
                    '.party .lbl{color:#666;font-size:11px;text-transform:uppercase;}' +
                    'table{width:100%;border-collapse:collapse;margin-top:8px;}' +
                    'td,th{border:1px solid #999;padding:8px 10px;font-size:13px;}' +
                    'th{background:#f2f2f2;text-align:left;}' +
                    '.r{text-align:right;}' +
                    '.grand td{font-weight:bold;font-size:14px;background:#f7f7f7;}' +
                    '.foot{margin-top:36px;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px;}' +
                    '.sign{border-top:1px solid #333;padding-top:6px;width:200px;text-align:center;}' +
                    '.note{margin-top:14px;font-size:11px;color:#555;}' +
                    '</style></head><body onload="window.focus();window.print();">' +
                    '<div class="sheet">' +
                    '<div class="hd"><div><div class="name">' + esc(instName) + '</div>' +
                    '<div class="meta">' + (instAddr ? esc(instAddr).replace(/\n/g, '<br>') : '') + gstLine + panLine + '</div></div>' +
                    (logoUrl ? '<img src="' + logoUrl + '" alt="logo">' : '') + '</div>' +
                    '<div class="title">Receipt' + (withGst ? '' : ' (without GST)') + '</div>' +
                    '<div class="meta-row"><div><strong>Receipt No:</strong> ' + esc(rec.receipt_no) + '</div>' +
                    '<div><strong>Date:</strong> ' + esc((rec.income_date || '').slice(0, 10)) + '</div></div>' +
                    '<div class="party"><span class="lbl">Received from</span><br><strong>' + esc(rec.client_name || '—') + '</strong>' +
                    (rec.client_address ? '<br>' + esc(rec.client_address) : '') + clientGst + '</div>' +
                    '<div class="party"><span class="lbl">Towards project</span><br>' + esc(rec.project_name || '—') +
                    (rec.project_code ? ' (' + esc(rec.project_code) + ')' : '') + '</div>' +
                    '<table><tbody>' + rowsHtml.join('') +
                    '<tr class="grand"><td>Total received</td><td class="r">' + money(grand) + '</td></tr>' +
                    '</tbody></table>' +
                    '<div class="note">Payment mode: ' + esc(modeLabel(rec.mode)) + (rec.bank_label ? ' · Bank: ' + esc(rec.bank_label) : '') + (rec.reference ? ' · Ref: ' + esc(rec.reference) : '') + '</div>' +
                    (rec.notes ? '<div class="note">' + esc(rec.notes) + '</div>' : '') +
                    '<div class="foot"><div></div><div class="sign">Authorised signatory<br>' + esc(instName) + '</div></div>' +
                    '</div></body></html>';
            }

            onMounted(async () => {
                await loadLists();
                const q = store.query || {};
                if (q.project_id) filterProjectId.value = +q.project_id;
                await load();
                // Arriving from the projects list "+ Income" action.
                if (q.add && q.project_id) {
                    openAdd();
                    form.project_id = +q.project_id;
                    onProjectChange();
                }
            });
            return {
                rows, total, gstTotal, baseTotal, loading, saving, projects, clients, banks, needsBank, filterProjectId, fmt, nf, MODES, modeLabel,
                showModal, editingId, form, gstAmount, sym, recalcFromBase, recalcFromTotal, load,
                openAdd, openEdit, save, remove, onProjectChange,
                showReceiptAsk, receiptRow, askReceipt, printReceipt,
            };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h1 class="text-xl font-semibold text-slate-800">Income</h1>
                <button @click="openAdd" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Add income</button>
            </div>
            <p class="text-sm text-slate-500 mb-5">Receipts from customer projects.</p>

            <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400">Project</span>
                    <select v-model="filterProjectId" @change="load" class="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                        <option value="">All projects</option>
                        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="text-sm text-slate-500 text-right">
                    <span>Base: <span class="text-slate-700">{{ fmt(baseTotal) }}</span></span>
                    <span class="mx-1 text-slate-300">·</span>
                    <span>GST: <span class="text-slate-700">{{ fmt(gstTotal) }}</span></span>
                    <span class="mx-1 text-slate-300">·</span>
                    <span>Total: <span class="font-semibold text-emerald-600">{{ fmt(total) }}</span></span>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5">
                <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                <div v-else class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 px-3">Date</th><th class="py-2 px-3">Receipt No.</th><th class="py-2 px-3">Project</th>
                            <th class="py-2 px-3">Client</th><th class="py-2 px-3 text-right">Amount</th><th class="py-2 px-3 text-right">GST</th>
                            <th class="py-2 px-3 text-right">Total</th><th class="py-2 px-3">Mode</th><th class="py-2 px-3">Bank</th><th class="py-2 px-3"></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="r in rows" :key="r.id" class="border-b border-slate-50">
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (r.income_date||'').slice(0,10) }}</td>
                                <td class="py-2 px-3 font-mono text-xs text-slate-600">{{ r.receipt_no }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ r.project_name || '—' }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ r.client_name || '—' }}</td>
                                <td class="py-2 px-3 text-right text-slate-600 whitespace-nowrap">{{ fmt(r.amount) }}</td>
                                <td class="py-2 px-3 text-right text-slate-500 whitespace-nowrap">{{ fmt(r.gst_amount) }}</td>
                                <td class="py-2 px-3 text-right font-medium text-slate-800 whitespace-nowrap">{{ fmt(r.total_amount) }}</td>
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ modeLabel(r.mode) }}</td>
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ r.bank_label || '—' }}</td>
                                <td class="py-2 px-3 text-right whitespace-nowrap">
                                    <button @click="askReceipt(r)" class="text-slate-600 hover:underline text-xs mr-2">Receipt</button>
                                    <button @click="openEdit(r)" class="text-brand hover:underline text-xs mr-2">Edit</button>
                                    <button @click="remove(r)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                </td>
                            </tr>
                            <tr v-if="!rows.length"><td colspan="10" class="py-8 text-center text-slate-400">No income yet — click “+ Add income”.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Add/Edit modal -->
            <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ editingId ? 'Edit income' : 'Add income' }}</h2>
                        <button @click="showModal=false" class="text-slate-400">✕</button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Project</label>
                            <select v-model="form.project_id" @change="onProjectChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Client</label>
                            <select v-model="form.client_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Amount (base)</label>
                            <input v-model.number="form.amount" @input="recalcFromBase" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">GST %</label>
                            <input v-model.number="form.gst_percent" @input="recalcFromBase" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs text-slate-500 mb-1">Total Income <span class="text-slate-400">(base + GST — edit either side)</span></label>
                            <input v-model.number="form.total" @input="recalcFromTotal" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Mode of payment</label>
                            <select v-model="form.mode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="m in MODES" :key="m.v" :value="m.v">{{ m.l }}</option>
                            </select>
                        </div>
                        <div v-if="needsBank">
                            <label class="block text-xs text-slate-500 mb-1">Bank account</label>
                            <select v-model="form.bank_account_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="b in banks" :key="b.id" :value="b.id">{{ b.account_label }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Date</label>
                            <input v-model="form.income_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
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
                    <div class="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2 text-sm flex justify-between">
                        <span class="text-slate-500">GST: <span class="text-slate-700">{{ sym() }}{{ nf(gstAmount) }}</span></span>
                        <span class="text-slate-500">Total: <span class="font-semibold text-slate-800">{{ sym() }}{{ nf(form.total) }}</span></span>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showModal=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="save" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save' }}</button>
                    </div>
                </div>
            </div>

            <!-- Receipt: ask with/without GST -->
            <div v-if="showReceiptAsk" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
                <div class="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 text-center">
                    <h2 class="font-semibold text-slate-800 mb-1">Print receipt</h2>
                    <p class="text-sm text-slate-500 mb-5">Include GST on the receipt?</p>
                    <div class="flex gap-2">
                        <button @click="printReceipt(true)" class="flex-1 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">With GST</button>
                        <button @click="printReceipt(false)" class="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Without GST</button>
                    </div>
                    <button @click="showReceiptAsk=false" class="mt-3 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/income', 'IncomeView', IncomeView);
})();
