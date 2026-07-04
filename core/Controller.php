<?php
declare(strict_types=1);

namespace Core;

/**
 * Base controller. Gives subclasses convenient access to validation and the
 * JSON envelope, plus a guard that maps service-layer exceptions to responses.
 */
abstract class Controller
{
    /**
     * Validate request body against rules. On failure sends a 422 and returns
     * null; on success returns the validated subset.
     */
    protected function validate(Request $request, array $rules): ?array
    {
        $validator = Validator::make($request->all(), $rules);
        if ($validator->fails()) {
            Response::validation($validator->errors());
            return null;
        }
        return $validator->validated();
    }

    protected function ok(mixed $data = null, array $meta = [], int $status = 200): void
    {
        Response::success($data, $meta, $status);
    }

    protected function fail(string $code, string $message, int $status = 400): void
    {
        Response::error($code, $message, $status);
    }

    /**
     * Wrap a service call, translating known exceptions into envelopes.
     * Business rules throw \App\Services\ServiceException with an HTTP status.
     */
    protected function guard(callable $fn): void
    {
        try {
            $fn();
        } catch (\App\Services\ServiceException $e) {
            Response::error($e->code(), $e->getMessage(), $e->status());
        } catch (\InvalidArgumentException $e) {
            Response::error('bad_request', $e->getMessage(), 400);
        } catch (\Throwable $e) {
            error_log('Unhandled controller error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $debug = Env::bool('APP_DEBUG', false);
            Response::error('server_error', $debug ? $e->getMessage() : 'An unexpected error occurred', 500);
        }
    }
}
