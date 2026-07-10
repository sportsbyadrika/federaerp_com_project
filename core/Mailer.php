<?php
declare(strict_types=1);

namespace Core;

/**
 * Minimal, dependency-free mailer. Sends via SMTP when MAIL_HOST is configured
 * (AUTH LOGIN, with STARTTLS/implicit TLS), otherwise falls back to logging the
 * message into storage/logs so flows (e.g. password reset) are testable without
 * a mail server. No Composer/PHPMailer needed.
 */
final class Mailer
{
    public static function send(string $toEmail, string $subject, string $htmlBody, ?string $textBody = null): bool
    {
        $host = (string)Env::get('MAIL_HOST', '');
        $fromEmail = (string)Env::get('MAIL_FROM', 'no-reply@localhost');
        $fromName = (string)Env::get('MAIL_FROM_NAME', 'Federa ERP');

        if ($host === '') {
            // No SMTP configured — log it so the flow still works in dev.
            error_log("[MAIL:fallback] To: {$toEmail} | Subject: {$subject}\n" . ($textBody ?? strip_tags($htmlBody)));
            return true;
        }

        try {
            return self::smtpSend($host, $toEmail, $fromEmail, $fromName, $subject, $htmlBody, $textBody);
        } catch (\Throwable $e) {
            error_log('Mailer SMTP error: ' . $e->getMessage());
            return false;
        }
    }

    private static function smtpSend(string $host, string $to, string $fromEmail, string $fromName, string $subject, string $html, ?string $text): bool
    {
        $port = Env::int('MAIL_PORT', 587);
        $user = (string)Env::get('MAIL_USER', '');
        $pass = (string)Env::get('MAIL_PASS', '');
        $enc = strtolower((string)Env::get('MAIL_ENCRYPTION', 'tls'));

        $transport = $enc === 'ssl' ? "ssl://{$host}" : $host;
        $fp = @stream_socket_client("{$transport}:{$port}", $errno, $errstr, 15);
        if (!$fp) {
            throw new \RuntimeException("SMTP connect failed: {$errstr} ({$errno})");
        }
        stream_set_timeout($fp, 15);

        $read = function () use ($fp): string {
            $data = '';
            while (($line = fgets($fp, 515)) !== false) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break;
                }
            }
            return $data;
        };
        $cmd = function (string $c) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            return $read();
        };
        $expect = function (string $resp, string $code): void {
            if (strncmp($resp, $code, strlen($code)) !== 0) {
                throw new \RuntimeException('SMTP unexpected reply: ' . trim($resp));
            }
        };

        $expect($read(), '220');
        $host_name = (string)Env::get('APP_URL', 'localhost');
        $expect($cmd('EHLO ' . parse_url($host_name, PHP_URL_HOST) ?: 'localhost'), '250');

        if ($enc === 'tls') {
            $expect($cmd('STARTTLS'), '220');
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
                throw new \RuntimeException('STARTTLS negotiation failed');
            }
            $expect($cmd('EHLO ' . (parse_url($host_name, PHP_URL_HOST) ?: 'localhost')), '250');
        }

        if ($user !== '') {
            $expect($cmd('AUTH LOGIN'), '334');
            $expect($cmd(base64_encode($user)), '334');
            $expect($cmd(base64_encode($pass)), '235');
        }

        $expect($cmd('MAIL FROM:<' . $fromEmail . '>'), '250');
        $expect($cmd('RCPT TO:<' . $to . '>'), '250');
        $expect($cmd('DATA'), '354');

        $boundary = 'b' . bin2hex(random_bytes(8));
        $headers = [
            'From: ' . self::encodeName($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $to . '>',
            'Subject: ' . self::encodeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $body = implode("\r\n", $headers) . "\r\n\r\n"
            . "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . ($text ?? strip_tags($html)) . "\r\n"
            . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . $html . "\r\n"
            . "--{$boundary}--\r\n.";
        $expect($cmd($body), '250');
        $cmd('QUIT');
        fclose($fp);
        return true;
    }

    private static function encodeHeader(string $s): string
    {
        return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
    }

    private static function encodeName(string $s): string
    {
        return self::encodeHeader($s);
    }
}
