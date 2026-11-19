<?php

namespace App\Services;

use App\Models\Record;
use App\Models\User;
use App\Support\CollectionAccess as Access;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Reads and writes the workflow data of the frontend. Every call is made for a logged-in user and
 * goes through App\Support\CollectionAccess.
 */
class RecordStore
{
    public const MAX_PULL = 2000;
    public const MAX_PUSH = 500;

    public function currentRev(): int
    {
        return (int) Record::query()->max('rev');
    }

    /**
     * Everything the user may see, in the shape of the old localStorage keys.
     * Collections the user may not read are simply absent.
     *
     * @return array<string, mixed>
     */
    public function state(User $user): array
    {
        $out = [];

        foreach (Access::ARRAY_COLLECTIONS as $c) {
            if (! Access::canReadCollection($user, $c)) {
                continue;
            }

            $list = [];

            Record::query()
                ->where('collection', $c)
                ->where('deleted', false)
                ->orderBy('id')
                ->each(function (Record $r) use (&$list, $user, $c) {
                    $d = $r->document();

                    if (is_array($d) && Access::canSee($user, $c, $d)) {
                        $list[] = $d;
                    }
                });

            $out[$c] = $list;
        }

        foreach (Access::OBJECT_COLLECTIONS as $c) {
            if (! Access::canReadCollection($user, $c)) {
                continue;
            }

            $r = Record::query()
                ->where('collection', $c)
                ->where('key', Access::OBJECT_KEY)
                ->where('deleted', false)
                ->first();

            $out[$c] = $r ? ($r->document() ?: new \stdClass) : new \stdClass;
        }

        $out[Access::USERS] = $this->users($user);

        return $out;
    }

    /** @return array<int, array<string, mixed>> */
public function users(User $viewer): array
{
    $isAdmin = $viewer->role === 'Administrator';
    $isStaff = $viewer->role === 'Staff';

    $withContact = $isAdmin || $isStaff;
    $withDepartment = $isAdmin || $isStaff;

    return User::query()
        ->orderBy('id')
        ->get()
        ->map(fn (User $u) => $u->toFrontend(
            $withContact,
            $withDepartment
        ))
        ->all();
}
    /**
     * What changed after revision $since (only what the user may see).
     *
     * @return array{rev:int, changes:array<int,array<string,mixed>>, more:bool}
     */
    public function pull(User $user, int $since): array
    {
        $rows = Record::query()
            ->where('rev', '>', $since)
            ->orderBy('rev')
            ->orderBy('id')
            ->limit(self::MAX_PULL + 1)
            ->get();

        $more = $rows->count() > self::MAX_PULL;
        $rows = $rows->take(self::MAX_PULL);

        $changes = [];
        $rev = $since;

        foreach ($rows as $r) {
            $rev = max($rev, $r->rev);

            if (! Access::canReadCollection($user, $r->collection)) {
                continue;
            }

            $d = $r->document();

            if (! is_array($d)) {
                continue;
            }

            // A record the person may not see is not announced at all.
            if (Access::isArrayCollection($r->collection) && ! Access::canSee($user, $r->collection, $d)) {
                continue;
            }

            if ($r->deleted) {
                $changes[] = [
                    'c' => $r->collection,
                    'k' => $r->key,
                    'd' => null,
                ];

                continue;
            }

            $changes[] = [
                'c' => $r->collection,
                'k' => $r->key,
                'd' => $d,
            ];
        }

        return [
            'rev' => $more ? $rev : max($rev, $this->currentRev()),
            'changes' => $changes,
            'more' => $more,
        ];
    }

