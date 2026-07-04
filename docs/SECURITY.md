# Security Checklist Report (Batch 8)

Concrete verifications performed against the Global Context security baseline,
with residual risks for a shared-hosting MVP. Automated checks live in
`tests/run_tests.php` (18 assertions, all passing).

## 1. SQL / data access
- **100% prepared statements.** All DB access goes through `Core\Database`
  helpers (`query/fetch/fetchAll/fetchColumn/execute/insert`), which only accept
  bound parameters. Audit (`grep` over `app/`, `core/`) found **no** user value
  interpolated into SQL. The only string-interpolated tokens are (a) hardcoded
  literals like `status='active'` and (b) table/column identifiers derived from
  model constants or a controller whitelist (`MasterDataController::RESOURCES`),
  never from request input.
- `PDO::ATTR_EMULATE_PREPARES = false` → real server-side prepares.
- **Tenant isolation** enforced in `BaseModel` (every `find/forTenant/update/
  delete` filters by `tenant_id`) and re-checked in services. Verified: an Org
  Admin reading another tenant's project returns `null`/404; tenant lists never
  contain foreign rows; settlement rejects cross-tenant project ids.

## 2. Authentication & sessions
- 3-field login (org id + email + password): the org must exist, the user is
  matched **within** that org, then the password is verified. Uniform
  `invalid_credentials` error avoids revealing which field was wrong.
- Passwords hashed with `password_hash()` (bcrypt/argon2); transparent rehash on
  algorithm change. Verified no plaintext is stored.
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` (from `SESSION_SECURE`),
  path-scoped. `session_regenerate_id(true)` on login (fixation defense);
  full session destroy + cookie expiry on logout.
- Same email under different orgs resolves to **distinct** accounts (verified).

## 3. CSRF & RBAC
- CSRF token per session (`Core\Csrf`), rotated on login, required on every
  `POST/PUT/PATCH/DELETE` via `CsrfMiddleware` (`hash_equals` comparison).
  Verified: a tokenless write returns HTTP 419.
- RBAC enforced in the **service layer** (`BaseService::assertRole`) and at the
  route edge (`SuperAdminOnly`, `OrgAdminOnly`). Super Admin (org 111111) is the
  only role permitted cross-org, via admin-scoped endpoints only.

## 4. File uploads & streaming
- Uploads validated in `Core\Storage`: extension allowlist + **content-sniffed**
  MIME match (`finfo`), 20 MB cap, `is_uploaded_file()`/`move_uploaded_file()`
  checks, randomized 32-hex stored names, `chmod 0644`.
- Files stored **outside** the web root (`/storage/uploads/<tenant>/…`); a
  `.htaccess` there denies direct access and disables the PHP engine.
- Served only through the authenticated proxy (`FileController`), which resolves
  the record **within the caller's tenant** before streaming. Path traversal
  blocked by `Storage::absolutePath` realpath containment (verified).

## 5. Security headers & .htaccess
- `public_html/.htaccess`: front-controller rewrite, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, CSP (self + the Vue/Tailwind
  CDNs), HSTS ready (commented until HTTPS confirmed), `Options -Indexes`,
  dotfile/`.env`/`.sql` denial, gzip + cache headers.
- App-code directories (`app/`, `core/`, `config/`, `storage/`) live above the
  web root and are unreachable over HTTP.
- Errors: `display_errors` off in production; details logged server-side; client
  never sees stack traces or DSN/credentials.

## 6. Input validation
- Server-side `Core\Validator` on every mutating endpoint (required/type/range/
  enum/digits/confirmed). The client is never trusted.

## Residual risks & recommendations (shared-hosting MVP)
1. **CSP allows the Tailwind Play CDN + `unsafe-inline`/`unsafe-eval`.** For
   production, pre-build a minified Tailwind CSS (Batch 9) and drop the Play CDN
   + `unsafe-eval` to tighten CSP.
2. **No rate limiting / brute-force lockout** on login (shared hosting rarely
   offers a shared cache). Add per-IP/per-org throttling (DB or APCu) or a WAF.
3. **CSRF token stored in session**; a strict double-submit cookie could be added
   if the app is ever embedded cross-site.
4. **Cron endpoint** is guarded by a shared `CRON_TOKEN`; prefer the CLI cron
   invocation (no HTTP exposure) where the host allows it.
5. **Antivirus scanning** of uploads is out of scope at MVP; execution is blocked
   and types are allowlisted, but consider ClamAV on a VPS.
6. **HTTPS/HSTS** must be enabled at the host before uncommenting the HSTS header
   and setting `SESSION_SECURE=true`.

## How to run the tests
```bash
php tests/run_tests.php     # re-seeds, then runs 18 integration assertions
```
Covers: 3-field login, same-email-across-orgs isolation, Super-Admin cross-org
vs Org-Admin denial, estimation math, settlement math, kanban move, upload/
storage guards, and password hashing.
