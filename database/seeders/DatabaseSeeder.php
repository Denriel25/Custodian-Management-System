<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Creates the five starting accounts (the same ones the frontend prototype documented).
     * Existing accounts are never touched (re-running the seeder cannot reset a changed password).
     * Passwords are hashed by the model. CHANGE THESE PASSWORDS before going live
     * (Admin > Users), or set CMS_SEED_PASSWORD in .env to use one password for all of them.
     *
     * No demo requisitions or inventory are created: the system starts empty. For sample data,
     * the Administrator can use System Settings > Data Management > "Create demo data".
     */
    public function run(): void
    {
        $override = env('CMS_SEED_PASSWORD');

        $accounts = [
            ['USR001', 'Nelson F. Salisi', 'admin@neu.edu.ph', 'Administrator', 'Property Department', 'admin123'],
            ['USR002', 'Denriel Dinogan', 'requester@neu.edu.ph', 'Requester', '', 'requester123'],
            ['USR003', 'Ana Reyes', 'staff@neu.edu.ph', 'Staff', 'Property Department', 'staff123'],
            ['USR004', 'Raymund S. Pagaduan', 'auditor@neu.edu.ph', 'Auditor', 'Auditing Office', 'auditor123'],
            ['USR005', 'Maria Lopez', 'requester2@neu.edu.ph', 'Requester', 'College of Engineering', 'requester123'],
        ];

        foreach ($accounts as [$code, $name, $email, $role, $department, $password]) {
            User::query()->firstOrCreate(
                ['email' => $email],
                [
                    'code' => $code, 'name' => $name, 'role' => $role, 'status' => 'Active',
                    'department' => $department, 'contact' => '', 'password' => $override ?: $password,
                ]
            );
        }
    }
}
