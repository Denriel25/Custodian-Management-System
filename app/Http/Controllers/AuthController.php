<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\RecordStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    /**
     * Home page of each role.
     */
    public static function homeFor(User $user): string
    {
        return match ($user->role) {
            'Auditor' => '/Auditor/AuditorDashboard/dashboard.html',
            'Requester' => '/Requester/RequesterDashboard/dashboard.html',
            default => '/Admin/Dashboard/dashboard.html',
        };
    }

    /**
     * Authenticate users with brute-force protection.
     */
    public function login(Request $request, RecordStore $store): JsonResponse
    {
        // Validate login information.
        $data = $request->validate([
            'email' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'side' => ['required', 'in:admin,requester'],
        ], [
            'email.required' => 'Please enter your email and password.',
            'password.required' => 'Please enter your email and password.',
        ]);

        // Normalize email address.
        $email = strtolower(trim($data['email']));

        // Generate a unique rate-limit key using email and IP.
        $key = 'login:' . hash(
            'sha256',
            $email . '|' . $request->ip()
        );

        // Maximum of 5 failed attempts within 60 seconds.
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json([
                'ok' => false,
                'message' => 'Too many login attempts. Please try again later.',
                'retry_after' => RateLimiter::availableIn($key),
            ], 429);
        }

        // Find user by email.
        $user = User::query()
            ->whereRaw('lower(email) = ?', [$email])
            ->first();

        // Check credentials.
        if (! $user || ! Hash::check($data['password'], $user->password)) {

            // Record failed login attempt.
            RateLimiter::hit($key, 60);

            return response()->json([
                'ok' => false,
                'message' => 'Invalid email or password.',
            ], 401);
        }

        // Clear failed attempts after valid credentials.
        RateLimiter::clear($key);

        // Verify administrator-side access.
        if (
            $data['side'] === 'admin'
            && ! $user->isAdminSide()
        ) {
            return response()->json([
                'ok' => false,
                'message' => 'This account is not an Administrator, Staff or Auditor account. Please use the Requester login.',
            ], 403);
        }

        // Verify requester-side access.
        if (
            $data['side'] === 'requester'
            && $user->role !== 'Requester'
        ) {
            return response()->json([
                'ok' => false,
                'message' => 'This account is not a Requester account. Please use the Admin login.',
            ], 403);
        }

        // Reject inactive accounts.
        if (! $user->isActive()) {
            return response()->json([
                'ok' => false,
                'message' => 'This account is inactive. Please contact the administrator.',
            ], 403);
        }

        // Authenticate user.
        Auth::login($user);

        // Regenerate session ID to prevent session fixation.
        $request->session()->regenerate();

        // Record successful login in the audit trail.
        $store->push($user, [
            'changes' => [[
                'c' => 'auditLog',
                'upserts' => [[
                    'k' => $id = now()->valueOf() . '-' . random_int(0, 9999),
                    'd' => [
                        'id' => $id,
                        'date' => now()->toIso8601String(),
                        'user' => $user->email,
                        'role' => $user->role,
                        'activity' => 'Logged in',
                    ],
                ]],
            ]],
        ]);

        // Return successful authentication response.
        return response()->json([
            'ok' => true,
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'redirect' => url(self::homeFor($user)),
        ]);
    }

    /**
     * Logout authenticated user.
     */
    public function logout(Request $request): JsonResponse
    {
        // Log out the authenticated user.
        Auth::logout();

        // Invalidate current session.
        $request->session()->invalidate();

        // Regenerate CSRF token.
        $request->session()->regenerateToken();

        return response()->json([
            'ok' => true,
        ]);
    }
}
