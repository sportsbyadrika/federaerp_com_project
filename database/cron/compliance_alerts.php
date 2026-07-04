<?php
declare(strict_types=1);

/**
 * Compliance renewal alert job — CLI-safe for cPanel Cron.
 *
 * cPanel Cron (recommended, no HTTP): run the PHP CLI directly, e.g. daily 8am:
 *   0 8 * * *  /usr/local/bin/php /home/USER/construction_saas/database/cron/compliance_alerts.php >> /home/USER/construction_saas/storage/logs/cron.log 2>&1
 *
 * Or hit the token-guarded endpoint instead (if CLI cron is unavailable):
 *   0 8 * * *  curl -s "https://yourdomain.com/api/cron/compliance?token=YOUR_CRON_TOKEN"
 *
 * This script prints a summary of permits due for renewal so the log captures
 * what was flagged. Extend markNotified()/notification hooks to email if needed.
 */

require dirname(__DIR__, 2) . '/core/bootstrap.php';

use App\Services\ComplianceService;

if (PHP_SAPI !== 'cli') {
    // If somehow reached over the web, require the cron token.
    $token = $_GET['token'] ?? '';
    $expected = (string)\Core\Env::get('CRON_TOKEN', '');
    if ($expected === '' || !hash_equals($expected, (string)$token)) {
        http_response_code(403);
        echo "Forbidden\n";
        exit(1);
    }
}

$service = new ComplianceService();
$alerts = $service->upcomingAlerts(null, 60); // platform-wide

echo '[' . date('c') . "] Compliance alert scan\n";
echo 'Permits needing attention within 60 days: ' . count($alerts) . "\n";
foreach ($alerts as $a) {
    printf(
        "  Org %d | %s (%s) | due %s | %d days | %s\n",
        (int)$a['tenant_id'],
        $a['permit_name'],
        $a['permit_number'] ?? 'n/a',
        $a['due_date'],
        (int)$a['days_remaining'],
        strtoupper($a['urgency'])
    );
}

$service->markNotified(array_map(static fn($a) => (int)$a['deadline_id'], $alerts));
echo "Done.\n";
