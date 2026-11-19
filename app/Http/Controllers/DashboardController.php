<?php

namespace App\Http\Controllers;

use App\Models\Record;
use App\Support\CollectionAccess;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private const TYPES = [
        'requisition' => ['label' => 'Requisition', 'color' => '#edae0f'],
        'receipt' => ['label' => 'Acknowledgment Receipt', 'color' => '#28a745'],
        'pullout' => ['label' => 'Pull-Out Request', 'color' => '#0dcaf0'],
    ];

    /** Forms submitted per month and form type (last N months) for the dashboard chart. */
    public function formsPerMonth(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['Administrator', 'Staff', 'Auditor'], true), 403);

        $n = min(12, max(1, (int) $request->query('months', 6)));
        $months = [];
        for ($i = $n - 1; $i >= 0; $i--) {
            $d = now()->startOfMonth()->subMonths($i);
            $months[] = ['key' => $d->format('Y-m'), 'label' => $d->format('M Y')];
        }
        $index = array_flip(array_column($months, 'key'));

        $series = [];
        foreach (self::TYPES as $type => $info) {
            $series[$type] = $info + ['data' => array_fill(0, $n, 0)];
        }

        Record::query()->where('collection', 'forms')->where('deleted', false)->each(function (Record $r) use ($user, $index, &$series) {
            $f = $r->document();
            if (! is_array($f) || ! isset($series[$f['type'] ?? '']) || ! CollectionAccess::canSee($user, 'forms', $f)) {
                return;
            }
            try {
                $key = Carbon::parse($f['dateCreated'] ?? '')->timezone(config('app.timezone'))->format('Y-m');
            } catch (\Throwable) {
                return;
            }
            if (isset($index[$key])) {
                $series[$f['type']]['data'][$index[$key]]++;
            }
        });

        $total = array_sum(array_map(fn ($s) => array_sum($s['data']), $series));

        return response()->json([
            'ok' => true,
            'months' => $months,
            'series' => $series,
            'total' => $total,
            'generatedAt' => now()->toIso8601String(),
        ]);
    }
}
