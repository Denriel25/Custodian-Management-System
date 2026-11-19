// ADMIN - SYSTEM SETTINGS (frontend simulation; Admin only)
// Data and rules: Shared/settings.js. Settings never contain or change records.

const SS_PAGES = {
    "Dashboard": "../Dashboard/dashboard.html", "Request Management": "../RequestManagement/requestmanagement.html", "Inventory Management": "../InventoryManagement/inventorymanagement.html",
    "Assets": "../Assets/assets.html", "Annual Inventory": "../AnnualInventory/annualinventory.html", "Issuance": "../Issuance/issuance.html", "Pull-Out Management": "../PullOut/pullout.html",
    "Reports": "../Reports/reports.html", "Users": "../Users/users.html", "Audit Trail": "../AuditTrail/audittrail.html"
};

let ssTab = "general";
let ssLogo = null;            // logo chosen on this screen but not saved yet (null = no change, "" = use the default logo)

const SS_TAG_SIM = '<span class="wf-tag sim">Simulated</span>';
const SS_TAG_FUTURE = '<span class="wf-tag future">Future backend</span>';

function ssEsc(t) { return wfEsc(t); }

function ssField(label, id, value, opts) {
    opts = opts || {};
    return '<div class="wf-field"><label for="' + id + '">' + label + '</label>' +
        (opts.textarea ? '<textarea class="wf-text" id="' + id + '" maxlength="' + (opts.max || 400) + '">' + ssEsc(value) + "</textarea>"
                       : '<input class="wf-input" id="' + id + '" value="' + ssEsc(value) + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : "") + (opts.type ? ' type="' + opts.type + '"' : "") + ">") +
        '<div class="wf-err" id="err_' + id + '"></div>' + (opts.hint ? '<div class="wf-hint">' + opts.hint + "</div>" : "") + "</div>";
}

function ssSelect(label, id, options, value, hint) {
    return '<div class="wf-field"><label for="' + id + '">' + label + '</label><select class="wf-select" id="' + id + '">' +
        options.map(function (o) { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + ssEsc(v) + '"' + (String(v) === String(value) ? " selected" : "") + ">" + ssEsc(t) + "</option>"; }).join("") +
        '</select><div class="wf-err" id="err_' + id + '"></div>' + (hint ? '<div class="wf-hint">' + hint + "</div>" : "") + "</div>";
}

function ssSwitch(id, label, on, note) {
    return '<label class="wf-switch"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + label + (note ? "<small>" + note + "</small>" : "") + "</span></label>";
}

function ssShowErrors(errors) {
    document.querySelectorAll(".wf-err").forEach(function (e) { e.textContent = ""; });
    Object.keys(errors || {}).forEach(function (k) { const e = document.getElementById("err_" + k); if (e) e.textContent = errors[k]; });
    const first = Object.keys(errors || {})[0];
    if (first && document.getElementById(first)) document.getElementById(first).focus();
}

function ssButtons(section) {
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="wf-btn gold" id="saveBtn">Save ' + section + ' settings</button>' +
        '<button type="button" class="wf-btn" id="defaultsBtn">Restore default ' + section + ' settings</button></div>' +
        '<p class="wf-note" style="margin-top:8px">Restoring defaults changes settings only. No record is changed or deleted.</p>';
}

function ssSave(section, collect) {
    const res = settingsSave(section, collect());
    ssShowErrors(res.errors);
    if (!res.ok) { wfToast(res.message, true); return; }
    wfToast(res.changed && res.changed.length ? "Settings saved." : "Nothing was changed.");
    ssRender();
}

function ssDefaults(section) {
    if (!confirm("Restore the default " + section + " settings? Only settings change. No record is changed.")) return;
    const r = settingsResetSection(section);
    if (!r.ok) { wfToast(r.message, true); return; }
    if (section === "general") ssLogo = null;
    wfToast("Default " + section + " settings restored.");
    ssRender();
}

