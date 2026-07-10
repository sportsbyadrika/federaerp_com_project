<?php
declare(strict_types=1);

/**
 * Super Admin provisioning (CLI only).
 *
 * Creates — or resets the password of — a Super Admin in the reserved platform
 * organisation 111111, with credentials YOU choose. Unlike seed.php it inserts
 * no demo data and touches nothing else.
 *
 * Usage:
 *   php database/create_admin.php --email=you@example.com --name="Site Admin"
 *       (you will be prompted for the password, hidden)
 *
 *   php database/create_admin.php --email=you@example.com --password='S3cret!' --name="Site Admin"
 *       (non-interactive; note the password may show in shell history / ps)
 *
 *   php database/create_admin.php --email=you@example.com --reset
 *       (reset the password of an existing Super Admin)
 *
 * Login afterwards with:  Organisation ID 111111  +  that email  +  that password
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script can only be run from the command line.\n");
}

require dirname(__DIR__) . '/core/bootstrap.php';

use App\Models\OrganisationModel;
use App\Models\UserModel;
use Core\Database;
use Core\Env;

const PLATFORM_ORG = 111111;

// ---- parse CLI args --------------------------------------------------------
$opts = parseArgs($argv);
if (isset($opts['help']) || isset($opts['h'])) {
    printUsage();
    exit(0);
}

// ---- ensure the DB is configured + reachable -------------------------------
if (!is_file(BASE_PATH . '/config/.env') && Env::get('DB_NAME') === null) {
    fail("config/.env is missing. Configure your database credentials first.");
}
$dbUser = (string)Env::get('DB_USER', '');
$dbPass = (string)Env::get('DB_PASS', '');
if ($dbUser === 'db_user' && $dbPass === 'db_password') {
    fail("config/.env still has the example placeholder credentials. Set your real DB_* values first.");
}
try {
    $db = Database::instance();
    $db->fetchColumn('SELECT 1');
} catch (\Throwable $e) {
    fail("Cannot connect to the database: " . $e->getMessage());
}

// ---- collect inputs --------------------------------------------------------
$email = strtolower(trim((string)($opts['email'] ?? prompt("Super Admin email: "))));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail("Invalid email address.");
}
$name = trim((string)($opts['name'] ?? 'Super Admin'));

$password = $opts['password'] ?? null;
if ($password === null) {
    $password = promptHidden("Password (min 8 chars): ");
    $confirm = promptHidden("Confirm password: ");
    if ($password !== $confirm) {
        fail("Passwords do not match.");
    }
}
if (strlen((string)$password) < 8) {
    fail("Password must be at least 8 characters.");
}

// ---- ensure the platform organisation exists -------------------------------
$orgs = new OrganisationModel();
$users = new UserModel();

if (!$orgs->existsById(PLATFORM_ORG)) {
    $orgs->create([
        'id'          => PLATFORM_ORG,
        'name'        => 'Platform Operator',
        'is_platform' => 1,
        'currency'    => 'USD',
        'status'      => 'active',
    ]);
    info("Created reserved platform organisation " . PLATFORM_ORG . ".");
}

// ---- create or reset the Super Admin ---------------------------------------
$existing = $users->findByOrgAndEmail(PLATFORM_ORG, $email);
$hash = password_hash((string)$password, PASSWORD_DEFAULT);

if ($existing !== null) {
    if (!isset($opts['reset'])) {
        fail("A user with email {$email} already exists in org " . PLATFORM_ORG . ".\n"
           . "       Re-run with --reset to change its password / promote it to Super Admin.");
    }
    $db->execute(
        "UPDATE users SET password_hash = :h, role = 'super_admin', status = 'active', name = :n
          WHERE id = :id",
        [':h' => $hash, ':n' => $name, ':id' => (int)$existing['id']]
    );
    success("Password reset for Super Admin {$email}.");
} else {
    $users->create([
        'organisation_id' => PLATFORM_ORG,
        'name'            => $name,
        'email'           => $email,
        'password_hash'   => $hash,
        'role'            => 'super_admin',
        'job_role'        => 'owner',
        'status'          => 'active',
    ]);
    success("Super Admin created: {$email}");
}

echo "\n";
echo "Log in with:\n";
echo "  Organisation ID : " . PLATFORM_ORG . "\n";
echo "  Email           : {$email}\n";
echo "  Password        : (the one you just set)\n";
exit(0);

// ===========================================================================
function parseArgs(array $argv): array
{
    $out = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (preg_match('/^--([a-zA-Z0-9_]+)(?:=(.*))?$/', $arg, $m)) {
            $out[$m[1]] = $m[2] ?? true;
        } elseif (preg_match('/^-([a-zA-Z])$/', $arg, $m)) {
            $out[$m[1]] = true;
        }
    }
    return $out;
}

function prompt(string $label): string
{
    fwrite(STDOUT, $label);
    $line = fgets(STDIN);
    return $line === false ? '' : rtrim($line, "\r\n");
}

function promptHidden(string $label): string
{
    fwrite(STDOUT, $label);
    // Best-effort hidden input; falls back to visible if stty is unavailable.
    $hasStty = false;
    if (function_exists('shell_exec')) {
        $ret = @shell_exec('stty -echo 2>/dev/null; echo ok');
        $hasStty = is_string($ret) && str_contains($ret, 'ok');
    }
    $line = fgets(STDIN);
    if ($hasStty) {
        @shell_exec('stty echo 2>/dev/null');
        fwrite(STDOUT, "\n");
    }
    return $line === false ? '' : rtrim($line, "\r\n");
}

function printUsage(): void
{
    fwrite(STDOUT, <<<TXT
    Super Admin provisioning (organisation 111111)

    Usage:
      php database/create_admin.php --email=you@example.com [--name="Site Admin"]
      php database/create_admin.php --email=you@example.com --password='S3cret!' [--name="..."]
      php database/create_admin.php --email=you@example.com --reset

    Options:
      --email=EMAIL      Super Admin email (prompted if omitted)
      --password=PASS    Password (prompted, hidden, if omitted)
      --name=NAME        Display name (default "Super Admin")
      --reset            Reset the password of an existing Super Admin
      -h, --help         Show this help

    TXT);
}

function info(string $m): void { fwrite(STDOUT, "  " . $m . "\n"); }
function success(string $m): void { fwrite(STDOUT, "\033[32m✓ " . $m . "\033[0m\n"); }
function fail(string $m): void { fwrite(STDERR, "\033[31mError:\033[0m " . $m . "\n"); exit(1); }
