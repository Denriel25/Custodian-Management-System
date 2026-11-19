<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Server-side store for the workflow data of the frontend (requisitions, pull-outs,
     * receipts, assets, units, annual inventories, audit log, notifications, settings...).
     * One row per frontend record; `rev` grows with every change so browsers can ask
     * "what changed since revision N". Deleted rows stay as tombstones so deletions sync too.
     */
    public function up(): void
    {
        Schema::create('records', function (Blueprint $table) {
            $table->id();
            $table->string('collection', 40);
            $table->string('key', 150);
            $table->longText('data');
            $table->unsignedBigInteger('rev')->index();
            $table->boolean('deleted')->default(false);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['collection', 'key']);
            $table->index(['collection', 'deleted']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('records');
    }
};