// ========================================
// GENERAL
// ========================================
function ssGeneral() {

    const g = settingsGet("general");
    const logo = ssLogo !== null ? ssLogo : g.logo;

    return "<h2>General Settings " + SS_TAG_SIM + "</h2>" +
        '<div class="wf-grid3"><div>' +
        ssField("System name", "systemName", g.systemName, { max: 60, hint: "Shown in the sidebar of every page." }) +
        ssField("Institution name", "institution", g.institution, { max: 80, hint: "Printed on forms and reports." }) +
        ssField("Office / department name", "office", g.office, { max: 60, hint: "Printed under the institution name." }) +
        "</div><div>" +
        ssField("Contact email", "contactEmail", g.contactEmail, { max: 100, hint: "Optional." }) +
        ssField("Contact phone", "contactPhone", g.contactPhone, { max: 25, hint: "Optional." }) +
        ssField("Address", "contactAddress", g.contactAddress, { max: 150, hint: "Optional." }) +
        "</div></div>" +
        ssField("System description", "description", g.description, { textarea: true, max: 300, hint: "Up to 300 characters. The chat assistant uses it when someone asks about the system." }) +
        '<div class="wf-field"><label>Logo ' + SS_TAG_SIM + SS_TAG_FUTURE + '</label><div class="wf-logo"><div class="box"><img id="logoPreview" alt="Logo preview" src="' + (logo ? logo : "../Login/neu-logo.png") + '"></div>' +
        '<div><input type="file" id="logoFile" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden><button type="button" class="wf-btn" id="logoChoose">Upload logo</button> ' +
        '<button type="button" class="wf-btn" id="logoRemove"' + (logo ? "" : " disabled") + '>Use the default logo</button>' +
        '<div class="wf-hint">PNG or JPG, up to 1 MB, between 32 and 2000 pixels. ' + (ssLogo !== null ? "<b>Not saved yet: click Save.</b>" : "") + '</div></div></div><div class="wf-err" id="err_logo"></div>' +
        '<div class="wf-hint">The logo is kept in this browser. A real server will store the file (future backend).</div></div>' +
        ssButtons("general");

}

function ssGeneralBind() {

    function values() {
        const v = function (id) { return document.getElementById(id).value; };
        return { systemName: v("systemName"), institution: v("institution"), office: v("office"), contactEmail: v("contactEmail"), contactPhone: v("contactPhone"), contactAddress: v("contactAddress"),
                 description: v("description"), logo: ssLogo !== null ? ssLogo : settingsGet("general.logo", "") };
    }

    document.getElementById("saveBtn").addEventListener("click", function () { ssSave("general", values); ssLogo = null; });
    document.getElementById("defaultsBtn").addEventListener("click", function () { ssDefaults("general"); });
    document.getElementById("logoChoose").addEventListener("click", function () { document.getElementById("logoFile").click(); });
    document.getElementById("logoRemove").addEventListener("click", function () { ssLogo = ""; document.getElementById("logoPreview").src = "../Login/neu-logo.png"; this.disabled = true; document.getElementById("err_logo").textContent = ""; });

    document.getElementById("logoFile").addEventListener("change", function () {

        const err = document.getElementById("err_logo");
        err.textContent = "";
        const file = this.files && this.files[0];
        this.value = "";
        if (!file) return;

        if (!/\.(png|jpe?g)$/i.test(file.name) || ["image/png", "image/jpeg"].indexOf(file.type) === -1) { err.textContent = "The logo must be a PNG or JPG image."; return; }
        if (file.size > SETTINGS_LOGO_MAX_BYTES) { err.textContent = "The logo is too big. The maximum is 1 MB."; return; }
        if (file.size === 0) { err.textContent = "The file is empty."; return; }

        const reader = new FileReader();
        reader.onerror = function () { err.textContent = "The file could not be read."; };
        reader.onload = function () {
            const url = String(reader.result);
            const img = new Image();
            img.onerror = function () { err.textContent = "This file is not a valid image."; };
            img.onload = function () {
                if (img.width < 32 || img.height < 32) { err.textContent = "The image is too small (at least 32 x 32 pixels)."; return; }
                if (img.width > 2000 || img.height > 2000) { err.textContent = "The image is too big (at most 2000 x 2000 pixels)."; return; }
                ssLogo = url;
                document.getElementById("logoPreview").src = url;
                document.getElementById("logoRemove").disabled = false;
                wfToast("Logo ready. Click Save to keep it.");
            };
            img.src = url;
        };
        reader.readAsDataURL(file);

    });

}

