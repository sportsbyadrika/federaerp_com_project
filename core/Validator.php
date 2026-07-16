<?php
declare(strict_types=1);

namespace Core;

/**
 * Rule-based server-side validation. Never trust the client. Returns a
 * field => [messages] map; empty means valid.
 *
 * Supported rules (pipe-separated):
 *   required, nullable, string, integer, numeric, boolean, email,
 *   min:N, max:N, between:A,B, in:a,b,c, digits:N, date, array,
 *   confirmed (expects <field>_confirmation)
 */
final class Validator
{
    private array $data;
    private array $rules;
    private array $errors = [];
    private bool $sizeByLength = false;

    public function __construct(array $data, array $rules)
    {
        $this->data = $data;
        $this->rules = $rules;
    }

    public static function make(array $data, array $rules): self
    {
        return new self($data, $rules);
    }

    public function passes(): bool
    {
        $this->errors = [];
        foreach ($this->rules as $field => $ruleString) {
            $rules = is_array($ruleString) ? $ruleString : explode('|', $ruleString);
            $value = $this->data[$field] ?? null;
            $isNullable = in_array('nullable', $rules, true);
            // A field declared string/email sizes min/max by character length,
            // even when its value looks numeric (e.g. an account number).
            $this->sizeByLength = in_array('string', $rules, true) || in_array('email', $rules, true);

            if ($isNullable && ($value === null || $value === '')) {
                continue;
            }

            foreach ($rules as $rule) {
                if ($rule === 'nullable') {
                    continue;
                }
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $this->applyRule($field, $value, $name, $arg);
            }
        }
        return empty($this->errors);
    }

    public function fails(): bool
    {
        return !$this->passes();
    }

    public function errors(): array
    {
        return $this->errors;
    }

    /** Return validated data limited to the ruleset keys. */
    public function validated(): array
    {
        $out = [];
        foreach (array_keys($this->rules) as $field) {
            if (array_key_exists($field, $this->data)) {
                $out[$field] = $this->data[$field];
            }
        }
        return $out;
    }

    private function addError(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }

    private function applyRule(string $field, mixed $value, string $name, ?string $arg): void
    {
        $label = str_replace('_', ' ', $field);

        switch ($name) {
            case 'required':
                if ($value === null || $value === '' || (is_array($value) && count($value) === 0)) {
                    $this->addError($field, "The {$label} field is required.");
                }
                break;

            case 'string':
                if ($value !== null && !is_string($value)) {
                    $this->addError($field, "The {$label} must be a string.");
                }
                break;

            case 'integer':
                if ($value !== null && filter_var($value, FILTER_VALIDATE_INT) === false) {
                    $this->addError($field, "The {$label} must be an integer.");
                }
                break;

            case 'numeric':
                if ($value !== null && !is_numeric($value)) {
                    $this->addError($field, "The {$label} must be a number.");
                }
                break;

            case 'boolean':
                if ($value !== null && !in_array($value, [true, false, 0, 1, '0', '1'], true)) {
                    $this->addError($field, "The {$label} must be true or false.");
                }
                break;

            case 'email':
                if ($value !== null && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    $this->addError($field, "The {$label} must be a valid email address.");
                }
                break;

            case 'digits':
                if ($value !== null && !preg_match('/^\d{' . (int)$arg . '}$/', (string)$value)) {
                    $this->addError($field, "The {$label} must be exactly {$arg} digits.");
                }
                break;

            case 'min':
                if (is_numeric($value) && !$this->sizeByLength) {
                    if ((float)$value < (float)$arg) {
                        $this->addError($field, "The {$label} must be at least {$arg}.");
                    }
                } elseif (mb_strlen((string)$value) < (int)$arg) {
                    $this->addError($field, "The {$label} must be at least {$arg} characters.");
                }
                break;

            case 'max':
                if (is_numeric($value) && !$this->sizeByLength) {
                    if ((float)$value > (float)$arg) {
                        $this->addError($field, "The {$label} may not be greater than {$arg}.");
                    }
                } elseif (mb_strlen((string)$value) > (int)$arg) {
                    $this->addError($field, "The {$label} may not exceed {$arg} characters.");
                }
                break;

            case 'between':
                [$lo, $hi] = array_pad(explode(',', (string)$arg), 2, null);
                $len = is_numeric($value) ? (float)$value : mb_strlen((string)$value);
                if ($len < (float)$lo || $len > (float)$hi) {
                    $this->addError($field, "The {$label} must be between {$lo} and {$hi}.");
                }
                break;

            case 'in':
                $allowed = explode(',', (string)$arg);
                if ($value !== null && !in_array((string)$value, $allowed, true)) {
                    $this->addError($field, "The selected {$label} is invalid.");
                }
                break;

            case 'array':
                if ($value !== null && !is_array($value)) {
                    $this->addError($field, "The {$label} must be a list.");
                }
                break;

            case 'date':
                if ($value !== null && strtotime((string)$value) === false) {
                    $this->addError($field, "The {$label} must be a valid date.");
                }
                break;

            case 'confirmed':
                $conf = $this->data[$field . '_confirmation'] ?? null;
                if ($value !== $conf) {
                    $this->addError($field, "The {$label} confirmation does not match.");
                }
                break;
        }
    }
}
