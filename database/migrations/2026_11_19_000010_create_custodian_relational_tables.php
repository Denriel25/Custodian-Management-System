<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Asset tables are already created by:
        // 2026_11_19_000002_create_asset_management_tables.php
        // Do not create them again here.

        Schema::create('forms', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('type', 80)->nullable();
            $table->string('control_no', 150)->nullable()->index();
            $table->string('requisition_no', 150)->nullable()->index();
            $table->string('status', 80)->nullable()->index();
            $table->string('requester_email', 255)->nullable()->index();
            $table->string('receiver_email', 255)->nullable();
            $table->string('submitted_by', 255)->nullable();
            $table->string('issued_by_name', 255)->nullable();
            $table->decimal('total', 14, 2)->nullable();
            $table->json('header_data')->nullable();
            $table->json('items_data')->nullable();
            $table->json('approval_data')->nullable();
            $table->json('signature_data')->nullable();
            $table->json('review_data')->nullable();
            $table->json('status_history_data')->nullable();
            $table->json('release_data')->nullable();
            $table->json('acknowledgment_data')->nullable();
            $table->json('source_data');
            $table->timestamps();
        });

        Schema::create('pullout_records', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('pullout_no', 150)->nullable()->index();
            $table->string('status', 80)->nullable()->index();
            $table->string('created_by', 255)->nullable();
            $table->string('processed_by', 255)->nullable();
            $table->dateTime('record_date')->nullable();
            $table->string('reason', 255)->nullable();
            $table->text('notes')->nullable();
            $table->json('unit_ids_data')->nullable();
            $table->json('history_data')->nullable();
            $table->json('previous_data')->nullable();
            $table->json('source_data');
            $table->timestamps();
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('asset_legacy_id', 150)->nullable()->index();
            $table->string('item_name', 255)->nullable();
            $table->string('movement_type', 80)->nullable();
            $table->decimal('quantity_before', 14, 2)->nullable();
            $table->decimal('quantity_change', 14, 2)->nullable();
            $table->decimal('quantity_after', 14, 2)->nullable();
            $table->string('performed_by', 255)->nullable();
            $table->string('reason', 255)->nullable();
            $table->dateTime('movement_date')->nullable();
            $table->json('source_data');
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('activity', 255)->nullable();
            $table->string('actor', 255)->nullable();
            $table->string('role', 80)->nullable();
            $table->dateTime('activity_date')->nullable();
            $table->json('source_data');
            $table->timestamps();
            $table->index('activity_date');
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('recipient', 255)->nullable()->index();
            $table->text('message')->nullable();
            $table->string('reference', 150)->nullable();
            $table->dateTime('notification_date')->nullable();
            $table->json('read_by_data')->nullable();
            $table->json('source_data');
            $table->timestamps();
        });

        Schema::create('form_counters', function (Blueprint $table) {
            $table->id();
            $table->string('counter_key', 100)->unique();
            $table->unsignedBigInteger('counter_value')->default(0);
            $table->timestamps();
        });

        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();
            $table->string('legacy_id', 150)->unique();
            $table->string('recipient', 255)->nullable();
            $table->string('subject', 255)->nullable();
            $table->longText('body')->nullable();
            $table->string('control_no', 150)->nullable()->index();
            $table->boolean('simulated')->default(false);
            $table->dateTime('sent_date')->nullable();
            $table->json('source_data');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive.
        // Do not drop migrated business data on rollback.
    }
};
