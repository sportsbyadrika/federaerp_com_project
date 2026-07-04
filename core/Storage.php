<?php
declare(strict_types=1);

namespace Core;

/**
 * File-storage abstraction. At MVP this is a local driver writing OUTSIDE the
 * web root; the interface is deliberately narrow so a future S3/GCS driver can
 * be swapped in without touching callers (cloud-migration goal from CLAUDE.md).
 *
 * Files are stored under storage/uploads/<tenant_id>/<random>.<ext> and are
 * NEVER exposed via a direct URL — they are streamed through an authenticated
 * proxy controller.
 */
final class Storage
{
    private string $root;

    /** Extension => allowed MIME types. */
    private const ALLOWED = [
        'jpg'  => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png'  => ['image/png'],
        'gif'  => ['image/gif'],
        'webp' => ['image/webp'],
        'pdf'  => ['application/pdf'],
        'doc'  => ['application/msword'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'xls'  => ['application/vnd.ms-excel'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'dwg'  => ['image/vnd.dwg', 'application/acad', 'application/octet-stream'],
        'dxf'  => ['image/vnd.dxf', 'application/dxf', 'application/octet-stream'],
        'txt'  => ['text/plain'],
        'csv'  => ['text/plain', 'text/csv', 'application/csv'],
    ];

    private const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

    public function __construct(?string $root = null)
    {
        $root = $root ?: (string)Env::get('STORAGE_PATH', '');
        if ($root === '') {
            // default: <project>/storage
            $root = dirname(__DIR__) . '/storage';
        }
        $this->root = rtrim($root, '/');
    }

    public function uploadsDir(): string
    {
        return $this->root . '/uploads';
    }

    /**
     * Validate + store an uploaded file for a tenant.
     * @param array $file  a $_FILES[...] entry
     * @return array{path:string,stored_name:string,original_name:string,mime:string,size:int,ext:string}
     * @throws \RuntimeException on validation failure
     */
    public function storeUpload(array $file, int $tenantId): array
    {
        if (!isset($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            throw new \RuntimeException('No valid uploaded file provided.');
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('File upload failed (error code ' . $file['error'] . ').');
        }

        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw new \RuntimeException('File exceeds the maximum allowed size (20 MB).');
        }

        $originalName = (string)($file['name'] ?? 'file');
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!isset(self::ALLOWED[$ext])) {
            throw new \RuntimeException("File type .{$ext} is not allowed.");
        }

        // Verify real MIME from file content, not the client-supplied type.
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($file['tmp_name']);
        if (!in_array($mime, self::ALLOWED[$ext], true)) {
            throw new \RuntimeException("File content ({$mime}) does not match extension .{$ext}.");
        }

        $dir = $this->uploadsDir() . '/' . $tenantId;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Unable to create storage directory.');
        }
        $this->ensureUploadGuard($this->uploadsDir());

        $storedName = bin2hex(random_bytes(16)) . '.' . $ext;
        $dest = $dir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new \RuntimeException('Failed to move uploaded file into storage.');
        }
        @chmod($dest, 0644);

        return [
            'path'          => $this->relative($dest),
            'stored_name'   => $storedName,
            'original_name' => $originalName,
            'mime'          => $mime,
            'size'          => $size,
            'ext'           => $ext,
        ];
    }

    /** Absolute path for a stored relative path. Guards against traversal. */
    public function absolutePath(string $relative): string
    {
        $relative = ltrim($relative, '/');
        $abs = $this->root . '/' . $relative;
        $realRoot = realpath($this->root) ?: $this->root;
        $realAbs = realpath($abs);
        if ($realAbs === false || !str_starts_with($realAbs, $realRoot)) {
            throw new \RuntimeException('Invalid storage path.');
        }
        return $realAbs;
    }

    public function delete(string $relative): bool
    {
        try {
            $abs = $this->absolutePath($relative);
        } catch (\RuntimeException) {
            return false;
        }
        return is_file($abs) && @unlink($abs);
    }

    private function relative(string $absolute): string
    {
        return ltrim(str_replace($this->root, '', $absolute), '/');
    }

    /** Drop a .htaccess that blocks execution + direct access inside uploads. */
    private function ensureUploadGuard(string $dir): void
    {
        $guard = $dir . '/.htaccess';
        if (is_file($guard)) {
            return;
        }
        $rules = <<<HT
        # Storage is served ONLY through the authenticated PHP proxy.
        Require all denied
        <IfModule mod_php.c>
            php_flag engine off
        </IfModule>
        RemoveHandler .php .phtml .php3 .php4 .php5 .php7
        AddType text/plain .php .phtml .php3 .php4 .php5 .php7
        HT;
        @file_put_contents($guard, $rules);
    }
}
