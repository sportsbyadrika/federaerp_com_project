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
$clientId = (int)$db->fetchColumn('SELECT id FROM clients WHERE tenant_id = ? LIMIT 1', [DEMO]);

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
check('tasks: direct + from-BOQ create, floor swimlanes, materials & labour CRUD', function () use ($db, $projectId) {
    $svc = new TaskService();
    $todo = (int)$db->fetchColumn("SELECT id FROM task_statuses WHERE tenant_id=? AND project_id=? AND name='To Do'", [DEMO, $projectId]);
    $floorId = (int)$db->fetchColumn('SELECT id FROM project_floors WHERE tenant_id=? AND project_id=? LIMIT 1', [DEMO, $projectId]);
    // Direct task with floor + percentage; title derives from item_head when blank.
    $direct = $svc->create(DEMO, ['project_id' => $projectId, 'status_id' => $todo, 'source' => 'direct',
        'project_floor_id' => $floorId, 'item_code' => 'CIV-9', 'item_head' => 'Slab casting', 'percentage' => 25]);
    if ($direct['title'] !== 'Slab casting' || (int)$direct['project_floor_id'] !== $floorId || (float)$direct['percentage'] !== 25.0) return false;
    // From-BOQ task carries the entry link.
    $entryId = (int)$db->fetchColumn('SELECT id FROM boq_entries WHERE tenant_id=? AND project_id=? LIMIT 1', [DEMO, $projectId]);
    $boqTask = $svc->create(DEMO, ['project_id' => $projectId, 'status_id' => $todo, 'source' => 'boq',
        'boq_entry_id' => $entryId, 'project_floor_id' => $floorId, 'item_head' => 'From BOQ', 'percentage' => 10]);
    if ($boqTask['source'] !== 'boq' || (int)$boqTask['boq_entry_id'] !== $entryId) return false;
    // Board exposes floor swimlanes + resource counts.
    $board = $svc->board(DEMO, $projectId);
    if (!isset($board['floors']) || !count($board['floors'])) return false;
    // Materials CRUD
    $tid = (int)$direct['id'];
    $mat = $svc->addMaterial(DEMO, $tid, null, ['item_name' => 'Cement', 'unit' => 'bag', 'quantity' => 40]);
    if ($mat['item_name'] !== 'Cement') return false;
    if (count($svc->listMaterials(DEMO, $tid)) !== 1) return false;
    $svc->deleteMaterial(DEMO, (int)$mat['id']);
    if (count($svc->listMaterials(DEMO, $tid)) !== 0) return false;
    // Labour CRUD
    $lab = $svc->addLabour(DEMO, $tid, null, ['worker_name' => 'Mason team', 'trade' => 'Masonry', 'headcount' => 4, 'hours' => 8]);
    if ((int)$lab['headcount'] !== 4) return false;
    if (count($svc->listLabour(DEMO, $tid)) !== 1) return false;
    $svc->deleteLabour(DEMO, (int)$lab['id']);
    // A blank date string must be stored as NULL (MySQL strict mode rejects '').
    $blankDate = $svc->addMaterial(DEMO, $tid, null, ['item_name' => 'Gravel', 'unit' => 'cu.m', 'quantity' => 1, 'used_date' => '']);
    if ($blankDate['used_date'] !== null) return false;
    $svc->deleteMaterial(DEMO, (int)$blankDate['id']);
    // Board count reflects materials/labour on a card (add one back)
    $svc->addMaterial(DEMO, $tid, null, ['item_name' => 'Sand', 'unit' => 'cu.m', 'quantity' => 2]);
    $board2 = $svc->board(DEMO, $projectId);
    $found = false;
    foreach ($board2['columns'] as $col) { foreach ($col['tasks'] as $t) { if ((int)$t['id'] === $tid && (int)$t['materials_count'] === 1) $found = true; } }
    return $found;
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
check('project carries a type; floors + BOQ entries/lines total correctly', function () use ($db, $projectId) {
    $svc = new \App\Services\ProjectService();
    $type = (string)$db->fetchColumn('SELECT project_type FROM projects WHERE id=?', [$projectId]);
    if (!in_array($type, ['new', 'renovation'], true)) return false;
    if (count($svc->listFloors(DEMO, $projectId)) < 3) return false;
    $boq = $svc->listBoq(DEMO, $projectId);
    // seed: RCC(120*180+95*180+95*180=55800) + Brick(400*32=12800) + Mob(15000) = 83600
    return abs($boq['total'] - 83600.00) < 0.01 && count($boq['entries']) === 3;
});
check('saveBoqEntry creates entry+lines, update recomputes, delete works; cross-tenant blocked', function () use ($projectId) {
    $svc = new \App\Services\ProjectService();
    $floors = $svc->listFloors(DEMO, $projectId);
    $fid = (int)$floors[0]['id'];
    $entry = $svc->saveBoqEntry(DEMO, $projectId, [
        'item_head' => 'Test Item', 'item_code' => 'TST-1', 'unit' => 'nos',
        'lines' => [['project_floor_id' => $fid, 'quantity' => 10, 'rate' => 25], ['project_floor_id' => null, 'quantity' => 2, 'rate' => 100]],
    ]);
    if (abs($entry['entry_total'] - 450.00) > 0.01 || count($entry['lines']) !== 2) return false;
    $upd = $svc->updateBoqEntry(DEMO, (int)$entry['id'], ['lines' => [['project_floor_id' => $fid, 'quantity' => 5, 'rate' => 10]]]);
    if (abs($upd['entry_total'] - 50.00) > 0.01) return false;
    $svc->deleteBoqEntry(DEMO, (int)$entry['id']);
    try { $svc->saveBoqEntry(999001, $projectId, ['item_head' => 'x', 'lines' => []]); return false; }
    catch (ServiceException $e) { return $e->code() === 'not_found'; }
});
check('institution settings: GST/PAN/letterhead update + party GST/PAN persist', function () use ($db) {
    $svc = new \App\Services\OrganisationService();
    $before = $svc->get(DEMO);
    if ($before['gst_number'] !== '29ABCDE1234F1Z5' || $before['pan'] !== 'ABCDE1234F') return false;
    $upd = $svc->update(DEMO, ['gst_number' => '29ZZZZZ0000Z1Z9', 'letterhead_address' => 'New Address Line', 'legal_name' => 'Skyline Renamed Pvt Ltd']);
    if ($upd['gst_number'] !== '29ZZZZZ0000Z1Z9' || $upd['letterhead_address'] !== 'New Address Line') return false;
    // party masters carry GST + PAN (tax_number renamed)
    $client = $db->fetch('SELECT gst_number, pan FROM clients WHERE tenant_id=? LIMIT 1', [DEMO]);
    $sub = $db->fetch('SELECT gst_number, pan FROM subcontractors WHERE tenant_id=? LIMIT 1', [DEMO]);
    $noTax = (int)$db->fetchColumn("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='suppliers' AND column_name='tax_number'");
    return $client && $client['pan'] === 'HARBR5678K' && $sub && $sub['gst_number'] === '29STEEL9012L1Z8' && $noTax === 0;
});
check('construction stages: per-record create/update/delete + totals', function () use ($projectId) {
    $svc = new \App\Services\ProjectService();
    $s = $svc->listStages(DEMO, $projectId);
    if (abs($s['grand_total'] - 500000.00) > 0.01 || abs($s['difference'] - 0.00) > 0.01 || count($s['stages']) !== 3) return false;
    $after = $svc->createStage(DEMO, $projectId, ['phase_no' => 4, 'details' => 'Extra', 'percentage' => 5, 'amount' => 25000]);
    if (count($after['stages']) !== 4 || abs($after['difference'] - (-25000.00)) > 0.01) return false;
    $newId = (int)$after['stages'][3]['id'];
    $upd = $svc->updateStage(DEMO, $newId, ['amount' => 10000]);
    if (abs($upd['grand_total'] - 510000.00) > 0.01) return false;
    $del = $svc->deleteStage(DEMO, $newId);
    return count($del['stages']) === 3 && abs($del['difference'] - 0.00) < 0.01;
});
check('expenditure: GST base/gst/total, joins, scope filters + CRUD', function () use ($projectId) {
    $svc = new \App\Services\ExpenditureService();
    $all = $svc->list(DEMO);
    // seed: base 42000+18000+6500 = 66500; GST 7560 (18% on materials); total 74060
    if (abs($all['base'] - 66500.00) > 0.01 || abs($all['gst'] - 7560.00) > 0.01 || abs($all['total'] - 74060.00) > 0.01) return false;
    $proj = $svc->list(DEMO, ['scope' => 'project']);
    $inst = $svc->list(DEMO, ['scope' => 'institutional']);
    if (abs($proj['total'] - 67560.00) > 0.01 || abs($inst['total'] - 6500.00) > 0.01) return false;
    // create computes GST amount + total from base + gst%
    $row = $svc->create(DEMO, null, ['scope' => 'project', 'project_id' => $projectId, 'party_type' => 'supplier', 'amount' => 1000, 'gst_percent' => 18, 'mode' => 'dd', 'expense_date' => '2026-05-01']);
    if (abs((float)$row['gst_amount'] - 180.00) > 0.01 || abs((float)$row['total_amount'] - 1180.00) > 0.01) return false;
    $upd = $svc->update(DEMO, (int)$row['id'], ['scope' => 'project', 'project_id' => $projectId, 'amount' => 2000, 'gst_percent' => 5, 'expense_date' => '2026-05-01']);
    if (abs((float)$upd['gst_amount'] - 100.00) > 0.01 || abs((float)$upd['total_amount'] - 2100.00) > 0.01) return false;
    $svc->delete(DEMO, (int)$row['id']);
    return true;
});
check('income: GST computed; receipt data; cross-tenant blocked', function () use ($projectId, $clientId) {
    $svc = new \App\Services\IncomeService();
    $list = $svc->list(DEMO, $projectId);
    if (abs($list['total'] - 118000.00) > 0.01) return false;   // 100000 + 18% GST
    $r = $svc->create(DEMO, null, ['project_id' => $projectId, 'client_id' => $clientId, 'amount' => 50000, 'gst_percent' => 18, 'income_date' => '2026-05-05']);
    if (abs((float)$r['gst_amount'] - 9000.00) > 0.01 || abs((float)$r['total_amount'] - 59000.00) > 0.01) return false;
    if (empty($r['project_name'])) return false;                // receipt needs joined names
    try { $svc->get(999001, (int)$r['id']); return false; }
    catch (ServiceException $e) { return $e->code() === 'not_found'; }
});
check('project carries a currency (per-project)', function () use ($db, $projectId) {
    $sym = (string)$db->fetchColumn('SELECT currency_symbol FROM projects WHERE id=?', [$projectId]);
    return $sym === '₹';
});
check('currency: default is set and mirrored to the organisation', function () use ($db) {
    $svc = new \App\Services\CurrencyService();
    $def = $svc->default(DEMO);
    if ($def['code'] !== 'INR' || $def['symbol'] !== '₹') return false;
    $eur = $svc->create(DEMO, ['code' => 'EUR', 'symbol' => '€', 'is_default' => true]);
    $now = $svc->default(DEMO);
    if ($now['code'] !== 'EUR' || (string)$db->fetchColumn('SELECT currency_symbol FROM organisations WHERE id=?', [DEMO]) !== '€') return false;
    // Editing the default currency's symbol mirrors onto the organisation.
    $svc->update(DEMO, (int)$eur['id'], ['code' => 'EUR', 'symbol' => 'EU']);
    return $svc->default(DEMO)['symbol'] === 'EU';
});

fwrite(STDOUT, "\n[11] Staff master + dashboard task-based progress\n");
check('staff: tenant-scoped CRUD via master resource', function () use ($db) {
    $m = new \App\Models\GenericModel('staff_members', ['tenant_id','staff_code','name','phone','email','staff_type','address','pan','status'], softDelete: true);
    if (count($m->forTenant(DEMO)) < 3) return false;              // seeded rows
    $id = $m->create(['tenant_id' => DEMO, 'staff_code' => 'STF-900', 'name' => 'Test Staff', 'staff_type' => 'skilled', 'pan' => 'ZZZPT9999Z']);
    $row = $m->findOrFail($id, DEMO);
    if ($row['staff_type'] !== 'skilled' || $row['pan'] !== 'ZZZPT9999Z') return false;
    $m->update($id, DEMO, ['staff_type' => 'unskilled', 'phone' => '999']);
    if ($m->findOrFail($id, DEMO)['staff_type'] !== 'unskilled') return false;
    $m->delete($id, DEMO);
    try { $m->findOrFail($id, DEMO); return false; } catch (ServiceException $e) { /* soft-deleted */ }
    try { $m->findOrFail(999999, DEMO); return false; } catch (ServiceException $e) { return $e->code() === 'not_found'; }
});
check('projects: contract GST computed on create + update', function () use ($db) {
    $svc = new \App\Services\ProjectService();
    $p = $svc->createProject(DEMO, ['name' => 'GST Contract Test', 'contract_value' => 500000, 'contract_gst_percent' => 18]);
    if (abs((float)$p['contract_gst_amount'] - 90000.00) > 0.01 || abs((float)$p['contract_total'] - 590000.00) > 0.01) return false;
    // Changing only the % recomputes the GST amount + total from the stored base.
    $u = $svc->updateProject(DEMO, (int)$p['id'], ['contract_gst_percent' => 5]);
    if (abs((float)$u['contract_gst_amount'] - 25000.00) > 0.01 || abs((float)$u['contract_total'] - 525000.00) > 0.01) return false;
    $svc->deleteProject(DEMO, (int)$p['id']);
    return true;
});
check('projects: map location persists; blank coords normalise to NULL', function () {
    $svc = new \App\Services\ProjectService();
    $p = $svc->createProject(DEMO, ['name' => 'Located', 'latitude' => 12.9716, 'longitude' => 77.5946]);
    if (abs((float)$p['latitude'] - 12.9716) > 0.0001 || abs((float)$p['longitude'] - 77.5946) > 0.0001) return false;
    $cleared = $svc->updateProject(DEMO, (int)$p['id'], ['latitude' => '', 'longitude' => '']);
    if ($cleared['latitude'] !== null || $cleared['longitude'] !== null) return false;
    $reset = $svc->updateProject(DEMO, (int)$p['id'], ['latitude' => 19.076, 'longitude' => 72.8777]);
    $ok = abs((float)$reset['latitude'] - 19.076) < 0.0001;
    $svc->deleteProject(DEMO, (int)$p['id']);
    return $ok;
});
check('projects: financial summary rolls up income/expense per project + totals', function () use ($db, $projectId) {
    $svc = new \App\Services\ProjectService();
    $sum = $svc->financialSummary(DEMO);
    if (!isset($sum['projects'], $sum['totals'])) return false;
    $row = null;
    foreach ($sum['projects'] as $r) { if ((int)$r['id'] === $projectId) { $row = $r; break; } }
    if ($row === null) return false;
    // Match the rollup against direct DB sums for this project.
    $expBaseDb = (float)$db->fetchColumn('SELECT COALESCE(SUM(amount),0) FROM expenditures WHERE tenant_id=? AND project_id=?', [DEMO, $projectId]);
    $incBaseDb = (float)$db->fetchColumn('SELECT COALESCE(SUM(amount),0) FROM incomes WHERE tenant_id=? AND project_id=?', [DEMO, $projectId]);
    if (abs((float)$row['exp_base'] - $expBaseDb) > 0.01) return false;
    if (abs((float)$row['inc_base'] - $incBaseDb) > 0.01) return false;
    if (abs((float)$row['balance'] - ($incBaseDb - $expBaseDb)) > 0.01) return false;
    // Column totals equal the sum of the rows.
    $expBase = 0.0; $incBase = 0.0; $bal = 0.0;
    foreach ($sum['projects'] as $r) { $expBase += (float)$r['exp_base']; $incBase += (float)$r['inc_base']; $bal += (float)$r['balance']; }
    return abs($sum['totals']['exp_base'] - $expBase) < 0.01
        && abs($sum['totals']['inc_base'] - $incBase) < 0.01
        && abs($sum['totals']['balance'] - $bal) < 0.01;
});
check('expenditure: staff party type + bank account link (non-cash only)', function () use ($db, $projectId) {
    $svc = new \App\Services\ExpenditureService();
    $staffId = (int)$db->fetchColumn('SELECT id FROM staff_members WHERE tenant_id=? LIMIT 1', [DEMO]);
    $bankId = (int)$db->fetchColumn('SELECT id FROM bank_accounts WHERE tenant_id=? LIMIT 1', [DEMO]);
    // Fund transfer to a staff member, with a bank account.
    $r = $svc->create(DEMO, null, ['scope' => 'project', 'project_id' => $projectId, 'party_type' => 'staff', 'party_id' => $staffId,
        'amount' => 5000, 'mode' => 'fund_transfer', 'bank_account_id' => $bankId, 'expense_date' => '2026-05-01']);
    if ($r['party_type'] !== 'staff' || (int)$r['party_id'] !== $staffId || (int)$r['bank_account_id'] !== $bankId) return false;
    // The list resolves the staff name + bank label.
    $found = null;
    foreach ($svc->list(DEMO)['items'] as $it) { if ((int)$it['id'] === (int)$r['id']) { $found = $it; break; } }
    if (!$found || empty($found['party_name']) || empty($found['bank_label'])) return false;
    // Cash mode must drop any bank account.
    $cash = $svc->update(DEMO, (int)$r['id'], ['scope' => 'project', 'project_id' => $projectId, 'party_type' => 'staff', 'party_id' => $staffId,
        'amount' => 5000, 'mode' => 'cash', 'bank_account_id' => $bankId, 'expense_date' => '2026-05-01']);
    if ($cash['bank_account_id'] !== null) return false;
    $svc->delete(DEMO, (int)$r['id']);
    return true;
});
check('validator: string max sizes by length, not numeric value', function () {
    // A purely numeric account number under the length cap must pass.
    $ok = \Core\Validator::make(['account_number' => '123456789012'], ['account_number' => 'required|string|max:60']);
    if (!$ok->passes()) return false;
    // Over the length cap must fail (as characters, not numeric magnitude).
    $tooLong = \Core\Validator::make(['account_number' => str_repeat('9', 61)], ['account_number' => 'required|string|max:60']);
    if ($tooLong->passes()) return false;
    // A plain numeric rule still bounds by magnitude.
    $numeric = \Core\Validator::make(['n' => '80'], ['n' => 'numeric|max:60']);
    if ($numeric->passes()) return false;
    // A string field also accepts an all-digit value arriving as a JSON number.
    $asNumber = \Core\Validator::make(['account_number' => 123456789012], ['account_number' => 'required|string|max:60']);
    if (!$asNumber->passes()) return false;
    // Non-scalars are still rejected by string.
    $arr = \Core\Validator::make(['x' => ['a']], ['x' => 'string']);
    return !$arr->passes();
});
check('salary slips: earnings/deductions totals, gross + net; cross-tenant blocked', function () use ($db) {
    $svc = new \App\Services\SalarySlipService();
    $staffId = (int)$db->fetchColumn('SELECT id FROM staff_members WHERE tenant_id=? LIMIT 1', [DEMO]);
    $slip = $svc->create(DEMO, null, ['staff_id' => $staffId, 'period' => '2026-07', 'lines' => [
        ['line_type' => 'earning', 'label' => 'Basic', 'amount' => 20000],
        ['line_type' => 'earning', 'label' => 'HRA', 'amount' => 8000],
        ['line_type' => 'deduction', 'label' => 'PF', 'amount' => 2400],
        ['line_type' => 'deduction', 'label' => 'bad', 'amount' => 0],   // dropped (0)
    ]]);
    if (abs((float)$slip['earnings_total'] - 28000.00) > 0.01) return false;   // gross
    if (abs((float)$slip['deductions_total'] - 2400.00) > 0.01) return false;
    if (abs((float)$slip['net_salary'] - 25600.00) > 0.01) return false;       // 28000 - 2400
    if (count($slip['lines']) !== 3) return false;                             // zero line dropped
    if (empty($slip['staff_name'])) return false;
    if (count($svc->listForStaff(DEMO, $staffId)) < 1) return false;
    try { $svc->get(999002, (int)$slip['id']); return false; }
    catch (ServiceException $e) { $ok = $e->code() === 'not_found'; }
    $svc->delete(DEMO, (int)$slip['id']);
    return $ok;
});
check('dashboard: weekly progress derives from tasks in a done column', function () use ($db, $projectId) {
    $data = (new \App\Services\DashboardService())->tenant(DEMO);
    $row = null;
    foreach ($data['weekly_progress'] as $r) { if ((int)$r['id'] === $projectId) { $row = $r; break; } }
    if ($row === null) return false;
    // Compute the expectation directly from tasks/task_statuses.is_done.
    $total = (int)$db->fetchColumn('SELECT COUNT(*) FROM tasks WHERE tenant_id=? AND project_id=? AND deleted_at IS NULL', [DEMO, $projectId]);
    $done = (int)$db->fetchColumn('SELECT COUNT(*) FROM tasks t JOIN task_statuses s ON s.id=t.status_id WHERE t.tenant_id=? AND t.project_id=? AND t.deleted_at IS NULL AND s.is_done=1', [DEMO, $projectId]);
    $expected = $total ? (int)round(100 * $done / $total) : 0;
    return (int)$row['progress_percent'] === $expected && $total > 0;
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
