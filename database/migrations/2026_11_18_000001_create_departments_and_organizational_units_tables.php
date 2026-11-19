<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // University departments
        Schema::create('departments', function (Blueprint $table) {
            $table->id();

            $table->string('name', 255)->unique();

            // Original department name from the old JSON data
            $table->string('legacy_name', 255)->nullable();

            $table->timestamps();
        });

        // Sections / Units under each department
        Schema::create('organizational_units', function (Blueprint $table) {
            $table->id();

            // Preserve the old frontend ID, e.g. UNT001
            $table->string('legacy_id', 50)->nullable()->unique();

            // Existing unit code, e.g. MRm102
            $table->string('code', 50)->unique();

            $table->foreignId('department_id')
                ->nullable()
                ->constrained('departments')
                ->nullOnDelete();

            $table->string('name', 255);

            // Preserve original text during data migration
            $table->string('legacy_department_name', 255)->nullable();

            // Existing custodian information
            $table->string('custodian_email', 255)->nullable();
            $table->string('job_title', 255)->nullable();

            // Existing IIN numbering sequence
            $table->unsignedInteger('next_iin')->default(1);

            $table->timestamps();

            $table->index('department_id');
            $table->index('custodian_email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizational_units');
        Schema::dropIfExists('departments');
    }
};
