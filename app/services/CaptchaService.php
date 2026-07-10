<?php
declare(strict_types=1);

namespace App\Services;

use Core\Env;

/**
 * Google reCAPTCHA verification. Degrades gracefully: if RECAPTCHA_SECRET is not
 * configured the CAPTCHA is treated as disabled (so the app works before keys
 * are added). Once the secret is set, a valid token is required.
 */
final class CaptchaService
{
    public static function enabled(): bool
    {
        return (string)Env::get('RECAPTCHA_SECRET', '') !== ''
            && (string)Env::get('RECAPTCHA_SITE_KEY', '') !== '';
    }

    public static function siteKey(): string
    {
        return (string)Env::get('RECAPTCHA_SITE_KEY', '');
    }

    /**
     * Verify a client token. Throws ServiceException on failure. No-op when the
     * CAPTCHA is disabled.
     */
    public static function verify(?string $token, ?string $remoteIp = null): void
    {
        if (!self::enabled()) {
            return;
        }
        if (!is_string($token) || $token === '') {
            throw new ServiceException('Please complete the CAPTCHA.', 'captcha_required', 422);
        }

        $secret = (string)Env::get('RECAPTCHA_SECRET', '');
        $ok = self::callGoogle($secret, $token, $remoteIp);
        if (!$ok) {
            throw new ServiceException('CAPTCHA verification failed. Please try again.', 'captcha_failed', 422);
        }
    }

    private static function callGoogle(string $secret, string $token, ?string $remoteIp): bool
    {
        $postData = http_build_query(array_filter([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $remoteIp,
        ]));

        // Prefer cURL; fall back to file_get_contents with a stream context.
        if (function_exists('curl_init')) {
            $ch = curl_init('https://www.google.com/recaptcha/api/siteverify');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $postData,
                CURLOPT_TIMEOUT        => 8,
            ]);
            $body = curl_exec($ch);
            curl_close($ch);
        } else {
            $ctx = stream_context_create(['http' => [
                'method'  => 'POST',
                'header'  => 'Content-Type: application/x-www-form-urlencoded',
                'content' => $postData,
                'timeout' => 8,
            ]]);
            $body = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $ctx);
        }

        if (!is_string($body) || $body === '') {
            error_log('reCAPTCHA verify: empty/failed response');
            return false;
        }
        $data = json_decode($body, true);
        return is_array($data) && !empty($data['success']);
    }
}
