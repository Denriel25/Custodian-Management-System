<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Carbon;

class ImportLegacyRecords extends Command
{
    protected $signature = 'legacy:import-relational
                            {--dry-run : Count source records without writing}';

    protected $description = 'Import legacy records into relational tables safely.';

    private int $imported = 0;
    private int $skipped = 0;

    private array $assetIds = [];
    private array $unitIds = [];

    public function handle(): int
    {
        if (!Schema::hasTable('records')) {
            $this->error('Records table is missing.');
            return self::FAILURE;
        }

        $tables = [
            'asset_categories',
            'assets',
            'asset_units',
            'asset_unit_history',
            'asset_iin_ranges',
            'forms',
            'pullout_records',
            'stock_movements',
            'audit_logs',
            'notifications',
            'email_logs',
            'form_counters',
        ];

        foreach ($tables as $table) {
            if (!Schema::hasTable($table)) {
                $this->error("Missing table: {$table}");
                return self::FAILURE;
            }
        }

        $collections = [
            'assets',
            'assetUnits',
            'forms',
            'pulloutRecords',
            'stockMovements',
            'auditLog',
            'notifications',
            'simEmails',
            'formCounters',
        ];

        $total = 0;

        foreach ($collections as $collection) {
            $count = DB::table('records')
                ->where('collection', $collection)
                ->where('deleted', false)
                ->count();

            $this->line("{$collection}: {$count} source records");

            $total += $count;
        }

        if ($this->option('dry-run')) {
            $this->info(
                "Dry run only. {$total} active source rows found; no data written."
            );

            return self::SUCCESS;
        }

        if (!$this->confirm(
            'Proceed with relational import? Original records will remain unchanged.',
            false
        )) {
            $this->warn('Import cancelled. No data written.');
            return self::SUCCESS;
        }

        try {
            DB::transaction(function () {
                $this->importAssets();
                $this->importAssetUnits();
                $this->importForms();
                $this->importPullouts();
                $this->importStockMovements();
                $this->importAuditLogs();
                $this->importNotifications();
                $this->importEmails();
                $this->importCounters();
            });

            $this->newLine();

            $this->info("Import completed. Processed: {$this->imported}");
            $this->warn("Skipped: {$this->skipped}");

            $this->comment(
                'Original records table was not modified.'
            );

            return self::SUCCESS;

        } catch (\Throwable $e) {
            $this->error('Import failed: ' . $e->getMessage());
            $this->warn('Database transaction rolled back.');

            return self::FAILURE;
        }
    }

    private function rows(string $collection)
    {
        return DB::table('records')
            ->where('collection', $collection)
            ->where('deleted', false)
            ->orderBy('id')
            ->get();
    }

    private function decode(object $row): ?array
    {
        $data = json_decode($row->data, true);

        if (!is_array($data)) {
            $this->warn(
                "Invalid JSON: {$row->collection}/{$row->key}"
            );

            $this->skipped++;

            return null;
        }

        return $data;
    }

    private function id(object $row, array $data): string
    {
        return (string) ($data['id'] ?? $row->key);
    }

    private function json(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return json_encode(
            $value,
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_THROW_ON_ERROR
        );
    }

