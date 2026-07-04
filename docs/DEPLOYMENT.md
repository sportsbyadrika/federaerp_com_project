# Deployment Guide — cPanel/Plesk Shared Hosting + Cloud Roadmap (Batch 9)

This guide takes a fresh cPanel/Plesk account to a live install of the
Construction Management SaaS (PHP 8.1+ · MySQL · Vue 3 CDN · Tailwind), then
outlines the concrete path to a Dockerized/VPS/cloud setup later. Nothing in the
MVP needs rewriting to move to cloud — only re-hosting.

---

## 0. What you need
- A cPanel/Plesk account with **PHP 8.1+** and the `pdo_mysql` extension.
- A MySQL 5.7+/8.0 database (created in cPanel).
- FTP/SSH or the cPanel File Manager to upload files.
- Your domain pointed at the account.

---

## 1. Directory placement (security-critical)

Only `public_html/` may be web-served. Everything else sits **one level above**
it and is unreachable over HTTP.

On a typical cPanel account the home dir is `/home/USER/`. Upload the project so
it looks like this:

```
/home/USER/
├── construction_saas/          <-- the repo (app code, NOT web-served)
│   ├── app/
│   ├── core/
│   ├── config/                 (contains .env — never web-served)
│   ├── database/
│   ├── storage/                (uploads + logs, writable)
│   └── public_html/            (the app's own web root)
└── public_html/                <-- the account's DocumentRoot
```

You have **two equivalent options**:

### Option A — point the DocumentRoot at the app's `public_html` (preferred)
In Plesk, or cPanel "Domains → set Document Root", set the site's document root
to `/home/USER/construction_saas/public_html`. Done — the sibling `app/`,
`core/`, `config/`, `storage/` stay private automatically.

### Option B — split into the account's existing `public_html`
If you cannot change the DocumentRoot:
1. Move the **contents** of `construction_saas/public_html/` into
   `/home/USER/public_html/` (so `index.php`, `.htaccess`, `assets/` sit there).
2. Keep `app/`, `core/`, `config/`, `database/`, `storage/` in
   `/home/USER/construction_saas/` (above the web root).
3. Edit `public_html/index.php` — change the bootstrap path from
   `dirname(__DIR__) . '/core/bootstrap.php'` to the real location, e.g.
   `'/home/USER/construction_saas/core/bootstrap.php'`. The code uses no other
   hard-coded absolute paths (`BASE_PATH` is derived from the bootstrap file's
   location), so this single edit is enough.

The included `.htaccess` (rewrites + security headers) is already in
`public_html/`.

---

## 2. Config management (secrets outside the web root)

1. Copy the example env into `config/.env` (which is **above** the web root and
   git-ignored):
   ```bash
   cp .env.example config/.env
   ```
2. Edit `config/.env`:
   ```ini
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://yourdomain.com
   APP_KEY=<a long random string>

   DB_HOST=localhost
   DB_NAME=USER_construction
   DB_USER=USER_csaas
   DB_PASS=<strong password>

   CRON_TOKEN=<a long random string>
   SESSION_SECURE=true          # once HTTPS is live
   ```
3. **File permissions:**
   - Directories `755`, files `644`.
   - `storage/`, `storage/uploads/`, `storage/logs/` must be **writable** by PHP
     (usually `755`; some hosts need `775`).
   ```bash
   find /home/USER/construction_saas -type d -exec chmod 755 {} \;
   find /home/USER/construction_saas -type f -exec chmod 644 {} \;
   chmod -R 755 /home/USER/construction_saas/storage
   ```
4. Never commit `config/.env` (already in `.gitignore`).

---

## 3. Database setup

1. In cPanel **MySQL Databases**: create a database (e.g. `USER_construction`)
   and a user (e.g. `USER_csaas`), then **add the user to the database with
   ALL PRIVILEGES**.
2. Put those credentials in `config/.env`.
3. Import the schema via **phpMyAdmin**:
   - Select the database → **Import** → choose `database/schema.sql` → Go.
   - It creates all 56 tables with no FK errors.
4. Seed demo/admin data (optional but recommended for first login). If you have
   SSH:
   ```bash
   php database/seed.php
   ```
   If you have no shell, either run seed once via a temporary protected script,
   or manually create your first organisation through the app's **New
   organisation** onboarding screen (it generates a 6-digit org id + Org Admin).

   > The Super Admin (org **111111**) is only created by the seed. On a
   > shell-less host, run the seed once (e.g. via cPanel "Terminal") or create
   > the platform org + super_admin row manually in phpMyAdmin using a
   > `password_hash()` value.

---

## 4. Asset optimization without a build step

The app loads Vue 3 + Tailwind from CDN — no Node/build needed. To keep pages
fast on low-resource shared hosting:

- **Tailwind:** the Play CDN (`cdn.tailwindcss.com`) is convenient but ships a
  JIT compiler. For production, pre-generate a **minified static CSS** once and
  serve it locally, then drop the Play CDN `<script>` and tighten the CSP:
  - On any machine with Node (your laptop, not the server):
    ```bash
    npx tailwindcss -i input.css -o public_html/assets/css/tailwind.min.css --minify
    ```
    Replace the `<script src="https://cdn.tailwindcss.com">` line in
    `app/views/shell.php` with
    `<link rel="stylesheet" href="/assets/css/tailwind.min.css">` and remove
    `cdn.tailwindcss.com` + `'unsafe-eval'` from the CSP in `public_html/.htaccess`.
  - Vue's global build can likewise be downloaded and served from
    `/assets/js/vendor/vue.global.prod.js` to remove the unpkg dependency.
- **JS:** feature scripts are already small and loaded with plain `<script>`.
  They can be concatenated/minified offline if desired; no build is required.
- **gzip + browser caching** are already enabled in `.htaccess`
  (`mod_deflate` + `mod_expires`), so CSS/JS/images compress and cache.

---

## 5. Cron — compliance renewal alerts

The compliance job is CLI-safe and also exposed as a token-guarded endpoint.

**Preferred (CLI, no HTTP exposure)** — cPanel → **Cron Jobs**, daily at 08:00:
```
0 8 * * *  /usr/local/bin/php /home/USER/construction_saas/database/cron/compliance_alerts.php >> /home/USER/construction_saas/storage/logs/cron.log 2>&1
```

**Fallback (HTTP, if CLI cron is unavailable)** — hit the token-guarded route:
```
0 8 * * *  curl -s "https://yourdomain.com/api/cron/compliance?token=YOUR_CRON_TOKEN"
```
`YOUR_CRON_TOKEN` must equal `CRON_TOKEN` in `config/.env`. The endpoint returns
403 without a valid token.

---

## 6. Go-live checklist
- [ ] DocumentRoot points at the app's `public_html` (Option A) or paths edited
      (Option B); `app/`, `core/`, `config/`, `storage/` are above the web root.
- [ ] `https://yourdomain.com/api/health` returns
      `{ "success": true, "data": { "status": "ok", "db": "ok" } }`.
- [ ] The app shell loads and you can log in / onboard a new organisation.
- [ ] `config/.env` exists, is not web-reachable
      (`https://yourdomain.com/../config/.env` → 403/404), `APP_DEBUG=false`.
- [ ] `storage/` is writable; a test upload succeeds and streams back via
      `/api/files/...` (never a direct link).
- [ ] HTTPS active; then set `SESSION_SECURE=true` and uncomment the HSTS header
      in `.htaccess`.
- [ ] Cron job configured and `storage/logs/cron.log` shows a run.

---

## 7. Future Cloud Roadmap (Docker/VPS/AWS/GCP)

The MVP was built so migration is **re-hosting, not rewriting**:

| Concern | MVP (shared hosting) | Cloud target | Change required |
|---|---|---|---|
| Runtime | mod_php / cPanel | **PHP-FPM + Nginx** in a container | Add a `Dockerfile` (php-fpm) + `nginx.conf` with the same rewrite → `index.php`. No app-code change. |
| Database | cPanel MySQL | **RDS / Cloud SQL** (managed) | Point `DB_*` env vars at the managed endpoint; import the same `schema.sql`. |
| Uploads | local `storage/uploads` | **S3 / GCS** | Add an `S3Storage` driver implementing the same `Core\Storage` interface; swap it in — `document_versions.storage_path` already stores relative keys. |
| Secrets | `config/.env` file | **Secrets Manager / SSM / env vars** | `Core\Env` already reads real env vars; mount secrets as env. |
| Cron | cPanel Cron | **ECS Scheduled Task / Cloud Scheduler / k8s CronJob** | Run the same `database/cron/compliance_alerts.php` on a schedule. |
| Sessions | file sessions | **Redis/Memcached session handler** | Set a PHP session save handler via env (stateless request handling already assumed). |
| Scaling | single host | horizontal PHP-FPM replicas behind a load balancer | Stateless requests + externalized sessions/uploads/DB make replicas trivial. |

Why it's clean: all money is `DECIMAL` (no float drift), tenancy is a single
`tenant_id` column (shard/replicate unchanged), file access is abstracted behind
`Core\Storage`, config comes from env (`Core\Env`), and there are no hard-coded
absolute paths (`BASE_PATH` is derived at runtime). A cloud move is: build the
container image, point env at managed MySQL + object storage, and schedule the
cron — the PHP and SQL are identical.

### Sketch: containerizing later
```dockerfile
# Dockerfile (illustrative — for the future cloud move, not needed at MVP)
FROM php:8.2-fpm-alpine
RUN docker-php-ext-install pdo_mysql
COPY . /var/www/app
WORKDIR /var/www/app
# Nginx (separate container) serves /var/www/app/public_html and proxies
# .php to php-fpm:9000, mirroring the shared-hosting .htaccess rewrite.
```
```
# docker-compose (illustrative)
services:
  app:   { build: ., environment: [DB_HOST, DB_NAME, DB_USER, DB_PASS, STORAGE_PATH] }
  web:   { image: nginx, ports: ["80:80"], volumes: ["./public_html:/var/www/app/public_html:ro"] }
  db:    { image: mysql:8, environment: [MYSQL_DATABASE, ...] }   # or external RDS
```

That's the whole path: the same codebase runs on a $3/month cPanel plan today
and on containers + managed services tomorrow.
