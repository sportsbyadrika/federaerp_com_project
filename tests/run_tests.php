<?php
declare(strict_types=1);

/**
 * Batch 8 — plain PHP CLI integration/smoke tests (no framework).
 * Exercises the security-critical flows against a freshly seeded database.
 *
 * Run:  php tests/run_tests.php
 * (re-seeds automatically for a known state)
 */

require dirname(__DIR__) . '/core/bootstrap.php';

use Core\Auth;
use Core\Database;
use Core\Storage;
use App\Models\GenericModel;
use App\Models\UserModel;
use App\Services\AuthService;
use App\Services\EstimationService;
use App\Services\BillingService;
use App\Services\TaskService;
use App\Services\ServiceException;

// ---- tiny test harness -----------------------------------------------------
$passed = 0; $failed = 0; $failures = [];
function ok(string $name): void { global $passed; $passed++; fwrite(STDOUT, "  \033[32m✓\033[0m {$name}\n"); }
function bad(string $name, string $why): void { global $failed, $failures; $failed++; $failures[] = "{$name}: {$why}"; fwrite(STDOUT, "  \033[31m✗\033[0m {$name} — {$why}\n"); }
function check(string $name, callable $fn): void { try { $fn() ? ok($name) : bad($name, 'assertion false'); } catch (\Throwable $e) { bad($name, get_class($e) . ': ' . $e->getMessage()); } }
function throws(string $name, string $expectCode, callable $fn): void {
    try { $fn(); bad($name, 'expected exception, none thrown'); }
    catch (ServiceException $e) { $e->code() === $expectCode ? ok($name) : bad($name, "wrong code {$e->code()} (wanted {$expectCode})"); }
    catch (\Throwable $e) { bad($name, 'unexpected ' . get_class($e) . ': ' . $e->getMessage()); }
}

// ---- fresh seed ------------------------------------------------------------
Auth::startSession();
fwrite(STDOUT, "Seeding fresh data...\n");
exec('php ' . escapeshellarg(BASE_PATH . '/database/seed.php') . ' 2>&1', $out, $rc);
if ($rc !== 0) { fwrite(STDERR, "Seed failed:\n" . implode("\n", $out) . "\n"); exit(1); }

$db = Database::instance();
const DEMO = 100200; const SUPER = 111111; const PW = 'Password123!';
$projectId = (int)$db->fetchColumn('SELECT id FROM projects WHERE tenant_id = ? LIMIT 1', [DEMO]);

$auth = new AuthService();
$users = new UserModel();

fwrite(STDOUT, "\n[1] Auth — email + password login\n");
check('valid login returns user with derived org', function () use ($auth) {
    $u = $auth->login('admin@skyline.test', PW);
    return $u['organisation_id'] === DEMO && $u['role'] === 'org_admin';
});
throws('wrong password rejected', 'invalid_credentials', fn() => $auth->login('admin@skyline.test', 'nope'));
throws('nonexistent email rejected', 'invalid_credentials', fn() => $auth->login('nobody@nowhere.test', PW));
check('super admin logs in by email only', function () use ($auth) {
    $u = $auth->login('super@platform.test', PW);
    return $u['organisation_id'] === SUPER && $u['role'] === 'super_admin';
});

fwrite(STDOUT, "\n[2] Email is globally unique\n");
check('email resolves to exactly one account (global lookup)', function () use ($users) {
    $a = $users->findByEmail('admin@skyline.test');
    return $a && $a['organisation_id'] === DEMO && $a['role'] === 'org_admin';
});
check('emailExists() detects a taken email across the platform', function () use ($users) {
    return $users->emailExists('pm@skyline.test') && !$users->emailExists('free@example.test');
});

fwrite(STDOUT, "\n[3] Super Admin cross-org vs tenant hard-scoping\n");
check('Super Admin can enumerate all organisations', function () use ($auth) {
    return count($auth->listOrganisations()) >= 2;
});
check('Org Admin CANNOT read another tenant project (scoped find = null)', function () use ($projectId) {
    $projects = new GenericModel('projects', [], softDelete: true);
    // demo project read as a different tenant (the rival/other org) must be null
    return $projects->find($projectId, 999001) === null
        && $projects->find($projectId, DEMO) !== null;
});
check('tenant-scoped list never returns other tenants rows', function () {
    $projects = new GenericModel('projects', [], softDelete: true);
    foreach ($projects->forTenant(DEMO) as $p) {
        if ((int)$p['tenant_id'] !== DEMO) return false;
    }
    return true;
});

