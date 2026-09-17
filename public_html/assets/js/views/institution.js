/**
 * Institution settings (#/institution): the login institution's letterhead
 * details — Full name, GST number, PAN, address (for letterhead) — plus Logo,
 * Signature and company round Seal images. Signature and seal are cropped before
 * upload (Cropper.js from CDN) and stored via the secure Storage proxy for reuse
 * on invoices and other documents. Editing is limited to Org Admins.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, nextTick } = Vue;

    // Lazy CDN loader for Cropper.js (shared).
    const cropperLib = {
        state: 'idle', waiters: [],
        ensure() {
            return new Promise((resolve) => {
                if (this.state === 'ready') return resolve(true);
                if (this.state === 'failed') return resolve(false);
                this.waiters.push(resolve);
                if (this.state === 'loading') return;
                this.state = 'loading';
                const css = document.createElement('link');
                css.rel = 'stylesheet'; css.href = 'https://unpkg.com/cropperjs@1.6.2/dist/cropper.min.css';
                document.head.appendChild(css);
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/cropperjs@1.6.2/dist/cropper.min.js'; s.async = true;
                s.onload = () => { this.state = 'ready'; this.flush(true); };
                s.onerror = () => { this.state = 'failed'; this.flush(false); };
                document.head.appendChild(s);
            });
        },
        flush(ok) { const w = this.waiters; this.waiters = []; w.forEach(f => f(ok)); },
    };

    const InstitutionView = {
        setup() {
            const loading = ref(true);
            const saving = ref(false);
            const org = reactive({});
            const has = reactive({ logo: false, signature: false, seal: false });
            const bust = reactive({ logo: 0, signature: 0, seal: 0 });
            const canEdit = computed(() => ['org_admin', 'super_admin'].includes(store.user && store.user.role));

            async function load() {
                loading.value = true;
                try {
                    const d = (await api.get('/api/organisation')).data;
                    Object.assign(org, d);
                    has.logo = !!d.has_logo; has.signature = !!d.has_signature; has.seal = !!d.has_seal;
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

            const imgUrl = (kind) => '/api/organisation/image/' + kind + '?v=' + bust[kind];
            const logoUrl = computed(() => '/api/organisation/logo?v=' + bust.logo);

            async function uploadBlob(kind, blob, filename) {
                const fd = new FormData(); fd.append('file', blob, filename);
                await api.upload('/api/organisation/image/' + kind, fd);
                has[kind] = true; bust[kind]++;
                CSApp.flash('success', kind.charAt(0).toUpperCase() + kind.slice(1) + ' updated');
            }

            // Logo: direct upload (no crop).
            async function onLogo(e) {
                const f = e.target.files[0]; e.target.value = ''; if (!f) return;
                if (!/\.(png|jpe?g|webp|gif)$/i.test(f.name)) { CSApp.flash('error', 'Logo must be an image (PNG/JPG/WEBP/GIF)'); return; }
                try { await uploadBlob('logo', f, f.name); } catch (err) { CSApp.flash('error', err.message); }
            }

            // ---- Signature / seal: crop before upload ----
            const crop = reactive({ open: false, kind: '', src: '', saving: false, round: false });
            const cropImg = ref(null);
            let cropper = null;

            async function onPick(kind, e) {
                const f = e.target.files[0]; e.target.value = ''; if (!f) return;
                if (!/\.(png|jpe?g|webp|gif)$/i.test(f.name)) { CSApp.flash('error', 'Please choose an image (PNG/JPG/WEBP/GIF)'); return; }
                const ok = await cropperLib.ensure();
                if (!ok) { // cropper unavailable — upload the original
                    try { await uploadBlob(kind, f, f.name); } catch (err) { CSApp.flash('error', err.message); }
                    return;
                }
                crop.kind = kind; crop.round = (kind === 'seal'); crop.src = URL.createObjectURL(f); crop.open = true;
                await nextTick();
                if (cropper) { cropper.destroy(); cropper = null; }
                cropper = new window.Cropper(cropImg.value, {
                    aspectRatio: kind === 'seal' ? 1 : NaN,
                    viewMode: 1, autoCropArea: 1, background: false, movable: true, zoomable: true,
                });
            }
            function closeCrop() {
                crop.open = false;
                if (cropper) { cropper.destroy(); cropper = null; }
                if (crop.src) { try { URL.revokeObjectURL(crop.src); } catch (e) {} crop.src = ''; }
            }
            function applyCrop() {
                if (!cropper) return;
                crop.saving = true;
                const canvas = cropper.getCroppedCanvas({ maxWidth: 1400, maxHeight: 1400, imageSmoothingQuality: 'high' });
                const kind = crop.kind;
                canvas.toBlob(async (blob) => {
                    try { await uploadBlob(kind, blob, kind + '.png'); closeCrop(); }
                    catch (err) { CSApp.flash('error', err.message); }
                    finally { crop.saving = false; }
                }, 'image/png');
            }
            function rotate(deg) { if (cropper) cropper.rotate(deg); }

            return { loading, saving, org, has, canEdit, logoUrl, imgUrl, save, onLogo, onPick, crop, cropImg, applyCrop, closeCrop, rotate };
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

                <!-- Brand assets: logo, signature, seal -->
                <div class="space-y-6">
                    <div class="bg-white rounded-xl border border-slate-200 p-6">
                        <h2 class="font-medium text-slate-700 mb-3">Logo</h2>
                        <div class="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 mb-3" style="min-height:110px">
                            <img v-if="has.logo" :src="logoUrl" alt="Institution logo" class="max-h-24 max-w-full object-contain">
                            <span v-else class="text-sm text-slate-400">No logo uploaded</span>
                        </div>
                        <label v-if="canEdit" class="block">
                            <span class="inline-block px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">{{ has.logo ? 'Replace logo' : 'Upload logo' }}</span>
                            <input type="file" accept="image/*" class="hidden" @change="onLogo">
                        </label>
                    </div>

                    <div class="bg-white rounded-xl border border-slate-200 p-6">
                        <h2 class="font-medium text-slate-700 mb-1">Authorised signature</h2>
                        <p class="text-xs text-slate-400 mb-3">Cropped before saving. Used on invoices &amp; documents.</p>
                        <div class="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 mb-3" style="min-height:90px">
                            <img v-if="has.signature" :src="imgUrl('signature')" alt="Signature" class="max-h-20 max-w-full object-contain">
                            <span v-else class="text-sm text-slate-400">No signature uploaded</span>
                        </div>
                        <label v-if="canEdit" class="block">
                            <span class="inline-block px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">{{ has.signature ? 'Replace signature' : 'Upload &amp; crop signature' }}</span>
                            <input type="file" accept="image/*" class="hidden" @change="onPick('signature', $event)">
                        </label>
                    </div>

                    <div class="bg-white rounded-xl border border-slate-200 p-6">
                        <h2 class="font-medium text-slate-700 mb-1">Company round seal</h2>
                        <p class="text-xs text-slate-400 mb-3">Square (1:1) crop for the round seal.</p>
                        <div class="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-slate-50 mb-3" style="min-height:110px">
                            <img v-if="has.seal" :src="imgUrl('seal')" alt="Company seal" class="max-h-24 object-contain rounded-full">
                            <span v-else class="text-sm text-slate-400">No seal uploaded</span>
                        </div>
                        <label v-if="canEdit" class="block">
                            <span class="inline-block px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">{{ has.seal ? 'Replace seal' : 'Upload &amp; crop seal' }}</span>
                            <input type="file" accept="image/*" class="hidden" @change="onPick('seal', $event)">
                        </label>
                    </div>
                </div>
            </div>

            <!-- Crop modal -->
            <div v-if="crop.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="font-semibold text-slate-800">Crop {{ crop.kind === 'seal' ? 'seal' : 'signature' }}</h2>
                        <button @click="closeCrop" class="text-slate-400">✕</button>
                    </div>
                    <div class="bg-slate-100 rounded-lg overflow-hidden" style="max-height:60vh">
                        <img ref="cropImg" :src="crop.src" style="max-width:100%; display:block">
                    </div>
                    <p class="text-xs text-slate-400 mt-2">Drag to move the crop box, drag corners to resize, scroll to zoom.</p>
                    <div class="flex items-center justify-between mt-4">
                        <div class="flex gap-2">
                            <button @click="rotate(-90)" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">⟲ Rotate</button>
                            <button @click="rotate(90)" class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">⟳ Rotate</button>
                        </div>
                        <div class="flex gap-2">
                            <button @click="closeCrop" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                            <button @click="applyCrop" :disabled="crop.saving" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ crop.saving ? 'Saving…' : 'Crop & save' }}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/institution', 'InstitutionView', InstitutionView);
})();