    /**
     * Applies changes sent by a browser.
     *
     * @return array{rev:int, applied:int, rejected:array<int,array<string,string>>}
     */
    public function push(User $user, array $payload): array
    {
        $rejected = [];
        $applied = 0;
        $total = 0;

        $lock = Cache::lock('records-rev', 15);
        $lock->block(10);

        try {
            $rev = 0;

            DB::transaction(function () use (
                $user,
                $payload,
                &$rejected,
                &$applied,
                &$total,
                &$rev
            ) {
                $rev = $this->currentRev() + 1;

                foreach ((array) ($payload['changes'] ?? []) as $change) {
                    $c = (string) ($change['c'] ?? '');

                    foreach ((array) ($change['upserts'] ?? []) as $item) {
                        if (++$total > self::MAX_PUSH) {
                            $rejected[] = [
                                'c' => $c,
                                'k' => '',
                                'reason' => 'Too many changes in one request.',
                            ];

                            return;
                        }

                        $k = (string) ($item['k'] ?? '');
                        $d = $item['d'] ?? null;

                        $reason = $this->upsert($user, $c, $k, $d, $rev);

                        if ($reason === null) {
                            $applied++;
                        } else {
                            $rejected[] = [
                                'c' => $c,
                                'k' => $k,
                                'reason' => $reason,
                            ];
                        }
                    }

                    foreach ((array) ($change['deletes'] ?? []) as $k) {
                        if (++$total > self::MAX_PUSH) {
                            $rejected[] = [
                                'c' => $c,
                                'k' => '',
                                'reason' => 'Too many changes in one request.',
                            ];

                            return;
                        }

                        $reason = $this->delete($user, $c, (string) $k, $rev);

                        if ($reason === null) {
                            $applied++;
                        } else {
                            $rejected[] = [
                                'c' => $c,
                                'k' => (string) $k,
                                'reason' => $reason,
                            ];
                        }
                    }
                }
            });
        } finally {
            $lock->release();
        }

        return [
            'rev' => $this->currentRev(),
            'applied' => $applied,
            'rejected' => $rejected,
        ];
    }

    // ------------------------------------------------------------------
    // ONE RECORD
    // ------------------------------------------------------------------

    private function upsert(User $user, string $c, string $k, mixed $d, int $rev): ?string
    {
        if ($c === Access::USERS) {
            return $this->upsertUser($user, $k, $d);
        }

        if (! Access::isRecordCollection($c)) {
            return 'Unknown collection.';
        }

        if ($k === '' || strlen($k) > 150) {
            return 'Invalid record key.';
        }

        if (! is_array($d)) {
            return 'Invalid record.';
        }

        if (Access::isArrayCollection($c)) {
            if (! isset($d['id']) || (string) $d['id'] !== $k) {
                return 'The record id does not match its key.';
            }
        } else {
            $k = Access::OBJECT_KEY;
        }

        if ($c === 'auditLog') {
            // Audit entries always identify the authenticated actor.
            $d['user'] = $user->email;
            $d['role'] = $user->role;
        }

        $existing = Record::query()
            ->where('collection', $c)
            ->where('key', $k)
            ->first();

        $old = ($existing && ! $existing->deleted)
            ? $existing->document()
            : null;

        $old = is_array($old) ? $old : null;

        if ($reason = Access::writeVerdict($user, $c, $k, $d, $old)) {
            return $reason;
        }

        if ($c === 'formCounters' && $old) {
            foreach ($old as $name => $value) {
                if (
                    is_numeric($value)
                    && (
                        ! isset($d[$name])
                        || ! is_numeric($d[$name])
                        || $d[$name] < $value
                    )
                ) {
                    $d[$name] = $value;
                }
            }
        }

        $json = json_encode(
            $d,
            JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES
                | JSON_PARTIAL_OUTPUT_ON_ERROR
        );

        if ($existing && ! $existing->deleted && $existing->data === $json) {
            return null;
        }

        Record::query()->updateOrCreate(
            [
                'collection' => $c,
                'key' => $k,
            ],
            [
                'data' => $json,
                'rev' => $rev,
                'deleted' => false,
                'updated_by' => $user->id,
            ]
        );

        return null;
    }

    private function delete(User $user, string $c, string $k, int $rev): ?string
    {
        if ($c === Access::USERS) {
            return $this->deleteUser($user, $k);
        }

        if (! Access::isRecordCollection($c)) {
            return 'Unknown collection.';
        }

        if (Access::isObjectCollection($c)) {
            return 'This data cannot be deleted.';
        }

        $existing = Record::query()
            ->where('collection', $c)
            ->where('key', $k)
            ->where('deleted', false)
            ->first();

        if (! $existing) {
            return null;
        }

        $old = $existing->document();

        if ($reason = Access::deleteVerdict(
            $user,
            $c,
            is_array($old) ? $old : null
        )) {
            return $reason;
        }

        $existing->update([
            'deleted' => true,
            'rev' => $rev,
            'updated_by' => $user->id,
        ]);

        return null;
    }

