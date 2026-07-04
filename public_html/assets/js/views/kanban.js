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

            const activeProject = computed(() => projects.value.find(p => p.id === activeId.value));
            const priorityColor = (p) => ({ low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-rose-50 text-rose-700' }[p] || 'bg-slate-100');

            return { projects, activeId, board, loading, showNew, newTask, activeProject, onDragStart, onDrop, addTask, priorityColor };
        },
        template: `
        <div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div class="flex items-center gap-3">
                    <h1 class="text-xl font-semibold text-slate-800">Projects</h1>
                    <select v-model="activeId" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand/40">
                        <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <button v-if="board" @click="showNew=true" class="px-3 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark">+ Task</button>
            </div>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading board…</div>
            <div v-else-if="!projects.length" class="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">No projects yet.</div>

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
        </div>`,
    };

    CSApp.route('/projects', 'ProjectsView', ProjectsView);
})();