// ========================================
// INVENTORY
// ========================================
function ssInventory() {

    const i = settingsGet("inventory");

    return "<h2>Inventory Settings " + SS_TAG_SIM + "</h2>" +
        '<p class="wf-note">These settings do not change how consumables (counted by quantity) and equipment (one record per physical unit) are stored.</p>' +
        '<div class="wf-grid3"><div>' +
        "<h4 style=\"color:#edae0f;margin-bottom:8px\">Consumables</h4>" +
        ssField("Fallback low-stock level", "lowStockFallback", i.lowStockFallback, { hint: "Used for a consumable whose own reorder level is 0. Use 0 to switch it off. Items with their own level keep it." }) +
        ssField("Reorder level suggested for a new consumable", "defaultReorderLevel", i.defaultReorderLevel, { hint: "Whole number from 0 to 9999." }) +
        ssField("Unit suggested for a new consumable", "defaultConsumableUnit", i.defaultConsumableUnit, { max: 20, hint: "For example pc, box, ream." }) +
        "</div><div>" +
        "<h4 style=\"color:#edae0f;margin-bottom:8px\">Equipment (non-consumable)</h4>" +
        ssSelect("Condition of newly added units", "defaultUnitCondition", [["same", "Same as the equipment record"], "New", "Good", "Fair"], i.defaultUnitCondition, "Each unit keeps its own condition afterwards.") +
        "<h4 style=\"color:#edae0f;margin:14px 0 8px\">Display</h4>" +
        ssSelect("Inventory Management: first filter", "defaultStatusFilter", SETTINGS_FILTERS.map(function (f) { return [f, f === "all" ? "All items" : f]; }), i.defaultStatusFilter) +
        ssSelect("Table rows per page", "rowsPerPage", SETTINGS_ROWS.map(function (r) { return [r, r === "auto" ? "Automatic (each page decides)" : r + " rows"]; }), i.rowsPerPage, "Applies to the tables that have pages.") +
        "</div></div>" + ssButtons("inventory");

}

function ssInventoryBind() {
    const v = function (id) { return document.getElementById(id).value; };
    document.getElementById("saveBtn").addEventListener("click", function () {
        ssSave("inventory", function () { return { lowStockFallback: v("lowStockFallback"), defaultReorderLevel: v("defaultReorderLevel"), defaultConsumableUnit: v("defaultConsumableUnit"), defaultStatusFilter: v("defaultStatusFilter"), rowsPerPage: v("rowsPerPage"), defaultUnitCondition: v("defaultUnitCondition") }; });
    });
    document.getElementById("defaultsBtn").addEventListener("click", function () { ssDefaults("inventory"); });
}

