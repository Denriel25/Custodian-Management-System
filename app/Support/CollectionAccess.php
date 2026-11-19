<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Arr;

/**
 * Who may read and write which data. The browser hides buttons, but THIS class is the real check:
 * every pull and every push passes through it.
 *
 * Roles: Administrator (acts as the Director), Staff, Auditor, Requester.
 *
 * Note: this is a permission layer (collection, record owner, protected fields and allowed status
 * values per role). It is not a full server-side re-implementation of every workflow rule; the
 * workflow engine (public/Shared/workflow.js) still decides the step-by-step logic.
 */
class CollectionAccess
{
    /** Collections stored as a JSON array of records that each have an "id". */
    public const ARRAY_COLLECTIONS = [
        'forms', 'assets', 'assetUnits', 'units', 'annualInventories', 'pulloutRecords',
        'stockMovements', 'auditLog', 'notifications', 'simEmails', 'reportHistory',
    ];

    /** Collections stored as one JSON object. */
    public const OBJECT_COLLECTIONS = ['systemSettings', 'formCounters'];

    /** Stored in the real `users` table, not in `records`. */
    public const USERS = 'users';

    public const OBJECT_KEY = '_';

    private const ADMIN = 'Administrator';
    private const STAFF = 'Staff';
    private const AUDITOR = 'Auditor';
    private const REQUESTER = 'Requester';

    public static function isArrayCollection(string $c): bool
    {
        return in_array($c, self::ARRAY_COLLECTIONS, true);
    }

    public static function isObjectCollection(string $c): bool
    {
        return in_array($c, self::OBJECT_COLLECTIONS, true);
    }

    public static function isRecordCollection(string $c): bool
    {
        return self::isArrayCollection($c) || self::isObjectCollection($c);
    }

    /** @return string[] every collection the browser keeps (including users) */
    public static function allCollections(): array
    {
        return array_merge(self::ARRAY_COLLECTIONS, self::OBJECT_COLLECTIONS, [self::USERS]);
    }

    // ------------------------------------------------------------------ reading

    public static function canReadCollection(User $u, string $c): bool
    {
        $r = $u->role;
        $staffSide = in_array($r, [self::ADMIN, self::STAFF], true);
        $adminSide = $staffSide || $r === self::AUDITOR;

        return match ($c) {
            'forms', 'assets', 'units', 'annualInventories', 'notifications', 'simEmails',
            'systemSettings', 'formCounters', self::USERS => true,
            'assetUnits', 'pulloutRecords', 'stockMovements', 'auditLog' => $adminSide,
            'reportHistory' => $staffSide,
            default => false,
        };
    }

    /** Record-level filter: may this user see this one record? */
    public static function canSee(User $u, string $c, array $data): bool
    {
        if (! self::canReadCollection($u, $c)) {
            return false;
        }

        $me = strtolower($u->email);
        $r = $u->role;

        switch ($c) {
            case 'forms':
                $type = $data['type'] ?? '';
                $status = $data['status'] ?? '';
                if ($r === self::ADMIN || $r === self::STAFF) {
                    // a Draft requisition is private to its Requester
                    return ! ($type === 'requisition' && $status === 'Draft');
                }
                if ($r === self::AUDITOR) {
                    return $type === 'requisition'
                        && ! in_array($status, ['Draft', 'Submitted', 'Pending Department Head Signature'], true);
                }

                return strtolower((string) ($data['requesterEmail'] ?? '')) === $me;

            case 'annualInventories':
                if ($r === self::REQUESTER) {
                    return strtolower((string) ($data['custodianEmail'] ?? '')) === $me;
                }

                return true;

            case 'notifications':
                $to = strtolower((string) ($data['to'] ?? ''));

                return $to === $me
                    || ($to === 'admin' && in_array($r, [self::ADMIN, self::STAFF], true))
                    || ($to === 'auditor' && $r === self::AUDITOR);

            case 'simEmails':
                return strtolower((string) ($data['to'] ?? '')) === $me;

            default:
                return true;
        }
    }

    // ------------------------------------------------------------------ writing

    /** Can this role write to this collection at all? (also sent to the browser) */
    public static function canWriteCollection(User $u, string $c): bool
    {
        $r = $u->role;
        $staffSide = in_array($r, [self::ADMIN, self::STAFF], true);

        return match ($c) {
            'forms' => true,
            'assets', 'assetUnits', 'units', 'pulloutRecords', 'stockMovements', 'reportHistory' => $staffSide,
            'annualInventories' => $staffSide || $r === self::REQUESTER,
            'auditLog', 'notifications', 'simEmails', 'formCounters' => true,
            'systemSettings', self::USERS => $r === self::ADMIN,
            default => false,
        };
    }

    /** @return string[] */
    public static function writableCollections(User $u): array
    {
        return array_values(array_filter(self::allCollections(), fn ($c) => self::canWriteCollection($u, $c)));
    }

