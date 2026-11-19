# Frontend + Laravel integration

## How it works (short)

The frontend (24 pages, ~29k lines of JS) keeps working as before: pages read and write `localStorage`.
Laravel now owns the data.

| Step | Where | What happens |
|---|---|---|
| Serve | `PageController` | Pages live in `resources/frontend/**.html`, assets in `public/`. A page is only served to a logged-in user of the right role. |
| Load | `PageController::render` | The current database state **for that role** is written into the page (`window.CMS`) before any script runs. |
| Save | `public/Shared/laravel-bridge.js` -> `POST /api/sync/push` | Each changed record is sent to `SyncController` -> `RecordStore` -> `CollectionAccess` (role rules). Unsent changes wait in an outbox, so a save followed by a page change is not lost. |
| Refresh | `GET /api/sync/pull` every 8 s | Changes by other users are applied and the usual `storage` event is raised, so the existing realtime code keeps working. |
| Login | `AuthController` | Real accounts (`users` table, hashed passwords), Laravel session, rate limit (10/min), role + status checks, login written to the Audit Trail. |
| Assistant | `ChatController` -> `ChatService` | The browser calls `POST /api/chat`; Laravel calls the AI API with the key from `.env` and a role-scoped data summary. History is stored in `chat_messages`. |
| Chart | `DashboardController` | `GET /api/dashboard/forms-per-month` (counted on the server, only forms the user may see). |

## Setup

```bash
composer install            # unchanged dependencies (nothing new was added)
php artisan migrate         # adds users columns, records, chat_messages
php artisan db:seed         # creates the 5 starting accounts (never overwrites existing ones)
php artisan serve           # then open http://127.0.0.1:8000
```

Edit `.env`:

```
APP_TIMEZONE=Asia/Manila
ANTHROPIC_API_KEY=sk-ant-...        # required for the AI assistant (server side only)
ANTHROPIC_MODEL=claude-sonnet-5-5   # optional
```

Without a key the chat still answers using the built-in helper (it says once that the AI is off).
After changing `.env` run `php artisan config:clear`.

Starting accounts (**change these passwords** in Admin > Users, or set `CMS_SEED_PASSWORD` before seeding):

| Role | Email | Password |
|---|---|---|
| Administrator | admin@neu.edu.ph | admin123 |
| Staff | staff@neu.edu.ph | staff123 |
| Auditor | auditor@neu.edu.ph | auditor123 |
| Requester | requester@neu.edu.ph / requester2@neu.edu.ph | requester123 |

The system starts **empty** (no demo requisitions). The Administrator can add sample data in
System Settings > Data Management.

Serve the site from the domain root (or a virtual host). Large signature images are stored inside
forms: if saving fails with HTTP 413, raise `post_max_size` / `upload_max_filesize` in `php.ini`.

## Tests

```bash
php artisan test
```
`tests/Feature/CustodianSystemTest.php` covers login, page protection, the per-role save rules,
user management, audit stamping, sync/pull, the assistant (AI call faked) and the chart numbers.

## Who can do what on the server (CollectionAccess)

- Pages: Admin folder = Administrator/Staff (Users and System Settings = Administrator only); Auditor folder = Auditor; Requester folder = Requester.
- Requester: sees and saves only their own forms; cannot set approval, review, auditor/director signatures or statuses beyond Submitted/Pending.../Completed.
- Auditor: only existing requisitions; may add the review and the auditor signature; cannot touch approval or the director signature.
- Staff: inventory, releases, receipts, pull-outs; cannot change approval, review or auditor/director signatures; cannot delete assets.
- Administrator: everything, including users and settings (cannot demote/delete self or the last active Administrator).
- Audit Trail: append-only; the server stamps the real user and role on every entry.
- Draft requisitions are private to their Requester.

## Known limits (be aware)

1. **Permission layer, not a full workflow engine.** The step-by-step rules (who signs when) still run in `public/Shared/workflow.js`. The server enforces ownership, protected fields and allowed status values per role, but a determined user could still, for example, skip a step that does not touch a protected field.
2. **Records are stored as JSON documents** (`records` table), not as the normalized tables in `docs/frontend-prototype/DATABASE_DESIGN.md`. This kept all existing screens working unchanged. Moving to normalized tables later means rewriting the workflow JS to call the API directly.
3. **Last write wins per record** if two people edit the same record at the same moment. Form counters only ever go up.
4. **Emails are still simulated** (`simEmails`); no real mail is sent yet. The `.env` mail settings are untouched.
5. Chart.js is loaded from jsDelivr (pinned to 4.4.7). Offline, the existing canvas fallback chart is drawn.
6. Data is cached in the browser's `localStorage` (about 5 MB limit) while a user is logged in; it is cleared at logout.