// ========================================
// NOTIFICATIONS
// ========================================
function ssNotifications() {

    const n = settingsGet("notifications");
    const w = n.workflow;

    return "<h2>Notification Settings " + SS_TAG_SIM + SS_TAG_FUTURE + "</h2>" +
        '<p class="wf-note">Notifications and emails are <b>simulated</b>. Nothing is sent outside this browser. Real email sending needs the future Laravel mail service.</p>' +
        ssSwitch("nEnabled", "<b>Simulated notifications</b> (the bell on every page)", n.enabled, "When this is off, no new notification and no new simulated email is made. Old ones stay.") +
        ssSwitch("nEmail", "Simulated email copies", n.emailCopies, "A simulated email is saved for each notification (see \"Simulated emails\").") +
        '<h4 style="color:#edae0f;margin:14px 0 4px">Requisition workflow</h4>' +
        ssSwitch("wSubmitted", "New requisition submitted", w.submitted) +
        ssSwitch("wSignatures", "Signature steps (Department Head, Auditor review and signature)", w.signatures) +
        ssSwitch("wDecisions", "Director approval or rejection", w.decisions) +
        ssSwitch("wReady", "Ready for release", w.ready) +
        ssSwitch("wRelease", "Items released", w.release) +
        ssSwitch("wAck", "Receipt confirmed by the Requester", w.acknowledged) +
        '<h4 style="color:#edae0f;margin:14px 0 4px">Stock</h4>' +
        ssSwitch("nLow", "Low-stock notifications", n.lowStock) +
        ssSwitch("nOut", "Out-of-stock notifications", n.outOfStock) +
        '<div class="wf-err" id="err__"></div>' + ssButtons("notifications") +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="wf-btn" id="testNote">Send a test notification</button><button type="button" class="wf-btn" id="showMail">Simulated emails</button></div>';

}

function ssNotificationsBind() {
    const c = function (id) { return document.getElementById(id).checked; };
    document.getElementById("saveBtn").addEventListener("click", function () {
        ssSave("notifications", function () { return { enabled: c("nEnabled"), emailCopies: c("nEmail"), lowStock: c("nLow"), outOfStock: c("nOut"),
            workflow: { submitted: c("wSubmitted"), signatures: c("wSignatures"), decisions: c("wDecisions"), ready: c("wReady"), release: c("wRelease"), acknowledged: c("wAck") } }; });
    });
    document.getElementById("defaultsBtn").addEventListener("click", function () { ssDefaults("notifications"); });
    document.getElementById("showMail").addEventListener("click", wfOpenEmailOutbox);
    document.getElementById("testNote").addEventListener("click", function () {
        if (!notifyAllowed("enabled")) { wfToast("Simulated notifications are switched off. Save the setting first.", true); return; }
        addNotification("admin", "Test notification from System Settings (simulated)", null);
        wfToast("A test notification was added. Look at the bell.");
    });
    const master = document.getElementById("nEnabled");
    function sync() { document.querySelectorAll("#panel input[type=checkbox]").forEach(function (b) { if (b !== master) b.disabled = !master.checked; }); }
    master.addEventListener("change", sync);
    sync();
}

