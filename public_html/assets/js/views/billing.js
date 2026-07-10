/**
 * Batch 6 — Advanced Customer Billing Hub + Sub-contractor RA Billing.
 * Financial timeline (demand notes, invoices, receipts), a Final Settlement Bill
 * layout that matches the backend calculation exactly, and RA bill preview/
 * generate from certified milestone %.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    const BillingView = {
        setup() {
            const projects = ref([]);
            const activeId = ref(null);
            const tab = ref('invoices');
            const demandNotes = ref([]);
            const invoices = ref([]);
            const settlement = ref(null);
            const workOrders = ref([]);
            const raPreview = ref(null);
            const loading = ref(true);

            const receipt = reactive({ invoice_id: null, amount: 0, method: 'bank_transfer', reference: '', payment_date: new Date().toISOString().slice(0, 10) });
            const raForm = reactive({ work_order_id: null, certified_percent: 0 });
            const newDN = reactive({ amount: 0, note_type: 'standard', due_date: '', description: '' });

            const fmt = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

            async function loadProjects() {
                loading.value = true;
                try {
                    projects.value = (await api.get('/api/projects')).data;
                    if (projects.value.length) { activeId.value = projects.value[0].id; await loadAll(); }
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadAll() {
                if (!activeId.value) return;
                try {
                    demandNotes.value = (await api.get('/api/projects/' + activeId.value + '/demand-notes')).data;
                    invoices.value = (await api.get('/api/projects/' + activeId.value + '/invoices')).data;
                    settlement.value = (await api.get('/api/projects/' + activeId.value + '/settlement')).data;
                    workOrders.value = (await api.get('/api/work-orders?project_id=' + activeId.value)).data;
                } catch (e) { CSApp.flash('error', e.message); }
            }
            onMounted(loadProjects);
            watch(activeId, loadAll);

            async function generateInvoice(dn) {
                try {
                    await api.post('/api/demand-notes/' + dn.id + '/invoice', { tax_percent: 5, retention_percent: 5, mobilization_recovery_percent: 20 });
                    CSApp.flash('success', 'Invoice generated');
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
            }
            async function recordReceipt() {
                if (!receipt.amount) { CSApp.flash('error', 'Enter an amount'); return; }
                try {
                    const payload = { project_id: activeId.value, ...receipt };
                    if (!payload.payment_date) delete payload.payment_date;
                    await api.post('/api/receipts', payload);
                    CSApp.flash('success', 'Receipt recorded'); receipt.amount = 0; receipt.reference = '';
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
            }
            async function createDemandNote() {
                if (!newDN.amount || newDN.amount <= 0) { CSApp.flash('error', 'Enter a demand amount'); return; }
                try {
                    const payload = { project_id: activeId.value, amount: newDN.amount, note_type: newDN.note_type, description: newDN.description };
                    if (newDN.due_date) payload.due_date = newDN.due_date;
                    await api.post('/api/demand-notes', payload);
                    CSApp.flash('success', 'Demand note created');
                    Object.assign(newDN, { amount: 0, note_type: 'standard', due_date: '', description: '' });
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
            }
            async function previewRa() {
                if (!raForm.work_order_id) return;
                try { raPreview.value = (await api.post('/api/work-orders/' + raForm.work_order_id + '/ra-bills/preview', { certified_percent: raForm.certified_percent })).data; }
                catch (e) { CSApp.flash('error', e.message); raPreview.value = null; }
            }
            async function generateRa() {
                try {
                    await api.post('/api/work-orders/' + raForm.work_order_id + '/ra-bills', { certified_percent: raForm.certified_percent });
                    CSApp.flash('success', 'RA bill generated'); raPreview.value = null;
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
            }

            return { projects, activeId, tab, demandNotes, invoices, settlement, workOrders, raPreview, loading, receipt, raForm, newDN, fmt, generateInvoice, recordReceipt, createDemandNote, previewRa, generateRa };
        },
        template: `
        <div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div class="flex items-center gap-3">
                    <h1 class="text-xl font-semibold text-slate-800">Billing Hub</h1>
                    <select v-model="activeId" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"><option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                </div>
                <div class="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm">
                    <button @click="tab='invoices'" :class="tab==='invoices'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Invoices</button>
                    <button @click="tab='settlement'" :class="tab==='settlement'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Settlement</button>
                    <button @click="tab='ra'" :class="tab==='ra'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">RA Billing</button>
                </div>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading…</div>

            <!-- INVOICES + timeline + receipts -->
            <div v-else-if="tab==='invoices'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Demand notes <span class="text-xs font-normal text-slate-400">(payment requests)</span></h2>
                        <div v-for="dn in demandNotes" :key="dn.id" class="flex items-center justify-between py-2 border-b border-slate-50 text-sm">
                            <div><span class="text-slate-700">{{ dn.reference }}</span> <span class="text-slate-400">· {{ fmt(dn.amount) }} · {{ dn.note_type }}</span></div>
                            <button v-if="dn.status!=='invoiced'" @click="generateInvoice(dn)" class="text-xs px-2 py-1 rounded bg-brand text-white">Generate invoice</button>
                            <span v-else class="text-xs text-emerald-600">Invoiced</span>
                        </div>
                        <p v-if="!demandNotes.length" class="text-sm text-slate-400 py-3 text-center">No demand notes yet — add one below.</p>

                        <!-- New demand note -->
                        <div class="mt-4 pt-4 border-t border-slate-100">
                            <h3 class="text-sm font-medium text-slate-600 mb-2">New demand note</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs text-slate-500 mb-1">Amount</label>
                                    <input v-model.number="newDN.amount" type="number" step="0.01" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                                </div>
                                <div>
                                    <label class="block text-xs text-slate-500 mb-1">Type</label>
                                    <select v-model="newDN.note_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                        <option value="standard">Standard</option>
                                        <option value="mobilization_advance">Mobilization advance</option>
                                        <option value="milestone">Milestone</option>
                                        <option value="retention_release">Retention release</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs text-slate-500 mb-1">Due date</label>
                                    <input v-model="newDN.due_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs text-slate-500 mb-1">Description</label>
                                    <input v-model="newDN.description" type="text" placeholder="e.g. Foundation milestone" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                </div>
                            </div>
                            <button @click="createDemandNote" class="mt-3 px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Create demand note</button>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Invoices</h2>
                        <div class="table-scroll"><table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100"><th class="py-2 pr-3">#</th><th class="py-2 pr-3 text-right">Gross</th><th class="py-2 pr-3 text-right">Retention</th><th class="py-2 pr-3 text-right">Recovery</th><th class="py-2 pr-3 text-right">Net</th><th class="py-2 pr-3 text-right">Paid</th><th class="py-2">Status</th></tr></thead>
                            <tbody>
                                <tr v-for="inv in invoices" :key="inv.id" class="border-b border-slate-50">
                                    <td class="py-2 pr-3 font-mono text-xs">{{ inv.invoice_number }}</td>
                                    <td class="py-2 pr-3 text-right">{{ fmt(inv.gross_amount) }}</td><td class="py-2 pr-3 text-right">{{ fmt(inv.retention_amount) }}</td>
                                    <td class="py-2 pr-3 text-right">{{ fmt(inv.mobilization_recovery) }}</td><td class="py-2 pr-3 text-right font-medium">{{ fmt(inv.net_payable) }}</td>
                                    <td class="py-2 pr-3 text-right">{{ fmt(inv.amount_paid) }}</td>
                                    <td class="py-2"><span class="text-xs px-2 py-0.5 rounded-full" :class="inv.status==='paid'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'">{{ inv.status }}</span></td>
                                </tr>
                                <tr v-if="!invoices.length"><td colspan="7" class="py-4 text-center text-slate-400">No invoices</td></tr>
                            </tbody>
                        </table></div>
                    </div>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                    <h2 class="font-medium text-slate-700 mb-3">Record payment receipt</h2>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Against invoice</label>
                            <select v-model="receipt.invoice_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">Unlinked / advance</option>
                                <option v-for="inv in invoices" :key="inv.id" :value="inv.id">{{ inv.invoice_number }} ({{ fmt(inv.net_payable) }})</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Amount received</label>
                            <input v-model.number="receipt.amount" type="number" step="0.01" min="0" placeholder="0.00" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Payment date</label>
                            <input v-model="receipt.payment_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Payment method</label>
                            <select v-model="receipt.method" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option value="bank_transfer">Bank transfer</option>
                                <option value="cash">Cash</option>
                                <option value="cheque">Cheque</option>
                                <option value="card">Card</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Reference / txn no.</label>
                            <input v-model="receipt.reference" type="text" placeholder="e.g. NEFT-88213" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <button @click="recordReceipt" class="w-full py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark">Record receipt</button>
                    </div>
                </div>
            </div>

            <!-- SETTLEMENT -->
            <div v-else-if="tab==='settlement' && settlement" class="max-w-2xl">
                <div class="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 class="font-semibold text-slate-800 mb-1">Final Settlement Bill</h2>
                    <p class="text-sm text-slate-500 mb-4">{{ settlement.project.name }} · {{ settlement.project.code }}</p>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span class="text-slate-500">Total invoiced (gross)</span><span class="text-slate-700">{{ fmt(settlement.total_invoiced) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Less: retention withheld</span><span class="text-rose-600">− {{ fmt(settlement.retention_withheld) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Less: mobilization advance recovered</span><span class="text-rose-600">− {{ fmt(settlement.advance_recovered) }}</span></div>
                        <div class="flex justify-between border-t border-slate-100 pt-2"><span class="text-slate-600 font-medium">Net payable (cumulative)</span><span class="text-slate-800 font-medium">{{ fmt(settlement.sum_net_payable) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Less: total received</span><span class="text-rose-600">− {{ fmt(settlement.total_received) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-600 font-medium">Outstanding on invoices</span><span class="text-slate-800 font-medium">{{ fmt(settlement.outstanding) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Add: retention balance to release</span><span class="text-emerald-600">+ {{ fmt(settlement.retention_balance) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Less: advance balance to recover</span><span class="text-rose-600">− {{ fmt(settlement.advance_balance) }}</span></div>
                        <div class="flex justify-between border-t-2 border-slate-200 pt-3 mt-1"><span class="text-slate-800 font-semibold">Net settlement</span><span class="text-lg font-semibold" :class="settlement.net_settlement>=0?'text-emerald-600':'text-rose-600'">{{ fmt(settlement.net_settlement) }}</span></div>
                        <p class="text-xs text-slate-400 text-right">{{ settlement.net_settlement_note }}</p>
                    </div>
                </div>
            </div>

            <!-- RA BILLING -->
            <div v-else-if="tab==='ra'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">Certify & preview RA bill</h2>
                    <div class="space-y-3">
                        <select v-model="raForm.work_order_id" @change="raPreview=null" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option :value="null">Select work order…</option><option v-for="wo in workOrders" :key="wo.id" :value="wo.id">{{ wo.wo_number }} — {{ fmt(wo.order_value) }}</option></select>
                        <div><label class="block text-sm text-slate-600 mb-1">Certified % (cumulative)</label><input v-model.number="raForm.certified_percent" type="number" min="0" max="100" step="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="flex gap-2"><button @click="previewRa" class="flex-1 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50">Preview</button><button @click="generateRa" :disabled="!raPreview" class="flex-1 py-2 rounded-lg bg-brand text-white text-sm disabled:opacity-50">Generate RA bill</button></div>
                    </div>
                </div>
                <div v-if="raPreview" class="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">RA bill #{{ raPreview.next_sequence }} preview</h2>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span class="text-slate-500">Previously billed</span><span>{{ raPreview.previous_percent }}%</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">This certification</span><span>{{ raPreview.delta_percent }}%</span></div>
                        <div class="flex justify-between border-t border-slate-100 pt-2"><span class="text-slate-600">Gross value</span><span>{{ fmt(raPreview.gross_value) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Retention</span><span class="text-rose-600">− {{ fmt(raPreview.retention_amount) }}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Advance recovery</span><span class="text-rose-600">− {{ fmt(raPreview.advance_recovery) }}</span></div>
                        <div class="flex justify-between border-t-2 border-slate-200 pt-2"><span class="font-semibold text-slate-800">Net payable</span><span class="font-semibold text-brand">{{ fmt(raPreview.net_payable) }}</span></div>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/billing', 'BillingView', BillingView);
})();
