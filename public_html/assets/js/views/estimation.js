/**
 * Interactive Estimation Workspace (Batch 4). Pick a construction model, tweak
 * material/labour rates, see live cost recalculation + a visual breakdown, drag
 * to reorder line items, and save/version the estimate. The live math mirrors
 * the backend EstimationService exactly; a "Verify with server" action confirms
 * parity against POST /api/estimates/calculate.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const EstimatesView = {
        setup() {
            const models = ref([]);
            const rates = ref([]);
            const saved = ref([]);
            const modelId = ref('');
            const title = ref('New Estimate');
            const overhead = ref(10);
            const margin = ref(15);
            const lines = ref([]);
            const dragIndex = ref(null);
            const serverGrand = ref(null);
            const flashMsg = ref(null);
            const loading = ref(true);

            async function loadRefs() {
                loading.value = true;
                try {
                    models.value = (await api.get('/api/construction-models')).data;
                    rates.value = (await api.get('/api/base-rates')).data;
                    saved.value = (await api.get('/api/estimates')).data;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            onMounted(loadRefs);

            function addLine(type) {
                lines.value.push({ line_type: type || 'material', item_code: '', description: '', unit: '', quantity: 1, rate: 0, wastage_percent: 0 });
            }
            function removeLine(i) { lines.value.splice(i, 1); }

            function applyRate(line) {
                const r = rates.value.find(x => x.item_code === line.item_code && x.rate_type === line.line_type);
                if (r) { line.rate = parseFloat(r.base_rate); line.unit = r.unit; line.description = r.item_name; line.wastage_percent = parseFloat(r.wastage_percent) || 0; }
            }

            // ---- live calc (mirrors backend) ----
            function lineAmount(l) {
                const qty = Math.max(0, parseFloat(l.quantity) || 0);
                const rate = parseFloat(l.rate) || 0;
                const wastage = l.line_type === 'material' ? (parseFloat(l.wastage_percent) || 0) : 0;
                return round2(qty * (1 + wastage / 100) * rate);
            }
            const materialsTotal = computed(() => round2(lines.value.filter(l => l.line_type !== 'labour').reduce((s, l) => s + lineAmount(l), 0)));
            const labourTotal = computed(() => round2(lines.value.filter(l => l.line_type === 'labour').reduce((s, l) => s + lineAmount(l), 0)));
            const subtotal = computed(() => round2(materialsTotal.value + labourTotal.value));
            const overheadAmt = computed(() => round2(subtotal.value * (parseFloat(overhead.value) || 0) / 100));
            const marginAmt = computed(() => round2((subtotal.value + overheadAmt.value) * (parseFloat(margin.value) || 0) / 100));
            const grandTotal = computed(() => round2(subtotal.value + overheadAmt.value + marginAmt.value));
            function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
            const fmt = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

            // ---- drag reorder ----
            function onDragStart(i) { dragIndex.value = i; }
            function onDrop(i) {
                if (dragIndex.value === null || dragIndex.value === i) return;
                const item = lines.value.splice(dragIndex.value, 1)[0];
                lines.value.splice(i, 0, item);
                dragIndex.value = null;
            }

            function payload() {
                return {
                    model_id: modelId.value || null, title: title.value,
                    overhead_percent: parseFloat(overhead.value) || 0, margin_percent: parseFloat(margin.value) || 0,
                    line_items: lines.value.map((l, idx) => ({ ...l, sort_order: idx })),
                };
            }
            async function verify() {
                try { serverGrand.value = (await api.post('/api/estimates/calculate', payload())).data.grand_total; }
                catch (e) { CSApp.flash('error', e.message); }
            }
            async function save() {
                if (!lines.value.length) { CSApp.flash('error', 'Add at least one line item'); return; }
                try {
                    const r = await api.post('/api/estimates', payload());
                    CSApp.flash('success', 'Estimate saved: ' + r.data.reference);
                    saved.value = (await api.get('/api/estimates')).data;
                } catch (e) { CSApp.flash('error', e.message); }
            }
            async function saveVersion(id) {
                try {
                    const r = await api.post('/api/estimates/' + id + '/version', payload());
                    CSApp.flash('success', 'Saved version ' + r.data.version);
                    saved.value = (await api.get('/api/estimates')).data;
                } catch (e) { CSApp.flash('error', e.message); }
            }

            const codesForType = (type) => rates.value.filter(r => r.rate_type === (type === 'labour' ? 'labour' : 'material'));

            addLine('material');
            return { models, rates, saved, modelId, title, overhead, margin, lines, serverGrand, loading,
                addLine, removeLine, applyRate, lineAmount, materialsTotal, labourTotal, subtotal, overheadAmt, marginAmt, grandTotal, fmt,
                onDragStart, onDrop, verify, save, saveVersion, codesForType };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-5">
                <h1 class="text-xl font-semibold text-slate-800">Estimation Workspace</h1>
                <div class="flex gap-2">
                    <button @click="verify" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Verify with server</button>
                    <button @click="save" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">Save estimate</button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div><label class="block text-sm text-slate-600 mb-1">Title</label><input v-model="title" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Construction model</label>
                                <select v-model="modelId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                                    <option value="">— none —</option>
                                    <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }} ({{ m.category }})</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-scroll">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                <th class="py-2 w-6"></th><th class="py-2 pr-2">Type</th><th class="py-2 pr-2">Item</th><th class="py-2 pr-2">Description</th>
                                <th class="py-2 pr-2 text-right">Qty</th><th class="py-2 pr-2 text-right">Rate</th><th class="py-2 pr-2 text-right">Waste%</th><th class="py-2 pr-2 text-right">Amount</th><th class="py-2"></th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="(l,i) in lines" :key="i" draggable="true" @dragstart="onDragStart(i)" @dragover.prevent @drop="onDrop(i)" class="border-b border-slate-50 hover:bg-slate-50/60">
                                    <td class="py-1.5 text-slate-300 cursor-move select-none" title="Drag to reorder">⠿</td>
                                    <td class="py-1.5 pr-2"><select v-model="l.line_type" class="rounded border border-slate-200 px-1.5 py-1 text-xs"><option value="material">Material</option><option value="labour">Labour</option><option value="other">Other</option></select></td>
                                    <td class="py-1.5 pr-2">
                                        <select v-model="l.item_code" @change="applyRate(l)" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-24">
                                            <option value="">custom</option>
                                            <option v-for="r in codesForType(l.line_type)" :key="r.id" :value="r.item_code">{{ r.item_code }}</option>
                                        </select>
                                    </td>
                                    <td class="py-1.5 pr-2"><input v-model="l.description" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-40"></td>
                                    <td class="py-1.5 pr-2"><input v-model.number="l.quantity" type="number" step="0.01" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-20 text-right"></td>
                                    <td class="py-1.5 pr-2"><input v-model.number="l.rate" type="number" step="0.01" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-24 text-right"></td>
                                    <td class="py-1.5 pr-2"><input v-model.number="l.wastage_percent" type="number" step="0.1" :disabled="l.line_type==='labour'" class="rounded border border-slate-200 px-1.5 py-1 text-xs w-16 text-right disabled:bg-slate-50"></td>
                                    <td class="py-1.5 pr-2 text-right font-medium text-slate-700">{{ fmt(lineAmount(l)) }}</td>
                                    <td class="py-1.5 text-right"><button @click="removeLine(i)" class="text-rose-400 hover:text-rose-600">✕</button></td>
                                </tr>
                                <tr v-if="!lines.length"><td colspan="9" class="py-6 text-center text-slate-400">No line items yet</td></tr>
                            </tbody>
                        </table>
                        </div>
                        <div class="flex gap-2 mt-3">
                            <button @click="addLine('material')" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">+ Material</button>
                            <button @click="addLine('labour')" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">+ Labour</button>
                        </div>
                        <p class="text-xs text-slate-400 mt-2">Tip: drag the ⠿ handle to reorder line items.</p>
                    </div>
                </div>

                <!-- Live breakdown -->
                <div class="space-y-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-4">Cost breakdown</h2>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between"><span class="text-slate-500">Materials</span><span class="text-slate-700">{{ fmt(materialsTotal) }}</span></div>
                            <div class="flex justify-between"><span class="text-slate-500">Labour</span><span class="text-slate-700">{{ fmt(labourTotal) }}</span></div>
                            <div class="flex justify-between border-t border-slate-100 pt-2"><span class="text-slate-600 font-medium">Subtotal</span><span class="text-slate-800 font-medium">{{ fmt(subtotal) }}</span></div>
                            <div class="flex justify-between items-center"><span class="text-slate-500">Overhead <input v-model.number="overhead" type="number" class="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs text-right mx-1">%</span><span class="text-slate-700">{{ fmt(overheadAmt) }}</span></div>
                            <div class="flex justify-between items-center"><span class="text-slate-500">Margin <input v-model.number="margin" type="number" class="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs text-right mx-1">%</span><span class="text-slate-700">{{ fmt(marginAmt) }}</span></div>
                            <div class="flex justify-between border-t-2 border-slate-200 pt-3 mt-1"><span class="text-slate-800 font-semibold">Grand total</span><span class="text-lg font-semibold text-brand">{{ fmt(grandTotal) }}</span></div>
                            <p v-if="serverGrand!==null" class="text-xs mt-2" :class="Math.abs(serverGrand-grandTotal)<0.01 ? 'text-emerald-600' : 'text-rose-600'">
                                Server total: {{ fmt(serverGrand) }} — {{ Math.abs(serverGrand-grandTotal)<0.01 ? 'matches ✓' : 'mismatch!' }}
                            </p>
                        </div>
                        <!-- simple visual bars -->
                        <div class="mt-4 h-3 rounded-full overflow-hidden flex" v-if="subtotal>0">
                            <div class="bg-blue-400" :style="{width: (materialsTotal/grandTotal*100)+'%'}" title="Materials"></div>
                            <div class="bg-emerald-400" :style="{width: (labourTotal/grandTotal*100)+'%'}" title="Labour"></div>
                            <div class="bg-amber-300" :style="{width: (overheadAmt/grandTotal*100)+'%'}" title="Overhead"></div>
                            <div class="bg-violet-400" :style="{width: (marginAmt/grandTotal*100)+'%'}" title="Margin"></div>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Saved estimates</h2>
                        <div v-for="e in saved" :key="e.id" class="flex items-center justify-between py-2 border-b border-slate-50 text-sm">
                            <div><div class="text-slate-700">{{ e.title }}</div><div class="text-xs text-slate-400">{{ e.reference }} · v{{ e.version }} · {{ fmt(e.grand_total) }}</div></div>
                            <button @click="saveVersion(e.id)" class="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">Save as new version</button>
                        </div>
                        <p v-if="!saved.length" class="text-sm text-slate-400 py-3 text-center">No saved estimates</p>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/estimates', 'EstimatesView', EstimatesView);
})();
