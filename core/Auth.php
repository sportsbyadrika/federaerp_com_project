<?php
declare(strict_types=1);

namespace Core;

/**
 * Session-backed authentication. Holds the authenticated user in the session
 * and exposes login/logout/check helpers. Password verification and the
 * 3-field (org id + email + password) flow live in AuthService (Batch 3); this
 * class only manages session state and secure cookie handling.
 */
final class Auth
{
    private const USER_KEY = '_auth_user';

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $name = (string)Env::get('SESSION_NAME', 'csaas_session');
        $secure = Env::bool('SESSION_SECURE', true);

        session_name($name);
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    /** Store the authenticated user and rotate the session id + CSRF token. */
    public static function login(array $user): void
    {
        session_regenerate_id(true);
        $_SESSION[self::USER_KEY] = [
            'id'              => (int)$user['id'],
            'organisation_id' => (int)$user['organisation_id'],
            'email'           => $user['email'],
            'name'            => $user['name'] ?? '',
            'role'            => $user['role'],
        ];
        Csrf::regenerate();
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $params['path'],
                'domain'   => $params['domain'],
                'secure'   => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => 'Lax',
            ]);
        }
        session_destroy();
    }

    public static function check(): bool
    {
        return isset($_SESSION[self::USER_KEY]);
    }

    public static function user(): ?array
    {
        return $_SESSION[self::USER_KEY] ?? null;
    }

    public static function id(): ?int
    {
        return isset($_SESSION[self::USER_KEY]) ? (int)$_SESSION[self::USER_KEY]['id'] : null;
    }

    public static function organisationId(): ?int
    {
        return isset($_SESSION[self::USER_KEY]) ? (int)$_SESSION[self::USER_KEY]['organisation_id'] : null;
    }

    public static function role(): ?string
    {
        return $_SESSION[self::USER_KEY]['role'] ?? null;
    }

    public static function isSuperAdmin(): bool
    {
        return self::role() === 'super_admin';
    }
}
