<?php
declare(strict_types=1);

namespace Core;

/**
 * Minimal .env loader. Reads a KEY=VALUE file that lives OUTSIDE public_html.
 * No external dependency. Values are cached in $_ENV / getenv() and a static map.
 */
final class Env
{
    private static array $vars = [];
    private static bool $loaded = false;

    public static function load(string $path): void
    {
        if (self::$loaded) {
            return;
        }
        self::$loaded = true;

        if (!is_file($path) || !is_readable($path)) {
            return; // fall back to real environment variables
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (!str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            // Strip surrounding quotes
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }

            self::$vars[$key] = $value;
            $_ENV[$key] = $value;
            putenv("$key=$value");
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, self::$vars)) {
            return self::$vars[$key];
        }
        $val = getenv($key);
        if ($val !== false) {
            return $val;
        }
        return $_ENV[$key] ?? $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $val = self::get($key);
        if ($val === null) {
            return $default;
        }
        return in_array(strtolower((string)$val), ['1', 'true', 'yes', 'on'], true);
    }

    public static function int(string $key, int $default = 0): int
    {
        $val = self::get($key);
        return $val === null ? $default : (int)$val;
    }
}