fwrite(STDOUT, "\n[4] Estimation engine math\n");
check('calculate() grand_total = 2530 (subtotal 2000 +10% +15%)', function () {
    $svc = new EstimationService();
    $r = $svc->calculate(DEMO, [
        'overhead_percent' => 10, 'margin_percent' => 15,
        'line_items' => [
            ['line_type' => 'material', 'description' => 'W', 'quantity' => 100, 'rate' => 10],
            ['line_type' => 'labour', 'description' => 'L', 'quantity' => 50, 'rate' => 20],
        ],
    ]);
    return abs($r['grand_total'] - 2530.00) < 0.001
        && abs($r['overhead_amount'] - 200.00) < 0.001
        && abs($r['margin_amount'] - 330.00) < 0.001;
});
check('material wastage is applied, labour has none', function () {
    $svc = new EstimationService();
    $r = $svc->calculate(DEMO, ['line_items' => [
        ['line_type' => 'material', 'quantity' => 100, 'rate' => 10, 'wastage_percent' => 5], // 1050
    ]]);
    return abs($r['materials_total'] - 1050.00) < 0.001;
});

fwrite(STDOUT, "\n[5] Settlement engine math\n");
check('settlement net = -18750 on seed data', function () use ($projectId) {
    $svc = new BillingService();
    $s = $svc->settlement(DEMO, $projectId);
    return abs($s['net_settlement'] - (-18750.00)) < 0.001
        && abs($s['total_invoiced'] - 131250.00) < 0.001
        && abs($s['sum_net_payable'] - 100000.00) < 0.001;
});
check('settlement rejects cross-tenant project', function () use ($projectId) {
    $svc = new BillingService();
    try { $svc->settlement(999001, $projectId); return false; }
    catch (ServiceException $e) { return $e->code() === 'not_found'; }
});

fwrite(STDOUT, "\n[6] Kanban move persistence\n");
check('move re-parents task and densely renumbers columns', function () use ($db, $projectId) {
    $svc = new TaskService();
    $todo = (int)$db->fetchColumn("SELECT id FROM task_statuses WHERE tenant_id=? AND project_id=? AND name='To Do'", [DEMO, $projectId]);
    $done = (int)$db->fetchColumn("SELECT id FROM task_statuses WHERE tenant_id=? AND project_id=? AND name='Done'", [DEMO, $projectId]);
    $taskId = (int)$db->fetchColumn('SELECT id FROM tasks WHERE tenant_id=? AND project_id=? AND status_id=? LIMIT 1', [DEMO, $projectId, $todo]);
    $moved = $svc->move(DEMO, $taskId, $done, 0);
    if ((int)$moved['status_id'] !== $done || (int)$moved['sort_order'] !== 0) return false;
    // destination column positions must be dense 0..n-1
    $orders = $db->fetchAll('SELECT sort_order FROM tasks WHERE tenant_id=? AND project_id=? AND status_id=? ORDER BY sort_order', [DEMO, $projectId, $done]);
    foreach ($orders as $i => $row) { if ((int)$row['sort_order'] !== $i) return false; }
    return true;
});
check('move rejects a status from another project/tenant', function () use ($db, $projectId) {
    $svc = new TaskService();
    $taskId = (int)$db->fetchColumn('SELECT id FROM tasks WHERE tenant_id=? AND project_id=? LIMIT 1', [DEMO, $projectId]);
    try { $svc->move(DEMO, $taskId, 999999, 0); return false; }
    catch (ServiceException $e) { return $e->code() === 'unprocessable'; }
});

