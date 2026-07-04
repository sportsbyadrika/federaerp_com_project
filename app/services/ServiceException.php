<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Domain/business-rule exception. Controllers catch this (via Controller::guard)
 * and translate it into the standard JSON error envelope with a proper status.
 */
class ServiceException extends \RuntimeException
{
    private string $errorCode;
    private int $httpStatus;

    public function __construct(string $message, string $errorCode = 'error', int $httpStatus = 400)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
    }

    public function code(): string
    {
        return $this->errorCode;
    }

    public function status(): int
    {
        return $this->httpStatus;
    }

    public static function notFound(string $message = 'Resource not found'): self
    {
        return new self($message, 'not_found', 404);
    }

    public static function forbidden(string $message = 'You do not have access to this resource'): self
    {
        return new self($message, 'forbidden', 403);
    }

    public static function conflict(string $message): self
    {
        return new self($message, 'conflict', 409);
    }

    public static function unprocessable(string $message): self
    {
        return new self($message, 'unprocessable', 422);
    }
}
