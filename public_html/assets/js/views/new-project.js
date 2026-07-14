/**
 * New project (#/projects/new) — a full page (not a modal) to create a project.
 * Contract value is the base; GST % derives the GST amount and Total contract
 * value (two-way, like income/expenses). A client can be added inline without
 * leaving the page.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const NewProjectView = {
        setup() {
            const saving = ref(false);
            const clients = ref([]);
            const currencies = ref([]);
            const location = reactive({ lat: null, lng: null });
            const form = reactive({
                code: '', name: '', client_id: null, project_type: 'new',
                contract_value: 0, contract_gst_percent: 0, contract_total: 0,
                currency_code: '', currency_symbol: '',
                site_address: '', status: 'planning', start_date: '', end_date: '', description: '',
            });
            const round2 = (n) => Math.round((+n || 0) * 100) / 100;
            const gstAmount = computed(() => round2((+form.contract_value || 0) * (+form.contract_gst_percent || 0) / 100));
            const sym = () => form.currency_symbol || (store.currency && store.currency.symbol) || '';
            const nf = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
            function recalcFromBase() { form.contract_total = round2((+form.contract_value || 0) * (1 + (+form.contract_gst_percent || 0) / 100)); }
            function recalcFromTotal() { form.contract_value = round2((+form.contract_total || 0) / (1 + (+form.contract_gst_percent || 0) / 100)); }
            function onCurrencyChange() { const c = currencies.value.find(x => x.code === form.currency_code); if (c) form.currency_symbol = c.symbol; }

            // ---- inline add-client ----
            const showClient = ref(false);
            const savingClient = ref(false);
            const clientForm = reactive({ name: '', contact_person: '', email: '', phone: '', gst_number: '', pan: '', address: '' });
            function openClient() { Object.assign(clientForm, { name: '', contact_person: '', email: '', phone: '', gst_number: '', pan: '', address: '' }); showClient.value = true; }
            async function saveClient() {
                if (!clientForm.name.trim()) { CSApp.flash('error', 'Client name is required'); return; }
                savingClient.value = true;
                try {
                    const created = (await api.post('/api/clients', { ...clientForm })).data;
                    clients.value = (await api.get('/api/clients')).data;
                    form.client_id = created.id;          // link the new client immediately
                    showClient.value = false;
                    CSApp.flash('success', 'Client added and linked');
                } catch (e) { CSApp.flash('error', e.message); }
                finally { savingClient.value = false; }
            }

            async function loadLists() {
                try { clients.value = (await api.get('/api/clients')).data; } catch (e) { clients.value = []; }
                try {
                    currencies.value = (await api.get('/api/currencies')).data;
                    const def = currencies.value.find(c => +c.is_default === 1) || currencies.value[0];
                    if (def) { form.currency_code = def.code; form.currency_symbol = def.symbol; }
                } catch (e) { currencies.value = []; }
            }

            async function save() {
                if (!form.name.trim()) { CSApp.flash('error', 'Project name is required'); return; }
                saving.value = true;
                try {
                    const payload = {
                        name: form.name.trim(), project_type: form.project_type, status: form.status,
                        client_id: form.client_id || null,
                        contract_value: +form.contract_value || 0, contract_gst_percent: +form.contract_gst_percent || 0,
                        currency_code: form.currency_code || null, currency_symbol: form.currency_symbol || null,
                        site_address: form.site_address, description: form.description,
                        latitude: (location.lat == null ? null : location.lat), longitude: (location.lng == null ? null : location.lng),
                    };
                    if (form.code) payload.code = form.code;
                    if (form.start_date) payload.start_date = form.start_date;
                    if (form.end_date) payload.end_date = form.end_date;
                    const created = (await api.post('/api/projects', payload)).data;
                    CSApp.flash('success', 'Project created: ' + created.name);
                    CSApp.navigate('/project/' + created.id);   // land on the new project
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            onMounted(loadLists);
            return { form, saving, clients, currencies, location, gstAmount, sym, nf, recalcFromBase, recalcFromTotal, onCurrencyChange, save,
                showClient, savingClient, clientForm, openClient, saveClient };
        },
        template: `
        <div>
            <div class="mb-5">
                <a href="#/projects" class="text-sm text-brand hover:underline">← Projects</a>
                <h1 class="text-xl font-semibold text-slate-800">New project</h1>
                <p class="text-sm text-slate-500">Create a project. Contract value is the base; GST % gives the GST amount and total contract value.</p>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-6 w-full">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="form.code" placeholder="auto if blank" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Project name *</label><input v-model="form.name" placeholder="e.g. Harbor Villa" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Type of project</label>
                        <select v-model="form.project_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="new">New</option><option value="renovation">Renovation</option></select>
                    </div>

                    <div class="sm:col-span-2">
                        <label class="block text-sm text-slate-600 mb-1">Client</label>
                        <div class="flex gap-2">
                            <select v-model="form.client_id" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— none —</option>
                                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                            </select>
                            <button type="button" @click="openClient" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-brand hover:bg-brand/5 whitespace-nowrap">+ Add client</button>
                        </div>
                    </div>
                    <div><label class="block text-sm text-slate-600 mb-1">Currency</label>
                        <select v-model="form.currency_code" @change="onCurrencyChange" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option v-for="c in currencies" :key="c.code" :value="c.code">{{ c.code }} ({{ c.symbol }})</option>
                        </select>
                    </div>

                    <div><label class="block text-sm text-slate-600 mb-1">Contract value (base)</label><input v-model.number="form.contract_value" @input="recalcFromBase" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">GST %</label><input v-model.number="form.contract_gst_percent" @input="recalcFromBase" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Total contract value <span class="text-slate-400">(base + GST)</span></label><input v-model.number="form.contract_total" @input="recalcFromTotal" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div class="sm:col-span-2 lg:col-span-3 -mt-1 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2 text-sm flex justify-between">
                        <span class="text-slate-500">GST value: <span class="text-slate-700">{{ sym() }}{{ nf(gstAmount) }}</span></span>
                        <span class="text-slate-500">Total contract value: <span class="font-semibold text-slate-800">{{ sym() }}{{ nf(form.contract_total) }}</span></span>
                    </div>

                    <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="form.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Status</label>
                        <select v-model="form.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select>
                    </div>

                    <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="form.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    <div><label class="block text-sm text-slate-600 mb-1">Target end date</label><input v-model="form.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                    <div class="hidden lg:block"></div>
                    <div class="sm:col-span-2 lg:col-span-3"><label class="block text-sm text-slate-600 mb-1">Description</label><textarea v-model="form.description" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>

                    <div class="sm:col-span-2 lg:col-span-3">
                        <label class="block text-sm text-slate-600 mb-1">Location <span class="text-slate-400">(mark on the map)</span></label>
                        <map-field v-model="location" :editable="true" height="20rem"></map-field>
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-5">
                    <a href="#/projects" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</a>
                    <button @click="save" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Creating…' : 'Create project' }}</button>
                </div>
            </div>

            <!-- Inline add-client modal -->
            <div v-if="showClient" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">Add client</h2><button @click="showClient=false" class="text-slate-400">✕</button></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="sm:col-span-2"><label class="block text-xs text-slate-500 mb-1">Name *</label><input v-model="clientForm.name" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Contact person</label><input v-model="clientForm.contact_person" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Phone</label><input v-model="clientForm.phone" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">Email</label><input v-model="clientForm.email" type="email" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">GST number</label><input v-model="clientForm.gst_number" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-xs text-slate-500 mb-1">PAN</label><input v-model="clientForm.pan" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="sm:col-span-2"><label class="block text-xs text-slate-500 mb-1">Address</label><textarea v-model="clientForm.address" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showClient=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="saveClient" :disabled="savingClient" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ savingClient ? 'Saving…' : 'Save client' }}</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/projects/new', 'NewProjectView', NewProjectView);
})();
