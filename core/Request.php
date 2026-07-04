<?php
declare(strict_types=1);

namespace Core;

/**
 * Wraps the incoming HTTP request. Parses JSON bodies, exposes route params,
 * and carries request-scoped context (auth user + tenant_id) injected by
 * middleware.
 */
final class Request
{
    private array $query;
    private array $body;
    private array $params = [];      // route params, e.g. {id}
    private array $context = [];     // auth user, tenant_id, etc.
    private string $method;
    private string $path;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        // Support method override for hosts that block PUT/DELETE.
        if ($this->method === 'POST' && isset($_POST['_method'])) {
            $override = strtoupper((string)$_POST['_method']);
            if (in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) {
                $this->method = $override;
            }
        }

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $this->path = '/' . trim(parse_url($uri, PHP_URL_PATH) ?? '/', '/');

        $this->query = $_GET ?? [];
        $this->body = $this->parseBody();
    }

    private function parseBody(): array
    {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($contentType, 'application/json')) {
            $raw = file_get_contents('php://input') ?: '';
            if ($raw === '') {
                return [];
            }
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }
        return $_POST ?? [];
    }

    public function method(): string
    {
        return $this->method;
    }

    public function path(): string
    {
        return $this->path;
    }

    public function isWrite(): bool
    {
        return in_array($this->method, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
    }

    /** Query-string value. */
    public function query(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function allQuery(): array
    {
        return $this->query;
    }

    /** Body value (JSON or form). */
    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function all(): array
    {
        return $this->body;
    }

    /** Return only the listed keys from the body. */
    public function only(array $keys): array
    {
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $this->body)) {
                $out[$k] = $this->body[$k];
            }
        }
        return $out;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('Authorization');
        if ($auth && preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    // ---- route params -------------------------------------------------
    public function setParams(array $params): void
    {
        $this->params = $params;
    }

    public function param(string $key, mixed $default = null): mixed
    {
        return $this->params[$key] ?? $default;
    }

    // ---- request context (set by middleware) --------------------------
    public function setContext(string $key, mixed $value): void
    {
        $this->context[$key] = $value;
    }

    public function context(string $key, mixed $default = null): mixed
    {
        return $this->context[$key] ?? $default;
    }

    /** Authenticated user array, or null. */
    public function user(): ?array
    {
        return $this->context['user'] ?? null;
    }

    /** Tenant (organisation) id scoping this request. */
    public function tenantId(): ?int
    {
        $t = $this->context['tenant_id'] ?? null;
        return $t === null ? null : (int)$t;
    }

    public function role(): ?string
    {
        return $this->context['user']['role'] ?? null;
    }

    public function isSuperAdmin(): bool
    {
        return $this->role() === 'super_admin';
    }
}
