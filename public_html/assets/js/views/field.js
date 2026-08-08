/**
 * Field staff work (#/field) and the admin review queue (#/field-reports).
 *
 *  - Field staff log a daily task on one of their assigned projects with the
 *    skilled / unskilled labour needed; entries start as "pending".
 *  - The institution admin reviews each entry (approve / reject with a note).
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const statusClass = (s) => ({ pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700' }[s] || 'bg-slate-100 text-slate-600');

    // ---- Field staff: my daily work --------------------------------------
    const FieldWorkView = {
        setup() {
            const loading = ref(true);
            const saving = ref(false);
            const ctx = ref({ staff: {}, projects: [] });
            const logs = ref([]);
            const form = reactive({ project_id: null, task_name: '', skilled_count: 0, unskilled_count: 0, log_date: new Date().toISOString().slice(0, 10), notes: '' });

            async function loadCtx() {
                try { ctx.value = (await api.get('/api/field/context')).data; }
                catch (e) { CSApp.flash('error', e.message); }
            }
            async function loadLogs() {
                try { logs.value = (await api.get('/api/field/logs')).data; }
                catch (e) { CSApp.flash('error', e.message); }
            }
            async function submit() {
                if (!form.project_id) { CSApp.flash('error', 'Select a project'); return; }
                if (!form.task_name.trim()) { CSApp.flash('error', 'Task name is required'); return; }
                saving.value = true;
                try {
                    await api.post('/api/field/logs', { ...form });
                    CSApp.flash('success', 'Daily log submitted for review');
                    Object.assign(form, { task_name: '', skilled_count: 0, unskilled_count: 0, notes: '' });
                    await loadLogs();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            onMounted(async () => { loading.value = true; await loadCtx(); await loadLogs(); loading.value = false; });
            return { loading, saving, ctx, logs, form, submit, statusClass };
        },
        template: `
        <div>
            <h1 class="text-xl font-semibold text-slate-800 mb-1">My field work</h1>
            <p class="text-sm text-slate-500 mb-5">Log daily tasks and the labour needed on your assigned projects.</p>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading…</div>
            <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- New log -->
                <div class="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                    <h2 class="font-medium text-slate-700 mb-3">New daily log</h2>
                    <div v-if="!ctx.projects.length" class="text-sm text-slate-400">No projects assigned to you yet. Ask your admin to assign a project.</div>
                    <div v-else class="space-y-3">
                        <div><label class="block text-xs text-slate-500 mb-1">Project</label>
                            <select v-model="form.project_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— select —</option>
                                <option v-for="p in ctx.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div><label class="block text-xs text-slate-500 mb-1">Task name</label><input v-model="form.task_name" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Slab shuttering"></div>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="block text-xs text-slate-500 mb-1">Skilled labour</label><input v-model.number="form.skilled_count" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                            <div><label class="block text-xs text-slate-500 mb-1">Unskilled labour</label><input v-model.number="form.unskilled_count" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        </div>
                        <div><label class="block text-xs text-slate-500 mb-1">Date</label><input v-model="form.log_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Notes</label><textarea v-model="form.notes" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                        <button @click="submit" :disabled="saving" class="w-full py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Submitting…' : 'Submit for review' }}</button>
                    </div>
                </div>

                <!-- My logs -->
                <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">My logs</h2>
                    <div class="table-scroll">
                        <table class="w-full text-sm">
                            <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                                <th class="py-2 px-3">Date</th><th class="py-2 px-3">Project</th><th class="py-2 px-3">Task</th>
                                <th class="py-2 px-3 text-right">Skilled</th><th class="py-2 px-3 text-right">Unskilled</th><th class="py-2 px-3">Status</th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="l in logs" :key="l.id" class="border-b border-slate-50">
                                    <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (l.log_date||'').slice(0,10) }}</td>
                                    <td class="py-2 px-3 text-slate-700">{{ l.project_name }}</td>
                                    <td class="py-2 px-3 text-slate-700">{{ l.task_name }}<div v-if="l.review_note" class="text-[11px] text-slate-400">Admin: {{ l.review_note }}</div></td>
                                    <td class="py-2 px-3 text-right text-slate-600">{{ l.skilled_count }}</td>
                                    <td class="py-2 px-3 text-right text-slate-600">{{ l.unskilled_count }}</td>
                                    <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="statusClass(l.review_status)">{{ l.review_status }}</span></td>
                                </tr>
                                <tr v-if="!logs.length"><td colspan="6" class="py-8 text-center text-slate-400">No logs yet.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`,
    };

    // ---- Admin: field review queue ---------------------------------------
    const FieldReviewView = {
        setup() {
            const loading = ref(true);
            const rows = ref([]);
            const filterStatus = ref('');
            const reviewing = reactive({ open: false, row: null, note: '', saving: false });

            async function load() {
                loading.value = true;
                try {
                    let url = '/api/field/review';
                    if (filterStatus.value) url += '?review_status=' + encodeURIComponent(filterStatus.value);
                    rows.value = (await api.get(url)).data;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            function openReview(row) { reviewing.open = true; reviewing.row = row; reviewing.note = row.review_note || ''; }
            async function setStatus(status) {
                reviewing.saving = true;
                try {
                    await api.post('/api/field/logs/' + reviewing.row.id + '/review', { review_status: status, review_note: reviewing.note });
                    CSApp.flash('success', 'Marked ' + status); reviewing.open = false; await load();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { reviewing.saving = false; }
            }
            const totals = computed(() => {
                const t = { skilled: 0, unskilled: 0 };
                rows.value.forEach(r => { t.skilled += +r.skilled_count || 0; t.unskilled += +r.unskilled_count || 0; });
                return t;
            });

            onMounted(load);
            return { loading, rows, filterStatus, reviewing, load, openReview, setStatus, totals, statusClass };
        },
        template: `
        <div>
            <h1 class="text-xl font-semibold text-slate-800 mb-1">Field reports</h1>
            <p class="text-sm text-slate-500 mb-5">Review the daily task &amp; labour logs submitted by field staff.</p>

            <div class="flex items-center gap-2 mb-4">
                <span class="text-xs text-slate-400">Status</span>
                <select v-model="filterStatus" @change="load" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                </select>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-5">
                <div v-if="loading" class="text-slate-400 text-sm py-8 text-center">Loading…</div>
                <div v-else class="table-scroll">
                    <table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
                            <th class="py-2 px-3">Date</th><th class="py-2 px-3">Staff</th><th class="py-2 px-3">Project</th><th class="py-2 px-3">Task</th>
                            <th class="py-2 px-3 text-right">Skilled</th><th class="py-2 px-3 text-right">Unskilled</th><th class="py-2 px-3">Status</th><th class="py-2 px-3"></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="l in rows" :key="l.id" class="border-b border-slate-50">
                                <td class="py-2 px-3 text-slate-600 whitespace-nowrap">{{ (l.log_date||'').slice(0,10) }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ l.staff_name }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ l.project_name }}</td>
                                <td class="py-2 px-3 text-slate-700">{{ l.task_name }}<div v-if="l.notes" class="text-[11px] text-slate-400">{{ l.notes }}</div></td>
                                <td class="py-2 px-3 text-right text-slate-600">{{ l.skilled_count }}</td>
                                <td class="py-2 px-3 text-right text-slate-600">{{ l.unskilled_count }}</td>
                                <td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-xs" :class="statusClass(l.review_status)">{{ l.review_status }}</span></td>
                                <td class="py-2 px-3 text-right"><button @click="openReview(l)" class="text-brand hover:underline text-xs">Review</button></td>
                            </tr>
                            <tr v-if="!rows.length"><td colspan="8" class="py-8 text-center text-slate-400">No field logs.</td></tr>
                        </tbody>
                        <tfoot v-if="rows.length">
                            <tr class="border-t-2 border-slate-200 font-semibold text-slate-700">
                                <td class="py-2 px-3" colspan="4">Totals ({{ rows.length }})</td>
                                <td class="py-2 px-3 text-right">{{ totals.skilled }}</td>
                                <td class="py-2 px-3 text-right">{{ totals.unskilled }}</td>
                                <td colspan="2"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <!-- Review modal -->
            <div v-if="reviewing.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
                <div class="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <div class="flex items-center justify-between mb-3"><h2 class="font-semibold text-slate-800">Review log</h2><button @click="reviewing.open=false" class="text-slate-400">✕</button></div>
                    <div class="text-sm text-slate-600 mb-3">
                        <div><strong>{{ reviewing.row.staff_name }}</strong> · {{ reviewing.row.project_name }}</div>
                        <div>{{ reviewing.row.task_name }} — skilled {{ reviewing.row.skilled_count }}, unskilled {{ reviewing.row.unskilled_count }} on {{ (reviewing.row.log_date||'').slice(0,10) }}</div>
                    </div>
                    <label class="block text-xs text-slate-500 mb-1">Review note (optional)</label>
                    <textarea v-model="reviewing.note" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                    <div class="flex justify-end gap-2">
                        <button @click="setStatus('rejected')" :disabled="reviewing.saving" class="px-4 py-2 text-sm rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50">Reject</button>
                        <button @click="setStatus('approved')" :disabled="reviewing.saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">Approve</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/field', 'FieldWorkView', FieldWorkView);
    CSApp.route('/field-reports', 'FieldReviewView', FieldReviewView);
})();
