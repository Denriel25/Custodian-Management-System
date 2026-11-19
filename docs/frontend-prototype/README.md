# NEU Custodian Management System

A property and custodian management system for New Era University: requisitions with a three-signatory approval, inventory (consumables and individually tracked equipment), releases with acknowledgment receipts, pull-outs, reports, QR codes, notifications and an audit trail.

**Status: complete frontend prototype.** It is plain HTML, CSS and JavaScript. There is no backend yet: all data is kept in the browser (localStorage) and demo data is created automatically. Laravel / MySQL is the planned next phase and is **not** part of this package.

## Quick start

1. Unzip the project and keep the folder structure as it is.
2. Open **`index.html`** in Chrome, Edge or Firefox (double-click it), **or** run a tiny local server from the project folder and open the address it prints:
   `python3 -m http.server 8000` then open `http://localhost:8000/index.html`
3. Log in with one of the demo accounts below. Demo data (requisitions in every status, equipment units, stock, pull-out records, receipts) is created on the first visit.

No installation, build step or package manager is needed.

> Data is stored per browser **and per address**. Opening the files directly (`file://`) and opening them through `http://localhost` use different storage, so each starts with its own demo data. Use one way consistently.

### Demo accounts

| Role | Login page | Email | Password |
|---|---|---|---|
| Administrator (acts as the **Director**) | Admin login | admin@neu.edu.ph | admin123 |
| Staff | Admin login | staff@neu.edu.ph | staff123 |
| Auditor (**School Auditor**) | Admin login | auditor@neu.edu.ph | auditor123 |
| Requester | Requester login | requester@neu.edu.ph | requester123 |
| Requester (second account) | Requester login | requester2@neu.edu.ph | requester123 |

Admin, Staff and Auditor sign in at **Admin/Login/login.html**; Requesters at **Requester/RequesterLogin/login.html** (both are linked from `index.html`).

## The four roles (no others exist)

| Role | What they do |
|---|---|
| **Administrator** | Acts as the Director: approves or rejects requisitions and pull-out requests and signs as Director. Manages users and System Settings, supervises the Release Queue, reports and audit trail. **Does not perform actual releases.** |
| **Staff** | Handles actual releases (Release Queue), inventory, assets and units, pull-out records and receipts. Cannot approve, reject or sign. |
| **Auditor** | Reviews the items and quantities of a requisition and signs as School Auditor. Read-only access to release records. |
| **Requester** | Creates requisitions and pull-out requests, records the Department Head signature (typed name + drawn or uploaded signature; the Department Head has no account), and confirms receipt of released items. |

## The requisition workflow

1. **Requester** submits the Requisition Form and records the **Department Head** signature.
2. **School Auditor** reviews and signs.
3. **Director (Admin)** approves and signs (or rejects with a reason). When the three signatures and the approval are complete the status becomes **Ready for Release**.
4. **Staff** open the **Release Queue** and release the items: for equipment they select specific Available unit IDs; for consumables they enter quantities checked against stock. Partial releases are supported (**Partially Released**). Inventory, unit statuses and unit history change only at this moment. Each release gets its own **Acknowledgment Receipt (PROP-ARII)**.
5. **Requester** confirms receipt; the requisition becomes **Completed**.

A QR code only opens a record; it never approves, signs or releases anything.

## Modules

| Module | Folder |
|---|---|
| Admin / Staff dashboard, Request Management, Inventory Management, Assets (consumables and equipment units, QR labels), Annual Inventory, Issuance (receipts), **Release Queue**, **Pull-Out Management**, Reports, Users, Audit Trail, **System Settings** | `Admin/` |
| Auditor dashboard, Requisition Review, Review History | `Auditor/` |
| Requester dashboard, Create Requisition, My Requests, History, Notifications, My Inventory | `Requester/` |
| Shared logic: workflow engine, stock, unit register, pull-out, settings, QR, notifications, chat assistant, demo data, fonts | `Shared/` |
| Notes and database design | `docs/` |

