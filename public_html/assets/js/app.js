/**
 * App shell (Batch 1). Mounts Vue, renders the fixed top navbar with a
 * horizontal inline menu, a right-side profile dropdown (Change Password +
 * Logout), and a mobile hamburger. Batch 4+ mount real dashboards/screens into
 * the <main> content slot via the in-memory store + a lightweight hash router.
 */
(function () {
    'use strict';
    const { createApp, reactive, computed, onMounted, ref } = Vue;

    // In-memory reactive store (no localStorage for app state at runtime).
    const store = reactive({
        user: (window.__APP__ && window.__APP__.user) || null,
        appName: (window.__APP__ && window.__APP__.appName) || 'Construction SaaS',
        route: (location.hash || '#/').slice(1) || '/',
    });
    window.addEventListener('hashchange', () => {
        store.route = (location.hash || '#/').slice(1) || '/';
    });
    window.store = store;

    const App = {
        setup() {
            const menuOpen = ref(false);       // mobile hamburger
            const profileOpen = ref(false);    // profile dropdown
            const showChangePw = ref(false);
            const pw = reactive({ current_password: '', new_password: '', new_password_confirmation: '' });
            const pwMsg = ref(null);
            const pwErr = ref(null);
            const busy = ref(false);

            const isAuthed = computed(() => !!store.user);
            const role = computed(() => (store.user && store.user.role) || null);

            // Role-aware primary menu.
            const menu = computed(() => {
                if (!store.user) return [];
                if (role.value === 'super_admin') {
                    return [
                        { label: 'Dashboard', href: '#/' },
                        { label: 'Organisations', href: '#/orgs' },
                        { label: 'Users', href: '#/users' },
                    ];
                }
                return [
                    { label: 'Dashboard', href: '#/' },
                    { label: 'Projects', href: '#/projects' },
                    { label: 'Estimates', href: '#/estimates' },
                    { label: 'Billing', href: '#/billing' },
                    { label: 'Documents', href: '#/documents' },
                    { label: 'Reports', href: '#/reports' },
                ];
            });

            async function logout() {
                try { await api.post('/api/auth/logout', {}); } catch (e) { /* ignore */ }
                store.user = null;
                location.hash = '#/';
                location.reload();
            }

            async function submitChangePassword() {
                pwErr.value = null; pwMsg.value = null; busy.value = true;
                try {
                    await api.post('/api/auth/change-password', {
                        current_password: pw.current_password,
                        new_password: pw.new_password,
                        new_password_confirmation: pw.new_password_confirmation,
                    });
                    pwMsg.value = 'Password updated successfully.';
                    pw.current_password = pw.new_password = pw.new_password_confirmation = '';
                    setTimeout(() => { showChangePw.value = false; pwMsg.value = null; }, 1200);
                } catch (e) {
                    pwErr.value = e.message || 'Could not change password.';
                } finally {
                    busy.value = false;
                }
            }

            return {
                store, menuOpen, profileOpen, showChangePw, pw, pwMsg, pwErr, busy,
                isAuthed, role, menu, logout, submitChangePassword,
            };
        },
        template: `
        <div class="min-h-screen flex flex-col">
            <!-- Fixed top navbar -->
            <header v-if="isAuthed" class="fixed top-0 inset-x-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
                <div class="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button class="sm:hidden p-2 -ml-2 text-slate-600" @click="menuOpen = !menuOpen" aria-label="Menu">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                        </button>
                        <a href="#/" class="flex items-center gap-2 font-semibold text-slate-800">
                            <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white text-sm">CS</span>
                            <span class="hidden sm:inline">{{ store.appName }}</span>
                        </a>
                        <nav class="hidden sm:flex items-center gap-1 ml-4">
                            <a v-for="m in menu" :key="m.href" :href="m.href"
                               class="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">{{ m.label }}</a>
                        </nav>
                    </div>

                    <!-- Profile dropdown -->
                    <div class="relative">
                        <button @click="profileOpen = !profileOpen"
                                class="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-slate-100">
                            <span class="hidden sm:block text-sm text-slate-700">{{ store.user.name || store.user.email }}</span>
                            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-sm font-medium">
                                {{ (store.user.name || store.user.email || '?').charAt(0).toUpperCase() }}
                            </span>
                        </button>
                        <div v-if="profileOpen" class="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-lg border border-slate-200 py-1 z-50"
                             @click.self="profileOpen = false">
                            <div class="px-4 py-2 border-b border-slate-100">
                                <div class="text-sm font-medium text-slate-800">{{ store.user.email }}</div>
                                <div class="text-xs text-slate-500 capitalize">{{ (store.user.role || '').replace('_',' ') }} · Org {{ store.user.organisation_id }}</div>
                            </div>
                            <button class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                    @click="showChangePw = true; profileOpen = false">Change Password</button>
                            <button class="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50" @click="logout">Logout</button>
                        </div>
                    </div>
                </div>

                <!-- Mobile menu -->
                <nav v-if="menuOpen" class="sm:hidden border-t border-slate-100 bg-white px-4 py-2 space-y-1">
                    <a v-for="m in menu" :key="m.href" :href="m.href" @click="menuOpen = false"
                       class="block px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100">{{ m.label }}</a>
                </nav>
            </header>

            <!-- Content -->
            <main :class="isAuthed ? 'pt-14' : ''" class="flex-1 w-full">
                <div class="w-full px-4 sm:px-6 py-6">
                    <div v-if="!isAuthed" class="max-w-md mx-auto mt-16 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                        <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white text-lg mb-4">CS</div>
                        <h1 class="text-lg font-semibold text-slate-800">{{ store.appName }}</h1>
                        <p class="text-sm text-slate-500 mt-2">The login and onboarding screens are delivered in Batch 4. The framework, API, and app shell are live.</p>
                        <a href="/api/health" class="inline-block mt-4 text-sm text-brand hover:underline">Check API health →</a>
                    </div>

                    <div v-else class="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                        <h1 class="text-lg font-semibold text-slate-800">Welcome, {{ store.user.name || store.user.email }}</h1>
                        <p class="text-sm text-slate-500 mt-2">Role-specific dashboards and modules arrive in later batches. App shell, navbar, and secure API are ready.</p>
                    </div>
                </div>
            </main>

            <!-- Change Password modal -->
            <div v-if="showChangePw" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
                <div class="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-base font-semibold text-slate-800">Change Password</h2>
                        <button class="text-slate-400 hover:text-slate-600" @click="showChangePw = false">✕</button>
                    </div>
                    <form @submit.prevent="submitChangePassword" class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Current password</label>
                            <input v-model="pw.current_password" type="password" required
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">New password</label>
                            <input v-model="pw.new_password" type="password" required minlength="8"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Confirm new password</label>
                            <input v-model="pw.new_password_confirmation" type="password" required minlength="8"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <p v-if="pwErr" class="text-sm text-rose-600">{{ pwErr }}</p>
                        <p v-if="pwMsg" class="text-sm text-emerald-600">{{ pwMsg }}</p>
                        <div class="flex justify-end gap-2 pt-2">
                            <button type="button" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" @click="showChangePw = false">Cancel</button>
                            <button type="submit" :disabled="busy" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">
                                {{ busy ? 'Saving…' : 'Update Password' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        `,
    };

    createApp(App).mount('#app');
})();