// ========================================
// ACCOUNT AND ACCESS
// ========================================
function ssAccount() {

    const me = userByEmail(sessionStorage.getItem("userEmail"));
    const roles = typeof ROLES !== "undefined" ? ROLES : ["Administrator", "Staff", "Auditor", "Requester"];
    const Y = '<span class="wf-yes">Yes</span>', N = '<span class="wf-no">-</span>';
    const matrix = [
        ["Open System Settings", 1, 0, 0, 0], ["Manage users", 1, 0, 0, 0], ["Approve or reject a requisition, sign as Director", 1, 0, 0, 0],
        ["Review and sign as School Auditor", 0, 0, 1, 0], ["Create a requisition, record the Department Head signature, confirm receipt", 0, 0, 0, 1],
        ["Release items, issue receipts", 1, 1, 0, 0], ["Manage inventory, assets and units", 1, 1, 0, 0], ["Create and process pull-out records", 1, 1, 0, 0], ["View the Audit Trail and reports", 1, 1, 0, 0]
    ];

    return "<h2>Account and Access " + SS_TAG_SIM + "</h2>" +
        '<h4 style="color:#edae0f;margin-bottom:6px">My account</h4>' +
        '<div class="wf-row"><strong>Name</strong><span>' + ssEsc(me ? me.name : "-") + "</span></div>" +
        '<div class="wf-row"><strong>Email</strong><span>' + ssEsc(me ? me.email : "-") + "</span></div>" +
        '<div class="wf-row"><strong>Role</strong><span>' + ssEsc(me ? me.role : "-") + "</span></div>" +
        '<div class="wf-row"><strong>Department</strong><span>' + ssEsc(me ? (me.department || "-") : "-") + "</span></div>" +
        '<div class="wf-row"><strong>Status</strong><span>' + ssEsc(me ? me.status : "-") + "</span></div>" +
        '<h4 style="color:#edae0f;margin:16px 0 6px">The four roles</h4>' +
        '<p class="wf-note">The system has exactly ' + roles.length + ' roles: ' + ssEsc(roles.join(", ")) + ". Roles cannot be added, renamed or removed here. Accounts are managed in Users.</p>" +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Can do</th><th>Administrator</th><th>Staff</th><th>Auditor</th><th>Requester</th></tr></thead><tbody>' +
        matrix.map(function (m) { return "<tr><td>" + ssEsc(m[0]) + "</td>" + m.slice(1).map(function (x) { return "<td>" + (x ? Y : N) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
        '<div class="wf-lock">System Settings can be opened and changed by the Administrator only. Staff, Auditor and Requester are sent away from this page and their menu does not show it.</div>' +
        '<p class="wf-note" style="margin-top:10px">Account security: passwords are hashed and logins use Laravel sessions (login attempts are rate limited). The permissions above are enforced by Laravel on every save, not only hidden in the browser. Lock-out after repeated failures and two-step login ' + SS_TAG_FUTURE + " are not included yet.</p>";

}

// ========================================
// APPEARANCE
// ========================================
function ssAppearance() {

    const a = settingsGet("appearance");

    return "<h2>Appearance Settings " + SS_TAG_SIM + "</h2>" +
        '<h4 style="color:#edae0f;margin-bottom:6px">Theme (fixed)</h4>' +
        '<p class="wf-note">The dark theme, the Poppins font and the gold accent are the identity of the system and cannot be changed here.</p>' +
        '<div style="margin-bottom:14px;font-family:Poppins,sans-serif"><span class="wf-swatch" style="background:#edae0f"></span>#edae0f gold accent &nbsp; <span class="wf-swatch" style="background:#1a1a1a"></span>dark surface &nbsp; <b>Poppins</b> font sample: Custodian Management System</div>' +
        '<h4 style="color:#edae0f;margin-bottom:6px">Preferences</h4><div class="wf-grid3"><div>' +
        ssSelect("Table density", "density", [["comfortable", "Comfortable (default)"], ["compact", "Compact (more rows on the screen)"]], a.density) +
        "</div><div>" +
        ssSelect("How long the small messages stay", "toastSeconds", SETTINGS_TOASTS.map(function (s) { return [s, s + " seconds"]; }), a.toastSeconds) +
        "</div></div>" + ssButtons("appearance");

}

function ssAppearanceBind() {
    const v = function (id) { return document.getElementById(id).value; };
    document.getElementById("saveBtn").addEventListener("click", function () { ssSave("appearance", function () { return { density: v("density"), toastSeconds: v("toastSeconds") }; }); });
    document.getElementById("defaultsBtn").addEventListener("click", function () { ssDefaults("appearance"); });
}

// ========================================
// DATA MANAGEMENT (demo data only)
// ========================================
const SS_STORES = [["forms", "Requisitions, pull-out requests, receipts"], ["assets", "Equipment and consumable records"], ["assetUnits", "Physical units of equipment"], ["pulloutRecords", "Pull-out records"],
                   ["stockMovements", "Stock movement history"], ["notifications", "Notifications"], ["simEmails", "Simulated emails"]];

function ssCounts() {
    return SS_STORES.map(function (s) {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(s[0])) || []; } catch (e) { list = []; }
        const demo = list.filter(function (x) { return x && (x.demo === true || (s[0] === "assetUnits" && String(x.assetId || "").indexOf("DEMO-") === 0) || (s[0] === "stockMovements" && String(x.assetId || "").indexOf("DEMO-") === 0)); }).length;
        return { key: s[0], label: s[1], total: list.length, demo: demo, real: list.length - demo };
    });
}

function ssData() {

    const rows = ssCounts();
    const refs = demoReferenceReport();
    const hasDemo = rows.some(function (r) { return r.demo > 0; });

    return "<h2>Data Management " + SS_TAG_SIM + "</h2>" +
        '<p class="wf-note"><b>Real records and demo records are kept apart.</b> Every demo record is marked <code>demo: true</code> and has a DEMO- ID. The operations below touch demo records only. There is no option here to delete real records or to clear the browser storage.</p>' +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Records</th><th>Real (never touched)</th><th>Demo</th><th>Total</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr><td>" + ssEsc(r.label) + "</td><td><b>" + r.real + "</b></td><td>" + r.demo + "</td><td>" + r.total + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (refs.length ? '<div class="wf-lock">' + refs.length + " real record(s) refer to demo equipment. They are kept in every operation. " + ssEsc(refs.slice(0, 4).map(function (r) { return r.no; }).join(", ")) + (refs.length > 4 ? ", ..." : "") + "</div>" : "") +
        '<h4 style="color:#edae0f;margin:16px 0 6px">Safe operations</h4><div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="wf-btn" id="dCheck">Check data integrity</button>' +
        '<button type="button" class="wf-btn" id="dBackup">Download a backup of the REAL records (JSON)</button></div>' +
        '<h4 style="color:#edae0f;margin:16px 0 6px">Demo data only ' + "</h4>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="wf-btn" id="dCreate"' + (hasDemo ? " disabled" : "") + ">Create demo data</button>" +
        '<button type="button" class="wf-btn red" id="dReset"' + (hasDemo ? "" : " disabled") + ">Reset demo data</button>" +
        '<button type="button" class="wf-btn red" id="dRemove"' + (hasDemo ? "" : " disabled") + ">Remove demo data only</button></div>" +
        '<p class="wf-note" style="margin-top:8px">Reset = remove the demo records and make them again. Remove = remove the demo records only. Both ask you to type a confirmation word. The backup file holds real records only (and the settings).</p>';

}

function ssDemoModal(kind) {

    const refs = demoReferenceReport();
    const word = kind === "reset" ? "RESET DEMO" : "REMOVE DEMO";
    const counts = ssCounts().filter(function (r) { return r.demo > 0; });

    wfModal(kind === "reset" ? "Reset demo data" : "Remove demo data only",
        '<p>This ' + (kind === "reset" ? "removes the demo records and makes them again as new" : "removes the demo records") + ". <b>Real records are never touched.</b></p>" +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Demo records that will be removed</th><th>Count</th></tr></thead><tbody>' +
        counts.map(function (r) { return "<tr><td>" + ssEsc(r.label) + "</td><td>" + r.demo + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (refs.length ? '<div class="wf-lock"><b>' + refs.length + " real record(s) refer to demo equipment:</b> " + ssEsc(refs.slice(0, 6).map(function (r) { return r.kind + " " + r.no; }).join(", ")) + ". They are kept." +
            (kind === "remove" ? " After the removal their demo units no longer exist, and the integrity check will list them." : " Their demo units and demo stock are made again and set to match what those records say.") + "</div>" : "") +
        '<label class="wf-note" style="display:block;margin-top:10px">Type <b>' + word + "</b> to confirm</label>" + '<input class="wf-input" id="confirmWord" autocomplete="off">',
        [{ text: "Cancel", onClick: wfCloseModal },
         { text: kind === "reset" ? "Reset demo data" : "Remove demo data", cls: "red", onClick: function () {
            if (document.getElementById("confirmWord").value.trim() !== word) { wfToast("Type " + word + " exactly to confirm.", true); return; }
            settingsAudit((kind === "reset" ? "Reset" : "Removed") + " demo data from System Settings");
            wfCloseModal();
            if (kind === "reset") { resetDemoData(); }          // reloads the page
            else { clearDemoData(); wfToast("Demo data removed. Real records were not touched."); ssRender(); }
         } }], true);

}

function ssDataBind() {

    document.getElementById("dCheck").addEventListener("click", function () {
        const issues = pulloutIntegrityCheck().map(function (i) { return { level: i.level, text: "Pull-out record " + i.no + ": " + i.text }; })
            .concat(typeof releaseIntegrityCheck === "function" ? releaseIntegrityCheck().map(function (i) { return { level: i.level, text: "Requisition " + i.no + ": " + i.text }; }) : [])
            .concat(demoReferenceReport().map(function (r) { return { level: "note", text: "Real " + r.kind + " " + r.no + " refers to demo equipment (" + r.what + ")." }; }));
        wfModal("Data integrity check",
            '<p class="wf-note">Nothing is changed by this check.</p>' +
            (issues.length ? issues.map(function (i) { return '<div class="wf-list-item"><span class="wf-badge ' + (i.level === "problem" ? "st-rejected" : "st-pending") + '">' + (i.level === "problem" ? "Problem" : "Note") + "</span> " + ssEsc(i.text) + "</div>"; }).join("")
                            : '<div class="wf-list-item"><span class="wf-badge st-released">OK</span> No problem was found. Real records do not depend on demo data.</div>'),
            [{ text: "Close", onClick: wfCloseModal }], true);
    });

    document.getElementById("dBackup").addEventListener("click", function () {
        const real = {};
        SS_STORES.forEach(function (s) {
            let list = [];
            try { list = JSON.parse(localStorage.getItem(s[0])) || []; } catch (e) { list = []; }
            real[s[0]] = list.filter(function (x) { return !(x && (x.demo === true || String(x.assetId || "").indexOf("DEMO-") === 0)); });
        });
        real.assetUnits = (real.assetUnits || []).filter(function (u) { return String(u.assetId || "").indexOf("DEMO-") !== 0; });
        real.settings = settingsAll();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: "Real records only (demo records are not included). Frontend prototype backup.", data: real }, null, 2)], { type: "application/json" }));
        a.download = "custodian-real-records-backup.json";
        a.click();
        settingsAudit("Downloaded a backup of the real records");
    });

    document.getElementById("dCreate").addEventListener("click", function () {
        if (!confirm("Create the demo records? They are added next to your real records. Real records are not touched.")) return;
        const r = createDemoData();
        wfToast(r.ok ? "Demo data created." : r.message, !r.ok);
        if (r.ok) { settingsAudit("Created demo data from System Settings"); ssRender(); }
    });

    document.getElementById("dReset").addEventListener("click", function () { ssDemoModal("reset"); });
    document.getElementById("dRemove").addEventListener("click", function () { ssDemoModal("remove"); });

}