The three official forms are the **Requisition Form**, the **Pull-Out Request Form** and the **Acknowledgment Receipt (PROP-ARII)**. No other form types or modules are included.

## Dependencies

Everything is included in the project, including the **Poppins** font (`Shared/fonts/`, SIL Open Font License). One optional online item: the dashboard chart uses **Chart.js from a CDN** when internet is available; without internet the dashboard draws the same bar chart itself. Nothing else needs a connection.

## Demo data and your own data

Demo records are marked `demo: true` and use `DEMO-` IDs. In the browser console: `resetDemoData()` removes and recreates **only** demo records; `clearDemoData()` removes only demo records. Real (user-created) records are never touched. The same operations, with typed confirmations, are in **System Settings > Data Management**, which can also download a backup of the real records.

## Known limitations of the frontend prototype

- There is no real security: passwords and sessions are simulated in the browser, and permissions are enforced in the browser only. Real authentication, password hashing, file storage and email need the planned Laravel backend.
- Notifications and emails are simulated; nothing is ever sent.
- Data lives in localStorage (about 5 MB per browser). Signatures and the logo are stored as images in it. Clearing the browser data removes it (use the backup in System Settings).
- Several browser tabs writing at the same moment can overwrite each other; a database with transactions will solve this.
- Camera QR scanning depends on the browser; typing or pasting the code always works.

---

# Detailed notes by module

## Per-unit asset register (non-consumable equipment)

An equipment record (for example "Laptop") is the kind of equipment. Every **physical unit** has its own record in the `assetUnits` store:

- unique Asset ID (`AST006-U001`), its own QR code (`NEU-CMS|ASSET|AST006-U001`), serial number, condition (New, Good, Fair, Damaged), location, Section / Unit, department, assigned person and a movement history;
- status: **Available, Assigned, Under Maintenance, For Pull-Out, Pulled Out**.

The `quantity`, `issued` and `maintenance` numbers of the equipment record are calculated from its units (quantity = units not Pulled Out, issued = Assigned, maintenance = Under Maintenance + For Pull-Out), so Annual Inventory, reports and the stock check keep working.

- Old equipment records are migrated automatically and safely (`ensureAssetUnits`): nothing is deleted or overwritten. The first `issued` units become Assigned, the next `maintenance` units Under Maintenance, the rest Available. A serial number is copied only when the record has one unit.
- **Release** (requisition), **pull-out release** and a direct **acknowledgment receipt**: Staff select the specific units. Only the selected units change status and are written in the release record and in their own history.
- Staff and Admin change a status with a required reason. A unit becomes Assigned only through a release or a receipt. Only the Admin can correct a Pulled Out unit.
- Files: `Shared/units.js` (data and rules), `Admin/Assets/assetunits.js` (screens).
- Demo units use `DEMO-` IDs and `demo: true`; `resetDemoData()` and `clearDemoData()` remove only those.

## Pull-Out Management (Admin and Staff)

Open **Pull-Out Management** in the sidebar. A pull-out record takes specific physical units (see the per-unit register) out of service:

1. **New Pull-Out Record**: search and select the units, choose the reason (Damaged beyond repair, Obsolete, For disposal, Replaced by a new unit, Lost or missing, Other), the condition (New, Good, Fair, Damaged) and add the supporting information. The units become **For Pull-Out**.
2. **Process pull-out**: the units become **Pulled Out**. Units and their history are never deleted.
3. **Cancel record** (a reason is required): the units get the status they had before the record.

A pull-out request of a Requester that Staff release in Request Management also leaves a record (already Pulled Out). A record can be printed as a slip, exported to CSV, and appears in the **Pull-Out Report**. Only Staff and the Admin can create, process or cancel a record. Demo records (`PO-yy-9001`...) are marked `demo: true` and are the only ones `resetDemoData()` may remove.

Files: `Shared/pullout.js` (records and rules), `Admin/PullOut/` (page).

