# Database migrations

Incremental schema/data changes applied automatically by `database/migrate.php`
(and on every cPanel deploy). The full baseline lives in `database/schema.sql`
and is tracked as `0000_baseline_schema`; put every change *after* the initial
release in this folder.

## Naming
Files are applied in **filename order**, so zero-pad a sequential prefix:

```
0001_add_projects_priority.sql
0002_backfill_client_country.php
```

Each file runs **once** and is recorded in the `schema_migrations` table.
Never edit or renumber a migration that has already been deployed — add a new
one instead.

## SQL migration example — `0001_add_projects_priority.sql`
```sql
ALTER TABLE projects
    ADD COLUMN priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium';
CREATE INDEX idx_projects_priority ON projects (tenant_id, priority);
```
Multiple `;`-separated statements are supported (quotes/comments are handled).
Prefer additive, reversible-in-spirit changes; use `IF NOT EXISTS` where your
MySQL version supports it so partial re-imports stay safe.

## PHP migration example (data backfill) — `0002_backfill_client_country.php`
```php
<?php
return function (\Core\Database $db): void {
    $db->execute("UPDATE clients SET country = 'USA' WHERE country IS NULL AND tenant_id > 0");
};
```

## Running manually
```bash
php database/migrate.php            # apply pending migrations
php database/migrate.php --status   # show applied vs pending (applies nothing)
```

On cPanel this runs automatically after files are copied (see `.cpanel.yml`);
it is a no-op when everything is already up to date, and it skips safely if the
database isn't configured yet.
