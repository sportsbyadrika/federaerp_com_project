/**
 * Batch 5 (extended) — Kanban Project Management.
 *
 * Board is laid out as a Jira-style table: floors are swimlane rows and
 * task_statuses are columns. Cards drag between cells (changing status and,
 * across rows, their floor) and persist via PATCH /api/tasks/{id}/move.
 * Tasks can be created Directly or copied From BOQ, edited in a modal, and
 * each card can capture Materials and Labour (with a filterable list).
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    const blankTask = () => ({
        id: null, title: '', source: 'direct', boq_entry_id: null, project_floor_id: null,
        item_code: '', item_head: '', item_description: '', percentage: 0,
        status_id: null, priority: 'medium', assignee_id: null,
    });

    const ProjectsView = {
        setup() {
            const projects = ref([]);
            const activeId = ref(null);
            const board = ref(null);
            const loading = ref(true);
            const dragTask = ref(null);

            // lookups
            const clients = ref([]);
            const staff = ref([]);
            const boqOptions = ref([]);
            const materialsCatalog = ref([]);
            const employees = ref([]);

            // task modal
            const showTask = ref(false);
            const savingTask = ref(false);
            const task = reactive(blankTask());

            // new project modal
            const showNewProject = ref(false);
            const newProject = reactive({ code: '', name: '', client_id: null, project_type: 'new', contract_value: 0, site_address: '', status: 'planning', start_date: '', end_date: '', description: '' });
            const savingProject = ref(false);

            // materials / labour modals
            const resModal = reactive({ open: false, kind: 'materials', task: null, filter: '', items: [], loading: false, saving: false });
            const matForm = reactive({ material_id: null, item_name: '', unit: '', quantity: 0, used_date: new Date().toISOString().slice(0, 10), notes: '' });
            const labForm = reactive({ employee_id: null, worker_name: '', trade: '', headcount: 1, hours: 0, work_date: new Date().toISOString().slice(0, 10), notes: '' });

            async function loadProjects() {
                loading.value = true;
                try {
                    projects.value = (await api.get('/api/projects')).data;
                    try { clients.value = (await api.get('/api/clients')).data; } catch (e) {}
                    try { staff.value = (await api.get('/api/auth/staff')).data; } catch (e) {}
                    try { materialsCatalog.value = (await api.get('/api/materials')).data; } catch (e) {}
                    try { employees.value = (await api.get('/api/employees')).data; } catch (e) {}
                    if (projects.value.length) {
                        // Prefer the project id from the route (#/board/:id), else the first.
                        const routeId = parseInt(store.params.id, 10);
                        const match = projects.value.find(p => p.id === routeId);
                        activeId.value = match ? match.id : projects.value[0].id;
                        await loadBoard();
                    }
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadBoard() {
                if (!activeId.value) return;
                try {
                    board.value = (await api.get('/api/projects/' + activeId.value + '/board')).data;
                    try { boqOptions.value = (await api.get('/api/projects/' + activeId.value + '/task-boq-options')).data; } catch (e) { boqOptions.value = []; }
                } catch (e) { CSApp.flash('error', e.message); }
            }
            onMounted(loadProjects);
            watch(activeId, loadBoard);

            // ---- swimlanes: real floors + an "Unassigned" lane when needed ----
            const lanes = computed(() => {
                if (!board.value) return [];
                const out = (board.value.floors || []).map(f => ({ id: f.id, label: f.label, code: f.code }));
                const hasUnassigned = (board.value.columns || []).some(c => (c.tasks || []).some(t => !t.project_floor_id));
                if (hasUnassigned || !out.length) out.push({ id: null, label: 'Unassigned', code: '—' });
                return out;
            });
            function cellTasks(col, laneId) {
                return (col.tasks || []).filter(t => (t.project_floor_id ? Number(t.project_floor_id) : null) === laneId);
            }

            // ---- drag & drop ----
            function onDragStart(t) { dragTask.value = t; }
            async function onDropCell(col, laneId) {
                const t = dragTask.value; dragTask.value = null;
                if (!t) return;
                const destCol = board.value.columns.find(c => c.id === col.id);
                if (!destCol) return;
                const sameStatus = Number(t.status_id) === Number(col.id);
                const sameFloor = (t.project_floor_id ? Number(t.project_floor_id) : null) === laneId;
                if (sameStatus && sameFloor) return;

                const prevStatus = t.status_id, prevFloor = t.project_floor_id;
                const pos = destCol.tasks.filter(x => x.id !== t.id).length; // append to column end
                try {
                    if (!sameFloor) {
                        await api.put('/api/tasks/' + t.id, { project_floor_id: laneId });
                        t.project_floor_id = laneId;
                    }
                    if (!sameStatus) {
                        await api.patch('/api/tasks/' + t.id + '/move', { status_id: col.id, sort_order: pos });
                    }
                    await loadBoard();
                } catch (e) {
                    t.status_id = prevStatus; t.project_floor_id = prevFloor;
                    CSApp.flash('error', 'Move failed: ' + e.message);
                }
            }

            // ---- task create / edit ----
            function openNewTask() {
                Object.assign(task, blankTask());
                if (board.value && board.value.columns.length) task.status_id = board.value.columns[0].id;
                showTask.value = true;
            }
            function openEditTask(t) {
                Object.assign(task, {
                    id: t.id, title: t.title || '', source: t.source || 'direct', boq_entry_id: t.boq_entry_id || null,
                    project_floor_id: t.project_floor_id ? Number(t.project_floor_id) : null,
                    item_code: t.item_code || '', item_head: t.item_head || '', item_description: t.item_description || '',
                    percentage: Number(t.percentage) || 0, status_id: t.status_id, priority: t.priority || 'medium',
                    assignee_id: t.assignee_id || null,
                });
                showTask.value = true;
            }
            function onPickBoq() {
                const e = boqOptions.value.find(x => String(x.id) === String(task.boq_entry_id));
                if (e) {
                    task.item_code = e.item_code || '';
                    task.item_head = e.item_head || '';
                    task.item_description = e.description || '';
                    if (e.project_floor_id) task.project_floor_id = Number(e.project_floor_id);
                }
            }
            function onSourceChange() { if (task.source !== 'boq') task.boq_entry_id = null; }
            async function saveTask() {
                if (!task.status_id) { CSApp.flash('error', 'Select a column'); return; }
                if (task.source === 'boq' && !task.boq_entry_id) { CSApp.flash('error', 'Pick a BOQ item'); return; }
                if (!task.item_head && !task.title) { CSApp.flash('error', 'Item head or title is required'); return; }
                savingTask.value = true;
                try {
                    const payload = {
                        project_id: activeId.value, status_id: task.status_id, source: task.source,
                        boq_entry_id: task.source === 'boq' ? (task.boq_entry_id || null) : null,
                        project_floor_id: task.project_floor_id || null,
                        title: task.title, item_code: task.item_code, item_head: task.item_head,
                        item_description: task.item_description, percentage: Number(task.percentage) || 0,
                        priority: task.priority, assignee_id: task.assignee_id || null,
                    };
                    if (task.id) await api.put('/api/tasks/' + task.id, payload);
                    else await api.post('/api/tasks', payload);
                    CSApp.flash('success', 'Task saved'); showTask.value = false; await loadBoard();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { savingTask.value = false; }
            }
            async function deleteTask(t) {
                if (!confirm('Delete task "' + (t.title || t.item_head) + '"?')) return;
                try { await api.del('/api/tasks/' + t.id); CSApp.flash('success', 'Deleted'); await loadBoard(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            async function createProject() {
                if (!newProject.name.trim()) { CSApp.flash('error', 'Project name is required'); return; }
                savingProject.value = true;
                try {
                    const payload = { name: newProject.name.trim(), project_type: newProject.project_type, status: newProject.status };
                    if (newProject.code) payload.code = newProject.code;
                    if (newProject.client_id) payload.client_id = newProject.client_id;
                    if (newProject.contract_value) payload.contract_value = newProject.contract_value;
                    if (newProject.site_address) payload.site_address = newProject.site_address;
                    if (newProject.start_date) payload.start_date = newProject.start_date;
                    if (newProject.end_date) payload.end_date = newProject.end_date;
                    if (newProject.description) payload.description = newProject.description;
                    const created = (await api.post('/api/projects', payload)).data;
                    CSApp.flash('success', 'Project created: ' + created.name);
                    showNewProject.value = false;
                    Object.assign(newProject, { code: '', name: '', client_id: null, project_type: 'new', contract_value: 0, site_address: '', status: 'planning', start_date: '', end_date: '', description: '' });
                    projects.value = (await api.get('/api/projects')).data;
                    activeId.value = created.id;
                } catch (e) { CSApp.flash('error', e.message); }
                finally { savingProject.value = false; }
            }

            // ---- materials / labour ----
            async function openRes(kind, t) {
                resModal.open = true; resModal.kind = kind; resModal.task = t; resModal.filter = ''; resModal.items = []; resModal.loading = true;
                Object.assign(matForm, { material_id: null, item_name: '', unit: '', quantity: 0, used_date: new Date().toISOString().slice(0, 10), notes: '' });
                Object.assign(labForm, { employee_id: null, worker_name: '', trade: '', headcount: 1, hours: 0, work_date: new Date().toISOString().slice(0, 10), notes: '' });
                await loadRes();
            }
            async function loadRes() {
                resModal.loading = true;
                try { resModal.items = (await api.get('/api/tasks/' + resModal.task.id + '/' + resModal.kind)).data; }
                catch (e) { CSApp.flash('error', e.message); }
                finally { resModal.loading = false; }
            }
            function onPickMaterial() {
                const m = materialsCatalog.value.find(x => String(x.id) === String(matForm.material_id));
                if (m) { matForm.item_name = m.name; matForm.unit = m.unit || ''; }
            }
            function onPickEmployee() {
                const e = employees.value.find(x => String(x.id) === String(labForm.employee_id));
                if (e) { labForm.worker_name = e.name; labForm.trade = e.designation || ''; }
            }
            const filteredItems = computed(() => {
                const q = resModal.filter.trim().toLowerCase();
                if (!q) return resModal.items;
                return resModal.items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
            });
            async function addRes() {
                resModal.saving = true;
                try {
                    if (resModal.kind === 'materials') {
                        if (!matForm.item_name && !matForm.material_id) { CSApp.flash('error', 'Pick or name a material'); resModal.saving = false; return; }
                        await api.post('/api/tasks/' + resModal.task.id + '/materials', { ...matForm });
                        Object.assign(matForm, { material_id: null, item_name: '', unit: '', quantity: 0, notes: '' });
                    } else {
                        if (!labForm.worker_name && !labForm.employee_id) { CSApp.flash('error', 'Pick or name a worker'); resModal.saving = false; return; }
                        await api.post('/api/tasks/' + resModal.task.id + '/labour', { ...labForm });
                        Object.assign(labForm, { employee_id: null, worker_name: '', trade: '', headcount: 1, hours: 0, notes: '' });
                    }
                    await loadRes(); await loadBoard();
                } catch (e) { CSApp.flash('error', e.message); }
                finally { resModal.saving = false; }
            }
            async function delRes(it) {
                const url = resModal.kind === 'materials' ? '/api/task-materials/' + it.id : '/api/task-labour/' + it.id;
                try { await api.del(url); await loadRes(); await loadBoard(); }
                catch (e) { CSApp.flash('error', e.message); }
            }

            const activeProject = computed(() => projects.value.find(p => p.id === activeId.value));
            const priorityColor = (p) => ({ low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-rose-50 text-rose-700' }[p] || 'bg-slate-100');
            const floorName = (id) => { const f = (board.value && board.value.floors || []).find(x => Number(x.id) === Number(id)); return f ? f.label : null; };

            return {
                projects, activeId, board, loading, lanes, cellTasks, PRIORITIES,
                clients, staff, boqOptions, materialsCatalog, employees,
                showTask, savingTask, task, openNewTask, openEditTask, onPickBoq, onSourceChange, saveTask, deleteTask,
                showNewProject, newProject, savingProject, createProject,
                onDragStart, onDropCell, activeProject, priorityColor, floorName,
                resModal, matForm, labForm, openRes, onPickMaterial, onPickEmployee, filteredItems, addRes, delRes,
            };
        },
        template: `
        <div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div class="flex items-center gap-3">
                    <h1 class="text-xl font-semibold text-slate-800">Projects</h1>
                    <select v-if="projects.length" v-model="activeId" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand/40">
                        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="flex gap-2">
                    <a v-if="activeId" :href="'#/project/' + activeId" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">⚙ Manage Project details</a>
                    <button @click="showNewProject=true" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">+ Project</button>
                    <button v-if="board" @click="openNewTask" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Task</button>
                </div>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading board…</div>
            <div v-else-if="!projects.length" class="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div class="text-slate-500 mb-1">No projects yet</div>
                <div class="text-sm text-slate-400 mb-4">Create your first project to start a Kanban board.</div>
                <button @click="showNewProject=true" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Create project</button>
            </div>

            <!-- Jira-style board: floors (rows) x statuses (columns) -->
            <div v-else-if="board" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="table-scroll">
                    <table class="border-collapse" style="min-width:100%">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200">
                                <th class="sticky left-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 w-40 border-r border-slate-200">Floor</th>
                                <th v-for="col in board.columns" :key="col.id" class="text-left px-3 py-2 border-r border-slate-100 last:border-r-0" style="min-width:16rem">
                                    <div class="flex items-center gap-2">
                                        <span class="h-2.5 w-2.5 rounded-full" :style="{background: col.color}"></span>
                                        <span class="text-sm font-medium text-slate-700">{{ col.name }}</span>
                                        <span class="text-xs text-slate-400">{{ col.tasks.length }}</span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="lane in lanes" :key="lane.id === null ? 'none' : lane.id" class="border-b border-slate-200 last:border-b-0 align-top">
                                <td class="sticky left-0 z-10 bg-white px-3 py-3 border-r border-slate-200 w-40">
                                    <div class="text-sm font-semibold text-slate-700">{{ lane.label }}</div>
                                    <div class="text-xs text-slate-400">{{ lane.code }}</div>
                                </td>
                                <td v-for="col in board.columns" :key="col.id" class="px-2 py-2 border-r border-slate-100 last:border-r-0 bg-slate-50/40"
                                    style="min-width:16rem" @dragover.prevent @drop="onDropCell(col, lane.id)">
                                    <div class="space-y-2 min-h-[3rem]">
                                        <div v-for="t in cellTasks(col, lane.id)" :key="t.id" draggable="true" @dragstart="onDragStart(t)"
                                             class="kanban-card bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-move hover:shadow">
                                            <div class="flex items-start justify-between gap-2">
                                                <div class="text-sm font-medium text-slate-800 mb-1">{{ t.title }}</div>
                                                <span v-if="+t.percentage" class="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 whitespace-nowrap">{{ +t.percentage }}%</span>
                                            </div>
                                            <div v-if="t.item_code" class="text-[11px] font-mono text-slate-400 mb-1">{{ t.item_code }}<span v-if="t.source==='boq'" class="ml-1 text-brand">· BOQ</span></div>
                                            <div class="flex items-center justify-between mt-1">
                                                <span class="text-xs px-1.5 py-0.5 rounded" :class="priorityColor(t.priority)">{{ t.priority }}</span>
                                                <span v-if="t.assignee_name" class="text-xs text-slate-400 truncate ml-1">{{ t.assignee_name }}</span>
                                            </div>
                                            <div class="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
                                                <button @click="openRes('materials', t)" :title="'Materials'" class="flex items-center gap-1 text-xs px-1.5 py-1 rounded hover:bg-slate-100 text-slate-600">🧱 <span v-if="+t.materials_count" class="text-slate-500">{{ t.materials_count }}</span></button>
                                                <button @click="openRes('labour', t)" :title="'Labour'" class="flex items-center gap-1 text-xs px-1.5 py-1 rounded hover:bg-slate-100 text-slate-600">👷 <span v-if="+t.labour_count" class="text-slate-500">{{ t.labour_count }}</span></button>
                                                <span class="flex-1"></span>
                                                <button @click="openEditTask(t)" :title="'Edit'" class="text-xs px-1.5 py-1 rounded hover:bg-slate-100 text-slate-500">✎</button>
                                                <button @click="deleteTask(t)" :title="'Delete'" class="text-xs px-1.5 py-1 rounded hover:bg-rose-50 text-rose-400">🗑</button>
                                            </div>
                                        </div>
                                        <div v-if="!cellTasks(col, lane.id).length" class="text-[11px] text-slate-300 text-center py-3">—</div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Task create/edit modal -->
            <div v-if="showTask" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">{{ task.id ? 'Edit task' : 'New task' }}</h2><button @click="showTask=false" class="text-slate-400">✕</button></div>

                    <div v-if="!task.id" class="flex gap-2 mb-4">
                        <button @click="task.source='direct'; onSourceChange()" :class="task.source==='direct'?'bg-brand text-white border-brand':'bg-white text-slate-600 border-slate-300'" class="flex-1 px-3 py-2 text-sm rounded-lg border">Add directly</button>
                        <button @click="task.source='boq'" :class="task.source==='boq'?'bg-brand text-white border-brand':'bg-white text-slate-600 border-slate-300'" class="flex-1 px-3 py-2 text-sm rounded-lg border">Copy from BOQ</button>
                    </div>

                    <div v-if="task.source==='boq'" class="mb-4">
                        <label class="block text-xs text-slate-500 mb-1">BOQ item</label>
                        <select v-model="task.boq_entry_id" @change="onPickBoq" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option :value="null">— select BOQ item —</option>
                            <option v-for="e in boqOptions" :key="e.id" :value="e.id">{{ e.item_head }}<span v-if="e.item_code"> ({{ e.item_code }})</span></option>
                        </select>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Floor</label>
                            <select v-model="task.project_floor_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— unassigned —</option>
                                <option v-for="f in (board.floors||[])" :key="f.id" :value="f.id">{{ f.label }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Item code</label>
                            <input v-model="task.item_code" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs text-slate-500 mb-1">Item head</label>
                            <input v-model="task.item_head" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="shown as the card title">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs text-slate-500 mb-1">Item description</label>
                            <textarea v-model="task.item_description" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Percentage (%)</label>
                            <input v-model.number="task.percentage" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Column</label>
                            <select v-model="task.status_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="c in board.columns" :key="c.id" :value="c.id">{{ c.name }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Priority</label>
                            <select v-model="task.priority" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">Assignee</label>
                            <select v-model="task.assignee_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option :value="null">— none —</option>
                                <option v-for="u in staff" :key="u.id" :value="u.id">{{ u.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 mt-5">
                        <button @click="showTask=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="saveTask" :disabled="savingTask" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ savingTask ? 'Saving…' : 'Save task' }}</button>
                    </div>
                </div>
            </div>

            <!-- Materials / Labour modal -->
            <div v-if="resModal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-1">
                        <h2 class="font-semibold text-slate-800">{{ resModal.kind==='materials' ? '🧱 Materials' : '👷 Labour' }}</h2>
                        <button @click="resModal.open=false" class="text-slate-400">✕</button>
                    </div>
                    <p class="text-xs text-slate-400 mb-4">{{ resModal.task && (resModal.task.title || resModal.task.item_head) }}</p>

                    <!-- Add form -->
                    <div v-if="resModal.kind==='materials'" class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-[11px] text-slate-500 mb-1">From catalog</label>
                            <select v-model="matForm.material_id" @change="onPickMaterial" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                                <option :value="null">— manual —</option>
                                <option v-for="m in materialsCatalog" :key="m.id" :value="m.id">{{ m.name }}</option>
                            </select>
                        </div>
                        <div class="col-span-2 sm:col-span-1"><label class="block text-[11px] text-slate-500 mb-1">Material</label><input v-model="matForm.item_name" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Unit</label><input v-model="matForm.unit" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Quantity</label><input v-model.number="matForm.quantity" type="number" step="0.001" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Date</label><input v-model="matForm.used_date" type="date" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div class="col-span-2 sm:col-span-3 flex justify-end"><button @click="addRes" :disabled="resModal.saving" class="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">+ Add material</button></div>
                    </div>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                        <div class="col-span-2 sm:col-span-1">
                            <label class="block text-[11px] text-slate-500 mb-1">From employees</label>
                            <select v-model="labForm.employee_id" @change="onPickEmployee" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                                <option :value="null">— manual —</option>
                                <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
                            </select>
                        </div>
                        <div class="col-span-2 sm:col-span-1"><label class="block text-[11px] text-slate-500 mb-1">Worker / crew</label><input v-model="labForm.worker_name" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Trade</label><input v-model="labForm.trade" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Headcount</label><input v-model.number="labForm.headcount" type="number" min="1" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Hours</label><input v-model.number="labForm.hours" type="number" step="0.5" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div><label class="block text-[11px] text-slate-500 mb-1">Date</label><input v-model="labForm.work_date" type="date" class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"></div>
                        <div class="col-span-2 sm:col-span-3 flex justify-end"><button @click="addRes" :disabled="resModal.saving" class="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">+ Add labour</button></div>
                    </div>

                    <!-- Filter + list -->
                    <div class="flex items-center justify-between mb-2">
                        <input v-model="resModal.filter" placeholder="Filter…" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-48">
                        <span class="text-xs text-slate-400">{{ filteredItems.length }} item(s)</span>
                    </div>
                    <div class="table-scroll border border-slate-100 rounded-lg">
                        <table class="w-full text-sm">
                            <thead v-if="resModal.kind==='materials'"><tr class="text-left text-slate-400 border-b border-slate-100 bg-slate-50">
                                <th class="py-2 px-3">Material</th><th class="py-2 px-3">Unit</th><th class="py-2 px-3 text-right">Qty</th><th class="py-2 px-3">Date</th><th class="py-2 px-3"></th>
                            </tr></thead>
                            <thead v-else><tr class="text-left text-slate-400 border-b border-slate-100 bg-slate-50">
                                <th class="py-2 px-3">Worker</th><th class="py-2 px-3">Trade</th><th class="py-2 px-3 text-right">Head</th><th class="py-2 px-3 text-right">Hrs</th><th class="py-2 px-3">Date</th><th class="py-2 px-3"></th>
                            </tr></thead>
                            <tbody v-if="resModal.kind==='materials'">
                                <tr v-for="it in filteredItems" :key="it.id" class="border-b border-slate-50">
                                    <td class="py-2 px-3 text-slate-700">{{ it.item_name }}</td>
                                    <td class="py-2 px-3 text-slate-500">{{ it.unit }}</td>
                                    <td class="py-2 px-3 text-right text-slate-700">{{ it.quantity }}</td>
                                    <td class="py-2 px-3 text-slate-500">{{ (it.used_date||'').slice(0,10) }}</td>
                                    <td class="py-2 px-3 text-right"><button @click="delRes(it)" class="text-rose-400 hover:text-rose-600 text-xs">Remove</button></td>
                                </tr>
                                <tr v-if="!filteredItems.length"><td colspan="5" class="py-6 text-center text-slate-400">No materials captured.</td></tr>
                            </tbody>
                            <tbody v-else>
                                <tr v-for="it in filteredItems" :key="it.id" class="border-b border-slate-50">
                                    <td class="py-2 px-3 text-slate-700">{{ it.worker_name }}</td>
                                    <td class="py-2 px-3 text-slate-500">{{ it.trade }}</td>
                                    <td class="py-2 px-3 text-right text-slate-700">{{ it.headcount }}</td>
                                    <td class="py-2 px-3 text-right text-slate-700">{{ it.hours }}</td>
                                    <td class="py-2 px-3 text-slate-500">{{ (it.work_date||'').slice(0,10) }}</td>
                                    <td class="py-2 px-3 text-right"><button @click="delRes(it)" class="text-rose-400 hover:text-rose-600 text-xs">Remove</button></td>
                                </tr>
                                <tr v-if="!filteredItems.length"><td colspan="6" class="py-6 text-center text-slate-400">No labour captured.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="flex justify-end mt-4"><button @click="resModal.open=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Done</button></div>
                </div>
            </div>

            <!-- New project modal -->
            <div v-if="showNewProject" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 overflow-y-auto print:hidden">
                <div class="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 my-auto">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">New project</h2><button @click="showNewProject=false" class="text-slate-400">✕</button></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="newProject.code" placeholder="auto if blank" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Project name *</label><input v-model="newProject.name" placeholder="e.g. Harbor Villa" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Client</label>
                            <select v-model="newProject.client_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option :value="null">— none —</option><option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                        </div>
                        <div><label class="block text-sm text-slate-600 mb-1">Type of project</label>
                            <select v-model="newProject.project_type" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="new">New</option><option value="renovation">Renovation</option></select>
                        </div>
                        <div><label class="block text-sm text-slate-600 mb-1">Contract value</label><input v-model.number="newProject.contract_value" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="newProject.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Status</label>
                            <select v-model="newProject.status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select>
                        </div>
                        <div></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="newProject.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div><label class="block text-sm text-slate-600 mb-1">Target end date</label><input v-model="newProject.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></div>
                        <div class="sm:col-span-2"><label class="block text-sm text-slate-600 mb-1">Description</label><textarea v-model="newProject.description" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></textarea></div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3">
                        <button @click="showNewProject=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                        <button @click="createProject" :disabled="savingProject" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ savingProject ? 'Creating…' : 'Create project' }}</button>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/board/:id', 'ProjectsView', ProjectsView);
    CSApp.route('/board', 'ProjectsView', ProjectsView);
})();