## System Settings (Admin only)

Open **System Settings** in the Admin sidebar. Staff, Auditor and Requester cannot open it (the page redirects them, the menu item is hidden, and saving is refused in code). Settings are saved in this browser (`localStorage` key `systemSettings`). They never contain or change records.

- **General** (simulated): system name, institution, office name, contact information, description, logo upload (PNG or JPG, up to 1 MB, 32 to 2000 px). The name and logo appear in the sidebar of every page; the institution, office and logo appear on printed forms, reports and pull-out slips; the contact information is used by the chat assistant.
- **Inventory** (simulated): fallback low-stock level for consumables without their own level, suggested reorder level and unit for new consumables, condition of newly added equipment units, first filter of Inventory Management, table rows per page. Consumables stay counted by quantity and equipment stays one record per physical unit.
- **Notifications** (simulated): master switch, simulated email copies, workflow groups (submitted, signatures, decisions, ready, release, receipt confirmed), low-stock and out-of-stock. Nothing is ever sent outside the browser; real email needs the future Laravel mail service.
- **Account and Access**: shows the current account and the four roles (Administrator, Staff, Auditor, Requester) with what each can do. Roles cannot be added or renamed. Real account security (password hashing, sessions, lock-out) is for the Laravel backend.
- **Appearance**: the dark theme, Poppins font and gold `#edae0f` are fixed. Supported preferences: table density and how long small messages stay.
- **Data Management**: shows real and demo record counts side by side. Safe operations: integrity check, backup download of the REAL records (JSON). Demo-only operations (each asks for a typed confirmation word): Create demo data, Reset demo data, Remove demo data only. There is no option to delete real records or clear the browser storage.

Files: `Shared/settings.js` (settings and getters), `Admin/Settings/` (page).

## Pull-out records and demo units

A pull-out record that uses demo units is itself a demo record (series `PO-yy-9xxx`) and records never mix demo and real units. If an older real record points at demo units, a demo reset sets those units to match the record. `pulloutIntegrityCheck()` reports any disagreement (also in Settings > Data Management and on the Pull-Out page).

## Ready-for-Release Queue (Admin and Staff)

Open **Release Queue** in the sidebar (also reachable from the Dashboard and the Issuance page). It lists **only** requisitions with the Department Head, School Auditor and Director signatures complete, the Auditor review and the Director approval complete, and items still to release (status **Ready for Release** or **Partially Released**). Anything else never appears and cannot be released, even if its status was edited by hand.

- **Staff make the actual release; the Admin supervises** (sees the queue and every record, but cannot release). Auditor: read-only release records inside the requisition details. Requester: sees their own release progress and confirms receipt.
- **Prepare release**: for equipment, select the specific **Available** unit IDs (only those units become Assigned); for consumables, enter the quantity (checked against stock and against the remaining balance). Partial releases are supported. Inventory, unit statuses, unit history, stock movement history and the Audit Trail change **only when Staff confirm**.
- Each release has its own number (`26-001-R1`, `-R2`...) and its own **Acknowledgment Receipt (PROP-ARII)** with the items and quantities really released (listed in Issuance). A one-time token stops a double click from releasing twice.
- Status: **Partially Released** until every item is released, then **Released**, and **Completed** when the Requester has confirmed every release. Staff can **close a partial release with the balance not released** (a reason is required).
- A QR code only opens a requisition; it never authorizes a release.

### Real requisitions that release demo equipment
A real requisition may release demo units or demo stock. A demo reset makes the demo units Available and the demo stock full again, which would disagree with the real release record. After a reset the system now sets the **demo** units (Assigned) and the **demo** stock to match what the real release records say. Real records are never changed. `releaseIntegrityCheck()` and Settings > Data Management > Check data integrity list any disagreement and any real record that refers to demo equipment.

Files: `Shared/workflow.js` (release engine, batches, checks), `Shared/release.js` (release window), `Admin/ReleaseQueue/` (page).
