// ADMIN / STAFF - PULL-OUT MANAGEMENT (frontend simulation)
// Data and rules: Shared/pullout.js (records) and Shared/units.js (the physical units).

const PO_PAGES = {
    "Dashboard": "../Dashboard/dashboard.html", "Request Management": "../RequestManagement/requestmanagement.html", "Inventory Management": "../InventoryManagement/inventorymanagement.html",
    "Assets": "../Assets/assets.html", "Annual Inventory": "../AnnualInventory/annualinventory.html", "Issuance": "../Issuance/issuance.html", "Reports": "../Reports/reports.html",
    "Users": "../Users/users.html", "Audit Trail": "../AuditTrail/audittrail.html"
};

let poTable = null;

function poBadge(status) {
    const cls = status === PULLOUT_STATUS.DONE ? "st-released" : status === PULLOUT_STATUS.CANCELLED ? "st-draft" : "st-pending";
    return '<span class="wf-badge ' + cls + '">' + wfEsc(status) + "</span>";
}

function poUnitText(r) {
    return r.unitIds.length <= 2 ? r.unitIds.join(", ") : r.unitIds.slice(0, 2).join(", ") + " +" + (r.unitIds.length - 2) + " more";
}

function poRows() {

    const q = document.getElementById("pSearch").value.toLowerCase().trim();
    const st = document.getElementById("pStatus").value;
    const from = document.getElementById("pFrom").value, to = document.getElementById("pTo").value;

    return loadPulloutRecords().filter(function (r) {
        const day = String(r.date).slice(0, 10);
        if (st !== "all" && r.status !== st) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        return !q || (r.no + " " + r.unitIds.join(" ") + " " + r.reason + " " + r.reasonNote + " " + r.createdByName + " " + (r.reference || "")).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

}

function poRefresh() {

    const all = loadPulloutRecords();
    document.getElementById("cFor").textContent = all.filter(function (r) { return r.status === PULLOUT_STATUS.FOR; }).length;
    document.getElementById("cDone").textContent = all.filter(function (r) { return r.status === PULLOUT_STATUS.DONE; }).length;
    document.getElementById("cCancel").textContent = all.filter(function (r) { return r.status === PULLOUT_STATUS.CANCELLED; }).length;
    document.getElementById("cUnits").textContent = loadAssetUnits().filter(function (u) { return u.status === UNIT_STATUS.PULLED_OUT; }).length;

    if (poTable) poTable.redraw();

}

// ----- new record -----
function poNewRecord() {

    const selected = new Set();

    const body = '<label class="wf-note">1. Find and select the units (search by unit ID, equipment, serial number or location)</label>' +
        '<input class="wf-input" id="nSearch" placeholder="e.g. Laptop, AST006-U002, LNV-E14...">' +
        '<div class="wf-tablewrap" style="max-height:230px;overflow:auto"><table class="wf-table"><thead><tr><th></th><th>Unit ID</th><th>Equipment</th><th>Serial</th><th>Condition</th><th>Location</th><th>Status</th></tr></thead><tbody id="nList"></tbody></table></div>' +
        '<p class="wf-note"><b id="nCount">0</b> unit(s) selected. Units that are already Pulled Out or For Pull-Out are not listed. A record cannot mix demo units and real units; a record with demo units is a demo record and is removed by a demo reset.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><label class="wf-note">2. Reason</label><select class="wf-select" id="nReason"><option value="">Choose...</option>' +
            PULLOUT_REASONS.map(function (r) { return "<option>" + wfEsc(r) + "</option>"; }).join("") + "</select></div>" +
        '<div style="flex:1;min-width:200px"><label class="wf-note">3. Condition of the units</label><select class="wf-select" id="nCond"><option value="">Choose...</option>' +
            UNIT_CONDITIONS.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></div></div>" +
        '<input class="wf-input" id="nReasonNote" placeholder="Describe the reason (required for Other)" style="margin-top:8px">' +
        '<label class="wf-note" style="display:block;margin-top:8px">Supporting information</label><textarea class="wf-text" id="nNotes" placeholder="Findings, who inspected, what happens to the units..."></textarea>' +
        '<label class="wf-note" style="display:block;margin-top:8px">Reference (optional, e.g. a pull-out request number)</label><input class="wf-input" id="nRef">';

    wfModal("New Pull-Out Record", body, [
        { text: "Cancel", onClick: wfCloseModal },
        { text: "Create record", cls: "gold", onClick: function () {
            const v = function (id) { return document.getElementById(id).value; };
            const r = createPulloutRecord({ unitIds: Array.from(selected), reason: v("nReason"), reasonNote: v("nReasonNote"), condition: v("nCond"), notes: v("nNotes"), reference: v("nRef") });
            if (!r.ok) { wfToast(r.message, true); return; }
            wfCloseModal();
            wfToast("Record " + r.record.no + " created. " + r.record.unitIds.length + " unit(s) are now For Pull-Out." + (r.record.demo ? " It is a DEMO record (demo units)." : ""));
            poRefresh();
        } }
    ], true);

    function draw() {

        const q = document.getElementById("nSearch").value.toLowerCase().trim();
        const all = pulloutEligibleUnits().filter(function (u) {
            return !q || (u.id + " " + u.equipment + " " + u.serial + " " + u.location + " " + u.status).toLowerCase().indexOf(q) !== -1;
        });
        const shown = all.slice(0, 40);

        document.getElementById("nList").innerHTML = shown.length ? shown.map(function (u) {
            return '<tr><td><input type="checkbox" class="nBox" value="' + wfEsc(u.id) + '"' + (selected.has(u.id) ? " checked" : "") + "></td><td>" + wfEsc(u.id) + (isDemoUnit(u) ? " <small>(demo)</small>" : "") + "</td><td>" + wfEsc(u.equipment) + "</td><td>" +
                wfEsc(u.serial || "-") + "</td><td>" + wfEsc(u.condition) + "</td><td>" + wfEsc(u.location || "-") + "</td><td>" + wfEsc(u.status) + "</td></tr>";
        }).join("") + (all.length > shown.length ? '<tr><td colspan="7" class="wf-note">' + (all.length - shown.length) + " more. Type in the search box to narrow the list.</td></tr>" : "")
            : '<tr><td colspan="7" class="wf-empty">No unit found.</td></tr>';

        document.querySelectorAll(".nBox").forEach(function (b) {
            b.addEventListener("change", function () {
                if (b.checked) { if (selected.size >= 50) { b.checked = false; wfToast("At most 50 units in one record.", true); return; } selected.add(b.value); } else selected.delete(b.value);
                document.getElementById("nCount").textContent = selected.size;
            });
        });

    }

    document.getElementById("nSearch").addEventListener("input", draw);
    draw();

}

// ----- details -----
function poOpen(id) {

    const r = loadPulloutRecords().find(function (x) { return x.id === id; });
    if (!r) return;

    const units = loadAssetUnits();
    const assets = loadAssets();
    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + (v === "" || v == null ? "-" : v) + "</span></div>"; }

    let body = row("Record No.", "<b>" + wfEsc(r.no) + "</b>" + (r.demo ? " (demo)" : "")) + row("Status", poBadge(r.status)) + row("Date", wfEsc(wfFormatDate(r.date, true))) +
        row("Reason", wfEsc(r.reason + (r.reasonNote ? " - " + r.reasonNote : ""))) + row("Condition", wfEsc(r.condition)) + row("Supporting information", wfEsc(r.notes)) +
        row("Reference", wfEsc(r.reference)) + row("Created by", wfEsc(r.createdByName || r.createdBy)) +
        row("Processed", r.processedAt ? wfEsc(wfFormatDate(r.processedAt, true) + " by " + (r.processedByName || r.processedBy)) : "") +
        '<h4 style="margin:12px 0 4px;color:#edae0f">Units</h4><div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Unit ID</th><th>Equipment</th><th>Serial</th><th>Current status</th></tr></thead><tbody>' +
        r.unitIds.map(function (uid) {
            const u = units.find(function (x) { return x.id === uid; }) || {};
            const a = assets.find(function (x) { return x.id === u.assetId; }) || {};
            return "<tr><td>" + wfEsc(uid) + "</td><td>" + wfEsc(a.name || "-") + "</td><td>" + wfEsc(u.serial || "-") + "</td><td>" + wfEsc(u.status || "Not in the register (its demo data was removed)") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<h4 style="margin:12px 0 4px;color:#edae0f">Record history</h4>' +
        r.history.slice().reverse().map(function (h) { return '<div class="wf-list-item">' + wfEsc(h.type) + "<small>" + wfEsc(wfFormatDate(h.date, true)) + " - " + wfEsc(h.by) + (h.note ? " - " + wfEsc(h.note) : "") + "</small></div>"; }).join("");

    const buttons = [{ text: "Close", onClick: wfCloseModal }, { text: "Print slip", onClick: function () { poPrint(r.id); } }];

    if (r.status === PULLOUT_STATUS.FOR && pulloutCanWork()) {
        buttons.push({ text: "Cancel record", cls: "red", onClick: function () { poCancel(r.id); } });
        buttons.push({ text: "Process pull-out", cls: "gold", onClick: function () {
            if (!confirm("Process " + r.no + "? The " + r.unitIds.length + " unit(s) become Pulled Out.")) return;
            const res = processPulloutRecord(r.id);
            if (!res.ok) { wfToast(res.message, true); return; }
            wfToast(r.no + " processed. The units are Pulled Out.");
            poRefresh();
            poOpen(r.id);
        } });
    }

    wfModal("Pull-Out Record " + r.no, body, buttons, true);

}

function poCancel(id) {

    wfModal("Cancel record", '<p class="wf-note">The units get the status they had before this record. A reason is required.</p><textarea class="wf-text" id="cReason"></textarea>', [
        { text: "Back", onClick: function () { poOpen(id); } },
        { text: "Cancel the record", cls: "red", onClick: function () {
            const res = cancelPulloutRecord(id, document.getElementById("cReason").value);
            if (!res.ok) { wfToast(res.message, true); return; }
            wfToast("Record cancelled.");
            poRefresh();
            poOpen(id);
        } }
    ]);

}

// ----- print slip -----
function poPrint(id) {

    const r = loadPulloutRecords().find(function (x) { return x.id === id; });
    if (!r) return;

    const units = loadAssetUnits();
    const assets = loadAssets();
    const rows = r.unitIds.map(function (uid, i) {
        const u = units.find(function (x) { return x.id === uid; }) || {};
        const a = assets.find(function (x) { return x.id === u.assetId; }) || {};
        return '<tr><td class="ctr">' + (i + 1) + "</td><td>" + esc(uid) + "</td><td>" + esc(a.name) + "</td><td>" + esc(u.serial || "") + '</td><td class="ctr">' + esc(r.condition) + "</td></tr>";
    }).join("");

    const html = '<div class="paper"><div class="top"><img src="' + appLogoSrc("../Login/neu-logo.png") + '" alt=""><div class="uni">' + esc(appInstitution()) + '</div><div class="dept">' + esc(appOffice().toUpperCase()) + '</div>' +
        '<div class="title">PULL-OUT RECORD</div><div class="box">RECORD NO:<b>' + esc(r.no) + "</b></div></div>" +
        '<table class="head"><tr><td style="width:50%">DATE: ' + esc(wfFormatDate(r.date)) + "</td><td>STATUS: " + esc(r.status) + "</td></tr>" +
        "<tr><td>REASON: " + esc(r.reason + (r.reasonNote ? " - " + r.reasonNote : "")) + "</td><td>REFERENCE: " + esc(r.reference) + "</td></tr>" +
        '<tr><td colspan="2">SUPPORTING INFORMATION: ' + esc(r.notes) + "</td></tr></table>" +
        '<table class="gap"><thead><tr><th style="width:6%">#</th><th style="width:26%">UNIT ASSET ID</th><th>EQUIPMENT</th><th style="width:20%">SERIAL NO.</th><th style="width:12%">CONDITION</th></tr></thead><tbody>' + rows + "</tbody></table>" +
        '<table class="gap"><tr class="sign-label"><td style="width:50%">Prepared by:</td><td>Noted by:</td></tr><tr class="sign"><td><span class="name">' + esc(String(r.createdByName || r.createdBy).toUpperCase()) +
        "</span>PROPERTY STAFF</td><td><span class=\"name\">" + esc(typeof directorName === "function" ? directorName().toUpperCase() : "") + "</span>DIRECTOR</td></tr></table></div>";

    setPageStyle("portrait");
    document.getElementById("printArea").innerHTML = html;
    window.print();

}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(".sidebar ul li").forEach(function (li) {
        li.addEventListener("click", function () {
            const n = li.textContent.trim();
            if (PO_PAGES[n]) location.href = PO_PAGES[n];
            else if (n === "Logout" && confirm("Are you sure you want to logout?")) { if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear(); location.href = "../Login/login.html"; }
        });
    });

    poTable = wfPagedTable({
        rows: poRows, tbody: "pBody", pager: "pPager", cols: 8, perPage: 8, empty: "No pull-out records.",
        rowHtml: function (r) {
            return "<tr><td><b>" + wfEsc(r.no) + "</b>" + (r.demo ? " <small>(demo)</small>" : "") + "</td><td>" + wfEsc(wfFormatDate(r.date)) + "</td><td>" + wfEsc(poUnitText(r)) + "</td><td>" + wfEsc(r.reason) + "</td><td>" + wfEsc(r.condition) +
                "</td><td>" + poBadge(r.status) + "</td><td>" + wfEsc(r.createdByName || r.createdBy) + '</td><td><button type="button" class="wf-btn sm gold" data-view="' + wfEsc(r.id) + '">' + (r.status === PULLOUT_STATUS.FOR ? "Review" : "View") + "</button></td></tr>";
        },
        onView: poOpen
    });

    ["pSearch", "pStatus", "pFrom", "pTo"].forEach(function (id) { document.getElementById(id).addEventListener(id === "pSearch" ? "input" : "change", function () { poTable.redraw(true); }); });
    document.getElementById("newRecord").addEventListener("click", function () {
        if (!pulloutCanWork()) { wfToast("Only Staff or the Admin can create a pull-out record.", true); return; }
        poNewRecord();
    });
    document.getElementById("pCheck").addEventListener("click", function () {
        const issues = pulloutIntegrityCheck();
        wfModal("Pull-out integrity check",
            '<p class="wf-note">Checks that the pull-out records and the unit statuses agree, and that real records do not depend on demo units. Nothing is changed by this check.</p>' +
            (issues.length ? issues.map(function (i) { return '<div class="wf-list-item"><span class="wf-badge ' + (i.level === "problem" ? "st-rejected" : "st-pending") + '">' + (i.level === "problem" ? "Problem" : "Note") + "</span> <b>" + wfEsc(i.no) + "</b>: " + wfEsc(i.text) + "</div>"; }).join("")
                            : '<div class="wf-list-item"><span class="wf-badge st-released">OK</span> All pull-out records agree with the unit statuses.</div>'),
            [{ text: "Close", onClick: wfCloseModal }], true);
    });
    document.getElementById("pCsv").addEventListener("click", function () {
        const lines = [["Record No.", "Date", "Status", "Units", "Reason", "Condition", "Notes", "Created by", "Processed"]].concat(poRows().map(function (r) {
            return [r.no, r.date, r.status, r.unitIds.join(" "), r.reason + (r.reasonNote ? " - " + r.reasonNote : ""), r.condition, r.notes, r.createdByName || r.createdBy, r.processedAt || ""];
        }));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")], { type: "text/csv" }));
        a.download = "pullout-records.csv"; a.click();
    });

    if (typeof onDataChange === "function") onDataChange(["pulloutRecords", "assetUnits"], poRefresh);
    poRefresh();

    const open = new URLSearchParams(location.search).get("open");
    if (open) poOpen(open);

});
