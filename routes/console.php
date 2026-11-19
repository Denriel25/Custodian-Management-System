<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');


Artisan::command('legacy:inspect', function () {

    if (!DB::getSchemaBuilder()->hasTable('records')) {
        $this->error('The records table does not exist.');
        return 1;
    }

    $total = DB::table('records')->count();

    $lines = [];
    $lines[] = 'LEGACY DATABASE INSPECTION';
    $lines[] = 'Generated: ' . now();
    $lines[] = 'Total records: ' . $total;
    $lines[] = '';

    $lines[] = 'COUNTS BY COLLECTION';

    $groups = DB::table('records')
        ->select('collection', 'deleted')
        ->selectRaw('COUNT(*) AS total')
        ->groupBy('collection', 'deleted')
        ->orderBy('collection')
        ->get();

    foreach ($groups as $group) {
        $lines[] = $group->collection
            . ' | deleted=' . $group->deleted
            . ' | total=' . $group->total;
    }

    $lines[] = '';
    $lines[] = 'JSON FIELD NAMES';

    $collections = DB::table('records')
        ->distinct()
        ->orderBy('collection')
        ->pluck('collection');

    foreach ($collections as $collection) {

        $fields = [];

        DB::table('records')
            ->where('collection', $collection)
            ->where('deleted', 0)
            ->orderBy('id')
            ->chunk(200, function ($rows) use (&$fields) {

                foreach ($rows as $row) {

                    $data = json_decode($row->data, true);

                    if (is_array($data)) {
                        foreach (array_keys($data) as $key) {
                            $fields[$key] = true;
                        }
                    }
                }
            });

        $names = array_keys($fields);
        sort($names);

        $lines[] = $collection . ': ' . implode(', ', $names);
    }

    $folder = storage_path('app/legacy-inspection');

    File::ensureDirectoryExists($folder);

    $path = $folder . '/legacy-schema-report.txt';

    File::put($path, implode(PHP_EOL, $lines));

    $this->info('Inspection completed!');
    $this->info('Total records: ' . $total);
    $this->info('Report: ' . $path);

    return 0;

})->purpose('Inspect legacy JSON records without changing database data');
