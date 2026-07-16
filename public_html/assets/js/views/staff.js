/**
 * Staff (#/staff) — workforce directory. Table of staff with Edit/Delete
 * actions and an add/edit modal. Fields: Staff Id, name, phone, email,
 * type (Office / Skilled / Unskilled), address and PAN.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const TYPES = [
        { v: 'office', l: 'Office' }, { v: 'skilled', l: 'Skilled' }, { v: 'unskilled', l: 'Unskilled' },
    ];
    const typeLabel = (v) => (TYPES.find(t => t.v === v) || {}).l || v;
    const typeClass = (v) => ({ office: 'bg-sky-50 text-sky-700', skilled: 'bg-emerald-50 text-emerald-700', unskilled: 'bg-amber-50 text-amber-700' }[v] || 'bg-slate-100 text-slate-600');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const StaffView = {
        setup() {
            const rows = ref([]);
            const loading = ref(true);
            const saving = ref(false);
            const filter = ref('');

            const showModal = ref(false);
            const editingId = ref(null);
            const blank = () => ({ staff_code: '', name: '', phone: '', email: '', staff_type: 'office', address: '', pan: '', status: 'active' });
            const form = reactive(blank());

            async function load() {
                loading.value = true;
                try { rows.value = (await api.get('/api/staff')).data; }
                catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            const filteredRows = computed(() => {
                const q = filter.value.trim().toLowerCase();
                if (!q) return rows.value;
                return rows.value.filter(r => JSON.stringify(r).toLowerCase().includes(q));
            });

            function openAdd() { editingId.value = null; Object.assign(form, blank()); showModal.value = true; }
            function openEdit(r) {
                editingId.value = r.id;
                Object.assign(form, {
                    staff_code: r.staff_code || '', name: r.name || '', phone: r.phone || '', email: r.email || '',
                    staff_type: r.staff_type || 'office', address: r.address || '', pan: r.pan || '', status: r.status || 'active',
                });
                showModal.value = true;
            }
            async function save() {
                if (!form.staff_code.trim()) { CSApp.flash('error', 'Staff Id is required'); return; }
                if (!form.name.trim()) { CSApp.flash('error', 'Name is required'); return; }
                saving.value = true;
                try {
                    const payload = { ...form };
                    if (editingId.value) await api.put('/api/staff/' + editingId.value, payload);
                    else await api.post('/api/staff', payload);
                    CSApp.flash('success', 'Staff saved'); showModal.value = false; await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }
            async function remove(r) {
                if (!confirm('Delete staff "' + r.name + '"?')) return;
                try { await api.del('/api/staff/' + r.id); CSApp.flash('success', 'Deleted'); await load(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            // ---- Salary slips ----
            const org = ref({});
            const nf = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
            const sym = () => (store.currency && store.currency.symbol) || '';
            const slipModal = reactive({ open: false, staff: null, slips: [], loading: false, savingSlip: false });
            const slipForm = reactive({ period: new Date().toISOString().slice(0, 7), notes: '', earnings: [], deductions: [] });
            const grossTotal = computed(() => slipForm.earnings.reduce((s, l) => s + (+l.amount || 0), 0));
            const dedTotal = computed(() => slipForm.deductions.reduce((s, l) => s + (+l.amount || 0), 0));
            const netTotal = computed(() => grossTotal.value - dedTotal.value);

            async function openSlips(staff) {
                slipModal.staff = staff; slipModal.open = true; slipModal.slips = [];
                resetSlipForm();
                try { org.value = (await api.get('/api/organisation')).data; } catch (e) { org.value = {}; }
                await loadSlips();
            }
            function resetSlipForm() {
                slipForm.period = new Date().toISOString().slice(0, 7); slipForm.notes = '';
                slipForm.earnings = [{ label: 'Basic', amount: 0 }];
                slipForm.deductions = [];
            }
            async function loadSlips() {
                slipModal.loading = true;
                try { slipModal.slips = (await api.get('/api/staff/' + slipModal.staff.id + '/salary-slips')).data; }
                catch (e) { CSApp.flash('error', e.message); }
                finally { slipModal.loading = false; }
            }
            function addEarning() { slipForm.earnings.push({ label: '', amount: 0 }); }
            function addDeduction() { slipForm.deductions.push({ label: '', amount: 0 }); }
            function removeEarning(i) { slipForm.earnings.splice(i, 1); }
            function removeDeduction(i) { slipForm.deductions.splice(i, 1); }
            async function saveSlip() {
                const lines = [];
                slipForm.earnings.forEach(l => { if (l.label && +l.amount > 0) lines.push({ line_type: 'earning', label: l.label, amount: +l.amount }); });
                slipForm.deductions.forEach(l => { if (l.label && +l.amount > 0) lines.push({ line_type: 'deduction', label: l.label, amount: +l.amount }); });
                if (!lines.length) { CSApp.flash('error', 'Add at least one earning or deduction'); return; }
                slipModal.savingSlip = true;
                try {
                    await api.post('/api/staff/' + slipModal.staff.id + '/salary-slips', { period: slipForm.period, notes: slipForm.notes, lines });
                    CSApp.flash('success', 'Salary slip saved'); resetSlipForm(); await loadSlips();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { slipModal.savingSlip = false; }
            }
            async function deleteSlip(s) {
                if (!confirm('Delete the ' + s.period + ' salary slip?')) return;
                try { await api.del('/api/salary-slips/' + s.id); CSApp.flash('success', 'Deleted'); await loadSlips(); }
                catch (e) { CSApp.flash('error', e.message); }
            }
            async function printSlip(s) {
                let full;
                try { full = (await api.get('/api/salary-slips/' + s.id)).data; }
                catch (e) { CSApp.flash('error', e.message); return; }
                const html = buildSlipHtml(full, slipModal.staff, org.value);
                const w = window.open('', '_blank', 'width=800,height=900');
                if (!w) { CSApp.flash('error', 'Please allow pop-ups to print the slip'); return; }
                w.document.open(); w.document.write(html); w.document.close();
            }
            function buildSlipHtml(slip, staff, o) {
                const money = (n) => sym() + nf(n);
                const instName = (o && (o.legal_name || o.name)) || (store.appName || 'Institution');
                const instAddr = (o && (o.letterhead_address || o.address)) || '';
                const earnings = slip.lines.filter(l => l.line_type === 'earning');
                const deductions = slip.lines.filter(l => l.line_type === 'deduction');
                const rowsFor = (arr) => arr.map(l => '<tr><td>' + esc(l.label) + '</td><td class="r">' + money(l.amount) + '</td></tr>').join('') || '<tr><td colspan="2" class="muted">—</td></tr>';
                return '<!doctype html><html><head><meta charset="utf-8"><title>Salary Slip ' + esc(slip.period) + ' — ' + esc(staff.name) + '</title>' +
                    '<style>@page{size:A4;margin:18mm;}*{box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:13px;margin:0;}' +
                    '.sheet{max-width:180mm;margin:0 auto;}.hd{border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px;}' +
                    '.hd .name{font-size:20px;font-weight:bold;}.hd .meta{font-size:12px;color:#333;margin-top:3px;}' +
                    '.title{text-align:center;font-size:15px;font-weight:bold;text-transform:uppercase;margin:6px 0 14px;letter-spacing:1px;}' +
                    '.info{display:flex;justify-content:space-between;font-size:12px;margin-bottom:14px;}' +
                    '.cols{display:flex;gap:16px;}.cols>div{flex:1;}' +
                    'table{width:100%;border-collapse:collapse;}td,th{border:1px solid #999;padding:6px 8px;font-size:12px;}th{background:#f2f2f2;text-align:left;}' +
                    '.r{text-align:right;}.muted{color:#888;text-align:center;}.tot td{font-weight:bold;background:#f7f7f7;}' +
                    '.net{margin-top:16px;border:2px solid #222;padding:10px 12px;display:flex;justify-content:space-between;font-size:15px;font-weight:bold;}' +
                    '.foot{margin-top:40px;display:flex;justify-content:space-between;font-size:12px;}.sign{border-top:1px solid #333;padding-top:6px;width:200px;text-align:center;}</style>' +
                    '</head><body onload="window.focus();window.print();"><div class="sheet">' +
                    '<div class="hd"><div class="name">' + esc(instName) + '</div><div class="meta">' + (instAddr ? esc(instAddr).replace(/\\n/g, '<br>') : '') + '</div></div>' +
                    '<div class="title">Salary Slip — ' + esc(slip.period) + '</div>' +
                    '<div class="info"><div><strong>Employee:</strong> ' + esc(staff.name) + ' (' + esc(staff.staff_code) + ')<br><strong>Type:</strong> ' + esc(typeLabel(staff.staff_type)) + '</div>' +
                    '<div><strong>PAN:</strong> ' + esc(staff.pan || '—') + '</div></div>' +
                    '<div class="cols">' +
                    '<div><table><thead><tr><th>Earnings</th><th class="r">Amount</th></tr></thead><tbody>' + rowsFor(earnings) +
                    '<tr class="tot"><td>Gross</td><td class="r">' + money(slip.earnings_total) + '</td></tr></tbody></table></div>' +
                    '<div><table><thead><tr><th>Deductions</th><th class="r">Amount</th></tr></thead><tbody>' + rowsFor(deductions) +
                    '<tr class="tot"><td>Total</td><td class="r">' + money(slip.deductions_total) + '</td></tr></tbody></table></div>' +
                    '</div>' +
                    '<div class="net"><span>Net Salary</span><span>' + money(slip.net_salary) + '</span></div>' +
                    (slip.notes ? '<div style="margin-top:10px;font-size:11px;color:#555;">' + esc(slip.notes) + '</div>' : '') +
                    '<div class="foot"><div></div><div class="sign">Authorised signatory<br>' + esc(instName) + '</div></div>' +
                    '</div></body></html>';
            }

            onMounted(load);
            return { rows, loading, saving, filter, filteredRows, TYPES, typeLabel, typeClass, showModal, editingId, form, openAdd, openEdit, save, remove,
                slipModal, slipForm, grossTotal, dedTotal, netTotal, nf, sym, openSlips, addEarning, addDeduction, removeEarning, removeDeduction, saveSlip, deleteSlip, printSlip };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h1 class="text-xl font-semibold text-slate-800">Staff</h1>
                <button @click="openAdd" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Add staff</button>
            </div>
            <p class="text-sm text-slate-500 mb-5">Workforce directory for your institution.</p>

            <div class="flex items-center justify-between mb-4">
                <input v-model="filter" placeholder="Filter…" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56">
                <span class="text-xs text-slate-400">{{ filteredRows.length }} staff</span>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5">
                <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                <div v-else class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 px-3">Staff Id</th><th class="py-2 px-3">Name</th><th class="py-2 px-3">Type</th>
                            <th class="py-2 px-3">Phone</th><th class="py-2 px-3">Email</th><th class="py-2 px-3">PAN</th>
                            <th class="py-2 px-3">Status</th><th class="py-2 px-3"></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="r in filteredRows" :key="r.id" class="border-b border-slate-50">
                                <td class="py-2 px-3 font-mono text-xs text-slate-600">{{ r.staff_code }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ r.name }}<div v-if="r.address" class="text-xs text-slate-400">{{ r.address }}</div></td>
                                <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="typeClass(r.staff_type)">{{ typeLabel(r.staff_type) }}</span></td>
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ r.phone || '—' }}</td>
                                <td class="py-2 px-3 text-slate-600">{{ r.email || '—' }}</td>
                                <td class="py-2 px-3 text-slate-600">{{ r.pan || '—' }}</td>
                                <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="r.status==='active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'">{{ r.status }}</span></td>
                                <td class="py-2 px-3 text-right whitespace-nowrap">
                                    <button @click="openSlips(r)" title="Salary slips" class="text-emerald-600 hover:underline text-xs mr-2">💰 Salary</button>
                                    <button @click="openEdit(r)" class="text-brand hover:underline text-xs mr-2">Edit</button>
                                    <button @click="remove(r)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                </td>
                            </tr>
                            <tr v-if="!filteredRows.length"><td colspan="8" class="py-8 text-center text-slate-400">No staff yet — click “+ Add staff”.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Add/Edit modal -->
            <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="font-semibold text-slate-800">{{ editingId ? 'Edit staff' : 'Add staff' }}</h2>
                        <button @click="showModal=false" class="text-slate-400">✕</button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label class="block text-xs text-slate-500 mb-1">Staff Id</label><input v-model="form.staff_code" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. STF-001"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Name</label><input v-model="form.name" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Phone</label><input v-model="form.phone" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Email</label><input v-model="form.email" type="email" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Type</label>
                            <select v-model="form.staff_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="t in TYPES" :key="t.v" :value="t.v">{{ t.l }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Status</label>
                            <select v-model="form.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option value="active">Active</option><option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div><label class="block text-xs text-slate-500 mb-1">PAN</label><input v-model="form.pan" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="sm:col-span-2"><label class="block text-xs text-slate-500 mb-1">Address</label><textarea v-model="form.address" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showModal=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="save" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save' }}</button>
                    </div>
                </div>
            </div>

            <!-- Salary slips modal -->
            <div v-if="slipModal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-3xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-1">
                        <h2 class="font-semibold text-slate-800">💰 Salary slips — {{ slipModal.staff && slipModal.staff.name }}</h2>
                        <button @click="slipModal.open=false" class="text-slate-400">✕</button>
                    </div>
                    <p class="text-xs text-slate-400 mb-4">{{ slipModal.staff && slipModal.staff.staff_code }}</p>

                    <!-- New slip form -->
                    <div class="rounded-lg border border-slate-200 p-4 mb-5">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-sm font-medium text-slate-700">New salary slip</h3>
                            <div class="flex items-center gap-2"><label class="text-xs text-slate-500">Period</label><input v-model="slipForm.period" type="month" class="rounded-lg border border-slate-300 px-2 py-1 text-sm"></div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div class="flex items-center justify-between mb-1"><span class="text-xs font-medium text-emerald-700">Earnings</span><button @click="addEarning" class="text-xs text-brand hover:underline">+ Add</button></div>
                                <div v-for="(l,i) in slipForm.earnings" :key="'e'+i" class="flex gap-1 mb-1">
                                    <input v-model="l.label" placeholder="e.g. Basic" class="flex-1 rounded border border-slate-200 px-2 py-1 text-xs">
                                    <input v-model.number="l.amount" type="number" step="0.01" class="w-24 rounded border border-slate-200 px-2 py-1 text-xs text-right">
                                    <button @click="removeEarning(i)" class="text-rose-400 hover:text-rose-600 text-xs px-1">✕</button>
                                </div>
                                <div class="text-right text-xs text-slate-500 mt-1">Gross: <span class="font-semibold text-slate-700">{{ sym() }}{{ nf(grossTotal) }}</span></div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1"><span class="text-xs font-medium text-rose-700">Deductions</span><button @click="addDeduction" class="text-xs text-brand hover:underline">+ Add</button></div>
                                <div v-for="(l,i) in slipForm.deductions" :key="'d'+i" class="flex gap-1 mb-1">
                                    <input v-model="l.label" placeholder="e.g. PF" class="flex-1 rounded border border-slate-200 px-2 py-1 text-xs">
                                    <input v-model.number="l.amount" type="number" step="0.01" class="w-24 rounded border border-slate-200 px-2 py-1 text-xs text-right">
                                    <button @click="removeDeduction(i)" class="text-rose-400 hover:text-rose-600 text-xs px-1">✕</button>
                                </div>
                                <div v-if="!slipForm.deductions.length" class="text-xs text-slate-300">No deductions.</div>
                                <div class="text-right text-xs text-slate-500 mt-1">Deductions: <span class="font-semibold text-slate-700">{{ sym() }}{{ nf(dedTotal) }}</span></div>
                            </div>
                        </div>
                        <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                            <input v-model="slipForm.notes" placeholder="Notes (optional)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-1/2">
                            <div class="flex items-center gap-3">
                                <span class="text-sm text-slate-600">Net: <span class="font-semibold text-slate-800">{{ sym() }}{{ nf(netTotal) }}</span></span>
                                <button @click="saveSlip" :disabled="slipModal.savingSlip" class="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ slipModal.savingSlip ? 'Saving…' : 'Save slip' }}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Existing slips -->
                    <h3 class="text-sm font-medium text-slate-700 mb-2">Slips</h3>
                    <div v-if="slipModal.loading" class="text-slate-400 text-sm py-4 text-center">Loading…</div>
                    <div v-else class="table-scroll">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                <th class="py-2 px-3">Period</th><th class="py-2 px-3 text-right">Gross</th><th class="py-2 px-3 text-right">Deductions</th><th class="py-2 px-3 text-right">Net</th><th class="py-2 px-3"></th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="s in slipModal.slips" :key="s.id" class="border-b border-slate-50">
                                    <td class="py-2 px-3 text-slate-700">{{ s.period }}</td>
                                    <td class="py-2 px-3 text-right text-slate-600">{{ sym() }}{{ nf(s.earnings_total) }}</td>
                                    <td class="py-2 px-3 text-right text-slate-500">{{ sym() }}{{ nf(s.deductions_total) }}</td>
                                    <td class="py-2 px-3 text-right font-medium text-slate-800">{{ sym() }}{{ nf(s.net_salary) }}</td>
                                    <td class="py-2 px-3 text-right whitespace-nowrap">
                                        <button @click="printSlip(s)" class="text-slate-600 hover:underline text-xs mr-2">Print</button>
                                        <button @click="deleteSlip(s)" class="text-rose-400 hover:text-rose-600 text-xs">Delete</button>
                                    </td>
                                </tr>
                                <tr v-if="!slipModal.slips.length"><td colspan="5" class="py-6 text-center text-slate-400">No salary slips yet.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="flex justify-end mt-4"><button @click="slipModal.open=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Close</button></div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/staff', 'StaffView', StaffView);
})();
