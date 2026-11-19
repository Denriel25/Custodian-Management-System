<?php

namespace App\Http\Controllers;

use App\Services\RecordStore;
use App\Support\CollectionAccess;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    /** What changed since the revision the browser already has. */
    public function pull(Request $request, RecordStore $store): JsonResponse
    {
        $user = $request->user();
        $result = $store->pull($user, max(0, (int) $request->query('since', 0)));

        return response()->json($result + [
            'ok' => true,
            'users' => $store->users($user),
            'writable' => CollectionAccess::writableCollections($user),
        ]);
    }

    /** Changes made in the browser (record by record). Each record is checked for the user's role. */
    public function push(Request $request, RecordStore $store): JsonResponse
    {
        $request->validate([
            'changes' => ['required', 'array', 'max:40'],
            'changes.*.c' => ['required', 'string', 'max:40'],
            'changes.*.upserts' => ['sometimes', 'array'],
            'changes.*.deletes' => ['sometimes', 'array'],
        ]);

        try {
            $result = $store->push($request->user(), $request->only('changes'));
        } catch (LockTimeoutException) {
            return response()->json(['ok' => false, 'message' => 'The system is busy. Please try again.'], 503);
        }

        return response()->json($result + ['ok' => true]);
    }
}
