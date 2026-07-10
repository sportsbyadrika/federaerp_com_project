/**
 * Root application: auth screens (login + onboarding), the authenticated app
 * shell (fixed navbar, profile dropdown, change-password), and the router
 * outlet. Feature views register themselves via CSApp.route() and render into
 * the outlet. Mounts last, after all feature scripts have loaded.
 */
(function () {
    'use strict';
    const { createApp, reactive, ref, computed, onMounted } = Vue;
    const store = window.store;
    const CSApp = window.CSApp;

    // ---- Login + onboarding (unauthenticated) -----------------------------
    const AuthView = {
        setup() {
            const mode = ref('login'); // 'login' | 'onboard'
            const busy = ref(false);
            const error = ref(null);
            const login = reactive({ organisation_id: '', email: '', password: '' });
            const onb = reactive({ organisation_name: '', admin_name: '', admin_email: '', password: '', password_confirmation: '' });
            const created = ref(null);

            async function ensureCsrf() {
                try { const r = await api.get('/api/auth/csrf'); api.setCsrf(r.data.csrf_token); } catch (e) {}
            }
            onMounted(ensureCsrf);

            async function submitLogin() {
                error.value = null; busy.value = true;
                try {
                    const r = await api.post('/api/auth/login', {
                        organisation_id: login.organisation_id, email: login.email, password: login.password,
                    });
                    api.setCsrf(r.data.csrf_token);
                    store.user = r.data.user;
                    CSApp.navigate('/');
                } catch (e) { error.value = e.message || 'Login failed'; }
                finally { busy.value = false; }
            }

            async function submitOnboard() {
                error.value = null; busy.value = true;
                try {
                    const r = await api.post('/api/auth/register-organisation', { ...onb });
                    created.value = r.data.organisation_id;
                    mode.value = 'login';
                    login.organisation_id = String(r.data.organisation_id);
                    login.email = onb.admin_email;
                } catch (e) { error.value = e.message || 'Could not create organisation'; }
                finally { busy.value = false; }
            }

            return { mode, busy, error, login, onb, created, submitLogin, submitOnboard };
        },
        template: `
        <div class="min-h-screen flex items-center justify-center px-4 py-10">
            <div class="w-full max-w-md">
                <div class="text-center mb-6">
                    <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white text-lg font-semibold">CS</div>
                    <h1 class="mt-3 text-xl font-semibold text-slate-800">{{ store.appName }}</h1>
                    <p class="text-sm text-slate-500">Construction Management Platform</p>
                </div>

                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div class="flex gap-2 mb-5 p-1 bg-slate-100 rounded-lg text-sm">
                        <button @click="mode='login'" :class="mode==='login' ? 'bg-white shadow text-slate-900' : 'text-slate-500'" class="flex-1 py-1.5 rounded-md font-medium">Sign in</button>
                        <button @click="mode='onboard'" :class="mode==='onboard' ? 'bg-white shadow text-slate-900' : 'text-slate-500'" class="flex-1 py-1.5 rounded-md font-medium">New organisation</button>
                    </div>

                    <div v-if="created" class="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                        Organisation created! Your Organisation ID is <b>{{ created }}</b>. Use it to sign in.
                    </div>
                    <p v-if="error" class="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{{ error }}</p>

                    <!-- LOGIN: three fields -->
                    <form v-if="mode==='login'" @submit.prevent="submitLogin" class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Organisation ID</label>
                            <input v-model="login.organisation_id" inputmode="numeric" maxlength="6" required placeholder="6-digit ID"
                                   class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Email</label>
                            <input v-model="login.email" type="email" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Password</label>
                            <input v-model="login.password" type="password" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
                    </form>

                    <!-- ONBOARD -->
                    <form v-else @submit.prevent="submitOnboard" class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Company / Organisation name</label>
                            <input v-model="onb.organisation_name" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Admin name</label>
                            <input v-model="onb.admin_name" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Admin email</label>
                            <input v-model="onb.admin_email" type="email" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm text-slate-600 mb-1">Password</label>
                                <input v-model="onb.password" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                            </div>
                            <div>
                                <label class="block text-sm text-slate-600 mb-1">Confirm</label>
                                <input v-model="onb.password_confirmation" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                            </div>
                        </div>
                        <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Creating…' : 'Create organisation' }}</button>
                    </form>
                </div>
                <p class="text-center text-xs text-slate-400 mt-4">Super Admin signs in with Organisation ID 111111.</p>
            </div>
        </div>`,
    };

    // ---- Dashboard (role-aware) -------------------------------------------
    const DashboardView = {
        setup() {
            const loading = ref(true);
            const error = ref(null);
            const data = ref(null);
            const role = computed(() => store.user && store.user.role);
            async function load() {
                loading.value = true; error.value = null;
                try { data.value = (await api.get('/api/dashboard')).data; }
                catch (e) { error.value = e.message; }
                finally { loading.value = false; }
            }
            onMounted(load);
            const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
            return { loading, error, data, role, fmt };
        },
        template: `
        <div>
            <h1 class="text-xl font-semibold text-slate-800 mb-1">Dashboard</h1>
            <p class="text-sm text-slate-500 mb-5">Welcome back, {{ store.user.name }} · <span class="capitalize">{{ (store.user.role||'').replace('_',' ') }}</span></p>

            <div v-if="loading" class="text-slate-400 text-sm py-10 text-center">Loading dashboard…</div>
            <div v-else-if="error" class="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{{ error }}</div>

            <!-- Super Admin -->
            <div v-else-if="data.role==='super_admin'" class="space-y-6">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.organisations.total }}</div><div class="text-sm text-slate-500 mt-1">Organisations</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-emerald-600">{{ data.metrics.organisations.active }}</div><div class="text-sm text-slate-500 mt-1">Active orgs</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.users }}</div><div class="text-sm text-slate-500 mt-1">Total users</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.projects }}</div><div class="text-sm text-slate-500 mt-1">Projects (all orgs)</div></div>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 class="font-medium text-slate-700 mb-3">Recent organisations</h2>
                    <div class="table-scroll"><table class="w-full text-sm">
                        <thead><tr class="text-left text-slate-400 border-b border-slate-100"><th class="py-2 pr-4">ID</th><th class="py-2 pr-4">Name</th><th class="py-2 pr-4">Status</th><th class="py-2">Created</th></tr></thead>
                        <tbody>
                            <tr v-for="o in data.metrics.recent_organisations" :key="o.id" class="border-b border-slate-50">
                                <td class="py-2 pr-4 font-mono">{{ o.id }}</td><td class="py-2 pr-4">{{ o.name }}</td>
                                <td class="py-2 pr-4"><span class="px-2 py-0.5 rounded-full text-xs" :class="o.status==='active'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'">{{ o.status }}</span></td>
                                <td class="py-2 text-slate-500">{{ (o.created_at||'').slice(0,10) }}</td>
                            </tr>
                            <tr v-if="!data.metrics.recent_organisations.length"><td colspan="4" class="py-6 text-center text-slate-400">No organisations yet</td></tr>
                        </tbody>
                    </table></div>
                </div>
            </div>

            <!-- Org Admin / Staff -->
            <div v-else class="space-y-6">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.projects.active }}</div><div class="text-sm text-slate-500 mt-1">Active projects</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-emerald-600">{{ fmt(data.metrics.finance.income) }}</div><div class="text-sm text-slate-500 mt-1">Income</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-rose-600">{{ fmt(data.metrics.finance.expense) }}</div><div class="text-sm text-slate-500 mt-1">Expense</div></div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.fleet.in_use }}/{{ data.metrics.fleet.total }}</div><div class="text-sm text-slate-500 mt-1">Fleet in use</div></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Weekly project progress</h2>
                        <div v-for="p in data.metrics.weekly_progress" :key="p.id" class="mb-3">
                            <div class="flex justify-between text-sm mb-1"><span class="text-slate-600">{{ p.name }}</span><span class="text-slate-400">{{ p.progress_percent }}%</span></div>
                            <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-brand rounded-full" :style="{width: p.progress_percent + '%'}"></div></div>
                        </div>
                        <p v-if="!data.metrics.weekly_progress.length" class="text-sm text-slate-400 py-4 text-center">No projects yet</p>
                    </div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Compliance alerts</h2>
                        <div v-for="a in data.metrics.compliance_alerts" :key="a.deadline_id" class="flex items-center justify-between py-2 border-b border-slate-50">
                            <div><div class="text-sm text-slate-700">{{ a.permit_name }}</div><div class="text-xs text-slate-400">Due {{ a.due_date }}</div></div>
                            <span class="px-2 py-0.5 rounded-full text-xs" :class="a.urgency==='overdue'?'bg-rose-50 text-rose-700':(a.urgency==='due_soon'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600')">{{ a.urgency.replace('_',' ') }}</span>
                        </div>
                        <p v-if="!data.metrics.compliance_alerts.length" class="text-sm text-slate-400 py-4 text-center">No upcoming renewals</p>
                    </div>
                </div>
            </div>
        </div>`,
    };

    CSApp.route('/', 'DashboardView', DashboardView);

    // ---- Root (navbar + outlet) -------------------------------------------
    const Root = {
        setup() {
            const menuOpen = ref(false), profileOpen = ref(false), showChangePw = ref(false);
            const pw = reactive({ current_password: '', new_password: '', new_password_confirmation: '' });
            const pwMsg = ref(null), pwErr = ref(null), busy = ref(false);

            const authed = computed(() => !!store.user);
            const role = computed(() => store.user && store.user.role);
            const currentView = computed(() => CSApp.resolve() || 'NotFound');

            const menu = computed(() => {
                if (!store.user) return [];
                if (role.value === 'super_admin') return [
                    { label: 'Dashboard', href: '#/' },
                    { label: 'Organisations', href: '#/organisations' },
                ];
                return [
                    { label: 'Dashboard', href: '#/' },
                    { label: 'Projects', href: '#/projects' },
                    { label: 'Estimation', href: '#/estimates' },
                    { label: 'Billing', href: '#/billing' },
                    { label: 'Documents', href: '#/documents' },
                    { label: 'Reports', href: '#/reports' },
                ];
            });

            async function logout() {
                try { await api.post('/api/auth/logout', {}); } catch (e) {}
                store.user = null; location.hash = '#/';
            }
            async function submitChangePassword() {
                pwErr.value = null; pwMsg.value = null; busy.value = true;
                try {
                    await api.post('/api/auth/change-password', { ...pw });
                    pwMsg.value = 'Password updated.';
                    pw.current_password = pw.new_password = pw.new_password_confirmation = '';
                    setTimeout(() => { showChangePw.value = false; pwMsg.value = null; }, 1200);
                } catch (e) { pwErr.value = e.message; } finally { busy.value = false; }
            }
            // Auto-close the profile dropdown / mobile menu on any outside click.
            const profileRef = ref(null);
            const headerRef = ref(null);
            function onDocClick(e) {
                if (profileOpen.value && profileRef.value && !profileRef.value.contains(e.target)) profileOpen.value = false;
                if (menuOpen.value && headerRef.value && !headerRef.value.contains(e.target)) menuOpen.value = false;
            }
            onMounted(() => document.addEventListener('click', onDocClick));

            return { store, menuOpen, profileOpen, showChangePw, pw, pwMsg, pwErr, busy, authed, role, menu, currentView, logout, submitChangePassword, profileRef, headerRef };
        },
        template: `
        <div v-if="!authed"><auth-view></auth-view></div>
        <div v-else class="min-h-screen flex flex-col">
            <header ref="headerRef" class="fixed top-0 inset-x-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
                <div class="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button class="sm:hidden p-2 -ml-2 text-slate-600" @click="menuOpen=!menuOpen"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
                        <a href="#/" class="flex items-center gap-2 font-semibold text-slate-800"><span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white text-sm">CS</span><span class="hidden sm:inline">{{ store.appName }}</span></a>
                        <nav class="hidden sm:flex items-center gap-1 ml-4">
                            <a v-for="m in menu" :key="m.href" :href="m.href" class="px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">{{ m.label }}</a>
                        </nav>
                    </div>
                    <div class="relative" ref="profileRef">
                        <button @click="profileOpen=!profileOpen" class="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-slate-100">
                            <span class="hidden sm:block text-sm text-slate-700">{{ store.user.name || store.user.email }}</span>
                            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-sm font-medium">{{ (store.user.name||store.user.email||'?').charAt(0).toUpperCase() }}</span>
                        </button>
                        <div v-if="profileOpen" class="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-lg border border-slate-200 py-1 z-50">
                            <div class="px-4 py-2 border-b border-slate-100"><div class="text-sm font-medium text-slate-800">{{ store.user.email }}</div><div class="text-xs text-slate-500 capitalize">{{ (store.user.role||'').replace('_',' ') }} · Org {{ store.user.organisation_id }}</div></div>
                            <button class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" @click="showChangePw=true; profileOpen=false">Change Password</button>
                            <button class="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50" @click="logout">Logout</button>
                        </div>
                    </div>
                </div>
                <nav v-if="menuOpen" class="sm:hidden border-t border-slate-100 bg-white px-4 py-2 space-y-1">
                    <a v-for="m in menu" :key="m.href" :href="m.href" @click="menuOpen=false" class="block px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100">{{ m.label }}</a>
                </nav>
            </header>

            <main class="pt-14 flex-1 w-full">
                <div v-if="store.flash" class="w-full px-4 sm:px-6 pt-4">
                    <div class="rounded-lg px-4 py-2 text-sm" :class="store.flash.type==='error'?'bg-rose-50 text-rose-700 border border-rose-200':'bg-emerald-50 text-emerald-700 border border-emerald-200'">{{ store.flash.message }}</div>
                </div>
                <div class="w-full px-4 sm:px-6 py-6">
                    <component :is="currentView"></component>
                </div>
            </main>

            <div v-if="showChangePw" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 print:hidden">
                <div class="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <div class="flex items-center justify-between mb-4"><h2 class="text-base font-semibold text-slate-800">Change Password</h2><button class="text-slate-400 hover:text-slate-600" @click="showChangePw=false">✕</button></div>
                    <form @submit.prevent="submitChangePassword" class="space-y-3">
                        <input v-model="pw.current_password" type="password" required placeholder="Current password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        <input v-model="pw.new_password" type="password" required minlength="8" placeholder="New password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        <input v-model="pw.new_password_confirmation" type="password" required minlength="8" placeholder="Confirm new password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand">
                        <p v-if="pwErr" class="text-sm text-rose-600">{{ pwErr }}</p>
                        <p v-if="pwMsg" class="text-sm text-emerald-600">{{ pwMsg }}</p>
                        <div class="flex justify-end gap-2 pt-1"><button type="button" class="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" @click="showChangePw=false">Cancel</button><button type="submit" :disabled="busy" class="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60">{{ busy?'Saving…':'Update' }}</button></div>
                    </form>
                </div>
            </div>
        </div>`,
    };

    const NotFound = { template: `<div class="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">This section isn't available yet.</div>` };

    // Build + mount.
    const app = createApp(Root);
    // Expose the shared store to every component template.
    app.config.globalProperties.store = store;
    app.component('AuthView', AuthView);
    app.component('NotFound', NotFound);
    CSApp.installPending(app);
    app.mount('#app');
})();
