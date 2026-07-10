<?php
declare(strict_types=1);

/**
 * Module route registration (Batch 3+). Returns a closure invoked by
 * config/routes.php with the shared middleware stacks:
 *   $auth  = [AuthMiddleware, TenantScope]                 (authenticated reads)
 *   $write = [AuthMiddleware, TenantScope, CsrfMiddleware] (state-changing)
 */

use Core\Router;
use App\Middleware\SuperAdminOnly;
use App\Middleware\OrgAdminOnly;

return function (Router $router, array $auth, array $write): void {

    $router->group('/api', [], function (Router $r) use ($auth, $write) {

        // ---- Auth: staff + super-admin org management ---------------------
        $r->get('/auth/staff', 'AuthController@listStaff', $auth);
        $r->post('/auth/staff', 'AuthController@createStaff', array_merge($write, [OrgAdminOnly::class]));
        $r->get('/admin/organisations', 'AuthController@listOrganisations', array_merge($auth, [SuperAdminOnly::class]));
        $r->patch('/admin/organisations/{id}/status', 'AuthController@setOrganisationStatus', array_merge($write, [SuperAdminOnly::class]));

        // ---- Dashboard ----------------------------------------------------
        $r->get('/dashboard', 'DashboardController@index', $auth);

        // ---- Estimation ---------------------------------------------------
        $r->post('/estimates/calculate', 'EstimateController@calculate', $auth); // non-mutating
        $r->get('/estimates', 'EstimateController@index', $auth);
        $r->get('/estimates/{id}', 'EstimateController@show', $auth);
        $r->post('/estimates', 'EstimateController@store', $write);
        $r->post('/estimates/{id}/version', 'EstimateController@version', $write);
        $r->delete('/estimates/{id}', 'EstimateController@destroy', $write);

        // ---- Projects -----------------------------------------------------
        $r->get('/projects', 'ProjectController@index', $auth);
        $r->get('/projects/{id}', 'ProjectController@show', $auth);
        $r->post('/projects', 'ProjectController@store', $write);
        $r->put('/projects/{id}', 'ProjectController@update', $write);
        $r->delete('/projects/{id}', 'ProjectController@destroy', $write);
        $r->get('/projects/{id}/statuses', 'ProjectController@statuses', $auth);
        $r->post('/statuses', 'ProjectController@createStatus', $write);
        $r->get('/projects/{id}/milestones', 'ProjectController@milestones', $auth);
        $r->post('/milestones', 'ProjectController@createMilestone', $write);
        $r->patch('/milestones/{id}/certify', 'ProjectController@certifyMilestone', $write);
        $r->get('/projects/{id}/progress', 'ProjectController@progress', $auth);
        $r->post('/progress', 'ProjectController@logProgress', $write);
        $r->get('/projects/{id}/checklists', 'ProjectController@checklists', $auth);
        $r->post('/checklists', 'ProjectController@saveChecklist', $write);
        $r->get('/projects/{id}/floors', 'ProjectController@floors', $auth);
        $r->post('/projects/{id}/floors', 'ProjectController@setFloors', $write);
        $r->get('/projects/{id}/boq', 'ProjectController@boq', $auth);
        $r->post('/projects/{id}/boq', 'ProjectController@createBoqEntry', $write);
        $r->put('/boq-entries/{id}', 'ProjectController@updateBoqEntry', $write);
        $r->delete('/boq-entries/{id}', 'ProjectController@deleteBoqEntry', $write);
        $r->get('/projects/{id}/stages', 'ProjectController@stages', $auth);
        $r->post('/projects/{id}/stages', 'ProjectController@saveStages', $write);

        // ---- Kanban tasks -------------------------------------------------
        $r->get('/projects/{id}/board', 'TaskController@board', $auth);
        $r->post('/tasks', 'TaskController@store', $write);
        $r->put('/tasks/{id}', 'TaskController@update', $write);
        $r->patch('/tasks/{id}/move', 'TaskController@move', $write);
        $r->delete('/tasks/{id}', 'TaskController@destroy', $write);

        // ---- Billing & settlement -----------------------------------------
        $r->get('/projects/{id}/demand-notes', 'BillingController@demandNotes', $auth);
        $r->post('/demand-notes', 'BillingController@createDemandNote', $write);
        $r->post('/demand-notes/{id}/invoice', 'BillingController@generateInvoice', $write);
        $r->get('/projects/{id}/invoices', 'BillingController@invoices', $auth);
        $r->get('/invoices/{id}', 'BillingController@showInvoice', $auth);
        $r->post('/receipts', 'BillingController@recordReceipt', $write);
        $r->post('/retention/{id}/release', 'BillingController@releaseRetention', $write);
        $r->get('/projects/{id}/settlement', 'BillingController@settlement', $auth);
        $r->post('/projects/{id}/settlement', 'BillingController@finalizeSettlement', $write);

        // ---- Materials & inventory ----------------------------------------
        $r->get('/material-requests', 'MaterialController@requests', $auth);
        $r->post('/material-requests', 'MaterialController@createRequest', $write);
        $r->post('/stock/allocate', 'MaterialController@allocate', $write);
        $r->get('/inventory/low', 'MaterialController@lowInventory', $auth);
        $r->get('/purchase-orders', 'MaterialController@purchaseOrders', $auth);
        $r->post('/purchase-orders', 'MaterialController@createPurchaseOrder', $write);

        // ---- Sub-contractor RA billing ------------------------------------
        $r->get('/work-orders', 'SubcontractorController@workOrders', $auth);
        $r->post('/work-orders', 'SubcontractorController@createWorkOrder', $write);
        $r->get('/work-orders/{id}/ra-bills', 'SubcontractorController@bills', $auth);
        $r->post('/work-orders/{id}/ra-bills/preview', 'SubcontractorController@preview', $auth);
        $r->post('/work-orders/{id}/ra-bills', 'SubcontractorController@generate', $write);

        // ---- Compliance ---------------------------------------------------
        $r->get('/compliance/permits', 'ComplianceController@permits', $auth);
        $r->post('/compliance/permits', 'ComplianceController@createPermit', $write);
        $r->post('/compliance/permits/{id}/status', 'ComplianceController@addStatusUpdate', $write);
        $r->get('/compliance/alerts', 'ComplianceController@alerts', $auth);
        // Token-guarded cron endpoint (no session auth).
        $r->get('/cron/compliance', 'ComplianceController@cronAlerts');

        // ---- Documents / photos / QHSE ------------------------------------
        $r->get('/documents', 'DocumentController@index', $auth);
        $r->get('/documents/{id}/versions', 'DocumentController@versions', $auth);
        $r->post('/documents', 'DocumentController@upload', $write);
        $r->get('/projects/{id}/photos', 'DocumentController@photos', $auth);
        $r->post('/photos', 'DocumentController@uploadPhoto', $write);
        $r->get('/files/{kind}/{id}', 'FileController@stream', $auth);
        $r->get('/projects/{id}/qhse', 'QhseController@checklists', $auth);
        $r->post('/qhse', 'QhseController@submitChecklist', $write);
        $r->get('/incidents', 'QhseController@incidents', $auth);
        $r->post('/incidents', 'QhseController@reportIncident', $write);

        // ---- Reports (JSON definition, or ?format=csv) --------------------
        $r->get('/reports/{report}', 'ReportController@show', $auth);

        // ---- Institution settings -----------------------------------------
        $r->get('/organisation', 'OrganisationController@show', $auth);
        $r->get('/organisation/logo', 'OrganisationController@logo', $auth);
        $r->put('/organisation', 'OrganisationController@update', array_merge($write, [OrgAdminOnly::class]));
        $r->post('/organisation/logo', 'OrganisationController@uploadLogo', array_merge($write, [OrgAdminOnly::class]));

        // ---- Currencies + settings ----------------------------------------
        $r->get('/settings', 'CurrencyController@settings', $auth);
        $r->get('/currencies', 'CurrencyController@index', $auth);
        $r->post('/currencies', 'CurrencyController@store', $write);
        $r->post('/currencies/{id}/default', 'CurrencyController@setDefault', $write);
        $r->delete('/currencies/{id}', 'CurrencyController@destroy', $write);

        // ---- Master data (generic tenant-scoped CRUD) ---------------------
        $resources = ['clients','suppliers','construction-models','base-rates','materials','subcontractors','vehicles','employees','unit-types','boq-items'];
        foreach ($resources as $res) {
            $r->get("/{$res}", 'MasterDataController@index', $auth);
            $r->get("/{$res}/{id}", 'MasterDataController@show', $auth);
            $r->post("/{$res}", 'MasterDataController@store', $write);
            $r->put("/{$res}/{id}", 'MasterDataController@update', $write);
            $r->delete("/{$res}/{id}", 'MasterDataController@destroy', $write);
        }
    });
};
