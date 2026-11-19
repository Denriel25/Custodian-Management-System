<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['code', 'name', 'email', 'role', 'status', 'contact', 'department', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public const ROLES = ['Administrator', 'Staff', 'Auditor', 'Requester'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isActive(): bool
    {
        return $this->status === 'Active';
    }

    public function isAdminSide(): bool
    {
        return in_array($this->role, ['Administrator', 'Staff', 'Auditor'], true);
    }

    /** The user as the frontend (Shared/users.js) expects it. Never contains the password. */
public function toFrontend(bool $withContact = true, bool $withDepartment = true): array
{
    return [
        'id' => $this->code ?: 'USR'.str_pad((string) $this->id, 4, '0', STR_PAD_LEFT),
        'name' => $this->name,
        'email' => $this->email,
        'contact' => $withContact ? (string) $this->contact : '',
        'department' => $withDepartment ? (string) $this->department : '',
        'role' => $this->role,
        'status' => $this->status,
    ];
}
}