    /**
     * Returns null when the write is allowed, otherwise the reason it is refused.
     *
     * @param array|null $old the stored document (null for a new record)
     */
    public static function writeVerdict(User $u, string $c, string $key, array $new, ?array $old): ?string
    {
        if (! self::canWriteCollection($u, $c)) {
            return 'Your role cannot change this data.';
        }

        $me = strtolower($u->email);
        $r = $u->role;

        switch ($c) {
            case 'forms':
                return self::formVerdict($u, $new, $old);

            case 'annualInventories':
                if ($r === self::REQUESTER) {
                    if (! $old || strtolower((string) ($old['custodianEmail'] ?? '')) !== $me) {
                        return 'You can only certify your own annual inventory.';
                    }
                    if (strtolower((string) ($new['custodianEmail'] ?? '')) !== $me) {
                        return 'The custodian cannot be changed.';
                    }
                }

                return null;

            case 'auditLog':
                if ($old !== null) {
                    return 'The audit trail cannot be edited.';
                }
                // the actor (user + role) is stamped by the server in RecordStore, so it cannot be faked

                return null;

            case 'simEmails':
                return $old !== null ? 'Simulated emails cannot be edited.' : null;

            case 'notifications':
                if ($old !== null && ! self::canSee($u, 'notifications', $old)) {
                    return 'This notification is not yours.';
                }

                return null;

            default:
                return null;
        }
    }

    /** Returns null when the delete is allowed, otherwise the reason it is refused. */
    public static function deleteVerdict(User $u, string $c, ?array $old): ?string
    {
        if (! self::canWriteCollection($u, $c)) {
            return 'Your role cannot change this data.';
        }

        $r = $u->role;

        if ($c === 'auditLog') {
            return 'The audit trail cannot be deleted.';
        }

        if ($r === self::ADMIN) {
            return null;
        }

        switch ($c) {
            case 'forms':
                if ($r === self::REQUESTER && $old
                    && strtolower((string) ($old['requesterEmail'] ?? '')) === strtolower($u->email)
                    && in_array($old['type'] ?? '', ['requisition', 'pullout'], true)) {
                    return null;
                }

                return 'Only the owner (or the Administrator) can delete this form.';

            case 'notifications':
                return ($old && self::canSee($u, 'notifications', $old)) ? null : 'This notification is not yours.';

            case 'reportHistory':
                return null;

            default:
                return 'Only the Administrator can delete this record.';
        }
    }

    // ------------------------------------------------------------------ forms

    private static function formVerdict(User $u, array $new, ?array $old): ?string
    {
        $r = $u->role;
        $me = strtolower($u->email);
        $type = $new['type'] ?? null;

        if (! in_array($type, ['requisition', 'pullout', 'receipt'], true)) {
            return 'Unknown form type.';
        }
        if ($old && ($old['type'] ?? null) !== $type) {
            return 'The form type cannot be changed.';
        }

        $oldStatus = $old['status'] ?? null;
        $newStatus = $new['status'] ?? null;
        $statusChanged = $oldStatus !== $newStatus;

        if ($r === self::ADMIN) {
            return null;
        }

        if ($r === self::STAFF) {
            if (! $old && $type === 'requisition') {
                return 'Staff cannot create a requisition.';
            }
            if ($bad = self::changedPath($old, $new, ['approval', 'review', 'sig.auditor', 'sig.director'])) {
                return 'Staff cannot change '.$bad.' (Director / Auditor decision).';
            }
            if ($type === 'requisition' && $statusChanged
                && ! in_array($newStatus, ['Ready for Release', 'Partially Released', 'Released', 'Completed'], true)) {
                return 'Staff cannot set the status "'.$newStatus.'".';
            }

            return null;
        }

        if ($r === self::AUDITOR) {
            if ($type !== 'requisition' || ! $old) {
                return 'The Auditor only reviews existing requisitions.';
            }
            $bad = self::changedPath($old, $new, [
                'approval', 'sig.director', 'sig.deptHead', 'header', 'items', 'releases', 'requesterEmail', 'controlNo',
            ]);
            if ($bad) {
                return 'The Auditor cannot change '.$bad.'.';
            }
            if ($statusChanged && ! in_array($newStatus, ['Pending Auditor Signature', 'Pending Director Approval'], true)) {
                return 'The Auditor cannot set the status "'.$newStatus.'".';
            }

            return null;
        }

        // Requester
        $owner = strtolower((string) ($new['requesterEmail'] ?? ''));
        if ($owner !== $me) {
            return 'You can only save your own forms.';
        }
        if ($old && strtolower((string) ($old['requesterEmail'] ?? '')) !== $me) {
            return 'This form belongs to someone else.';
        }
        if (! $old && $type === 'receipt') {
            return 'Receipts are issued by the Property Department.';
        }
        if ($bad = self::changedPath($old, $new, ['approval', 'review', 'sig.auditor', 'sig.director'])) {
            return 'You cannot change '.$bad.'.';
        }
        if ($type === 'requisition' && $statusChanged
            && ! in_array($newStatus, ['Draft', 'Submitted', 'Pending Department Head Signature', 'Pending Auditor Review', 'Completed'], true)) {
            return 'You cannot set the status "'.$newStatus.'".';
        }
        if ($type === 'pullout' && $statusChanged && ! in_array($newStatus, ['Pending', 'Draft'], true)) {
            return 'You cannot set the status "'.$newStatus.'".';
        }

        return null;
    }

    /** First dot-path whose value differs between $old and $new (missing = null), or null. */
    private static function changedPath(?array $old, array $new, array $paths): ?string
    {
        foreach ($paths as $p) {
            $a = $old ? Arr::get($old, $p) : null;
            $b = Arr::get($new, $p);
            if (json_encode($a) !== json_encode($b)) {
                return $p;
            }
        }

        return null;
    }
}
