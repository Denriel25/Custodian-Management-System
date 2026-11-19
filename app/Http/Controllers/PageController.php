<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\RecordStore;
use App\Support\CollectionAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;

/**
 * Serves the pages of the existing frontend (resources/frontend/**.html) behind real
 * authentication, and puts the current database state into each page before any script runs.
 */
class PageController extends Controller
{
    private const LOGIN_FOLDERS = ['Login', 'RequesterLogin'];

    public function index(Request $request)
    {
        if ($user = Auth::user()) {
            return redirect(AuthController::homeFor($user));
        }

        return $this->render('index.html', null, 'Shared/laravel-bridge.js');
    }

    public function show(Request $request, RecordStore $store, string $section, string $folder, string $page)
    {
        $relative = "$section/$folder/$page.html";
        $base = realpath(resource_path('frontend'));
        $file = realpath(resource_path("frontend/$relative"));

        if (! $base || ! $file || ! str_starts_with($file, $base.DIRECTORY_SEPARATOR) || ! is_file($file)) {
            abort(404);
        }

        // login pages are public
        if (in_array($folder, self::LOGIN_FOLDERS, true)) {
            return $this->render($relative, null);
        }

        /** @var User|null $user */
        $user = Auth::user();

        if (! $user || ! $user->isActive()) {
            if ($user) {
                Auth::logout();
                $request->session()->invalidate();
            }

            return redirect($section === 'Requester' ? '/Requester/RequesterLogin/login.html' : '/Admin/Login/login.html');
        }

        $allowed = match ($section) {
            'Admin' => in_array($user->role, ['Administrator', 'Staff'], true),
            'Auditor' => $user->role === 'Auditor',
            'Requester' => $user->role === 'Requester',
            default => false,
        };

        if (! $allowed) {
            return redirect(AuthController::homeFor($user));
        }

        // Users and System Settings are for the Administrator only
        if ($section === 'Admin' && in_array($folder, ['Users', 'Settings'], true) && $user->role !== 'Administrator') {
            return redirect('/Admin/Dashboard/dashboard.html');
        }

        return $this->render($relative, $user, null, $store);
    }

    private function render(string $relative, ?User $user, ?string $bridgeSrc = null, ?RecordStore $store = null): Response
    {
        $html = File::get(resource_path("frontend/$relative"));

        $payload = ['server' => true, 'csrf' => csrf_token(), 'guest' => $user === null];

        if ($user && $store) {
            $payload = array_merge($payload, [
                'user' => ['name' => $user->name, 'email' => $user->email, 'role' => $user->role],
                'rev' => $store->currentRev(),
                'writable' => CollectionAccess::writableCollections($user),
                'collections' => CollectionAccess::allCollections(),
                'state' => $store->state($user),
            ]);
        } else {
            $payload['collections'] = CollectionAccess::allCollections();
        }

        $json = json_encode($payload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);

        $src = $bridgeSrc ?? '../../Shared/laravel-bridge.js';
        $inject = '<meta name="csrf-token" content="'.e(csrf_token()).'">'
            ."\n<script>window.CMS = {$json};</script>"
            ."\n<script src=\"{$src}\"></script>";

        // insert right after the opening <head> tag (substr_replace: the JSON must not be treated as a regex replacement)
        if (preg_match('/<head[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE)) {
            $at = $m[0][1] + strlen($m[0][0]);
            $html = substr_replace($html, "\n".$inject, $at, 0);
        } else {
            $html = $inject.$html;
        }

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
