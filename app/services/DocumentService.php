<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;
use Core\Storage;

/**
 * Documents (blueprints/drawings) with version control, and site-photo
 * galleries. Files go through the Storage abstraction (validated, randomized
 * names, stored OUTSIDE the web root) and are served only via the authenticated
 * streaming proxy — never a direct URL.
 */
final class DocumentService extends BaseService
{
    private GenericModel $documents;
    private GenericModel $versions;
    private GenericModel $photos;
    private Storage $storage;

    public function __construct()
    {
        $this->documents = new GenericModel('documents', ['tenant_id','project_id','parent_document_id','title','doc_type','current_version','latest_version_id','uploaded_by'], softDelete: true);
        $this->versions  = new GenericModel('document_versions', ['tenant_id','document_id','version_number','storage_path','original_name','mime_type','file_size','checksum','uploaded_by','change_note']);
        $this->photos    = new GenericModel('site_photos', ['tenant_id','project_id','storage_path','original_name','mime_type','file_size','caption','taken_at','uploaded_by'], softDelete: true);
        $this->storage   = new Storage();
    }

    public function listDocuments(int $tenantId, ?int $projectId = null): array
    {
        $where = $projectId ? ['project_id' => $projectId] : [];
        return $this->documents->forTenant($tenantId, $where, ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    public function listVersions(int $tenantId, int $documentId): array
    {
        $this->documents->findOrFail($documentId, $tenantId);
        return $this->versions->forTenant($tenantId, ['document_id' => $documentId], ['order_by' => 'version_number', 'order_dir' => 'DESC']);
    }

    /**
     * Upload a document. If $documentId is given, adds a new version; otherwise
     * creates a new document at version 1.
     */
    public function upload(int $tenantId, ?int $userId, array $file, array $meta): array
    {
        $stored = $this->storage->storeUpload($file, $tenantId); // validates MIME/ext/size
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $documentId = isset($meta['document_id']) ? (int)$meta['document_id'] : 0;

            if ($documentId > 0) {
                $doc = $this->documents->findOrFail($documentId, $tenantId);
                $versionNumber = (int)$doc['current_version'] + 1;
            } else {
                $documentId = $this->documents->create([
                    'tenant_id'   => $tenantId,
                    'project_id'  => $meta['project_id'] ?? null,
                    'parent_document_id' => $meta['parent_document_id'] ?? null,
                    'title'       => (string)($meta['title'] ?? $stored['original_name']),
                    'doc_type'    => $meta['doc_type'] ?? 'other',
                    'current_version' => 1,
                    'uploaded_by' => $userId,
                ]);
                $versionNumber = 1;
            }

            $versionId = $this->versions->create([
                'tenant_id'      => $tenantId,
                'document_id'    => $documentId,
                'version_number' => $versionNumber,
                'storage_path'   => $stored['path'],
                'original_name'  => $stored['original_name'],
                'mime_type'      => $stored['mime'],
                'file_size'      => $stored['size'],
                'checksum'       => hash_file('sha256', $this->storage->absolutePath($stored['path'])),
                'uploaded_by'    => $userId,
                'change_note'    => $meta['change_note'] ?? null,
            ]);
            $this->documents->update($documentId, $tenantId, [
                'current_version' => $versionNumber, 'latest_version_id' => $versionId,
            ]);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            // best-effort cleanup of the orphaned file
            $this->storage->delete($stored['path']);
            throw $e;
        }
        $doc = $this->documents->findOrFail($documentId, $tenantId);
        $doc['versions'] = $this->versions->forTenant($tenantId, ['document_id' => $documentId], ['order_by' => 'version_number', 'order_dir' => 'DESC']);
        return $doc;
    }

    // ---- Site photos ------------------------------------------------------
    public function listPhotos(int $tenantId, int $projectId): array
    {
        return $this->photos->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    public function uploadPhoto(int $tenantId, ?int $userId, array $file, array $meta): array
    {
        $stored = $this->storage->storeUpload($file, $tenantId);
        $id = $this->photos->create([
            'tenant_id'     => $tenantId,
            'project_id'    => (int)$meta['project_id'],
            'storage_path'  => $stored['path'],
            'original_name' => $stored['original_name'],
            'mime_type'     => $stored['mime'],
            'file_size'     => $stored['size'],
            'caption'       => $meta['caption'] ?? null,
            'taken_at'      => $meta['taken_at'] ?? null,
            'uploaded_by'   => $userId,
        ]);
        return $this->photos->findOrFail($id, $tenantId);
    }

    /**
     * Resolve a file for streaming. Verifies tenant ownership before returning
     * the absolute path + metadata for Response::stream().
     */
    public function resolveForStream(int $tenantId, string $kind, int $id): array
    {
        if ($kind === 'document') {
            $row = $this->versions->findOrFail($id, $tenantId);
        } elseif ($kind === 'photo') {
            $row = $this->photos->findOrFail($id, $tenantId);
        } else {
            throw ServiceException::notFound('Unknown file kind');
        }
        return [
            'abs_path'      => $this->storage->absolutePath($row['storage_path']),
            'mime'          => $row['mime_type'],
            'download_name' => $row['original_name'],
        ];
    }
}
