<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Company currencies. A tenant can define several (code + symbol); exactly one
 * is the default. The default is mirrored onto organisations.currency /
 * currency_symbol for quick display everywhere.
 */
final class CurrencyService extends BaseService
{
    private GenericModel $currencies;

    public function __construct()
    {
        $this->currencies = new GenericModel('currencies', ['tenant_id', 'code', 'symbol', 'is_default']);
    }

    public function list(int $tenantId): array
    {
        return $this->currencies->forTenant($tenantId, [], ['order_by' => 'is_default', 'order_dir' => 'DESC']);
    }

    public function default(int $tenantId): array
    {
        $row = Database::instance()->fetch(
            'SELECT currency AS code, currency_symbol AS symbol FROM organisations WHERE id = :t',
            [':t' => $tenantId]
        );
        return $row ?: ['code' => 'USD', 'symbol' => '$'];
    }

    public function create(int $tenantId, array $input): array
    {
        $code = strtoupper(trim((string)($input['code'] ?? '')));
        $symbol = trim((string)($input['symbol'] ?? ''));
        if ($code === '' || $symbol === '') {
            throw ServiceException::unprocessable('Currency code and symbol are required');
        }
        if ($this->currencies->countForTenant($tenantId, ['code' => $code]) > 0) {
            throw ServiceException::conflict('That currency code already exists');
        }
        $makeDefault = !empty($input['is_default']) || $this->currencies->countForTenant($tenantId) === 0;

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $id = $this->currencies->create(['tenant_id' => $tenantId, 'code' => $code, 'symbol' => $symbol, 'is_default' => $makeDefault ? 1 : 0]);
            if ($makeDefault) {
                $this->applyDefault($tenantId, $id, $code, $symbol);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->currencies->findOrFail($id, $tenantId);
    }

    public function update(int $tenantId, int $id, array $input): array
    {
        $row = $this->currencies->findOrFail($id, $tenantId);
        $code = strtoupper(trim((string)($input['code'] ?? $row['code'])));
        $symbol = trim((string)($input['symbol'] ?? $row['symbol']));
        if ($code === '' || $symbol === '') {
            throw ServiceException::unprocessable('Currency code and symbol are required');
        }
        // Code must stay unique within the tenant (excluding this row).
        $clash = Database::instance()->fetchColumn(
            'SELECT COUNT(*) FROM currencies WHERE tenant_id = :t AND code = :c AND id <> :id',
            [':t' => $tenantId, ':c' => $code, ':id' => $id]
        );
        if ((int)$clash > 0) {
            throw ServiceException::conflict('That currency code already exists');
        }
        $makeDefault = !empty($input['is_default']);

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $this->currencies->update($id, $tenantId, ['code' => $code, 'symbol' => $symbol]);
            // Keep the org mirror in sync when editing the default (or setting it).
            if ($makeDefault || (int)$row['is_default'] === 1) {
                $this->applyDefault($tenantId, $id, $code, $symbol);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->currencies->findOrFail($id, $tenantId);
    }

    public function setDefault(int $tenantId, int $id): array
    {
        $row = $this->currencies->findOrFail($id, $tenantId);
        $this->applyDefault($tenantId, $id, $row['code'], $row['symbol']);
        return $this->currencies->findOrFail($id, $tenantId);
    }

    public function delete(int $tenantId, int $id): void
    {
        $row = $this->currencies->findOrFail($id, $tenantId);
        if ((int)$row['is_default'] === 1) {
            throw ServiceException::unprocessable('Cannot delete the default currency. Set another default first.');
        }
        $this->currencies->delete($id, $tenantId);
    }

    private function applyDefault(int $tenantId, int $id, string $code, string $symbol): void
    {
        $db = Database::instance();
        $db->execute('UPDATE currencies SET is_default = 0 WHERE tenant_id = :t', [':t' => $tenantId]);
        $db->execute('UPDATE currencies SET is_default = 1 WHERE id = :id AND tenant_id = :t', [':id' => $id, ':t' => $tenantId]);
        $db->execute('UPDATE organisations SET currency = :c, currency_symbol = :s WHERE id = :t', [':c' => $code, ':s' => $symbol, ':t' => $tenantId]);
    }
}
