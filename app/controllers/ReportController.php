<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ReportService;
use Core\Controller;
use Core\Request;
use Core\Response;

/**
 * Report endpoints. GET /api/reports/{report}?format=csv streams CSV for large
 * datasets; without format it returns the JSON report definition the frontend
 * wrapper renders (and can also print / Save-as-PDF / client-CSV).
 */
final class ReportController extends Controller
{
    private ReportService $service;

    public function __construct()
    {
        $this->service = new ReportService();
    }

    public function show(Request $request): void
    {
        $report = (string)$request->param('report');
        $format = $request->query('format');

        $this->guard(function () use ($request, $report, $format) {
            $data = $this->service->build((int)$request->tenantId(), $report, $request->allQuery());

            if ($format === 'csv') {
                $csv = $this->service->toCsv($data);
                Response::raw($csv, 'text/csv; charset=utf-8', 200, [
                    'Content-Disposition' => 'attachment; filename="' . $report . '-report.csv"',
                ]);
                return;
            }
            Response::success($data);
        });
    }
}
