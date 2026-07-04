/**
 * Batch 6 — Document & Drawing Control, site-photo gallery, and QHSE.
 * Drag-and-drop uploads with client-side type/size validation, version history,
 * and files served through the authenticated proxy (/api/files/...), never
 * direct links.
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    const ALLOWED = ['pdf','jpg','jpeg','png','gif','webp','doc','docx','xls','xlsx','dwg','dxf','txt','csv'];
    const MAX_BYTES = 20 * 1024 * 1024;

    function validateFile(f) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED.includes(ext)) return 'File type .' + ext + ' not allowed';
        if (f.size > MAX_BYTES) return 'File exceeds 20 MB';
        return null;
    }

    const DocumentsView = {
        setup() {
            const projects = ref([]);
            const activeId = ref(null);
            const tab = ref('docs');
            const documents = ref([]);
            const photos = ref([]);
            const qhse = ref([]);
            const incidents = ref([]);
            const loading = ref(true);
            const dragOver = ref(false);
            const uploading = ref(false);
            const expanded = ref({});

            const incidentForm = reactive({ description: '', severity: 'low', category: '' });

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
                    documents.value = (await api.get('/api/documents?project_id=' + activeId.value)).data;
                    photos.value = (await api.get('/api/projects/' + activeId.value + '/photos')).data;
                    qhse.value = (await api.get('/api/projects/' + activeId.value + '/qhse')).data;
                    incidents.value = (await api.get('/api/incidents?project_id=' + activeId.value)).data;
                } catch (e) { CSApp.flash('error', e.message); }
            }
            onMounted(loadProjects);
            watch(activeId, loadAll);

            async function uploadFiles(fileList, kind) {
                const files = Array.from(fileList);
                for (const f of files) {
                    const err = validateFile(f);
                    if (err) { CSApp.flash('error', f.name + ': ' + err); return; }
                }
                uploading.value = true;
                try {
                    if (kind === 'photo') {
                        const fd = new FormData();
                        files.forEach(f => fd.append('file[]', f));
                        fd.append('project_id', activeId.value);
                        await api.upload('/api/photos', fd);
                    } else {
                        for (const f of files) {
                            const fd = new FormData();
                            fd.append('file', f);
                            fd.append('project_id', activeId.value);
                            fd.append('title', f.name);
                            fd.append('doc_type', 'blueprint');
                            await api.upload('/api/documents', fd);
                        }
                    }
                    CSApp.flash('success', 'Uploaded ' + files.length + ' file(s)');
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { uploading.value = false; dragOver.value = false; }
            }

            function onDrop(e, kind) { dragOver.value = false; if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, kind); }
            function onPick(e, kind) { if (e.target.files.length) uploadFiles(e.target.files, kind); e.target.value = ''; }

            async function toggleVersions(doc) {
                if (expanded.value[doc.id]) { expanded.value[doc.id] = null; return; }
                try { expanded.value[doc.id] = (await api.get('/api/documents/' + doc.id + '/versions')).data; }
                catch (e) { CSApp.flash('error', e.message); }
            }
            const fileUrl = (kind, id) => '/api/files/' + kind + '/' + id;

            async function reportIncident() {
                if (!incidentForm.description) { CSApp.flash('error', 'Description required'); return; }
                try {
                    await api.post('/api/incidents', { project_id: activeId.value, ...incidentForm });
                    CSApp.flash('success', 'Incident logged'); incidentForm.description = '';
                    await loadAll();
                } catch (e) { CSApp.flash('error', e.message); }
            }

            const fmtSize = (b) => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : Math.round(b/1024)+' KB';
            return { projects, activeId, tab, documents, photos, qhse, incidents, loading, dragOver, uploading, expanded, incidentForm,
                onDrop, onPick, toggleVersions, fileUrl, reportIncident, fmtSize };
        },
        template: `
        <div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div class="flex items-center gap-3">
                    <h1 class="text-xl font-semibold text-slate-800">Documents & QHSE</h1>
                    <select v-model="activeId" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"><option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                </div>
                <div class="flex gap-1 p-1 bg-slate-100 rounded-lg text-sm">
                    <button @click="tab='docs'" :class="tab==='docs'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Drawings</button>
                    <button @click="tab='photos'" :class="tab==='photos'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">Site photos</button>
                    <button @click="tab='qhse'" :class="tab==='qhse'?'bg-white shadow text-slate-900':'text-slate-500'" class="px-3 py-1.5 rounded-md">QHSE</button>
                </div>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading…</div>

            <!-- DRAWINGS -->
            <div v-else-if="tab==='docs'">
                <div @dragover.prevent="dragOver=true" @dragleave.prevent="dragOver=false" @drop.prevent="e=>onDrop(e,'doc')"
                     :class="dragOver?'border-brand bg-blue-50':'border-slate-300 bg-white'" class="border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-5">
                    <p class="text-slate-500 text-sm">{{ uploading ? 'Uploading…' : 'Drag & drop blueprints/drawings here' }}</p>
                    <label class="inline-block mt-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">Browse<input type="file" class="hidden" multiple @change="e=>onPick(e,'doc')"></label>
                    <p class="text-xs text-slate-400 mt-2">PDF, images, DWG/DXF, Office docs · max 20 MB</p>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
                    <div v-for="d in documents" :key="d.id" class="p-4">
                        <div class="flex items-center justify-between">
                            <div><div class="text-sm font-medium text-slate-800">{{ d.title }}</div><div class="text-xs text-slate-400">{{ d.doc_type }} · v{{ d.current_version }}</div></div>
                            <div class="flex gap-2">
                                <a v-if="d.latest_version_id" :href="fileUrl('document', d.latest_version_id)" target="_blank" class="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">Open latest</a>
                                <button @click="toggleVersions(d)" class="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">Versions</button>
                            </div>
                        </div>
                        <div v-if="expanded[d.id]" class="mt-3 pl-3 border-l-2 border-slate-100 space-y-1">
                            <div v-for="v in expanded[d.id]" :key="v.id" class="flex items-center justify-between text-xs text-slate-500">
                                <span>v{{ v.version_number }} · {{ v.original_name }} · {{ fmtSize(v.file_size) }}</span>
                                <a :href="fileUrl('document', v.id)" target="_blank" class="text-brand hover:underline">download</a>
                            </div>
                        </div>
                    </div>
                    <div v-if="!documents.length" class="p-8 text-center text-slate-400 text-sm">No documents yet</div>
                </div>
            </div>

            <!-- PHOTOS -->
            <div v-else-if="tab==='photos'">
                <div @dragover.prevent="dragOver=true" @dragleave.prevent="dragOver=false" @drop.prevent="e=>onDrop(e,'photo')"
                     :class="dragOver?'border-brand bg-blue-50':'border-slate-300 bg-white'" class="border-2 border-dashed rounded-xl p-8 text-center mb-5">
                    <p class="text-slate-500 text-sm">{{ uploading ? 'Uploading…' : 'Drag & drop site photos here (multi-upload)' }}</p>
                    <label class="inline-block mt-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">Browse<input type="file" class="hidden" multiple accept="image/*" @change="e=>onPick(e,'photo')"></label>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div v-for="ph in photos" :key="ph.id" class="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <img :src="fileUrl('photo', ph.id)" :alt="ph.caption||ph.original_name" class="w-full h-32 object-cover bg-slate-100">
                        <div class="p-2 text-xs text-slate-500 truncate">{{ ph.caption || ph.original_name }}</div>
                    </div>
                    <div v-if="!photos.length" class="col-span-full text-center text-slate-400 text-sm py-8">No photos yet</div>
                </div>
            </div>

            <!-- QHSE -->
            <div v-else-if="tab==='qhse'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">QHSE inspections</h2>
                    <div v-for="c in qhse" :key="c.id" class="py-2 border-b border-slate-50 text-sm">
                        <div class="flex justify-between"><span class="text-slate-700">{{ c.title }}</span><span class="px-2 py-0.5 rounded-full text-xs" :class="c.status==='passed'?'bg-emerald-50 text-emerald-700':(c.status==='failed'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600')">{{ c.status }}</span></div>
                        <div class="text-xs text-slate-400">{{ c.checklist_type }} · {{ c.inspection_date }} · score {{ c.score_percent ?? '—' }}%</div>
                    </div>
                    <p v-if="!qhse.length" class="text-sm text-slate-400 py-3 text-center">No inspections yet</p>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">Incident log</h2>
                    <div class="space-y-2 mb-4">
                        <textarea v-model="incidentForm.description" placeholder="Describe incident…" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows="2"></textarea>
                        <div class="flex gap-2">
                            <select v-model="incidentForm.severity" class="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
                            <input v-model="incidentForm.category" placeholder="Category" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <button @click="reportIncident" class="px-3 py-2 rounded-lg bg-brand text-white text-sm">Log</button>
                        </div>
                    </div>
                    <div v-for="i in incidents" :key="i.id" class="py-2 border-b border-slate-50 text-sm">
                        <div class="flex justify-between"><span class="text-slate-700">{{ i.description }}</span><span class="px-2 py-0.5 rounded-full text-xs" :class="i.severity==='critical'||i.severity==='high'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-600'">{{ i.severity }}</span></div>
                        <div class="text-xs text-slate-400">{{ i.incident_date }} · {{ i.status }}</div>
                    </div>
                    <p v-if="!incidents.length" class="text-sm text-slate-400 py-3 text-center">No incidents</p>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/documents', 'DocumentsView', DocumentsView);
})();
