<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuthService;
use Core\Auth;
use Core\Controller;
use Core\Csrf;
use Core\Request;
use Core\Response;

final class AuthController extends Controller
{
    private AuthService $auth;

    public function __construct()
    {
        $this->auth = new AuthService();
    }

    /** Public: issue a CSRF token (used by the login form before authenticating). */
    public function csrf(Request $request): void
    {
        Response::success(['csrf_token' => Csrf::token()]);
    }

    /** POST /api/auth/login — 3-field login. */
    public function login(Request $request): void
    {
        $data = $this->validate($request, [
            'organisation_id' => 'required|digits:6',
            'email'           => 'required|email',
            'password'        => 'required|string',
        ]);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($data) {
            $user = $this->auth->login((int)$data['organisation_id'], $data['email'], $data['password']);
            Response::success([
                'user'       => $user,
                'csrf_token' => Csrf::token(),
            ]);
        });
    }

    /** POST /api/auth/register-organisation — onboarding. */
    public function registerOrganisation(Request $request): void
    {
        $data = $this->validate($request, [
            'organisation_name' => 'required|string|max:160',
            'admin_name'        => 'required|string|max:120',
            'admin_email'       => 'required|email',
            'password'          => 'required|string|min:8|confirmed',
        ]);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request) {
            $result = $this->auth->registerOrganisation($request->all());
            Response::success($result, [], 201);
        });
    }

    /** GET /api/auth/me — current user. */
    public function me(Request $request): void
    {
        Response::success([
            'user'       => $request->user(),
            'csrf_token' => Csrf::token(),
        ]);
    }

    /** POST /api/auth/logout */
    public function logout(Request $request): void
    {
        Auth::logout();
        Response::success(['message' => 'Logged out']);
    }

    /** POST /api/auth/change-password */
    public function changePassword(Request $request): void
    {
        $data = $this->validate($request, [
            'current_password' => 'required|string',
            'new_password'     => 'required|string|min:8|confirmed',
        ]);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request, $data) {
            $this->auth->changePassword((int)$request->user()['id'], $data['current_password'], $data['new_password']);
            Response::success(['message' => 'Password updated']);
        });
    }

    // ---- Staff management (Org Admin) -------------------------------------
    public function listStaff(Request $request): void
    {
        $this->guard(function () use ($request) {
            $tenantId = $request->isSuperAdmin() && $request->query('org_id')
                ? (int)$request->query('org_id')
                : $request->tenantId();
            Response::success($this->auth->listStaff((int)$tenantId));
        });
    }

    public function createStaff(Request $request): void
    {
        $data = $this->validate($request, [
            'name'     => 'required|string|max:120',
            'email'    => 'required|email',
            'password' => 'required|string|min:8',
            'role'     => 'nullable|in:org_admin,staff',
            'job_role' => 'nullable|in:owner,admin,project_manager,accountant,site_supervisor,subcontractor',
        ]);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request) {
            $tenantId = $request->isSuperAdmin() && $request->input('org_id')
                ? (int)$request->input('org_id')
                : $request->tenantId();
            Response::success($this->auth->createStaff((int)$tenantId, $request->all()), [], 201);
        });
    }

    // ---- Super Admin: cross-org --------------------------------------------
    public function listOrganisations(Request $request): void
    {
        $this->guard(function () {
            Response::success($this->auth->listOrganisations());
        });
    }

    public function setOrganisationStatus(Request $request): void
    {
        $data = $this->validate($request, ['status' => 'required|in:active,suspended']);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request, $data) {
            $org = $this->auth->setOrganisationStatus((int)$request->param('id'), $data['status']);
            Response::success($org);
        });
    }
}
