# Custodian Management System

A web system for the **Property Department of New Era University**. It replaces the paper forms used by the Property Custodian with online forms that can be filled in, approved, tracked and printed.

> **Status:** frontend prototype (HTML, CSS and JavaScript only). Data is saved in the browser. A Laravel backend with a database is planned (see [Next steps](#next-steps)).

---

## What it does

The system follows the three paper forms of the Property Department:

| Paper form | In the system | Who creates it |
|---|---|---|
| **Requisition Form** | Request page, tab *Requisition Form* | Requester |
| **Pull-Out Request** (PROP-POR, 3 copies) | Request page, tab *Pull-Out Request* | Requester |
| **Acknowledgment Receipt** (PROP-ARII) | Admin, *Issuance* | Admin (Property Staff), for a Requester account. The Requester sees it and can print it |

Every form can be printed in the layout of the paper form, ready for signatures.

### Roles

There are three roles.

| Role | Where | What it does |
|---|---|---|
| **Administrator** | Admin pages | Everything: approves, releases and rejects requests, deletes, certifies an Annual Inventory, manages Users, reads the Audit Trail. |
| **Staff** | Admin pages (the same pages as the Administrator) | Prepares the work: receipts, assets (add, edit, import), Sections / Units, **recording the signatures of a requisition**, counting the Annual Inventory, scanning, reports. It **cannot** approve, release or reject a request, delete, certify or reopen an Annual Inventory, print the User and Audit Trail reports, or open Users and Audit Trail. |
| **Requester** | Requester pages | One role, but each Requester has **his or her own base**: own dashboard, forms, receipts, notifications and Annual Inventory. |

A Staff account logs in at the Admin login. The other people who sign the forms (Department Head, School Auditor, Building Administrator, Property Custodian) are printed in the signature boxes but do not log in.

The top right of every page shows the name of the person who is logged in and the role, for example **Nelson Salisi - Administrator**, **Ana Reyes - Staff** or **Denriel Dinogan - Requester**. The name is the one saved in the account (*Admin > Users*).

> These limits only hide buttons and pages in the browser (this is a prototype). With Laravel they must also be checked on the server.

### Status of a form, and the three signatures

```
Pending -> Approved -> (3 signatures) -> Released
   \          \
    +----------+--->  Rejected
```

1. **Pending**: the requester submitted it.
2. **Approved**: the **Administrator** (the Property Custodian) verified the stock and approved it. The Administrator can also reject it.
3. **Signatures**: the printed form needs three signatures, in the paper: **Department Dean, Auditing Office, Property Custodian**. The signatures stay on paper. The Property Office (Staff or Administrator) **ticks each one** in the form when the paper comes back, and the requester is told each time. The list shows "Approved (1/3 signed)".
4. **Released**: the supplies are given out. **A requisition cannot be released until the three signatures are ticked.** An Administrator can remove a tick by mistake; Staff cannot.

This is for the **Requisition**. A Pull-Out Request goes Pending, Approved, Released, without the signature steps. An Acknowledgment Receipt is made by the Property Office and starts as Released.

### Control numbers

Control numbers are automatic: `yy-001`, `yy-002`, ... (for example `26-001`).
- Each form type has its own counter.
- The counter starts again at `001` every new year.
- The number of a deleted form is never used again.

---

## The requisition: the manual process and this system

| Manual step | In the system | Compared with paper |
|---|---|---|
| 1. Obtain a request form | The requester opens **Request > Requisition Form** on his or her own account. The Control No. is automatic. | Easier: no trip to the office |
| 2. List the requested items | Items are chosen from the inventory list (it shows the stock). The unit, price, Amount and Total fill in by themselves. | Easier, fewer mistakes |
| 3. Verify the stock and approve | The system checks the stock. The requester gets a warning if it is not enough, and the Administrator sees a **Stock check** and **approves or rejects**. The requester is notified at once. | Easier and faster |
| 4. Department Dean's signature | The requester prints the form (it has a QR code) and takes it for signature. The Property Office **records the signature** in the system. | Same paper, but now tracked |
| 5. Auditing Office's signature | Same: signed on paper, then recorded in the system. | Same paper, but now tracked |
| 6. Property Custodian's signature | Same: signed on paper, then recorded in the system. | Same paper, but now tracked |
| 7. Release and collection | When the three signatures are recorded, the Administrator clicks **Release**. The stock goes down by itself, the requester is notified, and an Acknowledgment Receipt can be prepared. | Easier to track |

So the paper is still used for the signatures, but the request is no longer "lost" between offices: everybody can see in *My Requests* and in *Request Management* how many signatures are done and what is the next step.

---

## Pages

**Requester**

| Page | Purpose |
|---|---|
| Login | Requester login (has a link to the Admin login) |
| Dashboard | Totals and the latest forms |
| Request | Requisition Form and Pull-Out Request (fill in, save, print), and the Acknowledgment Receipts issued to the requester (view, print) |
| My Requests | All forms of the requester with their status |
| History | Forms that are already released or rejected |
| My Inventory | The Annual Inventory of the Section / Unit of the Requester (the custodian): view, print, certify |

**Admin**

| Page | Purpose |
|---|---|
| Login | Admin login (has a link to the Requester login) |
| Dashboard | Pending, for release, released, totals, chart per month, latest requests |
| Request Management | All forms of all requesters. Approve, reject, release, print, and **scan the QR** of a form |
| Assets | Inventory of **consumable** and **non-consumable** items: add, edit, delete, photo, search, QR code and QR labels, and **Import from Excel** |
| Annual Inventory | **Sections / Units**, and the yearly Annual Inventory Report of each one: create, count, verify, print, certify |
| Issuance | Acknowledgment Receipts: choose the Requester account, choose the items from the inventory, view, print |
| Reports | Request, Requisition Cost, Issuance, Audit Trail, Inventory and User reports |
| Users | Create and manage the accounts that can log in |
| Audit Trail | Read-only list of logins, submitted forms and status changes |

---

## Folder structure

```
Custodian-Management-System/
├── Admin/
│   ├── Login/               Admin login
│   ├── Dashboard/
│   ├── RequestManagement/
│   ├── Assets/
│   ├── AnnualInventory/
│   ├── Issuance/
│   ├── Reports/
│   ├── Users/
│   └── AuditTrail/
├── Requester/
│   ├── RequesterLogin/
│   ├── RequesterDashboard/
│   ├── Request/             Requisition and Pull-Out forms
│   ├── RequesterMyRequests/
│   └── RequesterHistory/
├── Shared/                  Used by both sides (must stay in the project root)
│   ├── print.js             Print layouts of the paper forms
│   ├── print.css
│   ├── audit.js             Writes the Audit Trail
│   ├── qr.js                Makes QR codes (works offline)
│   ├── scanner.js           QR scanner window (camera, or typed code)
│   ├── realtime.js          Live updates and notifications (bell)
│   ├── stock.js             Consumable / non-consumable stock rules
│   ├── inventory.js         Sections / Units, IIN numbers, Annual Inventory
│   ├── permissions.js       What Administrator and Staff can do
│   ├── chatbot.js           The chat assistant (simple, no AI)
│   ├── responsive.css       Layout for phones and tablets
│   ├── responsive.js        Menu button and table labels for small screens
│   └── users.js             Accounts used by both logins
├── docs/
│   └── DATABASE_DESIGN.md   Tables and plan for the Laravel version
└── README.md
```

Every page has its own `.html`, `.css` and `.js` file.

> The `Shared` folder must be in the project root, next to `Admin` and `Requester`. If it is missing, printing and some pages will show a red message telling you what is wrong.

---

## How to run

No installation is needed.

1. Download or clone the project.
2. Open `Requester/RequesterLogin/login.html` or `Admin/Login/login.html` in a browser (double-click the file, or use *Live Server* in VS Code).
3. Log in with one of the test accounts below.

Use **one browser on one computer** to try both roles, because the data is saved in that browser.

An internet connection is needed for the Google Fonts (Poppins) and for the chart in the Admin Dashboard (Chart.js). Everything else works offline.

### Test accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@neu.edu.ph` | `admin123` |
| Staff | `staff@neu.edu.ph` | `staff123` |
| Requester | `requester@neu.edu.ph` | `requester123` |

More accounts can be created in **Admin > Users**. An *Inactive* account cannot log in, and the system always keeps at least one active Administrator.

---

## A quick demo

1. Log in as **Requester**, open **Request**, fill in a Requisition and click **Save & Print**.
2. Log out, log in as **Administrator**, open **Request Management**, click **Review**, check the **Stock check** and click **Approve**.
3. In the same window, tick the signatures of the **Department Dean**, the **Auditing Office** and the **Property Custodian** (a Staff account can do this too). The **Release** button works only after the third one.
4. Click **Release**. The stock goes down.
5. Log in as the Requester again. In **My Requests** the form shows each signature and the status **Released**, and it appears in **History**.
6. As Administrator, open **Issuance** to prepare an Acknowledgment Receipt, **Reports** to print a report, and **Audit Trail** to see everything that happened.

---

## Printing and PDF

Forms and reports use the print window of the browser. To keep a PDF, choose **Save as PDF** as the printer.

- Requisition Form and Acknowledgment Receipt print in landscape.
- Pull-Out Request prints in portrait, with the three copies on one page (Property's, Building Administrator's and Requesting Party's).
- Reports print in portrait with the *Prepared by* and *Noted by* signature lines.

---

## Phones and tablets

The system works on a desktop, a tablet and a phone. The desktop look is **exactly the same** as before: the changes only apply to small screens.

| Screen | What changes |
|---|---|
| **900 px wide or less** (tablets, phones) | The side menu becomes a drawer: tap the menu button (top left) to open it, tap outside, press Esc, or choose a page to close it. The content uses the whole width. The search box and buttons of a list go under its title. |
| **700 px wide or less** (phones) | The tables become **cards**: each row is a card and each cell shows its label. Summary numbers are two by two. Forms use one column. Windows (add, review, QR...) use the whole width. The chat and the notification list fit the screen. The chat button hides while a window is open, so it never covers a button. |
| **Wider than 900 px but not very wide** (laptops, a tablet on its side) | A wide list scrolls inside its own box instead of making the page wider. |

Tested at these sizes: 360x640, 390x844, 430x932, 844x390 (phone on its side), 820x1180, 1180x820 (tablet on its side), 1366x768 and 1920x1080. On every size no page was wider than the screen, and the main steps were done by tapping on a phone-sized screen (menu, requisition, windows, chat, notifications).

**To try it on a real phone**
- A phone cannot open the files by double-click. Put the project on a web host. The easiest is **GitHub Pages** (free, and it uses `https`, which the camera needs). Open the address on the phone.
- Data is saved in the browser of each device, so a phone does not see the data of the computer (see *Known limitations*).
- The QR scanner uses the camera of the phone. Browsers only allow the camera on `https` (or `localhost`), not on a plain `http://192.168...` address.
- Use an up-to-date browser. The card layout of the tables needs Chrome 105, Safari 15.4, Firefox 121 or newer.

---

## Chat assistant

Every page has a chat button at the bottom right. It is a simple helper: it looks for key words, so it **does not use AI** and works offline. It understands questions in **English and in Filipino** (for example "Paano mag-request?" or "Ilan ang pending ko?"). The answers are written in English.

| Ask about | Examples |
|---|---|
| How to do something | "How do I request?", "How do I make a pull-out request?", "What do the statuses mean?", "How do I delete a request?" |
| The status of a form | "Status of 26-001" |
| The stock of an item | "Stock of bond paper", "Meron bang laptop?" |
| Lists | "My pending forms", "Show my receipts", "How many pending do I have?" |
| Opening a page | "Open history", "Open reports" |
| **Admin only** | "Pending requests", "Low stock", "How do I release a form?", "How do I issue a receipt?", "How many users?" |

- A **Requester only gets answers about his or her own forms.** If a form number is not his or hers, the assistant answers that it cannot find it, exactly as if it did not exist.
- Answers can include buttons that open the right page, or the form itself.
- The conversation stays while you go from page to page, and it starts again for the next person who logs in.
- When it does not understand, it shows the topics it can help with.

---

## Annual Inventory

The yearly **Annual Inventory Report** of the Property Department: the list of the items that are under the custody of a person in a room or section, certified and signed each year.

**1. Set up (once)**
- In *Annual Inventory > Sections / Units* add each Section / Unit with its **code** (for example `MRm102`), department, name, the **custodian** (a Requester account) and the custodian's job title.
- In *Assets*, a **non-consumable** item can be given a **Section / Unit**, plus Make, Color, Size, Date and Remarks.

**2. The IIN (Item Inventory Number)**
Every non-consumable item of a unit gets numbers that **continue in that unit**: 2 air-conditioners get `MRm102-001-002`, the next item (1 projector) gets `MRm102-003`, and a monitor with 41 units gets `MRm102-006-046`. The numbers are automatic. When the quantity goes up, new numbers are added; when it goes down, the last numbers are dropped; a number is **never used again**.

**3. Many items at once: Import**
In *Assets > Import*, copy the table from Excel (with its first row of titles) and paste it, or choose a .csv file. The titles understood are *Unit Code, Item, Qty, Brand, Model, Make, Color, Size, Serial, Unit Price, Date, Condition, Remarks, Category*. The Qty can be written like "41 units". The table is checked first; if any row has a problem, **nothing is imported**.

**4. Each year**

```
Draft  ->  Verified (counted)  ->  Certified (signed, locked)
```

| Step | Who | What happens |
|---|---|---|
| **New Annual Inventory** | Staff or Administrator | Choose the year and the Section / Unit. The list is **copied** from the items of the unit. The copy does not change later, so it keeps what was counted that year. |
| **Count** | Staff or Administrator | Write the **Counted** quantity (it is the quantity that is printed) and the **Remarks**. A line found during the count that is not in Assets can be added. |
| **Verify** | Staff or Administrator | The count is done. The custodian is notified. |
| **Print** | anyone with access | The paper form, like the sample: header with Name, Job Title, Department, Section / Unit and Year; IIN, Date, Qty, Item, Description (Brand, Model, Make, Color, Size, Serial #), Unit Price, Amount, Remarks; the certification text; and the boxes for the signature of the custodian, the Section Chief and the Department Head. A Draft prints with a red "not valid" warning. |
| **Certify (custodian)** | the Requester, in *My Inventory* | Online certification. Optional: the paper still needs the signatures. |
| **Certify (lock)** | **Administrator only** | Done when the paper is signed. A certified report cannot be changed. |
| **Reopen** | **Administrator only** | Back to Draft, if there is a mistake. The certifications are removed. |

A Requester sees only his or her own Annual Inventory, and only after it was counted. *My Inventory* also shows the items that are in the records of his or her Section / Unit today.

---

## Consumable and non-consumable items

The inventory has two kinds of items. The kind is a property of the **item** (set in *Assets*), not of the form: a Requisition can ask for bond paper or for a laptop.

| | Consumable | Non-consumable |
|---|---|---|
| Examples | Bond paper, ink, markers | Laptop, projector, printer, chair |
| Tracked by | **Stock** on hand (`12 ream`) | **Units**: available, issued, under maintenance (`3 of 5 available`) |
| Special fields | Unit, unit price, **reorder level** | Brand, model, serial number, condition |
| Status (worked out by the system) | In Stock, **Low Stock**, Out of Stock | Available, Issued, Maintenance |

**Choosing items in the forms.** In the *Particulars* box of a Requisition, the *Item* box of a Pull-Out Request and the *Item* box of an Acknowledgment Receipt, the items of the inventory appear as suggestions with their stock. When one is chosen, the unit and the price are filled in. A free text still works for things that are not in the inventory (they do not change any stock). A Pull-Out Request only suggests non-consumable items.

**When the stock changes**

| Event | Consumable | Non-consumable |
|---|---|---|
| Requisition **released** | stock goes down | units become *issued* |
| Acknowledgment Receipt made directly | stock goes down | units become *issued* |
| Acknowledgment Receipt for a **released requisition** | no change (it was already updated at the release) | no change |
| Pull-Out Request **released** | not allowed | units leave their assignment and go *under maintenance* |

- The Admin sees a **Stock check** in the form (need 5, available 12). If the stock is not enough, **the form cannot be released** until stock is added in Assets or the form is rejected. A Requester only gets a warning when submitting.
- A receipt can be linked to a released requisition by typing its number. **Load items** copies the lines of the requisition into the receipt.
- To correct the number of issued units, edit *Issued* in Assets (stock adjustment). When a **repair** is done, lower *Under Maintenance*. To **restock** supplies, raise the *Stock on Hand*.
- Every change of stock is written in the Audit Trail.
- The Admin Dashboard has a **Low Stock** card, and the Inventory Report lists the supplies to restock.

---

## QR codes

**Assets.** Every asset has a QR code that holds its Asset ID (for example `AST001`).
- In *Assets*, click **QR** on a row to see the code with the details of the asset, and to print its label.
- Click **Print QR Labels** to print the labels of all assets (3 per row), to stick on the equipment.
- Click **Scan QR** and scan a label (or type the code) to open that asset.

**Forms.** Every printed form (Requisition, Pull-Out Request, Acknowledgment Receipt) has a QR code with its type and Control No.
- In *Request Management*, click **Scan QR**, scan the QR of the paper form, and the form opens ready to approve or release.
- You can also type only the Control No. (for example `26-001`). If the same number exists in more than one form type, the list is filtered so you can choose.

**How scanning works**
- With the **camera**: click *Start Camera* in the scanner window. The browser's QR reader is used when it has one. Otherwise the reader is downloaded from the internet. If neither is possible, the window tells you.
- With a **USB barcode/QR scanner**: it types the code like a keyboard, so just click the box in the scanner window and scan.
- By **typing** the code.
- The camera needs the permission of the browser. Opening the files directly works in Chrome. For other browsers and for phones, open the system with `localhost` or `https`.
- A phone's normal camera app will only show the text inside the QR (for example `NEU-CMS|ASSET|AST001`). To open the page directly from a phone, the QR would have to hold a web address, which is possible once the system is hosted (see the database design document).

---

## Realtime and notifications

Pages update by themselves when something changes in another open window, without pressing refresh.

- **Notifications (the bell in the top bar).**
  - The **Admin** is notified when a Requester submits or deletes a form.
  - The **Requester** is notified when the Admin approves, releases or rejects his or her form.
  - A small message appears at the bottom right, the bell shows the number of unread notifications, and clicking a notification opens the form. *Mark all as read* clears the number.
- **Live pages.** These update on their own: Request (saved list), My Requests, History and Dashboard of the Requester; Request Management, Dashboard (numbers, chart and latest requests), Audit Trail, Assets, Issuance, Users and Reports of the Admin.

**Important:** this works between windows of the **same browser** (for example the Admin in one window and the Requester in another). It does not reach another computer, because the data is only inside the browser. In the Laravel version this is replaced by broadcasting (see `docs/DATABASE_DESIGN.md`), and the same screens will then update across computers.

---

## Where the data is saved

Everything is saved in the browser (`localStorage` and `sessionStorage`).

| Key | Content |
|---|---|
| `forms` | All forms (Requisition, Pull-Out, Acknowledgment Receipt) with their items and status |
| `formCounters` | Last control number used for each form type and year |
| `users` | Accounts (name, email, role, status, password) |
| `assets` | Inventory |
| `auditLog` | Audit Trail entries |
| `reportHistory` | List of generated reports |
| `notifications` | Notifications of the bell (who they are for, message, who already read them) |
| `units` | Sections / Units (code, department, name, custodian, next IIN number) |
| `annualInventories` | The Annual Inventory reports (a copy of the lines, the count, the status and its history) |
| `userEmail`, `userRole` (session) | The user who is logged in |

To start again from zero, clear the site data of the browser.

---

## Known limitations

This is a prototype, and these points are expected until the Laravel version:

- **Data stays in one browser.** The Admin only sees the Requesters' forms if both use the same browser on the same computer. For the same reason, **realtime works between windows of the same browser only**.
- **Passwords are stored as plain text** in the browser. Do not use real passwords.
- **Pages are not protected.** Anyone who knows the address of an Admin page can open it. Real login protection comes with Laravel.
- **QR codes show text, not a web address.** Only the scanner inside the system opens the asset or form. A phone camera app just shows the text.
- **The phone layout was tested on a simulated phone screen, not on real phones.** Safari and Firefox on phones were not tested.
- **Camera reading was not tested with a real camera.** The scanner window and the QR codes were tested (the codes were decoded back correctly), but reading from a live camera depends on the browser. Typing the code or using a USB scanner always works.
- **The Annual Inventory is copied from Assets once.** If an asset changes later, the report does not change (that is on purpose). Create the report again, or ask an Administrator to reopen it, only if the count must change.
- **Many items need a real database.** The browser keeps about 5 MB. That is enough for some thousands of lines, but a whole campus should be in the Laravel database.
- **The signatures are tracked, not collected online.** The Dean, the Auditing Office and the Property Custodian still sign on paper. The Property Office ticks them in the system. A requisition that was approved before this rule needs its three ticks before it can be released.
- **Items are tracked by count, not one by one.** A non-consumable asset such as "Laptop x 5" is one record with how many are available, issued or under maintenance. The system does not know which laptop is with whom.

---

## Next steps

Planned for the Laravel version (the database design and the plan are in [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)):

- Database tables for users, assets, forms, form items and audit logs.
- Real authentication with hashed passwords, protection of the Admin pages, and the rules of Administrator, Staff and Requester checked on the server.
- Data shared between users on different computers.
- Realtime between computers with Laravel broadcasting (Reverb and Echo), using the same notifications.
- QR codes that hold a web address (a signed link), so a phone camera opens the asset or form directly.
- A history of who held each item over the years (custody), and applying the result of the yearly count to Assets.
- Tracking non-consumable items one by one (a property number for each unit and who holds it), and a history of stock movements.
- Optional: a place for the Admin to attach a scan of the signed paper form.
- An AI chatbot that understands free questions. It needs the server (the key of the AI service must never be in the browser), and it must only be given the data the logged-in user is allowed to see.

---

## Built with

HTML, CSS and plain JavaScript. Chart.js for the Admin Dashboard chart. Google Fonts (Poppins).


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