// ========================================
// PAGE
// ========================================
function ssRender() {

    const panel = document.getElementById("panel");

    if (!settingsCanEdit()) {
        panel.innerHTML = '<h2>System Settings</h2><div class="wf-lock">Only the Admin can open and change the System Settings.</div>';
        return;
    }

    const views = { general: [ssGeneral, ssGeneralBind], inventory: [ssInventory, ssInventoryBind], notifications: [ssNotifications, ssNotificationsBind], account: [ssAccount, null], appearance: [ssAppearance, ssAppearanceBind], data: [ssData, ssDataBind] };
    panel.innerHTML = views[ssTab][0]();
    if (views[ssTab][1]) views[ssTab][1]();

    document.querySelectorAll(".wf-tabbtn").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === ssTab); });

}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(".sidebar ul li").forEach(function (li) {
        li.addEventListener("click", function () {
            const n = li.textContent.trim();
            if (SS_PAGES[n]) location.href = SS_PAGES[n];
            else if (n === "Logout" && confirm("Are you sure you want to logout?")) { if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear(); location.href = "../Login/login.html"; }
        });
    });

    document.querySelectorAll(".wf-tabbtn").forEach(function (b) {
        b.addEventListener("click", function () { ssTab = b.dataset.tab; ssLogo = ssTab === "general" ? ssLogo : null; ssRender(); });
    });

    ssRender();

});
