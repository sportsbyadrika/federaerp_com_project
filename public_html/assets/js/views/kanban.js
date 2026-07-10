/**
 * Batch 5 — Kanban Project Management + Compliance Tracker + Daily Checklist.
 *
 * Kanban: columns from task_statuses, draggable task cards persisted via
 * PATCH /api/tasks/{id}/move with optimistic UI + rollback on error. Uses the
 * native HTML Drag-and-Drop API (no build step, CSP-clean).
 */
(function () {
    'use strict';
    const { ref, reactive, computed, onMounted, watch } = Vue;

    // ---- Projects list + kanban board ------------------------------------
    const ProjectsView = {
        setup() {
            const projects = ref([]);
            const activeId = ref(null);
            const board = ref(null);
            const loading = ref(true);
            const dragTask = ref(null);
            const showNew = ref(false);
            const newTask = reactive({ title: '', status_id: null, priority: 'medium', assignee_id: null });
            const showNewProject = ref(false);
            const newProject = reactive({ name: '', code: '', site_address: '', contract_value: 0, start_date: '', end_date: '' });
            const savingProject = ref(false);

            async function loadProjects() {
                loading.value = true;
                try {
                    projects.value = (await api.get('/api/projects')).data;
                    if (projects.value.length) { activeId.value = projects.value[0].id; await loadBoard(); }
                } catch (e) { CSApp.flash('error', e.message); }
                finally { loading.value = false; }
            }
            async function loadBoard() {
                if (!activeId.value) return;
                try { board.value = (await api.get('/api/projects/' + activeId.value + '/board')).data; }
                catch (e) { CSApp.flash('error', e.message); }
            }
            onMounted(loadProjects);
            watch(activeId, loadBoard);

            function onDragStart(task, colId) { dragTask.value = { task, fromCol: colId }; }
            async function onDrop(col, index) {
                if (!dragTask.value) return;
                const { task, fromCol } = dragTask.value;
                dragTask.value = null;
                const source = board.value.columns.find(c => c.id === fromCol);
                const dest = board.value.columns.find(c => c.id === col.id);
                if (!source || !dest) return;

                // snapshot for rollback
                const snapSource = source.tasks.slice();
                const snapDest = dest.tasks.slice();

                // optimistic move
                const si = source.tasks.findIndex(t => t.id === task.id);
                if (si > -1) source.tasks.splice(si, 1);
                const pos = index === undefined ? dest.tasks.length : index;
                dest.tasks.splice(pos, 0, task);
                task.status_id = col.id;

                try {
                    await api.patch('/api/tasks/' + task.id + '/move', { status_id: col.id, sort_order: pos });
                } catch (e) {
                    // rollback
                    source.tasks = snapSource; dest.tasks = snapDest;
                    CSApp.flash('error', 'Move failed: ' + e.message);
                }
            }

            async function addTask() {
                if (!newTask.title || !newTask.status_id) { CSApp.flash('error', 'Title + column required'); return; }
                try {
                    await api.post('/api/tasks', { project_id: activeId.value, ...newTask });
                    showNew.value = false; newTask.title = '';
                    await loadBoard();
                } catch (e) { CSApp.flash('error', e.message); }
            }

            async function createProject() {
                if (!newProject.name.trim()) { CSApp.flash('error', 'Project name is required'); return; }
                savingProject.value = true;
                try {
                    const payload = { name: newProject.name.trim() };
                    if (newProject.code) payload.code = newProject.code;
                    if (newProject.site_address) payload.site_address = newProject.site_address;
                    if (newProject.contract_value) payload.contract_value = newProject.contract_value;
                    if (newProject.start_date) payload.start_date = newProject.start_date;
                    if (newProject.end_date) payload.end_date = newProject.end_date;
                    const created = (await api.post('/api/projects', payload)).data;
                    CSApp.flash('success', 'Project created: ' + created.name);
                    showNewProject.value = false;
                    Object.assign(newProject, { name: '', code: '', site_address: '', contract_value: 0, start_date: '', end_date: '' });
                    projects.value = (await api.get('/api/projects')).data;
                    activeId.value = created.id;   // select the new project (loads its board via watch)
                } catch (e) { CSApp.flash('error', e.message); }
                finally { savingProject.value = false; }
            }

            const activeProject = computed(() => projects.value.find(p => p.id === activeId.value));
            const priorityColor = (p) => ({ low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-rose-50 text-rose-700' }[p] || 'bg-slate-100');

            return { projects, activeId, board, loading, showNew, newTask, showNewProject, newProject, savingProject, activeProject, onDragStart, onDrop, addTask, createProject, priorityColor };
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
                    <a v-if="activeId" :href="'#/project/' + activeId" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">⚙ Details / BOQ</a>
                    <button @click="showNewProject=true" class="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">+ Project</button>
                    <button v-if="board" @click="showNew=true" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Task</button>
                </div>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading board…</div>
            <div v-else-if="!projects.length" class="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div class="text-slate-500 mb-1">No projects yet</div>
                <div class="text-sm text-slate-400 mb-4">Create your first project to start a Kanban board.</div>
                <button @click="showNewProject=true" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Create project</button>
            </div>

            <div v-else-if="board" class="flex gap-4 overflow-x-auto pb-4">
                <div v-for="col in board.columns" :key="col.id" class="flex-shrink-0 w-72">
                    <div class="flex items-center justify-between mb-2 px-1">
                        <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" :style="{background: col.color}"></span><span class="text-sm font-medium text-slate-700">{{ col.name }}</span><span class="text-xs text-slate-400">{{ col.tasks.length }}</span></div>
                    </div>
                    <div class="kanban-col bg-slate-100/70 rounded-xl p-2 space-y-2 min-h-[8rem]" @dragover.prevent @drop="onDrop(col)">
                        <div v-for="(t,idx) in col.tasks" :key="t.id" draggable="true" @dragstart="onDragStart(t, col.id)" @dragover.prevent @drop.stop="onDrop(col, idx)"
                             class="kanban-card bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-move hover:shadow">
                            <div class="text-sm font-medium text-slate-800 mb-1">{{ t.title }}</div>
                            <div class="flex items-center justify-between">
                                <span class="text-xs px-1.5 py-0.5 rounded" :class="priorityColor(t.priority)">{{ t.priority }}</span>
                                <span v-if="t.assignee_name" class="text-xs text-slate-400">{{ t.assignee_name }}</span>
                            </div>
                            <div v-if="t.milestone_name" class="text-xs text-slate-400 mt-1">◈ {{ t.milestone_name }}</div>
                            <div v-if="t.due_date" class="text-xs text-slate-400 mt-0.5">Due {{ (t.due_date||'').slice(0,10) }}</div>
                        </div>
                        <div v-if="!col.tasks.length" class="text-xs text-slate-400 text-center py-4">Drop tasks here</div>
                    </div>
                </div>
            </div>

            <div v-if="showNew" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
                <div class="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">New task</h2><button @click="showNew=false" class="text-slate-400">✕</button></div>
                    <div class="space-y-3">
                        <input v-model="newTask.title" placeholder="Task title" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40">
                        <select v-model="newTask.status_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option :value="null">Select column…</option><option v-for="c in board.columns" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                        <select v-model="newTask.priority" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                        <div class="flex justify-end gap-2"><button @click="showNew=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button><button @click="addTask" class="px-4 py-2 text-sm rounded-lg bg-brand text-white">Add task</button></div>
                    </div>
                </div>
            </div>

            <div v-if="showNewProject" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
                <div class="w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
                    <div class="flex items-center justify-between mb-4"><h2 class="font-semibold text-slate-800">New project</h2><button @click="showNewProject=false" class="text-slate-400">✕</button></div>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Project name *</label>
                            <input v-model="newProject.name" placeholder="e.g. Harbor Villa Construction" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label class="block text-sm text-slate-600 mb-1">Code</label><input v-model="newProject.code" placeholder="auto if blank" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Contract value</label><input v-model.number="newProject.contract_value" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        </div>
                        <div><label class="block text-sm text-slate-600 mb-1">Site address</label><input v-model="newProject.site_address" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label class="block text-sm text-slate-600 mb-1">Start date</label><input v-model="newProject.start_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Target end</label><input v-model="newProject.end_date" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                        </div>
                        <div class="flex justify-end gap-2 pt-1">
                            <button @click="showNewProject=false" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600">Cancel</button>
                            <button @click="createProject" :disabled="savingProject" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ savingProject ? 'Creating…' : 'Create project' }}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/projects', 'ProjectsView', ProjectsView);
})();