fwrite(STDOUT, "\n[7] Secure storage / upload guards\n");
check('path traversal is blocked', function () {
    $s = new Storage();
    try { $s->absolutePath('../../../../etc/passwd'); return false; }
    catch (\RuntimeException) { return true; }
});
check('non-uploaded file is rejected', function () {
    $s = new Storage();
    $tmp = tempnam(sys_get_temp_dir(), 'csaas');
    file_put_contents($tmp, 'x');
    try { $s->storeUpload(['tmp_name' => $tmp, 'name' => 'x.exe', 'size' => 1, 'error' => 0], DEMO); return false; }
    catch (\RuntimeException) { return true; }
    finally { @unlink($tmp); }
});

fwrite(STDOUT, "\n[8] Password hashing\n");
check('passwords are bcrypt/argon hashed, never plaintext', function () use ($db) {
    $hash = (string)$db->fetchColumn("SELECT password_hash FROM users WHERE organisation_id=? AND email='admin@skyline.test'", [DEMO]);
    return $hash !== PW && password_verify(PW, $hash);
});

fwrite(STDOUT, "\n[9] Forgot / reset password token flow\n");
check('reset token is created and lets the user set a new password', function () use ($auth, $db) {
    $auth->forgotPassword('admin@skyline.test');            // mailer falls back to log
    $row = $db->fetch("SELECT * FROM password_resets WHERE email='admin@skyline.test' AND used_at IS NULL ORDER BY id DESC LIMIT 1");
    if (!$row) return false;
    // We can't read the emailed token, but a wrong token must fail and expiry logic must hold.
    try { $auth->resetPassword('not-the-real-token', 'BrandNewPass1'); return false; }
    catch (ServiceException $e) { return $e->code() === 'invalid_token'; }
});
check('reset with the real token succeeds, old password stops working', function () use ($auth, $db) {
    // Insert a known token directly (simulating the emailed one) to exercise reset.
    $userId = (int)$db->fetchColumn("SELECT id FROM users WHERE email='supervisor@skyline.test'");
    $token = 'testtoken_' . bin2hex(random_bytes(6));
    $db->execute("INSERT INTO password_resets (user_id,email,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))",
        [$userId, 'supervisor@skyline.test', hash('sha256', $token)]);
    $auth->resetPassword($token, 'ResetPass2026');
    try { $auth->login('supervisor@skyline.test', PW); return false; }        // old pw
    catch (ServiceException) { /* expected */ }
    $u = $auth->login('supervisor@skyline.test', 'ResetPass2026');            // new pw
    return $u['role'] === 'staff';
});

fwrite(STDOUT, "\n[10] Project type, floors & BOQ\n");
check('project carries a type; floors + BOQ persist and total correctly', function () use ($db, $projectId) {
    $svc = new \App\Services\ProjectService();
    $type = (string)$db->fetchColumn('SELECT project_type FROM projects WHERE id=?', [$projectId]);
    if (!in_array($type, ['new', 'renovation'], true)) return false;
    $floors = $svc->listFloors(DEMO, $projectId);
    if (count($floors) < 3) return false;
    $boq = $svc->listBoq(DEMO, $projectId);
    // seed BOQ: GF 120*180 + 400*32 + F1 95*180 + F2 95*180 + 15000 = 21600+12800+17100+17100+15000
    return abs($boq['total'] - 83600.00) < 0.01 && count($boq['items']) === 5;
});
check('saveBoq replaces items and recomputes amounts; cross-tenant blocked', function () use ($projectId) {
    $svc = new \App\Services\ProjectService();
    $res = $svc->saveBoq(DEMO, $projectId, [
        ['description' => 'Test item', 'unit' => 'nos', 'quantity' => 10, 'rate' => 25],
    ]);
    if (count($res['items']) !== 1 || abs($res['total'] - 250.00) > 0.01) return false;
    try { $svc->saveBoq(999001, $projectId, [['description' => 'x', 'quantity' => 1, 'rate' => 1]]); return false; }
    catch (ServiceException $e) { return $e->code() === 'not_found'; }
});

// ---- summary ---------------------------------------------------------------
fwrite(STDOUT, "\n" . str_repeat('─', 50) . "\n");
fwrite(STDOUT, "Passed: {$passed}  Failed: {$failed}\n");
if ($failed > 0) {
    fwrite(STDOUT, "\nFailures:\n - " . implode("\n - ", $failures) . "\n");
    exit(1);
}
fwrite(STDOUT, "\033[32mAll tests passed.\033[0m\n");
exit(0);
