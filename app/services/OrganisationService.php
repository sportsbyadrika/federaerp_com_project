<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\OrganisationModel;
use Core\Storage;

/**
 * Institution (organisation) settings: letterhead details (GST/PAN, full name,
 * address) and the logo. The logo is stored via the Storage abstraction
 * (outside the web root) and streamed through an authenticated route.
 */
final class OrganisationService extends BaseService
{
    private OrganisationModel $orgs;
    private Storage $storage;

    private const EDITABLE = [
        'name', 'legal_name', 'gst_number', 'pan', 'email', 'phone',
        'address', 'city', 'country', 'letterhead_address',
    ];

    /** Image kind => the organisations column that stores its path. */
    private const IMAGE_COLUMNS = [
        'logo'      => 'logo_path',
        'signature' => 'signature_path',
        'seal'      => 'seal_path',
    ];

    public function __construct()
    {
        $this->orgs = new OrganisationModel();
        $this->storage = new Storage();
    }

    public function get(int $tenantId): array
    {
        $org = $this->orgs->findById($tenantId);
        if ($org === null) {
            throw ServiceException::notFound('Organisation not found');
        }
        unset($org['is_platform']);
        $org['has_logo'] = !empty($org['logo_path']);
        $org['has_signature'] = !empty($org['signature_path']);
        $org['has_seal'] = !empty($org['seal_path']);
        return $org;
    }

    public function update(int $tenantId, array $input): array
    {
        $data = [];
        foreach (self::EDITABLE as $col) {
            if (array_key_exists($col, $input)) {
                $data[$col] = $input[$col];
            }
        }
        if ($data) {
            $this->orgs->update($tenantId, null, $data);
        }
        return $this->get($tenantId);
    }

    /** Store an institution image (logo | signature | seal); replaces the old one. */
    public function saveImage(int $tenantId, string $kind, array $file): array
    {
        $column = self::IMAGE_COLUMNS[$kind] ?? null;
        if ($column === null) {
            throw ServiceException::notFound('Unknown image kind');
        }
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true)) {
            throw ServiceException::unprocessable('Image must be a PNG, JPG, WEBP or GIF.');
        }
        $stored = $this->storage->storeUpload($file, $tenantId);

        $org = $this->orgs->findById($tenantId);
        $old = $org[$column] ?? null;

        $this->orgs->update($tenantId, null, [$column => $stored['path']]);
        if ($old) {
            $this->storage->delete($old);
        }
        return $this->get($tenantId);
    }

    /** Resolve an institution image for streaming (absolute path + mime). */
    public function imageForStream(int $tenantId, string $kind): array
    {
        $column = self::IMAGE_COLUMNS[$kind] ?? null;
        if ($column === null) {
            throw ServiceException::notFound('Unknown image kind');
        }
        $org = $this->orgs->findById($tenantId);
        if ($org === null || empty($org[$column])) {
            throw ServiceException::notFound(ucfirst($kind) . ' not set');
        }
        $abs = $this->storage->absolutePath($org[$column]);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($abs) ?: 'image/png';
        return ['abs_path' => $abs, 'mime' => $mime, 'download_name' => $kind . '.' . pathinfo($abs, PATHINFO_EXTENSION)];
    }

    /** Back-compat wrappers for the existing logo routes. */
    public function saveLogo(int $tenantId, array $file): array
    {
        return $this->saveImage($tenantId, 'logo', $file);
    }

    public function logoForStream(int $tenantId): array
    {
        return $this->imageForStream($tenantId, 'logo');
    }
}

