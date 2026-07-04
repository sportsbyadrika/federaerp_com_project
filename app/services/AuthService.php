<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\OrganisationModel;
use App\Models\UserModel;
use Core\Auth;
use Core\Database;

/**
 * Authentication & tenancy. Implements the mandatory 3-field login
 * (organisation_id + email + password), organisation onboarding, staff
 * management, and password changes.
 */
final class AuthService extends BaseService
{
    private UserModel $users;
    private OrganisationModel $orgs;

    public function __construct()
    {
        $this->users = new UserModel();
        $this->orgs = new OrganisationModel();
    }

    /**
     * 3-field login. Validate the org exists, then match the user WITHIN that
     * org, then verify the password. Uniform error message so we don't reveal
     * which of the three fields was wrong.
     */
    public function login(int $organisationId, string $email, string $password): array
    {
        $genericError = new ServiceException('Invalid organisation ID, email, or password', 'invalid_credentials', 401);

        if (!$this->orgs->existsById($organisationId)) {
            throw $genericError;
        }
        $user = $this->users->findByOrgAndEmail($organisationId, $email);
        if ($user === null || $user['status'] === 'disabled') {
            throw $genericError;
        }
        if (!password_verify($password, $user['password_hash'])) {
            throw $genericError;
        }

        // Transparent rehash if the algorithm/cost changed.
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->users->updatePassword((int)$user['id'], password_hash($password, PASSWORD_DEFAULT));
        }

        $this->users->touchLogin((int)$user['id']);
        Auth::login($user);                 // regenerates session id + CSRF token

        return $this->publicUser($user);
    }

    /**
     * Organisation onboarding: create a new org with a random unique 6-digit id
     * and its first Org Admin. Runs in a transaction.
     */
    public function registerOrganisation(array $data): array
    {
        $db = Database::instance();
        $email = strtolower(trim((string)$data['admin_email']));

        $db->beginTransaction();
        try {
            $orgId = $this->orgs->generateUniqueId();
            $this->orgs->create([
                'id'         => $orgId,
                'name'       => trim((string)$data['organisation_name']),
                'legal_name' => $data['legal_name'] ?? null,
                'email'      => $data['organisation_email'] ?? $email,
                'phone'      => $data['phone'] ?? null,
                'city'       => $data['city'] ?? null,
                'country'    => $data['country'] ?? null,
                'currency'   => $data['currency'] ?? 'USD',
                'is_platform'=> 0,
                'status'     => 'active',
            ]);

            $userId = $this->users->create([
                'organisation_id' => $orgId,
                'name'            => trim((string)$data['admin_name']),
                'email'           => $email,
                'password_hash'   => password_hash((string)$data['password'], PASSWORD_DEFAULT),
                'role'            => 'org_admin',
                'job_role'        => 'admin',
                'status'          => 'active',
            ]);

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return [
            'organisation_id' => $orgId,
            'admin_user_id'   => $userId,
            'message'         => 'Organisation created. Use this Organisation ID to log in.',
        ];
    }

    /** Org Admin (or Super Admin) creates/invites a staff member in an org. */
    public function createStaff(int $tenantId, array $data): array
    {
        $email = strtolower(trim((string)$data['email']));
        if ($this->users->emailExistsInOrg($tenantId, $email)) {
            throw ServiceException::conflict('A user with that email already exists in this organisation');
        }
        $role = $data['role'] ?? 'staff';
        if (!in_array($role, ['org_admin', 'staff'], true)) {
            $role = 'staff';
        }
        $userId = $this->users->create([
            'organisation_id' => $tenantId,
            'name'            => trim((string)$data['name']),
            'email'           => $email,
            'password_hash'   => password_hash((string)$data['password'], PASSWORD_DEFAULT),
            'role'            => $role,
            'job_role'        => $data['job_role'] ?? null,
            'phone'           => $data['phone'] ?? null,
            'status'          => 'active',
        ]);
        return $this->publicUser($this->users->find($userId, $tenantId) ?? []);
    }

    public function listStaff(int $tenantId): array
    {
        return $this->users->forOrg($tenantId);
    }

    public function changePassword(int $userId, string $current, string $new): void
    {
        $user = $this->users->find($userId, null);
        if ($user === null) {
            throw ServiceException::notFound('User not found');
        }
        if (!password_verify($current, $user['password_hash'])) {
            throw new ServiceException('Current password is incorrect', 'invalid_password', 422);
        }
        $this->users->updatePassword($userId, password_hash($new, PASSWORD_DEFAULT));
    }

    // ---- Super Admin: cross-org management --------------------------------
    public function listOrganisations(): array
    {
        return $this->orgs->allOrganisations();
    }

    public function setOrganisationStatus(int $orgId, string $status): array
    {
        if (!in_array($status, ['active', 'suspended'], true)) {
            throw ServiceException::unprocessable('Invalid status');
        }
        if ($orgId === 111111) {
            throw ServiceException::forbidden('The platform organisation cannot be modified');
        }
        $this->orgs->update($orgId, null, ['status' => $status]);
        return $this->orgs->findById($orgId) ?? [];
    }

    private function publicUser(array $user): array
    {
        return [
            'id'              => (int)$user['id'],
            'organisation_id' => (int)$user['organisation_id'],
            'name'            => $user['name'],
            'email'           => $user['email'],
            'role'            => $user['role'],
            'job_role'        => $user['job_role'] ?? null,
        ];
    }
}
