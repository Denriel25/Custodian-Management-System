<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\Record;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Run with: php artisan test
 * Covers login, page protection, the per-role save rules, user management,
 * the sync API, the AI assistant and the dashboard chart numbers.
 */
class CustodianSystemTest extends TestCase
{
    use RefreshDatabase;

    private function user(
        string $role,
        string $email,
        string $status = 'Active',
        string $password = 'secret123'
    ): User {
        static $n = 0;

        return User::query()->create([
            'code' => 'USR'.str_pad((string) ++$n, 3, '0', STR_PAD_LEFT),
            'name' => $role.' Person',
            'email' => $email,
            'role' => $role,
            'status' => $status,
            'department' => 'Dept',
            'contact' => '',
            'password' => $password,
        ]);
    }

    private function form(
        string $id,
        string $requesterEmail,
        string $status = 'Submitted',
        array $extra = []
    ): array {
        return array_replace_recursive([
            'id' => $id,
            'type' => 'requisition',
            'controlNo' => '26-'.$id,
            'status' => $status,
            'requesterEmail' => $requesterEmail,
            'header' => ['department' => 'Engineering'],
            'items' => [],
            'sig' => [
                'deptHead' => null,
                'auditor' => null,
                'director' => null,
            ],
            'dateCreated' => now()->toIso8601String(),
        ], $extra);
    }

    private function push(
        User $as,
        string $collection,
        array $upserts = [],
        array $deletes = []
    ) {
        return $this->actingAs($as)->postJson('/api/sync/push', [
            'changes' => [[
                'c' => $collection,
                'upserts' => array_map(
                    fn ($d) => [
                        'k' => (string) ($d['id'] ?? '_'),
                        'd' => $d,
                    ],
                    $upserts
                ),
                'deletes' => $deletes,
            ]],
        ]);
    }

    // ------------------------------------------------------------------
    // Login
    // ------------------------------------------------------------------

    public function test_landing_page_is_public(): void
    {
        $this->get('/')->assertOk();
    }

    public function test_login_wrong_password_is_refused(): void
    {
        $this->user('Administrator', 'admin@neu.edu.ph');

        $this->postJson('/auth/login', [
            'email' => 'admin@neu.edu.ph',
            'password' => 'nope',
            'side' => 'admin',
        ])->assertStatus(401)->assertJson(['ok' => false]);

        $this->assertGuest();
    }