    private function textValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_scalar($value)) {
            return (string) $value;
        }

        return $this->json($value);
    }

    private function date(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateTimeString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function dateOnly(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function put(
        string $table,
        string $id,
        array $data
    ): void {
        $now = now();

        DB::table($table)->updateOrInsert(
            ['legacy_id' => $id],
            $data + [
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        $this->imported++;
    }

    private function importAssets(): void
    {
        foreach ($this->rows('assets') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $id = $this->id($row, $d);

            $name = trim((string) ($d['name'] ?? ''));
            $type = trim((string) ($d['type'] ?? ''));

            if ($name === '' || $type === '') {
                throw new \RuntimeException(
                    "Asset {$id} is missing its required name or type."
                );
            }

            $category = trim(
                (string) ($d['category'] ?? '')
            );

            $categoryId = null;

            if ($category !== '') {
                if (mb_strlen($category) > 150) {
                    throw new \RuntimeException(
                        "Asset category is too long: {$category}"
                    );
                }

                $categoryId = DB::table('asset_categories')
                    ->where('name', $category)
                    ->value('id');

                if (!$categoryId) {
                    $categoryId = DB::table('asset_categories')
                        ->insertGetId([
                            'name' => $category,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                }
            }

            if (mb_strlen($type) > 50) {
                throw new \RuntimeException(
                    "Asset type is too long for asset {$id}."
                );
            }

            $payload = [
                'category_id' => $categoryId,
                'legacy_category' => $category ?: null,

                'type' => $type,
                'name' => $name,

                'unit' => $d['unit'] ?? 'pc',
                'quantity' => $d['quantity'] ?? 0,
                'unit_price' => $d['unitPrice'] ?? 0,
                'reorder_level' => $d['reorderLevel'] ?? 0,

                'brand' => $this->textValue($d['brand'] ?? null),
                'model' => $this->textValue($d['model'] ?? null),
                'serial' => $this->textValue($d['serial'] ?? null),
                'condition' => $this->textValue($d['condition'] ?? null),
                'location' => $this->textValue($d['location'] ?? null),

                'legacy_unit_id' => $this->textValue($d['unitId'] ?? null),

                'make' => $this->textValue($d['make'] ?? null),
                'color' => $this->textValue($d['color'] ?? null),
                'size' => $this->textValue($d['size'] ?? null),

                'date_assigned' => $this->dateOnly(
                    $d['dateAssigned'] ?? null
                ),

                'date_added' => $this->date(
                    $d['dateAdded'] ?? null
                ),

                'issued' => $d['issued'] ?? 0,
                'maintenance' => $d['maintenance'] ?? 0,

                'remarks' => $d['remarks'] ?? null,
                'photo' => $d['photo'] ?? null,

                'unit_registry' => (bool) (
                    $d['unitRegistry'] ?? false
                ),

                'unit_seq' => (int) ($d['unitSeq'] ?? 0),

                'legacy_counts' => $this->json(
                    $d['counts'] ?? null
                ),

                'legacy_data' => $this->json($d),
            ];

            $this->put('assets', $id, $payload);

            $this->assetIds[$id] = DB::table('assets')
                ->where('legacy_id', $id)
                ->value('id');
        }
    }

    private function importAssetUnits(): void
    {
        foreach ($this->rows('assetUnits') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $id = $this->id($row, $d);

            $assetLegacyId = (string) (
                $d['assetId'] ?? ''
            );

            $assetId = $this->assetIds[$assetLegacyId]
                ?? DB::table('assets')
                    ->where('legacy_id', $assetLegacyId)
                    ->value('id');

            if (!$assetId) {
                $this->warn(
                    "Skipped unit {$id}: parent asset not found."
                );

                $this->skipped++;

                continue;
            }

            $this->put('asset_units', $id, [
                'asset_id' => $assetId,

                'serial' => $this->textValue($d['serial'] ?? null),
                'condition' => $d['condition'] ?? 'New',
                'status' => $d['status'] ?? 'Available',

                'location' => $this->textValue($d['location'] ?? null),
                'legacy_unit_id' => $this->textValue($d['unitId'] ?? null),

                'department' => $this->textValue($d['department'] ?? null),
                'assigned_to' => $this->textValue($d['assignedTo'] ?? null),
                'assigned_ref' => $this->textValue($d['assignedRef'] ?? null),

                'iin' => $this->textValue($d['iin'] ?? null),

                'acquired_date' => $this->dateOnly(
                    $d['acquiredDate'] ?? null
                ),

                'cost' => $d['cost'] ?? null,

                'date_added' => $this->date(
                    $d['dateAdded'] ?? null
                ),

                'demo' => (bool) ($d['demo'] ?? false),

                'legacy_data' => $this->json($d),
            ]);

            $unitId = DB::table('asset_units')
                ->where('legacy_id', $id)
                ->value('id');

            $this->unitIds[$id] = $unitId;

            $historyItems = $d['history'] ?? [];

            if (!is_array($historyItems)) {
                continue;
            }

            foreach ($historyItems as $history) {
                if (!is_array($history)) {
                    continue;
                }

                $eventType = (string) (
                    $history['type'] ?? 'Legacy history'
                );

                $historyJson = $this->json($history);

                $exists = DB::table('asset_unit_history')
                    ->where('asset_unit_id', $unitId)
                    ->where('event_type', $eventType)
                    ->where('legacy_data', $historyJson)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('asset_unit_history')->insert([
                    'asset_unit_id' => $unitId,

                    'event_date' => $this->date(
                        $history['date'] ?? null
                    ),

                    'event_type' => $eventType,

                    'from_status' => $this->textValue(
                        $history['from'] ?? null
                    ),

                    'to_status' => $this->textValue(
                        $history['to'] ?? null
                    ),

                    'performed_by' => $this->textValue(
                        $history['by'] ?? null
                    ),

                    'reference' => $this->textValue(
                        $history['ref'] ?? null
                    ),

                    'note' => $this->textValue(
                        $history['note'] ?? null
                    ),

                    'legacy_data' => $historyJson,

                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    private function importForms(): void
    {
        foreach ($this->rows('forms') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('forms', $this->id($row, $d), [
                'type' => $d['type'] ?? null,
                'control_no' => $d['controlNo'] ?? null,
                'requisition_no' => $d['requisitionNo'] ?? null,
                'status' => $d['status'] ?? null,

                'requester_email' => $d['requesterEmail'] ?? null,
                'receiver_email' => $d['receiverEmail'] ?? null,

                'submitted_by' => $d['submittedBy'] ?? null,
                'issued_by_name' => $d['issuedByName'] ?? null,

                'total' => $d['total'] ?? null,

                'header_data' => $this->json($d['header'] ?? null),
                'items_data' => $this->json($d['items'] ?? null),
                'approval_data' => $this->json($d['approval'] ?? null),
                'signature_data' => $this->json($d['sig'] ?? null),
                'review_data' => $this->json($d['review'] ?? null),

                'status_history_data' => $this->json(
                    $d['statusHistory'] ?? null
                ),

                'release_data' => $this->json(
                    $d['releases'] ?? null
                ),

                'acknowledgment_data' => $this->json(
                    $d['acknowledgment'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importPullouts(): void
    {
        foreach ($this->rows('pulloutRecords') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('pullout_records', $this->id($row, $d), [
                'pullout_no' => $d['no'] ?? null,
                'status' => $d['status'] ?? null,

                'created_by' => $this->textValue(
                    $d['createdByName'] ?? $d['createdBy'] ?? null
                ),

                'processed_by' => $this->textValue(
                    $d['processedByName'] ?? $d['processedBy'] ?? null
                ),

                'record_date' => $this->date(
                    $d['date'] ?? null
                ),

                'reason' => $d['reason'] ?? null,
                'notes' => $d['notes'] ?? $d['reasonNote'] ?? null,

                'unit_ids_data' => $this->json(
                    $d['unitIds'] ?? null
                ),

                'history_data' => $this->json(
                    $d['history'] ?? null
                ),

                'previous_data' => $this->json(
                    $d['prev'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importStockMovements(): void
    {
        foreach ($this->rows('stockMovements') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('stock_movements', $this->id($row, $d), [
                'asset_legacy_id' => $d['assetId'] ?? null,
                'item_name' => $d['item'] ?? null,
                'movement_type' => $d['type'] ?? null,

                'quantity_before' => $d['before'] ?? null,
                'quantity_change' => $d['change'] ?? null,
                'quantity_after' => $d['after'] ?? null,

                'performed_by' => $this->textValue(
                    $d['by'] ?? null
                ),

                'reason' => $d['reason'] ?? null,

                'movement_date' => $this->date(
                    $d['date'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importAuditLogs(): void
    {
        foreach ($this->rows('auditLog') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('audit_logs', $this->id($row, $d), [
                'activity' => $this->textValue(
                    $d['activity'] ?? null
                ),

                'actor' => $this->textValue(
                    $d['user'] ?? null
                ),

                'role' => $this->textValue(
                    $d['role'] ?? null
                ),

                'activity_date' => $this->date(
                    $d['date'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importNotifications(): void
    {
        foreach ($this->rows('notifications') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('notifications', $this->id($row, $d), [
                'recipient' => $this->textValue(
                    $d['to'] ?? null
                ),

                'message' => $this->textValue(
                    $d['message'] ?? null
                ),

                'reference' => $this->textValue(
                    $d['ref'] ?? null
                ),

                'notification_date' => $this->date(
                    $d['date'] ?? null
                ),

                'read_by_data' => $this->json(
                    $d['readBy'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importEmails(): void
    {
        foreach ($this->rows('simEmails') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            $this->put('email_logs', $this->id($row, $d), [
                'recipient' => $this->textValue(
                    $d['to'] ?? null
                ),

                'subject' => $this->textValue(
                    $d['subject'] ?? null
                ),

                'body' => $this->textValue(
                    $d['body'] ?? null
                ),

                'control_no' => $d['controlNo'] ?? null,

                'simulated' => (bool) (
                    $d['simulated'] ?? false
                ),

                'sent_date' => $this->date(
                    $d['date'] ?? null
                ),

                'source_data' => $this->json($d),
            ]);
        }
    }

    private function importCounters(): void
    {
        foreach ($this->rows('formCounters') as $row) {
            $d = $this->decode($row);

            if ($d === null) {
                continue;
            }

            foreach ($d as $key => $value) {
                if (!is_scalar($value)) {
                    continue;
                }

                DB::table('form_counters')->updateOrInsert(
                    ['counter_key' => (string) $key],
                    [
                        'counter_value' => max(0, (int) $value),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );

                $this->imported++;
            }
        }
    }
}
