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

    // ---- reCAPTCHA widget (renders only when configured) ------------------
    const captchaHelper = {
        loading: false, ready: false,
        ensureScript() {
            if (this.ready || this.loading) return;
            this.loading = true;
            const s = document.createElement('script');
            s.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
            s.async = true; s.defer = true;
            s.onload = () => { this.ready = true; };
            document.head.appendChild(s);
        },
    };
    const RecaptchaBox = {
        props: { modelValue: String },
        emits: ['update:modelValue'],
        setup(props, { emit }) {
            const el = ref(null);
            let widgetId = null;
            const enabled = computed(() => store.config.captcha_enabled && store.config.recaptcha_site_key);
            function tryRender(attempt = 0) {
                if (!enabled.value || !el.value) return;
                if (window.grecaptcha && window.grecaptcha.render) {
                    try {
                        widgetId = window.grecaptcha.render(el.value, {
                            sitekey: store.config.recaptcha_site_key,
                            callback: (t) => emit('update:modelValue', t),
                            'expired-callback': () => emit('update:modelValue', ''),
                        });
                    } catch (e) { /* already rendered */ }
                } else if (attempt < 40) {
                    setTimeout(() => tryRender(attempt + 1), 150);
                }
            }
            onMounted(() => { if (enabled.value) { captchaHelper.ensureScript(); tryRender(); } });
            return { el, enabled };
        },
        template: `<div v-if="enabled" ref="el" class="my-3"></div>`,
    };

    // ---- Login (Email + Password) -----------------------------------------
    const AuthView = {
        components: { RecaptchaBox },
        setup() {
            const busy = ref(false), error = ref(null);
            const login = reactive({ email: '', password: '' });
            const captcha = ref('');
            async function submitLogin() {
                error.value = null; busy.value = true;
                try {
                    const r = await api.post('/api/auth/login', { email: login.email, password: login.password, recaptcha_token: captcha.value });
                    api.setCsrf(r.data.csrf_token);
                    store.user = r.data.user;
                    if (r.data.currency) store.currency = r.data.currency;
                    CSApp.loadOrg();
                    CSApp.navigate('/');
                } catch (e) { error.value = e.message || 'Login failed'; }
                finally { busy.value = false; }
            }
            return { busy, error, login, captcha, submitLogin };
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
                    <h2 class="font-semibold text-slate-800 mb-4">Sign in</h2>
                    <p v-if="error" class="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{{ error }}</p>
                    <form @submit.prevent="submitLogin" class="space-y-3">
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Email</label>
                            <input v-model="login.email" type="email" required autocomplete="username" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <div>
                            <label class="block text-sm text-slate-600 mb-1">Password</label>
                            <input v-model="login.password" type="password" required autocomplete="current-password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none">
                        </div>
                        <recaptcha-box v-model="captcha"></recaptcha-box>
                        <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
                    </form>
                    <div class="flex items-center justify-between mt-4 text-sm">
                        <a href="#/forgot" class="text-brand hover:underline">Forgot password?</a>
                        <a href="#/register" class="text-brand hover:underline">Register new institution</a>
                    </div>
                </div>
            </div>
        </div>`,
    };

    // ---- Register a new institution (separate page) -----------------------
    const RegisterView = {
        components: { RecaptchaBox },
        setup() {
            const busy = ref(false), error = ref(null), created = ref(null);
            const onb = reactive({ organisation_name: '', admin_name: '', admin_email: '', password: '', password_confirmation: '' });
            const captcha = ref('');
            async function submit() {
                error.value = null; busy.value = true;
                try {
                    const r = await api.post('/api/auth/register-organisation', { ...onb, recaptcha_token: captcha.value });
                    created.value = r.data.organisation_id;
                } catch (e) { error.value = e.message || 'Could not create institution'; }
                finally { busy.value = false; }
            }
            return { busy, error, created, onb, captcha, submit };
        },
        template: `
        <div class="min-h-screen flex items-center justify-center px-4 py-10">
            <div class="w-full max-w-md">
                <div class="text-center mb-6">
                    <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white text-lg font-semibold">CS</div>
                    <h1 class="mt-3 text-xl font-semibold text-slate-800">Register your institution</h1>
                    <p class="text-sm text-slate-500">Create an account for your construction company</p>
                </div>
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div v-if="created" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                        Institution created! You can now <a href="#/" class="font-medium underline">sign in</a> with your admin email and password.
                    </div>
                    <template v-else>
                        <p v-if="error" class="mb-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{{ error }}</p>
                        <form @submit.prevent="submit" class="space-y-3">
                            <div><label class="block text-sm text-slate-600 mb-1">Institution / Company name</label><input v-model="onb.organisation_name" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Admin name</label><input v-model="onb.admin_name" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Admin email</label><input v-model="onb.admin_email" type="email" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div class="grid grid-cols-2 gap-3">
                                <div><label class="block text-sm text-slate-600 mb-1">Password</label><input v-model="onb.password" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                                <div><label class="block text-sm text-slate-600 mb-1">Confirm</label><input v-model="onb.password_confirmation" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            </div>
                            <recaptcha-box v-model="captcha"></recaptcha-box>
                            <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Creating…' : 'Create institution' }}</button>
                        </form>
                    </template>
                    <p class="text-center text-sm mt-4"><a href="#/" class="text-brand hover:underline">← Back to sign in</a></p>
                </div>
            </div>
        </div>`,
    };

    // ---- Forgot password --------------------------------------------------
    const ForgotView = {
        components: { RecaptchaBox },
        setup() {
            const busy = ref(false), sent = ref(false), error = ref(null);
            const email = ref(''); const captcha = ref('');
            async function submit() {
                error.value = null; busy.value = true;
                try { await api.post('/api/auth/forgot-password', { email: email.value, recaptcha_token: captcha.value }); sent.value = true; }
                catch (e) { error.value = e.message; }
                finally { busy.value = false; }
            }
            return { busy, sent, error, email, captcha, submit };
        },
        template: `
        <div class="min-h-screen flex items-center justify-center px-4 py-10">
            <div class="w-full max-w-md">
                <div class="text-center mb-6"><h1 class="text-xl font-semibold text-slate-800">Reset your password</h1></div>
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div v-if="sent" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                        If that email is registered, we've sent a reset link. Check your inbox (and spam). The link expires in 1 hour.
                    </div>
                    <template v-else>
                        <p class="text-sm text-slate-500 mb-3">Enter your account email and we'll send you a reset link.</p>
                        <p v-if="error" class="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{{ error }}</p>
                        <form @submit.prevent="submit" class="space-y-3">
                            <div><label class="block text-sm text-slate-600 mb-1">Email</label><input v-model="email" type="email" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <recaptcha-box v-model="captcha"></recaptcha-box>
                            <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Sending…' : 'Send reset link' }}</button>
                        </form>
                    </template>
                    <p class="text-center text-sm mt-4"><a href="#/" class="text-brand hover:underline">← Back to sign in</a></p>
                </div>
            </div>
        </div>`,
    };

    // ---- Reset password (from emailed link #/reset?token=..) --------------
    const ResetView = {
        setup() {
            const busy = ref(false), done = ref(false), error = ref(null);
            const pw = reactive({ password: '', password_confirmation: '' });
            const token = computed(() => store.query.token || '');
            async function submit() {
                error.value = null;
                if (pw.password !== pw.password_confirmation) { error.value = 'Passwords do not match'; return; }
                busy.value = true;
                try {
                    await api.post('/api/auth/reset-password', { token: token.value, password: pw.password, password_confirmation: pw.password_confirmation });
                    done.value = true;
                } catch (e) { error.value = e.message; }
                finally { busy.value = false; }
            }
            return { busy, done, error, pw, token, submit };
        },
        template: `
        <div class="min-h-screen flex items-center justify-center px-4 py-10">
            <div class="w-full max-w-md">
                <div class="text-center mb-6"><h1 class="text-xl font-semibold text-slate-800">Set a new password</h1></div>
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div v-if="done" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                        Password updated. <a href="#/" class="font-medium underline">Sign in</a> with your new password.
                    </div>
                    <div v-else-if="!token" class="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                        Missing or invalid reset link. Please request a new one from <a href="#/forgot" class="underline">Forgot password</a>.
                    </div>
                    <template v-else>
                        <p v-if="error" class="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{{ error }}</p>
                        <form @submit.prevent="submit" class="space-y-3">
                            <div><label class="block text-sm text-slate-600 mb-1">New password</label><input v-model="pw.password" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <div><label class="block text-sm text-slate-600 mb-1">Confirm new password</label><input v-model="pw.password_confirmation" type="password" minlength="8" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"></div>
                            <button type="submit" :disabled="busy" class="w-full py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60">{{ busy ? 'Saving…' : 'Update password' }}</button>
                        </form>
                    </template>
                </div>
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
            const fmt = (n) => CSApp.money(n);
            // Balance = base income − total expenditure.
            const balanceValue = computed(() => {
                const f = data.value && data.value.metrics && data.value.metrics.finance;
                if (!f) return 0;
                return Math.round(((+f.income.base || 0) - (+f.expense.total || 0)) * 100) / 100;
            });
            return { loading, error, data, role, fmt, balanceValue };
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
                <!-- Institution details -->
                <div v-if="data.metrics.organisation" class="bg-white rounded-xl border border-slate-200 p-5">
                    <div class="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <h2 class="font-semibold text-slate-800">{{ data.metrics.organisation.name }}</h2>
                            <p v-if="data.metrics.organisation.legal_name" class="text-sm text-slate-500">{{ data.metrics.organisation.legal_name }}</p>
                            <p class="text-sm text-slate-500 mt-1">
                                <span v-if="data.metrics.organisation.address">{{ data.metrics.organisation.address }}<span v-if="data.metrics.organisation.city">, </span></span>
                                <span v-if="data.metrics.organisation.city">{{ data.metrics.organisation.city }}</span>
                                <span v-if="data.metrics.organisation.country"> · {{ data.metrics.organisation.country }}</span>
                            </p>
                            <p class="text-sm text-slate-500">
                                <span v-if="data.metrics.organisation.email">✉ {{ data.metrics.organisation.email }}</span>
                                <span v-if="data.metrics.organisation.phone"> · ☎ {{ data.metrics.organisation.phone }}</span>
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-slate-400">Institution ID</div>
                            <div class="text-lg font-mono font-semibold text-slate-700">{{ data.metrics.organisation.id }}</div>
                            <div class="text-xs text-slate-400 mt-1">Currency: {{ data.metrics.organisation.currency }}</div>
                        </div>
                    </div>
                </div>
                <!-- Row 1: Income · Expense · Balance · Fleet -->
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <div class="text-3xl font-semibold text-emerald-600">{{ fmt(data.metrics.finance.income.base) }}</div>
                        <div class="text-sm text-slate-500 mt-1">Income (base)</div>
                        <div class="text-xs text-slate-400 mt-1">GST {{ fmt(data.metrics.finance.income.gst) }} · Total {{ fmt(data.metrics.finance.income.total) }}</div>
                    </div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <div class="text-3xl font-semibold text-rose-600">{{ fmt(data.metrics.finance.expense.total) }}</div>
                        <div class="text-sm text-slate-500 mt-1">Expense (total)</div>
                        <div class="text-xs text-slate-400 mt-1">Base {{ fmt(data.metrics.finance.expense.base) }} · GST {{ fmt(data.metrics.finance.expense.gst) }}</div>
                    </div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <div class="text-3xl font-semibold" :class="balanceValue >= 0 ? 'text-emerald-700' : 'text-rose-600'">{{ fmt(balanceValue) }}</div>
                        <div class="text-sm text-slate-500 mt-1">Balance <span class="text-slate-400">(income − expense)</span></div>
                        <div v-if="(data.metrics.bank_balances||[]).length" class="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                            <div v-for="b in data.metrics.bank_balances" :key="b.id" class="flex justify-between text-xs">
                                <span class="text-slate-500 truncate mr-2">🏦 {{ b.label }}</span>
                                <span :class="b.balance >= 0 ? 'text-emerald-700' : 'text-rose-600'">{{ fmt(b.balance) }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl border border-slate-200 p-5"><div class="text-3xl font-semibold text-slate-800">{{ data.metrics.fleet.in_use }}/{{ data.metrics.fleet.total }}</div><div class="text-sm text-slate-500 mt-1">Fleet in use</div></div>
                </div>

                <!-- Row 2: Active projects · Staff · Clients · Suppliers · Sub-contractors -->
                <div v-if="data.metrics.directory" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <a href="#/projects" class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow hover:border-brand/40 transition">
                        <span class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand text-xl">🏗️</span>
                        <div><div class="text-2xl font-semibold text-slate-800">{{ data.metrics.projects.active }} <span class="text-base text-slate-400">/ {{ data.metrics.projects.total }}</span></div><div class="text-sm text-slate-500">Active projects</div></div>
                    </a>
                    <a href="#/staff" class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow hover:border-brand/40 transition">
                        <span class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-xl">👷</span>
                        <div><div class="text-2xl font-semibold text-slate-800">{{ data.metrics.directory.staff }}</div><div class="text-sm text-slate-500">Staff</div></div>
                    </a>
                    <a href="#/setup?tab=clients" class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow hover:border-brand/40 transition">
                        <span class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600 text-xl">👥</span>
                        <div><div class="text-2xl font-semibold text-slate-800">{{ data.metrics.directory.clients }}</div><div class="text-sm text-slate-500">Clients</div></div>
                    </a>
                    <a href="#/setup?tab=suppliers" class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow hover:border-brand/40 transition">
                        <span class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 text-xl">🏭</span>
                        <div><div class="text-2xl font-semibold text-slate-800">{{ data.metrics.directory.suppliers }}</div><div class="text-sm text-slate-500">Suppliers</div></div>
                    </a>
                    <a href="#/setup?tab=subcontractors" class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow hover:border-brand/40 transition">
                        <span class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600 text-xl">🛠️</span>
                        <div><div class="text-2xl font-semibold text-slate-800">{{ data.metrics.directory.subcontractors }}</div><div class="text-sm text-slate-500">Sub-contractors</div></div>
                    </a>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 class="font-medium text-slate-700 mb-3">Weekly project progress</h2>
                        <div v-for="p in data.metrics.weekly_progress" :key="p.id" class="mb-3">
                            <div class="flex justify-between text-sm mb-1"><span class="text-slate-600"><span v-if="p.code" class="font-mono text-xs text-slate-400 mr-1">{{ p.code }}</span>{{ p.name }}<span v-if="p.project_type" class="text-slate-400"> ({{ p.project_type }})</span></span><span class="text-slate-400">{{ p.progress_percent }}%</span></div>
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
            // Unauthenticated routing (login / register / forgot / reset).
            const guestView = computed(() => {
                const r = store.route;
                if (r === '/register') return 'RegisterView';
                if (r === '/forgot') return 'ForgotView';
                if (r === '/reset') return 'ResetView';
                return 'AuthView';
            });

            const menu = computed(() => {
                if (!store.user) return [];
                if (role.value === 'super_admin') return [
                    { label: 'Dashboard', href: '#/' },
                    { label: 'Organisations', href: '#/organisations' },
                ];
                return [
                    { label: 'Dashboard', href: '#/' },
                    { label: 'Projects', href: '#/projects' },
                    { label: 'Staff', href: '#/staff' },
                    { label: 'Expenditure', href: '#/expenditure' },
                    { label: 'Income', href: '#/income' },
                    { label: 'Documents', href: '#/documents' },
                    { label: 'Reports', href: '#/reports' },
                    { label: 'Setup', href: '#/setup' },
                ];
            });

            async function logout() {
                try { await api.post('/api/auth/logout', {}); } catch (e) {}
                store.user = null; store.org = null; location.hash = '#/';
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

            return { store, menuOpen, profileOpen, showChangePw, pw, pwMsg, pwErr, busy, authed, role, menu, currentView, guestView, logout, submitChangePassword, profileRef, headerRef };
        },
        template: `
        <div v-if="!authed"><component :is="guestView"></component></div>
        <div v-else class="min-h-screen flex flex-col">
            <header ref="headerRef" class="fixed top-0 inset-x-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
                <div class="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button class="sm:hidden p-2 -ml-2 text-slate-600" @click="menuOpen=!menuOpen"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
                        <a href="#/" class="flex items-center gap-2 font-semibold text-slate-800">
                            <img v-if="store.org && store.org.has_logo" src="/api/organisation/logo" alt="logo" class="h-8 w-8 rounded-lg object-contain bg-white border border-slate-100">
                            <span v-else class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white text-sm">{{ ((store.org && store.org.name) || store.appName || 'CS').charAt(0).toUpperCase() }}</span>
                            <span class="hidden sm:inline">{{ (store.org && store.org.name) || store.appName }}</span>
                        </a>
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
    app.component('RegisterView', RegisterView);
    app.component('ForgotView', ForgotView);
    app.component('ResetView', ResetView);
    app.component('RecaptchaBox', RecaptchaBox);
    app.component('NotFound', NotFound);
    CSApp.installPending(app);
    app.mount('#app');
})();
