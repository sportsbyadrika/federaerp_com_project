<?php
declare(strict_types=1);

/**
 * Seed script (Batch 2). Loads one platform Super Admin, one demo tenant with
 * an Org Admin + Staff, and minimal sample data across the modules so later
 * batches (estimation, kanban, settlement) are testable.
 *
 * Run:  php database/seed.php
 * Safe to re-run: it clears existing demo rows for the two seed orgs first.
 */

require dirname(__DIR__) . '/core/bootstrap.php';

use Core\Database;

$db = Database::instance();
$pdo = $db->pdo();

const SUPER_ORG = 111111;
const DEMO_ORG  = 100200;   // fixed for reproducible tests (normally random 6-digit)
const PASSWORD  = 'Password123!';

function hash_pw(string $p): string
{
    return password_hash($p, PASSWORD_DEFAULT);
}

echo "Seeding database...\n";
$pdo->beginTransaction();
try {
    // ---- Clean previous demo data ----------------------------------------
    // Delete every tenant-scoped row for the two seed orgs, then users + orgs.
    // FK checks are toggled off so we can wipe all tables regardless of the
    // internal cascade order (some references are RESTRICT by design).
    $orgIds = SUPER_ORG . ',' . DEMO_ORG;
    $tenantTables = $db->fetchAll(
        "SELECT DISTINCT table_name FROM information_schema.columns
          WHERE table_schema = DATABASE() AND column_name = 'tenant_id'"
    );
    $db->execute('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($tenantTables as $t) {
        $table = $t['table_name'] ?? $t['TABLE_NAME'];
        $db->execute("DELETE FROM `{$table}` WHERE tenant_id IN ({$orgIds})");
    }
    $db->execute("DELETE FROM users WHERE organisation_id IN ({$orgIds})");
    $db->execute("DELETE FROM organisations WHERE id IN ({$orgIds})");
    $db->execute('SET FOREIGN_KEY_CHECKS = 1');

    // ---- Organisations ----------------------------------------------------
    $db->insert('organisations', [
        'id' => SUPER_ORG, 'name' => 'Platform Operator', 'is_platform' => 1,
        'currency' => 'USD', 'status' => 'active',
    ]);
    $db->insert('organisations', [
        'id' => DEMO_ORG, 'name' => 'Skyline Builders Ltd', 'legal_name' => 'Skyline Builders Private Limited',
        'gst_number' => '29ABCDE1234F1Z5', 'pan' => 'ABCDE1234F',
        'letterhead_address' => "12 Skyline Tower, MG Road, Metro City, Karnataka 560001\nTel: +91-80-5555-0100",
        'email' => 'info@skyline.example', 'phone' => '+91-80-5555-0100', 'address' => '12 Skyline Tower, MG Road',
        'city' => 'Metro City', 'country' => 'India',
        'currency' => 'INR', 'currency_symbol' => '₹', 'status' => 'active',
    ]);

    // ---- Users ------------------------------------------------------------
    $db->insert('users', [
        'organisation_id' => SUPER_ORG, 'name' => 'Super Admin', 'email' => 'super@platform.test',
        'password_hash' => hash_pw(PASSWORD), 'role' => 'super_admin', 'job_role' => 'owner', 'status' => 'active',
    ]);
    $adminId = $db->insert('users', [
        'organisation_id' => DEMO_ORG, 'name' => 'Olivia Admin', 'email' => 'admin@skyline.test',
        'password_hash' => hash_pw(PASSWORD), 'role' => 'org_admin', 'job_role' => 'admin', 'status' => 'active',
    ]);
    $pmId = $db->insert('users', [
        'organisation_id' => DEMO_ORG, 'name' => 'Peter Manager', 'email' => 'pm@skyline.test',
        'password_hash' => hash_pw(PASSWORD), 'role' => 'staff', 'job_role' => 'project_manager', 'status' => 'active',
    ]);
    $superviserId = $db->insert('users', [
        'organisation_id' => DEMO_ORG, 'name' => 'Sam Supervisor', 'email' => 'supervisor@skyline.test',
        'password_hash' => hash_pw(PASSWORD), 'role' => 'staff', 'job_role' => 'site_supervisor', 'status' => 'active',
    ]);

    // (Email is globally unique — the same address cannot exist under two orgs.)

    // ---- Client + construction model + base rates -------------------------
    $clientId = $db->insert('clients', [
        'tenant_id' => DEMO_ORG, 'name' => 'Harbor Development Corp', 'contact_person' => 'Dana Client',
        'email' => 'dana@harbor.example', 'phone' => '+91-98450-00100',
        'gst_number' => '29HARBR5678K1Z2', 'pan' => 'HARBR5678K', 'address' => '12 Dockside Ave',
    ]);
    $modelId = $db->insert('construction_models', [
        'tenant_id' => DEMO_ORG, 'name' => 'Standard Residential Villa', 'category' => 'residential',
        'description' => 'Two-storey villa baseline model',
    ]);
    // Base rates: materials (per unit) + labour (per hour)
    $rates = [
        ['material', 'CEM01', 'Cement (OPC)', 'bag', 8.50, 2.0],
        ['material', 'STL01', 'Steel Rebar', 'kg', 1.20, 3.0],
        ['material', 'BRK01', 'Bricks', 'piece', 0.35, 5.0],
        ['material', 'SND01', 'Sand', 'cu.m', 22.00, 1.0],
        ['labour',   'LAB01', 'Mason', 'hour', 15.00, 0.0],
        ['labour',   'LAB02', 'Helper', 'hour', 9.00, 0.0],
    ];
    foreach ($rates as [$type, $code, $name, $unit, $rate, $wastage]) {
        $db->insert('base_rate_configs', [
            'tenant_id' => DEMO_ORG, 'model_id' => $modelId, 'rate_type' => $type,
            'item_code' => $code, 'item_name' => $name, 'unit' => $unit,
            'base_rate' => $rate, 'wastage_percent' => $wastage,
        ]);
    }

    // ---- Estimate + line items --------------------------------------------
    $estId = $db->insert('estimates', [
        'tenant_id' => DEMO_ORG, 'client_id' => $clientId, 'model_id' => $modelId,
        'reference' => 'EST-2026-0001', 'title' => 'Villa – Harbor Plot 7', 'version' => 1,
        'square_footage' => 2400, 'labour_hours' => 1800,
        'materials_total' => 0, 'labour_total' => 0, 'overhead_percent' => 10, 'margin_percent' => 15,
        'grand_total' => 0, 'status' => 'approved', 'created_by' => $pmId,
    ]);
    $lines = [
        ['material', 'CEM01', 'Cement (OPC)', 'bag', 500, 8.50],
        ['material', 'STL01', 'Steel Rebar', 'kg', 6000, 1.20],
        ['material', 'BRK01', 'Bricks', 'piece', 20000, 0.35],
        ['labour',   'LAB01', 'Mason labour', 'hour', 1200, 15.00],
        ['labour',   'LAB02', 'Helper labour', 'hour', 600, 9.00],
    ];
    $matTotal = 0.0; $labTotal = 0.0; $order = 0;
    foreach ($lines as [$type, $code, $desc, $unit, $qty, $rate]) {
        $amount = round($qty * $rate, 2);
        if ($type === 'material') { $matTotal += $amount; } else { $labTotal += $amount; }
        $db->insert('estimate_line_items', [
            'tenant_id' => DEMO_ORG, 'estimate_id' => $estId, 'line_type' => $type, 'item_code' => $code,
            'description' => $desc, 'unit' => $unit, 'quantity' => $qty, 'rate' => $rate,
            'amount' => $amount, 'sort_order' => $order++,
        ]);
    }
    $subtotal = $matTotal + $labTotal;
    $withOverhead = $subtotal * 1.10;
    $grand = round($withOverhead * 1.15, 2);
    $db->execute(
        'UPDATE estimates SET materials_total=?, labour_total=?, grand_total=? WHERE id=?',
        [$matTotal, $labTotal, $grand, $estId]
    );

    // ---- Project + kanban board -------------------------------------------
    $projectId = $db->insert('projects', [
        'tenant_id' => DEMO_ORG, 'client_id' => $clientId, 'estimate_id' => $estId,
        'code' => 'PRJ-0001', 'name' => 'Harbor Villa Construction', 'project_type' => 'new',
        'site_address' => '12 Dockside Ave, Metro City',
        'contract_value' => 500000, 'currency_code' => 'INR', 'currency_symbol' => '₹',
        'start_date' => '2026-01-15', 'end_date' => '2026-12-20',
        'status' => 'active', 'progress_percent' => 35, 'project_manager_id' => $pmId,
    ]);

    // Floors + a small Bill of Quantities (some split by floor).
    $floorIds = [];
    foreach ([['GF', 'Ground Floor', 0], ['F1', '1st Floor', 1], ['F2', '2nd Floor', 2]] as [$code, $label, $ord]) {
        $floorIds[$code] = $db->insert('project_floors', [
            'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'code' => $code, 'label' => $label, 'sort_order' => $ord,
        ]);
    }
    // BOQ entries with per-floor lines (new model).
    $boqEntries = [
        ['CIV-01', 'RCC Framing', 'Reinforced cement concrete framing', 'cu.m',
            [[$floorIds['GF'], 120, 180], [$floorIds['F1'], 95, 180], [$floorIds['F2'], 95, 180]]],
        ['MAS-01', 'Brick Masonry', 'Brick masonry in cement mortar 1:6', 'sq.m',
            [[$floorIds['GF'], 400, 32]]],
        ['GEN-01', 'Site Mobilization', 'Mobilization, setup and site establishment', 'lot',
            [[null, 1, 15000]]],
    ];
    $eord = 0;
    foreach ($boqEntries as [$code, $head, $desc, $unit, $lines]) {
        $entryId = $db->insert('boq_entries', [
            'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'item_code' => $code,
            'item_head' => $head, 'description' => $desc, 'unit' => $unit, 'sort_order' => $eord++,
        ]);
        $lord = 0;
        foreach ($lines as [$fid, $qty, $rate]) {
            $db->insert('boq_lines', [
                'tenant_id' => DEMO_ORG, 'boq_entry_id' => $entryId, 'project_floor_id' => $fid,
                'quantity' => $qty, 'rate' => $rate, 'amount' => round($qty * $rate, 2), 'sort_order' => $lord++,
            ]);
        }
    }

    // Construction stages (phased plan vs contract value).
    $stages = [
        [1, 'Foundation & substructure', 25, 125000],
        [2, 'Superstructure & framing', 40, 200000],
        [3, 'Finishing & handover', 35, 175000],
    ];
    $sord = 0;
    foreach ($stages as [$phase, $details, $pct, $amt]) {
        $db->insert('construction_stages', [
            'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'phase_no' => $phase,
            'details' => $details, 'percentage' => $pct, 'amount' => $amt, 'sort_order' => $sord++,
        ]);
    }

    // Settings masters: unit types, currencies, BOQ item master.
    $uord = 0;
    foreach (['cu.m', 'sq.m', 'sq.ft', 'nos', 'bag', 'kg', 'lot', 'hour'] as $u) {
        $db->insert('unit_types', ['tenant_id' => DEMO_ORG, 'name' => $u, 'sort_order' => $uord++]);
    }
    $db->insert('currencies', ['tenant_id' => DEMO_ORG, 'code' => 'INR', 'symbol' => '₹', 'is_default' => 1]);
    $db->insert('currencies', ['tenant_id' => DEMO_ORG, 'code' => 'USD', 'symbol' => '$', 'is_default' => 0]);
    $masterItems = [
        ['new', 'CIV-01', 'RCC Framing', 'Reinforced cement concrete framing including formwork and steel', 'cu.m', 180],
        ['new', 'MAS-01', 'Brick Masonry', 'Brick masonry in cement mortar 1:6', 'sq.m', 32],
        ['new', 'PLA-01', 'Plastering', 'Internal/external cement plaster 12mm', 'sq.m', 14],
        ['renovation', 'DEM-01', 'Demolition', 'Careful demolition and debris removal', 'cu.m', 45],
        ['any', 'GEN-01', 'Site Mobilization', 'Mobilization, setup and site establishment', 'lot', 15000],
    ];
    foreach ($masterItems as [$ptype, $code, $head, $desc, $unit, $rate]) {
        $db->insert('boq_item_master', [
            'tenant_id' => DEMO_ORG, 'project_type' => $ptype, 'item_code' => $code,
            'item_head' => $head, 'description' => $desc, 'unit' => $unit, 'default_rate' => $rate,
        ]);
    }
    $expTypeIds = [];
    $exord = 0;
    foreach (['Materials', 'Labour', 'Equipment Hire', 'Fuel', 'Office & Admin'] as $etn) {
        $expTypeIds[$etn] = $db->insert('expenditure_types', ['tenant_id' => DEMO_ORG, 'name' => $etn, 'sort_order' => $exord++]);
    }

    $columns = [
        ['To Do', '#94a3b8', 0, 0],
        ['In Progress', '#3b82f6', 1, 0],
        ['Review', '#f59e0b', 2, 0],
        ['Done', '#22c55e', 3, 1],
    ];
    $statusIds = [];
    foreach ($columns as [$name, $color, $pos, $isDone]) {
        $statusIds[$name] = $db->insert('task_statuses', [
            'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'name' => $name,
            'color' => $color, 'position' => $pos, 'is_done' => $isDone,
        ]);
    }

    // Milestones (weights drive RA billing; certified % drives payments)
    $ms1 = $db->insert('milestones', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'name' => 'Foundation', 'due_date' => '2026-03-01',
        'percent_weight' => 25, 'certified_percent' => 100, 'status' => 'certified', 'sort_order' => 0,
    ]);
    $ms2 = $db->insert('milestones', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'name' => 'Superstructure', 'due_date' => '2026-06-01',
        'percent_weight' => 40, 'certified_percent' => 50, 'status' => 'in_progress', 'sort_order' => 1,
    ]);
    $db->insert('milestones', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'name' => 'Finishing', 'due_date' => '2026-11-01',
        'percent_weight' => 35, 'certified_percent' => 0, 'status' => 'pending', 'sort_order' => 2,
    ]);

    // [title, column, priority, milestone, sort, floor code, percentage]
    $tasks = [
        ['Excavate site', 'Done', 'high', $ms1, 0, 'GF', 10],
        ['Pour foundation', 'Done', 'high', $ms1, 1, 'GF', 15],
        ['Erect columns', 'In Progress', 'high', $ms2, 0, 'GF', 20],
        ['First-floor slab', 'In Progress', 'medium', $ms2, 1, 'F1', 15],
        ['Inspect rebar', 'Review', 'urgent', $ms2, 0, 'F1', 5],
        ['Order finishing materials', 'To Do', 'low', null, 0, 'F2', 0],
    ];
    $firstTaskId = null;
    foreach ($tasks as [$title, $col, $prio, $msId, $sort, $floorCode, $pct]) {
        $tid = $db->insert('tasks', [
            'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'status_id' => $statusIds[$col],
            'milestone_id' => $msId, 'title' => $title, 'item_head' => $title, 'assignee_id' => $superviserId,
            'project_floor_id' => $floorIds[$floorCode] ?? null, 'percentage' => $pct,
            'priority' => $prio, 'due_date' => '2026-05-30', 'sort_order' => $sort,
        ]);
        if ($firstTaskId === null) { $firstTaskId = $tid; }
    }
    // Sample per-task materials + labour so the kanban icons show data.
    if ($firstTaskId) {
        $db->insert('task_materials', ['tenant_id' => DEMO_ORG, 'task_id' => $firstTaskId, 'item_name' => 'Cement (OPC 53)', 'unit' => 'bag', 'quantity' => 60, 'used_date' => '2026-02-05']);
        $db->insert('task_materials', ['tenant_id' => DEMO_ORG, 'task_id' => $firstTaskId, 'item_name' => 'River sand', 'unit' => 'cu.m', 'quantity' => 8, 'used_date' => '2026-02-05']);
        $db->insert('task_labour', ['tenant_id' => DEMO_ORG, 'task_id' => $firstTaskId, 'worker_name' => 'Excavation crew', 'trade' => 'Earthwork', 'headcount' => 6, 'hours' => 8, 'work_date' => '2026-02-04']);
    }

    // ---- Billing: mobilization advance + invoices + receipts + retention --
    // Mobilization advance of 50,000 (10% of contract), recovered at 20%/bill.
    $db->insert('mobilization_advances', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'reference' => 'MOB-0001',
        'advance_amount' => 50000, 'recovery_percent' => 20, 'recovered_amount' => 0,
        'balance_amount' => 50000, 'status' => 'active', 'issued_date' => '2026-01-20',
    ]);

    // Demand note -> Invoice #1
    $dn1 = $db->insert('demand_notes', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'client_id' => $clientId,
        'reference' => 'DN-0001', 'milestone_id' => $ms1, 'amount' => 125000, 'note_type' => 'milestone',
        'due_date' => '2026-03-15', 'status' => 'invoiced', 'description' => 'Foundation milestone',
    ]);
    // Invoice: subtotal 125000, tax 5%, retention 5%, advance recovery 20% of gross.
    $subtotal1 = 125000.00;
    $tax1 = round($subtotal1 * 0.05, 2);            // 6250
    $gross1 = $subtotal1 + $tax1;                    // 131250
    $retention1 = round($subtotal1 * 0.05, 2);       // 6250 (on work value)
    $recovery1 = round($subtotal1 * 0.20, 2);        // 25000
    $net1 = $gross1 - $retention1 - $recovery1;       // 100000
    $inv1 = $db->insert('invoices', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'client_id' => $clientId, 'demand_note_id' => $dn1,
        'invoice_number' => 'INV-2026-0001', 'invoice_date' => '2026-03-16', 'due_date' => '2026-04-15',
        'subtotal' => $subtotal1, 'tax_percent' => 5, 'tax_amount' => $tax1, 'gross_amount' => $gross1,
        'retention_percent' => 5, 'retention_amount' => $retention1, 'mobilization_recovery' => $recovery1,
        'net_payable' => $net1, 'amount_paid' => $net1, 'status' => 'paid',
    ]);
    $db->insert('invoice_items', [
        'tenant_id' => DEMO_ORG, 'invoice_id' => $inv1, 'description' => 'Foundation works (milestone 1)',
        'unit' => 'lot', 'quantity' => 1, 'rate' => $subtotal1, 'amount' => $subtotal1, 'sort_order' => 0,
    ]);
    $db->insert('retention_money', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'invoice_id' => $inv1,
        'withheld_amount' => $retention1, 'released_amount' => 0, 'balance_amount' => $retention1,
        'status' => 'withheld', 'release_due_date' => '2027-03-16',
    ]);
    $db->insert('payment_receipts', [
        'tenant_id' => DEMO_ORG, 'invoice_id' => $inv1, 'project_id' => $projectId, 'client_id' => $clientId,
        'receipt_number' => 'RCP-0001', 'amount' => $net1, 'payment_date' => '2026-04-10',
        'method' => 'bank_transfer', 'reference' => 'NEFT-88213', 'created_by' => $adminId,
    ]);
    // Record advance recovery against the mobilization advance.
    // MySQL evaluates SET assignments left-to-right, so `recovered_amount` in
    // later expressions already holds the NEW value — balance subtracts it once.
    $db->execute(
        'UPDATE mobilization_advances
            SET recovered_amount = recovered_amount + ?,
                balance_amount   = advance_amount - recovered_amount,
                status = CASE WHEN advance_amount - recovered_amount <= 0 THEN \'recovered\' ELSE \'active\' END
          WHERE project_id = ? AND status = \'active\'',
        [$recovery1, $projectId]
    );

    // ---- Subcontractor + work order + RA bill -----------------------------
    $scId = $db->insert('subcontractors', [
        'tenant_id' => DEMO_ORG, 'name' => 'SteelFix Contractors', 'trade' => 'Structural Steel',
        'contact_person' => 'Ravi Steel', 'phone' => '+91-98450-00199',
        'gst_number' => '29STEEL9012L1Z8', 'pan' => 'STEEL9012L',
    ]);
    $woId = $db->insert('subcontractor_work_orders', [
        'tenant_id' => DEMO_ORG, 'subcontractor_id' => $scId, 'project_id' => $projectId,
        'wo_number' => 'WO-0001', 'scope' => 'Structural steel fabrication & erection',
        'order_value' => 120000, 'retention_percent' => 5, 'advance_percent' => 0,
        'start_date' => '2026-02-01', 'status' => 'active',
    ]);
    // RA bill 1: certified 30% cumulative, previously 0%. gross = 120000*30% = 36000
    $gross = round(120000 * 0.30, 2);
    $retention = round($gross * 0.05, 2);
    $net = $gross - $retention;
    $raId = $db->insert('ra_bills', [
        'tenant_id' => DEMO_ORG, 'work_order_id' => $woId, 'project_id' => $projectId,
        'bill_number' => 'RA-0001', 'sequence_no' => 1, 'certified_percent' => 30, 'previous_percent' => 0,
        'gross_value' => $gross, 'retention_amount' => $retention, 'advance_recovery' => 0,
        'net_payable' => $net, 'bill_date' => '2026-04-01', 'status' => 'certified',
    ]);
    $db->insert('ra_bill_items', [
        'tenant_id' => DEMO_ORG, 'ra_bill_id' => $raId, 'milestone_id' => $ms2,
        'description' => 'Steel erection – 30% certified', 'certified_percent' => 30, 'amount' => $gross,
    ]);

    // ---- Suppliers, materials, stock --------------------------------------
    $supId = $db->insert('suppliers', [
        'tenant_id' => DEMO_ORG, 'name' => 'BuildMart Supplies', 'contact_person' => 'Nina Supply',
        'phone' => '+91-98450-00170', 'gst_number' => '29BUILD3456M1Z1', 'pan' => 'BUILD3456M', 'rating' => 4.5,
    ]);
    $matCement = $db->insert('material_catalog', [
        'tenant_id' => DEMO_ORG, 'code' => 'CEM01', 'name' => 'Cement (OPC)', 'category' => 'Binders',
        'unit' => 'bag', 'unit_price' => 8.50, 'reorder_level' => 100,
    ]);
    $db->insert('material_catalog', [
        'tenant_id' => DEMO_ORG, 'code' => 'STL01', 'name' => 'Steel Rebar', 'category' => 'Steel',
        'unit' => 'kg', 'unit_price' => 1.20, 'reorder_level' => 500,
    ]);
    $db->insert('inventory_stock', [
        'tenant_id' => DEMO_ORG, 'material_id' => $matCement, 'project_id' => $projectId,
        'quantity_on_hand' => 320, 'avg_unit_cost' => 8.40,
    ]);
    $db->insert('stock_movements', [
        'tenant_id' => DEMO_ORG, 'material_id' => $matCement, 'project_id' => $projectId,
        'movement_type' => 'in', 'quantity' => 320, 'unit_cost' => 8.40,
        'reference_type' => 'opening_stock', 'moved_by' => $adminId, 'notes' => 'Opening stock',
    ]);

    // ---- Ledger accounts + a transaction ----------------------------------
    $accIncome = $db->insert('ledger_accounts', ['tenant_id' => DEMO_ORG, 'code' => '4000', 'name' => 'Project Revenue', 'type' => 'income']);
    $accBank   = $db->insert('ledger_accounts', ['tenant_id' => DEMO_ORG, 'code' => '1000', 'name' => 'Bank', 'type' => 'asset']);
    $db->insert('ledger_accounts', ['tenant_id' => DEMO_ORG, 'code' => '5000', 'name' => 'Materials Expense', 'type' => 'expense']);
    $txnId = $db->insert('transactions', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'txn_date' => '2026-04-10', 'txn_type' => 'income',
        'reference' => 'RCP-0001', 'description' => 'Payment received – Invoice INV-2026-0001',
        'amount' => $net1, 'source_type' => 'receipt', 'created_by' => $adminId,
    ]);
    $db->insert('transaction_lines', ['tenant_id' => DEMO_ORG, 'transaction_id' => $txnId, 'account_id' => $accBank, 'debit' => $net1, 'credit' => 0]);
    $db->insert('transaction_lines', ['tenant_id' => DEMO_ORG, 'transaction_id' => $txnId, 'account_id' => $accIncome, 'debit' => 0, 'credit' => $net1]);

    // ---- Fleet ------------------------------------------------------------
    $vehId = $db->insert('vehicles_machinery', [
        'tenant_id' => DEMO_ORG, 'asset_code' => 'EXC-01', 'name' => 'Excavator CAT 320',
        'asset_type' => 'machinery', 'registration_no' => 'MX-4521', 'make_model' => 'CAT 320',
        'status' => 'in_use', 'assigned_project_id' => $projectId, 'purchase_date' => '2024-05-10',
    ]);
    $db->insert('fuel_logs', ['tenant_id' => DEMO_ORG, 'vehicle_id' => $vehId, 'log_date' => '2026-06-01', 'litres' => 120, 'cost' => 180.00, 'odometer' => 15230.5, 'logged_by' => $superviserId]);
    $schedId = $db->insert('maintenance_schedules', ['tenant_id' => DEMO_ORG, 'vehicle_id' => $vehId, 'title' => 'Engine service', 'interval_type' => 'date', 'next_due_date' => '2026-08-01']);
    $db->insert('maintenance_logs', ['tenant_id' => DEMO_ORG, 'vehicle_id' => $vehId, 'schedule_id' => $schedId, 'service_date' => '2026-05-01', 'description' => 'Oil + filter change', 'cost' => 220.00, 'odometer' => 15000]);

    // ---- Compliance permits + renewal deadline ----------------------------
    $permitId = $db->insert('compliance_permits', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'permit_name' => 'Building Construction Permit',
        'permit_type' => 'construction', 'authority' => 'City Planning Dept', 'permit_number' => 'BCP-2026-771',
        'issue_date' => '2026-01-05', 'expiry_date' => '2026-08-15', 'status' => 'active',
    ]);
    $db->insert('permit_status_updates', ['tenant_id' => DEMO_ORG, 'permit_id' => $permitId, 'status' => 'active', 'remark' => 'Permit issued', 'updated_by' => $adminId]);
    $db->insert('renewal_deadlines', ['tenant_id' => DEMO_ORG, 'permit_id' => $permitId, 'due_date' => '2026-08-15', 'reminder_days' => 30, 'is_resolved' => 0]);

    $permit2 = $db->insert('compliance_permits', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'permit_name' => 'Environmental Clearance',
        'permit_type' => 'environment', 'authority' => 'Env. Authority', 'permit_number' => 'ENV-2026-045',
        'issue_date' => '2026-01-10', 'expiry_date' => '2026-07-20', 'status' => 'active',
    ]);
    $db->insert('renewal_deadlines', ['tenant_id' => DEMO_ORG, 'permit_id' => $permit2, 'due_date' => '2026-07-20', 'reminder_days' => 30, 'is_resolved' => 0]);

    // ---- Documents + QHSE -------------------------------------------------
    $docId = $db->insert('documents', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'title' => 'Ground Floor Plan',
        'doc_type' => 'blueprint', 'current_version' => 1, 'uploaded_by' => $pmId,
    ]);
    $dvId = $db->insert('document_versions', [
        'tenant_id' => DEMO_ORG, 'document_id' => $docId, 'version_number' => 1,
        'storage_path' => 'uploads/' . DEMO_ORG . '/sample-ground-floor.pdf',
        'original_name' => 'ground-floor-v1.pdf', 'mime_type' => 'application/pdf', 'file_size' => 204800,
        'uploaded_by' => $pmId, 'change_note' => 'Initial issue',
    ]);
    $db->execute('UPDATE documents SET latest_version_id=? WHERE id=?', [$dvId, $docId]);

    $qcId = $db->insert('qhse_checklists', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'checklist_type' => 'safety',
        'title' => 'Weekly Safety Inspection', 'inspection_date' => '2026-06-01', 'inspector_id' => $superviserId,
        'score_percent' => 92, 'status' => 'passed',
    ]);
    foreach ([['PPE worn by all workers', 'yes'], ['Scaffolding certified', 'yes'], ['First-aid kit stocked', 'no']] as $i => [$label, $resp]) {
        $db->insert('qhse_checklist_items', ['tenant_id' => DEMO_ORG, 'checklist_id' => $qcId, 'label' => $label, 'response' => $resp, 'sort_order' => $i]);
    }
    $db->insert('incidents', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'reported_by' => $superviserId,
        'incident_date' => '2026-05-20', 'severity' => 'low', 'category' => 'Slip/Trip',
        'description' => 'Worker slipped near wet area, no injury.', 'action_taken' => 'Area cordoned and dried.',
        'status' => 'closed',
    ]);

    // ---- Employees + attendance ------------------------------------------
    $empId = $db->insert('employees', [
        'tenant_id' => DEMO_ORG, 'user_id' => $superviserId, 'employee_code' => 'EMP-001', 'name' => 'Sam Supervisor',
        'designation' => 'Site Supervisor', 'employment_type' => 'permanent', 'monthly_salary' => 3200, 'join_date' => '2025-03-01',
    ]);
    $db->insert('attendance_logs', ['tenant_id' => DEMO_ORG, 'employee_id' => $empId, 'project_id' => $projectId, 'attendance_date' => '2026-06-01', 'status' => 'present', 'hours_worked' => 8]);

    // ---- Expenditure + Income samples -------------------------------------
    $db->insert('expenditures', [
        'tenant_id' => DEMO_ORG, 'scope' => 'project', 'project_id' => $projectId,
        'expenditure_type_id' => $expTypeIds['Materials'], 'party_type' => 'supplier', 'party_id' => $supId,
        'amount' => 42000, 'mode' => 'fund_transfer', 'reference' => 'PO-cement-batch1',
        'expense_date' => '2026-03-05', 'notes' => 'Cement + steel purchase', 'created_by' => $adminId,
    ]);
    $db->insert('expenditures', [
        'tenant_id' => DEMO_ORG, 'scope' => 'project', 'project_id' => $projectId,
        'expenditure_type_id' => $expTypeIds['Labour'], 'party_type' => 'subcontractor', 'party_id' => $scId,
        'amount' => 18000, 'mode' => 'cheque', 'reference' => 'CHQ-00231',
        'expense_date' => '2026-03-20', 'notes' => 'Steel erection labour', 'created_by' => $adminId,
    ]);
    $db->insert('expenditures', [
        'tenant_id' => DEMO_ORG, 'scope' => 'institutional', 'project_id' => null,
        'expenditure_type_id' => $expTypeIds['Office & Admin'], 'party_type' => 'none', 'party_id' => null,
        'amount' => 6500, 'mode' => 'cash', 'reference' => 'office-rent-mar',
        'expense_date' => '2026-03-01', 'notes' => 'Office rent', 'created_by' => $adminId,
    ]);

    $incAmt = 100000.00; $incGstPct = 18.0; $incGst = round($incAmt * $incGstPct / 100, 2);
    $db->insert('incomes', [
        'tenant_id' => DEMO_ORG, 'project_id' => $projectId, 'client_id' => $clientId,
        'receipt_no' => 'RCPT-2026-0001', 'amount' => $incAmt, 'gst_percent' => $incGstPct,
        'gst_amount' => $incGst, 'total_amount' => round($incAmt + $incGst, 2), 'mode' => 'fund_transfer',
        'reference' => 'NEFT-77120', 'income_date' => '2026-04-10', 'notes' => 'Milestone 1 payment', 'created_by' => $adminId,
    ]);

    $pdo->commit();
    echo "Seed complete.\n\n";
    echo "Login credentials (all password: " . PASSWORD . ")\n";
    echo "  Super Admin  -> Org 111111 | super@platform.test\n";
    echo "  Org Admin    -> Org " . DEMO_ORG . " | admin@skyline.test\n";
    echo "  Project Mgr  -> Org " . DEMO_ORG . " | pm@skyline.test\n";
    echo "  Supervisor   -> Org " . DEMO_ORG . " | supervisor@skyline.test\n";
} catch (\Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "Seed FAILED: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n");
    exit(1);
}
