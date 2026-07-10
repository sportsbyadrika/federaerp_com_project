<?php
declare(strict_types=1);

/**
 * SPA-lite app shell. Loads Vue 3 + Tailwind from CDN (no build step) and
 * bootstraps the CSRF token + current user into the page so the frontend can
 * make authenticated calls immediately.
 */

use Core\Auth;
use Core\Csrf;

$appName = htmlspecialchars((string)\Core\Env::get('APP_NAME', 'Construction SaaS'), ENT_QUOTES);
$csrf = htmlspecialchars(Csrf::token(), ENT_QUOTES);
$user = Auth::user();
$bootstrap = json_encode([
    'csrfToken' => Csrf::token(),
    'user'      => $user,
    'appName'   => (string)\Core\Env::get('APP_NAME', 'Construction SaaS'),
], JSON_UNESCAPED_SLASHES);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?= $csrf ?>">
    <title><?= $appName ?></title>

    <!-- Tailwind (Play CDN — swap for pre-built minified CSS in production, see Batch 9) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        base: '#F7F7F5',
                        panel: '#FFFFFF',
                        brand: { DEFAULT: '#1f6feb', dark: '#1552b0' },
                    },
                },
            },
        };
    </script>

    <!-- Vue 3 global build (no build step) -->
    <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>

    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="bg-base text-slate-800 antialiased min-h-screen">
    <div id="app"></div>

    <script>
        window.__APP__ = <?= $bootstrap ?: '{}' ?>;
    </script>
    <script src="/assets/js/api.js"></script>
    <script src="/assets/js/store.js"></script>
    <!-- Feature views (register routes/components before app.js mounts) -->
    <script src="/assets/js/views/masters.js"></script>
    <script src="/assets/js/views/estimation.js"></script>
    <script src="/assets/js/views/kanban.js"></script>
    <script src="/assets/js/views/compliance.js"></script>
    <script src="/assets/js/views/billing.js"></script>
    <script src="/assets/js/views/documents.js"></script>
    <script src="/assets/js/views/reports.js"></script>
    <script src="/assets/js/app.js"></script>
</body>
</html>
