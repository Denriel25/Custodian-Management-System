<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

// ---- the pages of the existing frontend (login pages are public, the rest need a login) ----
Route::get('/', [PageController::class, 'index']);

Route::get('/{section}/{folder}/{page}.html', [PageController::class, 'show'])
    ->where(['section' => 'Admin|Auditor|Requester', 'folder' => '[A-Za-z]+', 'page' => '[A-Za-z]+']);

// ---- authentication ----
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/auth/logout', [AuthController::class, 'logout']);

// ---- data and assistant (logged-in users only) ----
Route::middleware(['auth', 'active'])->prefix('api')->group(function () {
    Route::get('/sync/pull', [SyncController::class, 'pull']);
    Route::post('/sync/push', [SyncController::class, 'push'])->middleware('throttle:120,1');

    Route::get('/dashboard/forms-per-month', [DashboardController::class, 'formsPerMonth']);

    Route::get('/chat/history', [ChatController::class, 'history']);
    Route::post('/chat', [ChatController::class, 'send'])->middleware('throttle:20,1');
    Route::delete('/chat', [ChatController::class, 'clear']);
});
