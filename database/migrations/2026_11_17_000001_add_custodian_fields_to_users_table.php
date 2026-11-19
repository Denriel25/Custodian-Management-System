<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Extends the existing users table (no new users table): the four roles of the
     * Custodian Management System, the account status and the profile fields the
     * frontend already uses (Admin > Users).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('code', 20)->nullable()->unique()->after('id');          // frontend id, e.g. USR001
            $table->string('role', 20)->default('Requester')->after('email');       // Administrator | Staff | Auditor | Requester
            $table->string('status', 10)->default('Active')->after('role');         // Active | Inactive
            $table->string('contact')->nullable()->after('status');
            $table->string('department')->nullable()->after('contact');
            $table->index(['role', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role', 'status']);
            $table->dropUnique(['code']);
            $table->dropColumn(['code', 'role', 'status', 'contact', 'department']);
        });
    }
};
