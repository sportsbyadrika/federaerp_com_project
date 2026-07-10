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

    /** Store a logo image; replaces any previous logo. */
    public function saveLogo(int $tenantId, array $file): array
    {
        // Restrict to images.
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true)) {
            throw ServiceException::unprocessable('Logo must be a PNG, JPG, WEBP or GIF image.');
        }
        $stored = $this->storage->storeUpload($file, $tenantId);

        $org = $this->orgs->findById($tenantId);
        $old = $org['logo_path'] ?? null;

        $this->orgs->update($tenantId, null, ['logo_path' => $stored['path']]);
        if ($old) {
            $this->storage->delete($old);
        }
        return $this->get($tenantId);
    }

    /** Resolve the logo for streaming (absolute path + mime). */
    public function logoForStream(int $tenantId): array
    {
        $org = $this->orgs->findById($tenantId);
        if ($org === null || empty($org['logo_path'])) {
            throw ServiceException::notFound('No logo set');
        }
        $abs = $this->storage->absolutePath($org['logo_path']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($abs) ?: 'image/png';
        return ['abs_path' => $abs, 'mime' => $mime, 'download_name' => 'logo.' . pathinfo($abs, PATHINFO_EXTENSION)];
    }
}