    // ------------------------------------------------------------------
    // USERS (REAL USERS TABLE)
    // ------------------------------------------------------------------

    private function upsertUser(User $actor, string $code, mixed $d): ?string
    {
        if (! Access::canWriteCollection($actor, Access::USERS)) {
            return 'Only the Administrator can manage users.';
        }

        if (! is_array($d)) {
            return 'Invalid user.';
        }

        $name = trim((string) ($d['name'] ?? ''));
        $email = strtolower(trim((string) ($d['email'] ?? '')));
        $role = (string) ($d['role'] ?? '');
        $status = (string) ($d['status'] ?? 'Active');
        $password = (string) ($d['password'] ?? '');

        if ($name === '' || strlen($name) > 255) {
            return 'The name is required.';
        }

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
            return 'The email address is not valid.';
        }

        if (! in_array($role, User::ROLES, true)) {
            return 'Unknown role.';
        }

        if (! in_array($status, ['Active', 'Inactive'], true)) {
            return 'Unknown status.';
        }

        if ($password !== '' && strlen($password) < 12) {
            return 'The password must have at least 12 characters.';
        }

        // Validate optional profile fields against the database column limits.
        $contact = trim((string) ($d['contact'] ?? ''));
        $department = trim((string) ($d['department'] ?? ''));

        if (strlen($contact) > 255) {
            return 'Contact must not exceed 255 characters.';
        }

        if (strlen($department) > 255) {
            return 'Department must not exceed 255 characters.';
        }

        $user = $this->findUser($code);

        if (! $user && $password === '') {
            return 'A new user needs a password.';
        }

        $taken = User::query()
            ->where('email', $email)
            ->when($user, fn ($q) => $q->where('id', '!=', $user->id))
            ->exists();

        if ($taken) {
            return 'This email address is already used.';
        }

        if (
            $user
            && $user->id === $actor->id
            && ($role !== 'Administrator' || $status !== 'Active')
        ) {
            return 'You cannot remove your own Administrator access.';
        }

        if (
            $user
            && $user->role === 'Administrator'
            && ($role !== 'Administrator' || $status !== 'Active')
            && $this->lastActiveAdmin($user)
        ) {
            return 'There must always be one active Administrator.';
        }

        $fields = [
            'name' => $name,
            'email' => $email,
            'role' => $role,
            'status' => $status,
            'contact' => $contact,
            'department' => $department,
        ];

        if ($password !== '') {
            $fields['password'] = $password; // Hashed by the User model cast.
        }

        if ($user) {
            $user->fill($fields)->save();
        } else {
            $new = new User($fields);
            $new->code = preg_match('/^[A-Za-z0-9_-]{1,20}$/', $code)
                ? $code
                : null;
            $new->save();
        }

        return null;
    }

    private function deleteUser(User $actor, string $code): ?string
    {
        if (! Access::canWriteCollection($actor, Access::USERS)) {
            return 'Only the Administrator can manage users.';
        }

        $user = $this->findUser($code);

        if (! $user) {
            return null;
        }

        if ($user->id === $actor->id) {
            return 'You cannot delete your own account.';
        }

        if (
            $user->role === 'Administrator'
            && $this->lastActiveAdmin($user)
        ) {
            return 'There must always be one active Administrator.';
        }

        $user->delete();

        return null;
    }

    /**
     * The frontend ID is the code column, or USR + row ID for accounts
     * created without a code.
     */
    private function findUser(string $code): ?User
    {
        $user = User::query()->where('code', $code)->first();

        if (! $user && preg_match('/^USR0*(\d+)$/', $code, $m)) {
            $user = User::query()
                ->whereNull('code')
                ->where('id', (int) $m[1])
                ->first();
        }

        return $user;
    }

    private function lastActiveAdmin(User $except): bool
    {
        return ! User::query()
            ->where('role', 'Administrator')
            ->where('status', 'Active')
            ->where('id', '!=', $except->id)
            ->exists();
    }
}
