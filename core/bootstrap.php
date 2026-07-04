<?php
declare(strict_types=1);

/**
 * Application bootstrap. Loaded by the front controller (and by CLI scripts).
 * Registers a PSR-4-ish autoloader for Core\ and App\, loads env, and starts
 * the session. Deliberately dependency-free so it runs on bare shared hosting.
 */

define('BASE_PATH', dirname(__DIR__));

// ---- Autoloader ------------------------------------------------------------
spl_autoload_register(static function (string $class): void {
    $prefixes = [
        'Core\\' => BASE_PATH . '/core/',
        'App\\'  => BASE_PATH . '/app/',
    ];
    foreach ($prefixes as $prefix => $baseDir) {
        if (!str_starts_with($class, $prefix)) {
            continue;
        }
        $relative = substr($class, strlen($prefix));
        // App\Controllers\Foo -> app/controllers/Foo.php (lower-cased dirs)
        $parts = explode('\\', $relative);
        $file = array_pop($parts);
        $dir = strtolower(implode('/', $parts));
        $path = $baseDir . ($dir ? $dir . '/' : '') . $file . '.php';
        if (is_file($path)) {
            require $path;
            return;
        }
        // Fallback: exact-case path
        $path2 = $baseDir . str_replace('\\', '/', $relative) . '.php';
        if (is_file($path2)) {
            require $path2;
        }
    }
});

// ---- Environment -----------------------------------------------------------
\Core\Env::load(BASE_PATH . '/config/.env');

date_default_timezone_set((string)\Core\Env::get('APP_TIMEZONE', 'UTC'));

// ---- Error handling --------------------------------------------------------
$debug = \Core\Env::bool('APP_DEBUG', false);
error_reporting(E_ALL);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
$logFile = BASE_PATH . '/storage/logs/app.log';
if (is_dir(dirname($logFile))) {
    ini_set('error_log', $logFile);
}
