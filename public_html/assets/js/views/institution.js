/**
 * Institution settings (#/institution): the login institution's letterhead
 * details — Full name, GST number, PAN, address (for letterhead) and Logo —
 * plus basic contact fields. Editing is limited to Org Admins; Staff see it
 * read-only. Logo uploads through the secure Storage proxy.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted } = Vue;

    const InstitutionView = {
        setup() {
            const loading = ref(true);
            const saving = ref(false);
            const org = reactive({});
            const hasLogo = ref(false);
            const logoBust = ref(Date.now ? 0 : 0); // cache-buster counter (Date.now unavailable-safe)
            let bust = 0;
            const canEdit = computed(() => ['org_admin', 'super_admin'].includes(store.user && store.user.role));

            async function load() {
                loading.value = true;
                try {
                    const d = (await api.get('/api/organisation')).data;
                    Object.assign(org, d);
                    hasLogo.value = !!d.has_logo;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            onMounted(load);

            async function save() {
                saving.value = true;
                try {
                    await api.put('/api/organisation', {
                        name: org.name, legal_name: org.legal_name, gst_number: org.gst_number, pan: org.pan,
                        letterhead_address: org.letterhead_address, email: org.email, phone: org.phone,
                        address: org.address, city: org.city, country: org.country,
                    });
                    CSApp.flash('success', 'Institution settings saved');
                } catch (e) { CSApp.flash('error', e.message); }
                finally { saving.value = false; }
            }

            const logoUrl = computed(() => '/api/organisation/logo?v=' + bust);
            async function onLogo(e) {
                const f = e.target.files[0]; if (!f) return;
                if (!/\.(png|jpe?g|webp|gif)$/i.test(f.name)) { CSApp.flash('error', 'Logo must be an image (PNG/JPG/WEBP/GIF)'); return; }
                const fd = new FormData(); fd.append('file', f);
                try {
                    await api.upload('/api/organisation/logo', fd);
                    hasLogo.value = true; bust++;
                    CSApp.flash('success', 'Logo updated');
                } catch (err) { CSApp.flash('error', err.message); }
                e.target.value = '';
            }

            return { loading, saving, org, hasLogo, canEdit, logoUrl, save, onLogo };
        },
        template: `
        <div>
            <div class="flex items-center justify-between mb-5">
                <div>
                    <a href="#/setup" class="text-sm text-brand hover:underline">← Setup</a>
                    <h1 class="text-xl font-semibold text-slate-800">Institution settings</h1>
                </div>
            </div>
            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading…</div>
            <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
                    <p v-if="!canEdit" class="mb-4 text-sm text-amber-600">You have read-only access. Ask an Org Admin to edit these details.</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Full name of institution</label><input v-model="org.legal_name" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Display name</label><input v-model="org.name" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div></div>
                        <div><label class="block text-sm text-slate-600 mb-1">GST number</label><input v-model="org.gst_number" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">PAN</label><input v-model="org.pan" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Email</label><input v-model="org.email" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Phone</label><input v-model="org.phone" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Address for letterhead</label><textarea v-model="org.letterhead_address" :disabled="!canEdit" rows="3" placeholder="Full postal address shown on printed reports / letterhead" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                        <div><label class="block text-sm text-slate-600 mb-1">City</label><input v-model="org.city" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Country</label><input v-model="org.country" :disabled="!canEdit" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                    </div>
                    <div v-if="canEdit" class="mt-4"><button @click="save" :disabled="saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ saving ? 'Saving…' : 'Save settings' }}</button></div>
                </div>

                <!-- Logo -->
                <div class="bg-white rounded-xl border border-slate-200 p-6 h-fit">
                    <h2 class="font-medium text-slate-700 mb-3">Logo</h2>
                    <div class="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 mb-3" style="min-height:120px">
                        <img v-if="hasLogo" :src="logoUrl" alt="Institution logo" class="max-h-28 max-w-full object-contain">
                        <span v-else class="text-sm text-slate-400">No logo uploaded</span>
                    </div>
                    <label v-if="canEdit" class="block">
                        <span class="inline-block px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">{{ hasLogo ? 'Replace logo' : 'Upload logo' }}</span>
                        <input type="file" accept="image/*" class="hidden" @change="onLogo">
                    </label>
                    <p class="text-xs text-slate-400 mt-2">PNG, JPG, WEBP or GIF. Shown on printed reports / letterhead.</p>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/institution', 'InstitutionView', InstitutionView);
})();
