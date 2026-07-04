<?php
declare(strict_types=1);

namespace Core;

/**
 * CSRF / API token. A per-session token is generated on login and required on
 * every state-changing request (header X-CSRF-Token or body _csrf). Compared
 * with hash_equals to avoid timing leaks.
 */
final class Csrf
{
    private const SESSION_KEY = '_csrf_token';

    public static function token(): string
    {
        if (empty($_SESSION[self::SESSION_KEY])) {
            $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::SESSION_KEY];
    }

    /** Rotate the token (call on login/privilege change). */
    public static function regenerate(): string
    {
        $_SESSION[self::SESSION_KEY] = bin2hex(random_bytes(32));
        return $_SESSION[self::SESSION_KEY];
    }

    public static function verify(Request $request): bool
    {
        $expected = $_SESSION[self::SESSION_KEY] ?? null;
        if (!$expected) {
            return false;
        }
        $provided = $request->header('X-CSRF-Token')
            ?? $request->input('_csrf')
            ?? $request->bearerToken();

        if (!is_string($provided) || $provided === '') {
            return false;
        }
        return hash_equals($expected, $provided);
    }
}
