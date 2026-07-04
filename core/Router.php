<?php
declare(strict_types=1);

namespace Core;

/**
 * Segment router with route params ({id}), HTTP verbs, and middleware — both
 * global (via groups) and per-route. Controllers are resolved lazily as
 * "Class@method" strings so we don't instantiate everything on every request.
 */
final class Router
{
    /** @var array<int,array{method:string,pattern:string,regex:string,vars:string[],handler:mixed,middleware:string[]}> */
    private array $routes = [];

    /** stack of middleware applied by the current group() */
    private array $groupMiddleware = [];
    private string $groupPrefix = '';

    public function get(string $path, mixed $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    public function post(string $path, mixed $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    public function put(string $path, mixed $handler, array $middleware = []): void
    {
        $this->add('PUT', $path, $handler, $middleware);
    }

    public function patch(string $path, mixed $handler, array $middleware = []): void
    {
        $this->add('PATCH', $path, $handler, $middleware);
    }

    public function delete(string $path, mixed $handler, array $middleware = []): void
    {
        $this->add('DELETE', $path, $handler, $middleware);
    }

    /** Register a group of routes sharing a prefix + middleware. */
    public function group(string $prefix, array $middleware, callable $fn): void
    {
        $prevPrefix = $this->groupPrefix;
        $prevMw = $this->groupMiddleware;

        $this->groupPrefix = $prevPrefix . $prefix;
        $this->groupMiddleware = array_merge($prevMw, $middleware);

        $fn($this);

        $this->groupPrefix = $prevPrefix;
        $this->groupMiddleware = $prevMw;
    }

    private function add(string $method, string $path, mixed $handler, array $middleware): void
    {
        $full = $this->groupPrefix . $path;
        $full = '/' . trim($full, '/');
        if ($full === '/') {
            $full = '/';
        }

        // Convert {name} to a named capture group.
        $vars = [];
        $regex = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', function ($m) use (&$vars) {
            $vars[] = $m[1];
            return '([^/]+)';
        }, $full);
        $regex = '#^' . $regex . '$#';

        $this->routes[] = [
            'method'     => $method,
            'pattern'    => $full,
            'regex'      => $regex,
            'vars'       => $vars,
            'handler'    => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    /**
     * Match & dispatch. Runs middleware in order, then the controller.
     * Middleware are class names implementing handle(Request): bool — returning
     * false short-circuits (the middleware already sent a response).
     */
    public function dispatch(Request $request): void
    {
        $method = $request->method();
        $path = $request->path();
        $methodMismatch = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $matches)) {
                continue;
            }
            if ($route['method'] !== $method) {
                $methodMismatch = true;
                continue;
            }

            // Bind route params
            $params = [];
            foreach ($route['vars'] as $i => $name) {
                $params[$name] = $matches[$i + 1] ?? null;
            }
            $request->setParams($params);

            // Run middleware
            foreach ($route['middleware'] as $mw) {
                $instance = new $mw();
                if ($instance->handle($request) === false) {
                    return; // middleware already responded
                }
            }

            $this->invoke($route['handler'], $request);
            return;
        }

        if ($methodMismatch) {
            Response::error('method_not_allowed', 'HTTP method not allowed for this route', 405);
            return;
        }
        Response::notFound('Route not found');
    }

    private function invoke(mixed $handler, Request $request): void
    {
        if (is_callable($handler)) {
            $handler($request);
            return;
        }
        if (is_string($handler) && str_contains($handler, '@')) {
            [$class, $action] = explode('@', $handler, 2);
            $fqcn = str_contains($class, '\\') ? $class : "App\\Controllers\\$class";
            $controller = new $fqcn();
            $controller->$action($request);
            return;
        }
        Response::error('server_error', 'Invalid route handler', 500);
    }
}
