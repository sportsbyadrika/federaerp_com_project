# Construction Management SaaS (MVP)

Multi-tenant construction management platform. **PHP 8.1+ · MySQL · Vue 3 (CDN, no build) · Tailwind · Vanilla PDO.** Security-first, shared-hosting friendly (cPanel/Plesk), with a clean path to a future Dockerized/cloud deployment.

See [`CLAUDE.md`](CLAUDE.md) for the full project context and constraints, and [`docs/`](docs) for per-batch build notes.

## Project layout

```
├── app/                      # application code (NOT web-reachable)
│   ├── controllers/          # thin controllers → JSON envelope
│   ├── models/               # PDO-backed models
│   ├── services/             # business logic + RBAC
│   ├── middleware/           # Auth, TenantScope, Csrf, Role
│   └── views/                # server-rendered app shell
├── core/                     # framework (Router, Database, Auth, Csrf, ...)
├── config/                   # routes.php, app.php, .env (uncommitted)
├── database/                 # schema.sql + seed
├── storage/                  # uploads/ + logs/  (outside web root)
│   ├── uploads/              # streamed via authenticated proxy only
│   └── logs/
├── public_html/              # THE ONLY web root
│   ├── index.php             # front controller
│   ├── .htaccess             # rewrites + security headers
│   └── assets/{css,js}/      # Vue app shell, api.js, styles
└── .env.example
```

Only `public_html/` is served. `app/`, `core/`, `config/`, `storage/` sit one level above and are never reachable from the browser.

## Local development

Requirements: PHP 8.1+ with `pdo_mysql`, and a MySQL 5.7+/8.0 server.

```bash
# 1. Configure environment (kept outside the web root, never committed)
cp .env.example config/.env
#   edit config/.env → set DB_HOST/DB_NAME/DB_USER/DB_PASS, APP_KEY, CRON_TOKEN

# 2. Create the database & load schema + seed (available from Batch 2)
mysql -u root -p -e "CREATE DATABASE construction_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p construction_saas < database/schema.sql
php database/seed.php

# 3. Serve the public web root with PHP's built-in server
php -S localhost:8000 -t public_html
```

Then:
- App shell → http://localhost:8000/
- Health check → http://localhost:8000/api/health

> The built-in server serves `public_html` as the document root, mirroring shared hosting where the app dirs live one level up and stay private.

## Shared hosting (cPanel/Plesk) — quick version

1. Upload the repo **above** `public_html` (e.g. into `~/construction_saas/`), then point the site's document root at that project's `public_html`, **or** move the contents of `public_html/` into the account's `public_html` and the sibling dirs (`app/`, `core/`, `config/`, `storage/`) just outside it.
2. Create `config/.env` (outside the web root) with production DB credentials.
3. Create the MySQL DB + user in cPanel and import `database/schema.sql` via phpMyAdmin.
4. Ensure `storage/uploads` and `storage/logs` are writable (typically `755`).
5. Add the compliance cron in cPanel (token-guarded) — details in Batch 3/9.

The full step-by-step deployment guide + cloud roadmap ships in **Batch 9**.

## Security baseline

- 100% PDO prepared statements, tenant-scoped by `organisation_id` on every query.
- Server-side sessions (httpOnly, SameSite) + CSRF token on all writes.
- Passwords via `password_hash()`. RBAC enforced in the service layer.
- Uploads validated (MIME + extension allowlist, size cap, randomized names),
  stored outside the web root, execution blocked, streamed via authenticated proxy.
- Security headers + hardened `.htaccess`.

## Build batches

| Batch | Scope | Status |
|------:|-------|--------|
| 0 | Global context (`CLAUDE.md`) | done |
| 1 | Scaffold & foundation | done |
| 2 | MySQL schema + seed | done |
| 3 | Backend engine & REST APIs | done |
| 4 | Frontend: shell, dashboards, estimation | done |
| 5 | Frontend: Kanban + compliance tracker | done |
| 6 | Frontend: billing hub + documents/QHSE | done |
| 7 | Reports: print / PDF / CSV | done |
| 8 | Security hardening & tests (`docs/SECURITY.md`) | done |
| 9 | Deployment + cloud roadmap (`docs/DEPLOYMENT.md`) | done |

## Tests

```bash
php tests/run_tests.php   # 18 integration assertions (re-seeds first)
```