    public function test_login_is_rate_limited_after_five_failed_attempts(): void
    {
        $email = 'admin@neu.edu.ph';

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/auth/login', [
                'email' => $email,
                'password' => 'WrongPassword123!',
                'side' => 'admin',
            ])->assertUnauthorized();
        }

        $this->postJson('/auth/login', [
            'email' => $email,
            'password' => 'WrongPassword123!',
            'side' => 'admin',
        ])->assertStatus(429)
          ->assertJson([
              'ok' => false,
          ]);
    }

    public function test_login_checks_the_side_and_the_status(): void
    {
        $this->user('Requester', 'req@neu.edu.ph');
        $this->user('Staff', 'inactive@neu.edu.ph', 'Inactive');

        $this->postJson('/auth/login', [
            'email' => 'req@neu.edu.ph',
            'password' => 'secret123',
            'side' => 'admin',
        ])->assertStatus(403);

        $this->postJson('/auth/login', [
            'email' => 'inactive@neu.edu.ph',
            'password' => 'secret123',
            'side' => 'admin',
        ])->assertStatus(403);

        $this->assertGuest();
    }

    public function test_login_succeeds_redirects_by_role_and_writes_the_audit_trail(): void
    {
        $this->user('Auditor', 'aud@neu.edu.ph');

        $res = $this->postJson('/auth/login', [
            'email' => 'AUD@neu.edu.ph',
            'password' => 'secret123',
            'side' => 'admin',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertStringEndsWith(
            '/Auditor/AuditorDashboard/dashboard.html',
            $res->json('redirect')
        );

        $this->assertAuthenticated();

        $entry = Record::query()
            ->where('collection', 'auditLog')
            ->first();

        $this->assertNotNull($entry);
        $this->assertSame('aud@neu.edu.ph', $entry->document()['user']);
        $this->assertSame('Logged in', $entry->document()['activity']);
    }

    public function test_logout_ends_the_session(): void
    {
        $u = $this->user('Staff', 'staff@neu.edu.ph');

        $this->actingAs($u)->postJson('/auth/logout')->assertOk();

        $this->assertGuest();
    }

    // ------------------------------------------------------------------
    // Pages
    // ------------------------------------------------------------------

    public function test_guest_is_sent_to_the_right_login_page(): void
    {
        $this->get('/Admin/Dashboard/dashboard.html')
            ->assertRedirect('/Admin/Login/login.html');

        $this->get('/Requester/RequesterDashboard/dashboard.html')
            ->assertRedirect('/Requester/RequesterLogin/login.html');
    }

    public function test_pages_are_limited_to_the_right_role(): void
    {
        $req = $this->user('Requester', 'req@neu.edu.ph');
        $staff = $this->user('Staff', 'staff@neu.edu.ph');
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->actingAs($req)
            ->get('/Admin/Dashboard/dashboard.html')
            ->assertRedirect('/Requester/RequesterDashboard/dashboard.html');

        $this->actingAs($staff)
            ->get('/Requester/RequesterDashboard/dashboard.html')
            ->assertRedirect('/Admin/Dashboard/dashboard.html');

        $this->actingAs($staff)
            ->get('/Admin/Users/users.html')
            ->assertRedirect('/Admin/Dashboard/dashboard.html');

        $this->actingAs($staff)
            ->get('/Admin/Settings/settings.html')
            ->assertRedirect('/Admin/Dashboard/dashboard.html');

        $this->actingAs($admin)
            ->get('/Admin/Users/users.html')
            ->assertOk();
    }

    public function test_unknown_page_is_404_and_no_path_escape(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->actingAs($admin)
            ->get('/Admin/Dashboard/nothing.html')
            ->assertNotFound();

        $this->actingAs($admin)
            ->get('/Admin/Dashboard/..%2f..%2f.env.html')
            ->assertNotFound();
    }

    public function test_page_carries_state_and_bridge_but_never_a_password(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push(
            $admin,
            'forms',
            [$this->form('F1', 'req@neu.edu.ph')]
        )->assertOk();

        $html = $this->actingAs($admin)
            ->get('/Admin/Dashboard/dashboard.html')
            ->assertOk()
            ->getContent();

        $this->assertStringContainsString('window.CMS = {', $html);
        $this->assertStringContainsString('laravel-bridge.js', $html);
        $this->assertStringContainsString('name="csrf-token"', $html);
        $this->assertStringContainsString('26-F1', $html);
        $this->assertStringNotContainsString('secret123', $html);
        $this->assertStringNotContainsString('"password"', $html);
    }

    public function test_requester_page_only_contains_their_own_forms(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $this->user('Requester', 'b@neu.edu.ph');

        $this->push($admin, 'forms', [
            $this->form('A1', 'a@neu.edu.ph'),
            $this->form('B1', 'b@neu.edu.ph'),
        ])->assertOk();

        $html = $this->actingAs($a)
            ->get('/Requester/RequesterDashboard/dashboard.html')
            ->getContent();

        $this->assertStringContainsString('26-A1', $html);
        $this->assertStringNotContainsString('26-B1', $html);
    }

    // ------------------------------------------------------------------
    // Saving: role rules
    // ------------------------------------------------------------------

    public function test_requester_can_save_own_form_but_not_someone_elses(): void
    {
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $this->push(
            $a,
            'forms',
            [$this->form('A1', 'a@neu.edu.ph', 'Submitted')]
        )->assertOk()->assertJsonCount(0, 'rejected');

        $this->push(
            $a,
            'forms',
            [$this->form('X1', 'b@neu.edu.ph')]
        )->assertOk()->assertJsonCount(1, 'rejected');

        $this->assertNotNull(
            Record::query()->where('collection', 'forms')->where('key', 'A1')->first()
        );

        $this->assertNull(
            Record::query()->where('collection', 'forms')->where('key', 'X1')->first()
        );
    }

    public function test_requester_cannot_approve_or_sign_for_others(): void
    {
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $this->push(
            $a,
            'forms',
            [$this->form('A1', 'a@neu.edu.ph', 'Approved')]
        )->assertJsonCount(1, 'rejected');

        $this->push(
            $a,
            'forms',
            [$this->form('A2', 'a@neu.edu.ph', 'Submitted', [
                'approval' => ['decision' => 'Approved'],
            ])]
        )->assertJsonCount(1, 'rejected');

        $this->push(
            $a,
            'forms',
            [$this->form('A3', 'a@neu.edu.ph', 'Submitted', [
                'sig' => ['director' => ['name' => 'Me']],
            ])]
        )->assertJsonCount(1, 'rejected');

        $this->assertSame(0, Record::query()->where('collection', 'forms')->count());
    }

    public function test_staff_cannot_change_the_director_decision(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $staff = $this->user('Staff', 'staff@neu.edu.ph');

        $this->push(
            $admin,
            'forms',
            [$this->form('F1', 'r@neu.edu.ph', 'Pending Director Approval')]
        )->assertJsonCount(0, 'rejected');

        $tampered = $this->form(
            'F1',
            'r@neu.edu.ph',
            'Ready for Release',
            ['approval' => ['decision' => 'Approved']]
        );

        $this->push($staff, 'forms', [$tampered])
            ->assertJsonCount(1, 'rejected');

        $release = $this->form('F1', 'r@neu.edu.ph', 'Released');

        $this->push($staff, 'forms', [$release])
            ->assertJsonCount(0, 'rejected');
    }

    public function test_auditor_can_review_but_not_approve(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $aud = $this->user('Auditor', 'aud@neu.edu.ph');

        $this->push(
            $admin,
            'forms',
            [$this->form('F1', 'r@neu.edu.ph', 'Pending Auditor Review')]
        );

        $reviewed = $this->form(
            'F1',
            'r@neu.edu.ph',
            'Pending Auditor Signature',
            [
                'review' => [
                    'by' => 'Auditor',
                    'at' => now()->toIso8601String(),
                ],
            ]
        );

        $this->push($aud, 'forms', [$reviewed])
            ->assertJsonCount(0, 'rejected');

        $approve = $this->form(
            'F1',
            'r@neu.edu.ph',
            'Ready for Release',
            ['approval' => ['decision' => 'Approved']]
        );

        $this->push($aud, 'forms', [$approve])
            ->assertJsonCount(1, 'rejected');
    }

    public function test_only_staff_side_changes_inventory(): void
    {
        $req = $this->user('Requester', 'a@neu.edu.ph');
        $staff = $this->user('Staff', 'staff@neu.edu.ph');

        $asset = [
            'id' => 'AST001',
            'name' => 'Bond paper',
            'type' => 'Consumable',
            'quantity' => 10,
        ];

        $this->push($req, 'assets', [$asset])
            ->assertJsonCount(1, 'rejected');

        $this->push($staff, 'assets', [$asset])
            ->assertJsonCount(0, 'rejected');

        $this->push($staff, 'assets', [], ['AST001'])
            ->assertJsonCount(1, 'rejected');
    }

    public function test_only_administrator_changes_settings(): void
    {
        $staff = $this->user('Staff', 'staff@neu.edu.ph');
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push(
            $staff,
            'systemSettings',
            [['id' => '_', 'organization' => 'X']]
        )->assertJsonCount(1, 'rejected');

        $this->push(
            $admin,
            'systemSettings',
            [['id' => '_', 'organization' => 'NEU']]
        )->assertJsonCount(0, 'rejected');
    }

    public function test_audit_entries_are_stamped_with_the_real_actor_and_cannot_be_deleted(): void
    {
        $req = $this->user('Requester', 'a@neu.edu.ph');
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push($req, 'auditLog', [[
            'id' => 'L1',
            'date' => now()->toIso8601String(),
            'user' => 'boss@neu.edu.ph',
            'role' => 'Administrator',
            'activity' => 'x',
        ]])->assertJsonCount(0, 'rejected');

        $doc = Record::query()
            ->where('collection', 'auditLog')
            ->where('key', 'L1')
            ->first()
            ->document();

        $this->assertSame('a@neu.edu.ph', $doc['user']);
        $this->assertSame('Requester', $doc['role']);

        $this->push($admin, 'auditLog', [], ['L1'])
            ->assertJsonCount(1, 'rejected');

        $this->push($admin, 'auditLog', [
            array_merge($doc, ['activity' => 'changed']),
        ])->assertJsonCount(1, 'rejected');
    }

    public function test_form_counters_only_go_up(): void
    {
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $this->push($a, 'formCounters', [
            ['id' => '_', 'requisition-2026' => 5],
        ])->assertOk();

        $this->push($a, 'formCounters', [
            ['id' => '_', 'requisition-2026' => 3],
        ])->assertOk();

        $this->assertSame(
            5,
            Record::query()->where('collection', 'formCounters')->first()->document()['requisition-2026']
        );
    }

    public function test_unknown_collection_and_bad_payloads_are_refused(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push($admin, 'secrets', [['id' => '1']])
            ->assertJsonCount(1, 'rejected');

        $this->actingAs($admin)
            ->postJson('/api/sync/push', [])
            ->assertStatus(422);

        $this->postJson('/api/sync/push', [
            'changes' => [[
                'c' => 'forms',
                'upserts' => [[
                    'k' => 'A',
                    'd' => [
                        'id' => 'B',
                        'type' => 'requisition',
                    ],
                ]],
            ]],
        ])->assertJsonCount(1, 'rejected');
    }

    // ------------------------------------------------------------------
    // Users
    // ------------------------------------------------------------------

    public function test_administrator_creates_a_user_with_a_hashed_password(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push($admin, 'users', [[
            'id' => 'USR900',
            'name' => 'New Staff',
            'email' => 'NEW@neu.edu.ph',
            'role' => 'Staff',
            'status' => 'Active',
            'department' => 'Property',
            'contact' => '',
            'password' => 'BrandNewUser2026!',
        ]])->assertJsonCount(0, 'rejected');

        $new = User::query()->where('email', 'new@neu.edu.ph')->first();

        $this->assertNotNull($new);

        $this->assertTrue(
            Hash::check('BrandNewUser2026!', $new->password)
        );

        $this->assertSame('USR900', $new->code);

        $this->postJson('/auth/login', [
            'email' => 'new@neu.edu.ph',
            'password' => 'BrandNewUser2026!',
            'side' => 'admin',
        ])->assertOk();
    }

    public function test_user_directory_hides_contact_and_department_from_auditors_and_requesters(): void
    {
        // Create one user whose details will be checked.
        $target = $this->user('Staff', 'target@neu.edu.ph');

        $target->update([
            'contact' => '09171234567',
            'department' => 'Property Office',
        ]);

        // Create viewers for each role.
        $viewers = [
            'Administrator' => $this->user('Administrator', 'admin@neu.edu.ph'),
            'Staff' => $this->user('Staff', 'staff@neu.edu.ph'),
            'Auditor' => $this->user('Auditor', 'auditor@neu.edu.ph'),
            'Requester' => $this->user('Requester', 'requester@neu.edu.ph'),
        ];

        foreach ($viewers as $role => $viewer) {
            $response = $this->actingAs($viewer)
                ->getJson('/api/sync/pull?since=0')
                ->assertOk();

            $users = $response->json('users');

            $this->assertIsArray($users);

            $targetData = collect($users)->firstWhere('id', $target->code);

            $this->assertNotNull(
                $targetData,
                "{$role} should be able to see the user directory."
            );

            $this->assertArrayNotHasKey('password', $targetData);

            if (in_array($role, ['Administrator', 'Staff'], true)) {
                $this->assertSame('09171234567', $targetData['contact']);
                $this->assertSame('Property Office', $targetData['department']);
            } else {
                $this->assertSame('', $targetData['contact']);
                $this->assertSame('', $targetData['department']);
            }

            $this->assertSame('target@neu.edu.ph', $targetData['email']);
            $this->assertSame('Staff', $targetData['role']);
            $this->assertSame('Active', $targetData['status']);
        }
    }

    public function test_user_rules_are_enforced(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $staff = $this->user('Staff', 'staff@neu.edu.ph');

        $other = [
            'id' => 'USR800',
            'name' => 'N',
            'email' => 'n@neu.edu.ph',
            'role' => 'Staff',
            'status' => 'Active',
            'password' => 'abcdef',
        ];

        $this->push($staff, 'users', [$other])
            ->assertJsonCount(1, 'rejected');

        $this->push($admin, 'users', [
            array_merge($other, ['password' => '123']),
        ])->assertJsonCount(1, 'rejected');

        $this->push($admin, 'users', [
            array_merge($other, ['role' => 'Boss']),
        ])->assertJsonCount(1, 'rejected');

        $this->push($admin, 'users', [
            array_merge($other, ['email' => 'admin@neu.edu.ph']),
        ])->assertJsonCount(1, 'rejected');

        $this->push($admin, 'users', [], [$admin->code])
            ->assertJsonCount(1, 'rejected');

        $this->push($admin, 'users', [
            array_merge($admin->toFrontend(), ['role' => 'Staff']),
        ])->assertJsonCount(1, 'rejected');
    }

    public function test_inactive_account_loses_access_at_once(): void
    {
        $u = $this->user('Staff', 'staff@neu.edu.ph');

        $u->update(['status' => 'Inactive']);

        $this->actingAs($u)
            ->getJson('/api/sync/pull?since=0')
            ->assertStatus(401);
    }

    // ------------------------------------------------------------------
    // Pull
    // ------------------------------------------------------------------

    public function test_pull_returns_only_what_changed_and_what_the_role_may_see(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $first = $this->push(
            $admin,
            'forms',
            [$this->form('A1', 'a@neu.edu.ph')]
        )->json('rev');

        $this->push(
            $admin,
            'forms',
            [$this->form('B1', 'b@neu.edu.ph')]
        );

        $res = $this->actingAs($a)
            ->getJson('/api/sync/pull?since='.$first)
            ->assertOk();

        $this->assertSame([], $res->json('changes'));

        $all = $this->actingAs($a)
            ->getJson('/api/sync/pull?since=0')
            ->json('changes');

        $this->assertCount(1, $all);
        $this->assertSame('A1', $all[0]['k']);
    }

    public function test_deletes_reach_other_browsers_as_tombstones(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $rev = $this->push(
            $admin,
            'assets',
            [[
                'id' => 'AST1',
                'name' => 'x',
                'type' => 'Consumable',
                'quantity' => 1,
            ]]
        )->json('rev');

        $this->push($admin, 'assets', [], ['AST1'])
            ->assertJsonCount(0, 'rejected');

        $changes = $this->actingAs($admin)
            ->getJson('/api/sync/pull?since='.$rev)
            ->json('changes');

        $this->assertSame('AST1', $changes[0]['k']);
        $this->assertNull($changes[0]['d']);
    }

    // ------------------------------------------------------------------
    // Assistant
    // ------------------------------------------------------------------

    public function test_chat_reports_when_the_ai_is_not_configured(): void
    {
        config(['services.anthropic.key' => '']);

        $u = $this->user('Requester', 'a@neu.edu.ph');

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => 'hello'])
            ->assertStatus(503)
            ->assertJson(['ok' => false, 'code' => 'not_configured']);
    }

    public function test_chat_returns_the_ai_answer_and_keeps_history(): void
    {
        config(['services.anthropic.key' => 'test-key']);

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'text',
                    'text' => 'Your requisition is Submitted.',
                ]],
            ], 200),
        ]);

        $u = $this->user('Requester', 'a@neu.edu.ph');

        $this->push(
            $u,
            'forms',
            [$this->form('A1', 'a@neu.edu.ph')]
        );

        $this->actingAs($u)
            ->postJson('/api/chat', [
                'message' => 'Where is my request?',
                'page' => '/x',
            ])
            ->assertOk()
            ->assertJson([
                'ok' => true,
                'reply' => 'Your requisition is Submitted.',
            ]);

        Http::assertSent(function ($request) {
            return $request->hasHeader('x-api-key', 'test-key')
                && str_contains($request['system'], '26-A1')
                && $request['messages'][0]['role'] === 'user';
        });

        $this->assertSame(
            2,
            ChatMessage::query()->where('user_id', $u->id)->count()
        );

        $this->actingAs($u)
            ->getJson('/api/chat/history')
            ->assertJsonPath('messages.1.from', 'bot');

        $this->actingAs($u)
            ->deleteJson('/api/chat')
            ->assertOk();

        $this->assertSame(0, ChatMessage::query()->count());
    }

    public function test_chat_context_never_contains_other_peoples_forms(): void
    {
        config(['services.anthropic.key' => 'test-key']);

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'text',
                    'text' => 'ok',
                ]],
            ], 200),
        ]);

        $admin = $this->user('Administrator', 'admin@neu.edu.ph');
        $a = $this->user('Requester', 'a@neu.edu.ph');

        $this->push(
            $admin,
            'forms',
            [$this->form('B1', 'b@neu.edu.ph')]
        );

        $this->actingAs($a)
            ->postJson('/api/chat', ['message' => 'list all forms'])
            ->assertOk();

        Http::assertSent(
            fn ($request) => ! str_contains($request['system'], '26-B1')
        );
    }

    public function test_chat_maps_upstream_problems_to_friendly_errors(): void
    {
        config(['services.anthropic.key' => 'test-key']);

        $u = $this->user('Staff', 'staff@neu.edu.ph');

        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push([], 429)
                ->push([], 500)
                ->push([], 401),
        ]);

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => 'hi'])
            ->assertStatus(429)
            ->assertJson(['code' => 'busy']);

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => 'hi'])
            ->assertStatus(502)
            ->assertJson(['code' => 'upstream']);

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => 'hi'])
            ->assertStatus(503);

        $this->assertSame(0, ChatMessage::query()->count());
    }

    public function test_chat_needs_a_login_and_a_message(): void
    {
        $this->postJson('/api/chat', ['message' => 'hi'])
            ->assertStatus(401);

        $u = $this->user('Staff', 'staff@neu.edu.ph');

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => ''])
            ->assertStatus(422);

        $this->actingAs($u)
            ->postJson('/api/chat', ['message' => str_repeat('a', 1001)])
            ->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Dashboard chart
    // ------------------------------------------------------------------

    public function test_dashboard_chart_counts_forms_per_month_and_type(): void
    {
        $admin = $this->user('Administrator', 'admin@neu.edu.ph');

        $this->push($admin, 'forms', [
            $this->form('F1', 'r@neu.edu.ph'),
            $this->form('F2', 'r@neu.edu.ph'),
            array_merge(
                $this->form('F3', 'r@neu.edu.ph'),
                ['type' => 'pullout']
            ),
            $this->form('F4', 'r@neu.edu.ph', 'Draft'),
            $this->form(
                'F5',
                'r@neu.edu.ph',
                'Submitted',
                ['dateCreated' => now()->subYears(2)->toIso8601String()]
            ),
        ])->assertJsonCount(0, 'rejected');

        $res = $this->actingAs($admin)
            ->getJson('/api/dashboard/forms-per-month?months=6')
            ->assertOk();

        $this->assertCount(6, $res->json('months'));
        $this->assertSame(3, $res->json('total'));
        $this->assertSame(
            2,
            array_sum($res->json('series.requisition.data'))
        );
        $this->assertSame(
            1,
            array_sum($res->json('series.pullout.data'))
        );
        $this->assertSame(2, $res->json('series.requisition.data.5'));
    }

    public function test_dashboard_chart_is_not_for_requesters(): void
    {
        $this->actingAs(
            $this->user('Requester', 'a@neu.edu.ph')
        )->getJson('/api/dashboard/forms-per-month')
            ->assertForbidden();
    }
}
