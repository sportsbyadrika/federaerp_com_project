<?php
declare(strict_types=1);

/**
 * Database migration runner (CLI). Applies, in order and exactly once:
 *   1. the baseline schema (database/schema.sql, tracked as "0000_baseline_schema")
 *   2. every incremental migration in database/migrations/ (NNNN_name.sql | .php)
 *
 * Applied migrations are recorded in the `schema_migrations` table, so re-runs
 * are safe and only pending files execute. Designed to be called on every
 * cPanel deploy so the database auto-updates.
 *
 *   php database/migrate.php            # apply pending migrations
 *   php database/migrate.php --status   # list applied vs pending, apply nothing
 *
 * Exit codes: 0 = success / nothing to do / DB not configured yet (skipped),
 *             1 = a migration failed or the DB is configured but unreachable.
 *
 * Add a schema change: create database/migrations/0001_add_something.sql with
 * the ALTER/CREATE statements (or a .php file returning fn(\Core\Database $db)).
 */

require dirname(__DIR__) . '/core/bootstrap.php';

use Core\Database;
use Core\Env;

$statusOnly = in_array('--status', $argv, true);

// If the app hasn't been configured yet, skip quietly (exit 0) so a first
// deploy never fails before the admin has set real DB credentials:
//   (a) no config/.env at all, or
//   (b) .env still carries the .env.example placeholder credentials.
$envFile = BASE_PATH . '/config/.env';
if (!is_file($envFile) && Env::get('DB_NAME') === null) {
    fwrite(STDOUT, "[migrate] No config/.env yet — skipping migrations (configure the DB, then redeploy).\n");
    exit(0);
}
$dbUser = (string)Env::get('DB_USER', '');
$dbPass = (string)Env::get('DB_PASS', '');
if ($dbUser === 'db_user' && $dbPass === 'db_password') {
    fwrite(STDOUT, "[migrate] config/.env still has placeholder credentials — skipping migrations (set real DB creds, then redeploy).\n");
    exit(0);
}

try {
    $db = Database::instance();
    $db->fetchColumn('SELECT 1');
} catch (\Throwable $e) {
    fwrite(STDERR, "[migrate] Database is configured but unreachable: " . $e->getMessage() . "\n");
    exit(1);
}

ensureMigrationsTable($db);
$applied = appliedMigrations($db);
$plan = buildPlan();

if ($statusOnly) {
    fwrite(STDOUT, "Applied migrations:\n");
    foreach ($plan as $m) {
        $mark = isset($applied[$m['name']]) ? "\033[32m✓ applied\033[0m" : "\033[33m• pending\033[0m";
        fwrite(STDOUT, sprintf("  %s  %s\n", $mark, $m['name']));
    }
    exit(0);
}

$pending = array_values(array_filter($plan, static fn($m) => !isset($applied[$m['name']])));
if (!$pending) {
    fwrite(STDOUT, "[migrate] Database is up to date — nothing to apply.\n");
    exit(0);
}

$batch = nextBatch($db);
$count = 0;
foreach ($pending as $m) {
    fwrite(STDOUT, "[migrate] Applying {$m['name']} ...\n");
    try {
        if ($m['type'] === 'php') {
            $fn = require $m['path'];
            if (is_callable($fn)) {
                $fn($db);
            }
        } else {
            runSqlFile($db, $m['path']);
        }
        recordMigration($db, $m['name'], $batch);
        $count++;
    } catch (\Throwable $e) {
        fwrite(STDERR, "[migrate] FAILED on {$m['name']}: " . $e->getMessage() . "\n");
        exit(1);
    }
}
fwrite(STDOUT, "\033[32m[migrate] Applied {$count} migration(s) (batch {$batch}).\033[0m\n");
exit(0);

// ---------------------------------------------------------------------------
function ensureMigrationsTable(Database $db): void
{
    $db->execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            migration  VARCHAR(191) NOT NULL,
            batch      INT UNSIGNED NOT NULL DEFAULT 1,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_schema_migration (migration)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

/** @return array<string,bool> applied migration name => true */
function appliedMigrations(Database $db): array
{
    $rows = $db->fetchAll('SELECT migration FROM schema_migrations');
    $out = [];
    foreach ($rows as $r) {
        $out[$r['migration']] = true;
    }
    return $out;
}

function nextBatch(Database $db): int
{
    return (int)$db->fetchColumn('SELECT COALESCE(MAX(batch),0) + 1 FROM schema_migrations');
}

function recordMigration(Database $db, string $name, int $batch): void
{
    $db->execute(
        'INSERT INTO schema_migrations (migration, batch) VALUES (:m, :b)',
        [':m' => $name, ':b' => $batch]
    );
}

/**
 * Ordered plan: baseline schema first, then migrations/ files sorted by name.
 * @return array<int,array{name:string,path:string,type:string}>
 */
function buildPlan(): array
{
    $plan = [[
        'name' => '0000_baseline_schema',
        'path' => BASE_PATH . '/database/schema.sql',
        'type' => 'sql',
    ]];

    $dir = BASE_PATH . '/database/migrations';
    $files = glob($dir . '/*.{sql,php}', GLOB_BRACE) ?: [];
    sort($files, SORT_STRING);
    foreach ($files as $file) {
        $plan[] = [
            'name' => pathinfo($file, PATHINFO_FILENAME),
            'path' => $file,
            'type' => strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'php' ? 'php' : 'sql',
        ];
    }
    return $plan;
}

function runSqlFile(Database $db, string $path): void
{
    $sql = file_get_contents($path);
    if ($sql === false) {
        throw new \RuntimeException("Cannot read migration file: {$path}");
    }
    foreach (splitSqlStatements($sql) as $statement) {
        $db->pdo()->exec($statement);
    }
}

/**
 * Split a SQL script into individual statements, honoring quoted strings,
 * backtick identifiers, and -- / # / block comments so semicolons inside them
 * don't split a statement.
 * @return string[]
 */
function splitSqlStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $len = strlen($sql);
    $inSingle = $inDouble = $inBacktick = false;
    $inLineComment = $inBlockComment = false;

    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';

        if ($inLineComment) {
            if ($ch === "\n") { $inLineComment = false; $buffer .= $ch; }
            continue;
        }
        if ($inBlockComment) {
            if ($ch === '*' && $next === '/') { $inBlockComment = false; $i++; }
            continue;
        }
        if (!$inSingle && !$inDouble && !$inBacktick) {
            if (($ch === '-' && $next === '-') || $ch === '#') { $inLineComment = true; continue; }
            if ($ch === '/' && $next === '*') { $inBlockComment = true; $i++; continue; }
        }

        if ($ch === "'" && !$inDouble && !$inBacktick) {
            $inSingle = !$inSingle;
        } elseif ($ch === '"' && !$inSingle && !$inBacktick) {
            $inDouble = !$inDouble;
        } elseif ($ch === '`' && !$inSingle && !$inDouble) {
            $inBacktick = !$inBacktick;
        }

        if ($ch === ';' && !$inSingle && !$inDouble && !$inBacktick) {
            $trimmed = trim($buffer);
            if ($trimmed !== '') {
                $statements[] = $trimmed;
            }
            $buffer = '';
            continue;
        }
        $buffer .= $ch;
    }

    $trimmed = trim($buffer);
    if ($trimmed !== '') {
        $statements[] = $trimmed;
    }
    return $statements;
}
