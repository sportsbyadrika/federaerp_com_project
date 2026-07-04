# Construction Management SaaS — Global Project Context (Batch 0)

This file is the persistent context for the whole project. Obey it in every batch
unless explicitly overridden.

## What we are building
An MVP of a **multi-tenant Construction Management SaaS**. Three account tiers:
1. **Super Admin** — the SaaS platform operator (reserved org id `111111`).
2. **Organisation Administrator** — admin of a client construction company.
3. **Staff** — members belonging to an organisation.

## Non-negotiable tech stack
- **Backend:** PHP 8.1+, **no framework**. Lightweight custom MVC — single front
  controller (`public_html/index.php`), a simple segment/regex router, thin
  controllers, PDO-backed models, and a service layer for business logic. No
  Composer dependency required to run (if used, PSR-4 autoloading only).
- **Database:** MySQL 5.7+/8.0 — InnoDB, utf8mb4. **All queries via PDO prepared
  statements — never string-concatenate SQL.**
- **Frontend:** Vue 3 from CDN (global build, **no build step**) + Tailwind CSS.
  No Node/npm/Vite. Assets are plain files under `public_html`.
- **Hosting target:** traditional shared hosting (cPanel/Plesk). No shell access,
  no long-running workers, no Docker at MVP. Scheduled jobs run via cPanel Cron
  hitting a PHP CLI script or a token-protected endpoint.

## Login model (mandatory)
- Every organisation has a **6-digit numeric `organisation_id`**, randomly
  generated on creation, unique across the platform. Super Admin's org is fixed
  at **`111111`** (reserved; never assigned to a client org).
- Login requires **three fields for all users: Organisation ID + Email +
  Password.** The org ID scopes the account — the same email may exist under
  different orgs. Validate the org exists, then match email/password within it.
- `organisation_id` is the **tenant key** (`tenant_id`). Super Admin sees across
  orgs; Org Admin and Staff are hard-scoped to their own `organisation_id`.

## Architecture rules
- **Multi-tenancy:** single shared DB, isolation by `tenant_id` on every business
  table. Every query auto-scoped to the authenticated user's org. Never allow
  cross-tenant reads/writes. Only Super Admin may query across orgs, and only via
  explicitly admin-scoped endpoints.
- **Folder layout (security-critical):** application/framework code lives
  **outside** `public_html`. Only `index.php`, assets, and an uploads handler live
  inside `public_html`. Uploaded files are stored **outside the web root** and
  streamed through an authenticated PHP proxy — never linked directly.
- **Config:** DB credentials and secrets come from a `.env`-style file outside
  `public_html`, never committed.
- **API style:** RESTful JSON under `/api/...`. Consistent envelope:
  `{ "success": bool, "data": ..., "error": { "code", "message" }, "meta": {...} }`
  with proper HTTP status codes.

## Security baseline (apply everywhere)
- PDO prepared statements for 100% of queries.
- Server-side sessions + a signed CSRF/API token for state-changing requests.
  Passwords hashed with `password_hash()` (bcrypt/argon2).
- CSRF protection on all POST/PUT/DELETE. Output escaping on all rendered data.
  Strict server-side validation of every input.
- Role-based access control enforced in the **service layer**, not just UI.
- Secure file uploads: MIME + extension allowlist, size cap, randomized stored
  names, execution blocked in upload dir (`.htaccess`), stored outside web root.
- Security headers via `.htaccess`/PHP: CSP, X-Content-Type-Options,
  X-Frame-Options, HSTS-ready.

## Code quality rules
- Clarity over cleverness. Small, single-responsibility classes/functions.
- Naming: `snake_case` for DB columns/tables (plural table names), `PascalCase`
  for PHP classes, `camelCase` for PHP methods/JS.
- Every module ships with model(s), service(s), controller(s), route
  registration, and at least a smoke test or seed script.
- Schema/structure designed so a future migration to Dockerized cloud/VPS is
  seamless: no hard-coded absolute paths, config via env, stateless request
  handling, uploads behind a Storage class.

## UX rules
- Clean, modern, professional, **mobile-first** (supervisors use phones on-site).
  Graceful loading/empty/error states everywhere.
- Page background: off-white base (`#F7F7F5`); cards/panels/tables pure white.
  Report print output stays pure white.
- Global layout: **fixed top navigation bar** — logo left, horizontal inline menu,
  profile dropdown on the far right (Change Password + Logout). Collapses to a
  hamburger on mobile; top bar + profile stay fixed.
- Every page is full-width / full-stretched and fully mobile responsive,
  including tables (collapse to stacked cards or horizontal scroll on small
  screens).
- Per-user dashboards for Super Admin, Org Admin, Staff.
- Reports render in-page, print on clean white background (print stylesheet hides
  nav/controls), export to PDF, and offer Download CSV.
- **Kanban board** for Project Management with drag-and-drop between columns.
  Drag-and-drop only where it adds value (kanban cards, uploads, estimate line
  reordering) — not forced into forms/tables.

## Batch roadmap
0. Global context (this file)
1. Project scaffold & foundation
2. Full relational MySQL schema
3. Backend core engine & REST APIs
4. Frontend: app shell, dashboards & estimation
5. Frontend: Kanban PM + compliance tracker
6. Frontend: billing hub + documents/QHSE
7. Reports: printable / PDF / CSV
8. Security hardening & testing pass
9. Shared-hosting deployment + cloud roadmap

When given a batch: produce production-quality, runnable code that fits this
context. If ambiguous, make a sensible MVP decision and note it briefly.
