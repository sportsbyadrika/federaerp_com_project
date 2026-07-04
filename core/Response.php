<?php
declare(strict_types=1);

namespace Core;

/**
 * JSON envelope helper. Every API response has the shape:
 *   { "success": bool, "data": ..., "error": {code,message}, "meta": {...} }
 */
final class Response
{
    public static function json(mixed $payload, int $status = 200): void
    {
        http_response_code($status);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function success(mixed $data = null, array $meta = [], int $status = 200): void
    {
        $envelope = [
            'success' => true,
            'data'    => $data,
            'error'   => null,
        ];
        if ($meta) {
            $envelope['meta'] = $meta;
        }
        self::json($envelope, $status);
    }

    public static function error(string $code, string $message, int $status = 400, array $extra = []): void
    {
        $envelope = [
            'success' => false,
            'data'    => null,
            'error'   => array_merge(['code' => $code, 'message' => $message], $extra),
        ];
        self::json($envelope, $status);
    }

    /** Validation failure with a field->messages map. */
    public static function validation(array $errors, string $message = 'Validation failed'): void
    {
        self::error('validation_error', $message, 422, ['fields' => $errors]);
    }

    public static function unauthorized(string $message = 'Authentication required'): void
    {
        self::error('unauthorized', $message, 401);
    }

    public static function forbidden(string $message = 'You do not have access to this resource'): void
    {
        self::error('forbidden', $message, 403);
    }

    public static function notFound(string $message = 'Resource not found'): void
    {
        self::error('not_found', $message, 404);
    }

    /** Stream a file through PHP (used by the authenticated upload proxy). */
    public static function stream(string $absolutePath, string $mime, string $downloadName, bool $inline = true): void
    {
        if (!is_file($absolutePath)) {
            self::notFound('File not found');
            return;
        }
        $disposition = $inline ? 'inline' : 'attachment';
        http_response_code(200);
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($absolutePath));
        header(sprintf('Content-Disposition: %s; filename="%s"', $disposition, rawurlencode($downloadName)));
        header('X-Content-Type-Options: nosniff');
        readfile($absolutePath);
    }

    /** Send raw text (e.g. CSV export). */
    public static function raw(string $body, string $contentType, int $status = 200, array $headers = []): void
    {
        http_response_code($status);
        header('Content-Type: ' . $contentType);
        foreach ($headers as $k => $v) {
            header("$k: $v");
        }
        echo $body;
    }
}
