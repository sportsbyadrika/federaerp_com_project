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

            onMounted(load);
            return { rows, loading, saving, filter, filteredRows, TYPES, typeLabel, typeClass, showModal, editingId, form, openAdd, openEdit, save, remove };
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
        </div>`,
    };

    CSApp.route('/staff', 'StaffView', StaffView);
})();
