// ========================================
// ASSETS PAGE - PER-UNIT REGISTER SCREENS (frontend simulation)
//   openUnitRegister(assetId)   the units of one equipment record
//   openUnitDetails(unitId)     ONE physical unit: details, QR, history, edit, status
// The data rules are in Shared/units.js. A QR code only opens a unit. It never changes it.
// ========================================

function unitBadge(status) {
    const cls = status === "Available" ? "st-released" : status === "Assigned" ? "st-ready" :
                status === "Pulled Out" ? "st-draft" : status === "For Pull-Out" ? "st-rejected" : "st-pending";
    return '<span class="wf-badge ' + cls + '">' + wfEsc(status) + "</span>";
}

// Labels: the units of an equipment record replace the record itself
function expandLabelList(list) {

    const out = [];

    list.forEach(function (a) {

        if (typeof usesUnitRegistry === "function" && usesUnitRegistry(a)) {
            unitsOf(a.id).filter(function (u) { return u.status !== "Pulled Out"; }).forEach(function (u) {
                out.push({ id: u.id, name: a.name + (u.serial ? " (" + u.serial + ")" : ""), location: u.location });
            });
        } else {
            out.push(a);
        }

    });

    return out;

}

// PNG download of a QR image (the SVG is drawn on a canvas)
function downloadQrPng(svgText, fileName) {

    let xml = svgText;
    if (xml.indexOf("xmlns=") === -1) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

    const img = new Image();

    img.onload = function () {
        const size = 600;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, size, size);
        canvas.toBlob(function (blob) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
        }, "image/png");
    };

    img.onerror = function () { wfToast("The QR image could not be created.", true); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

}

function sectionName(unitId) {
    const s = typeof loadUnits === "function" ? loadUnits().find(function (x) { return x.id === unitId; }) : null;
    return s ? s.code + " - " + s.name : "";
}

// ========================================
// REGISTER OF ONE EQUIPMENT RECORD
// ========================================
function openUnitRegister(assetId, statusFilter) {

    const asset = loadAssets().find(function (a) { return a.id === assetId; });
    if (!asset) return;

    const all = unitsOf(assetId);
    const filter = statusFilter || "all";
    const list = all.filter(function (u) { return filter === "all" || u.status === filter; });
    const c = unitCounts(assetId, all);
    const pulled = all.filter(function (u) { return u.status === "Pulled Out"; }).length;

    let body = '<div class="wf-row"><strong>Equipment</strong><span>' + wfEsc(asset.name) + " (" + wfEsc(asset.id) + ") - " + wfEsc(asset.category) + "</span></div>" +
        '<div class="wf-row"><strong>Units</strong><span>' + c.quantity + " in use: " + c.available + " Available, " + c.issued + " Assigned, " + c.maintenance + " Under Maintenance / For Pull-Out. " + pulled + " Pulled Out.</span></div>" +
        '<div class="wf-tools" style="margin-top:10px"><select class="wf-select" id="uFilter"><option value="all">All statuses</option>' +
        UNIT_STATUSES.map(function (s) { return '<option value="' + wfEsc(s) + '"' + (s === filter ? " selected" : "") + ">" + wfEsc(s) + "</option>"; }).join("") + "</select>" +
        '<input class="wf-input" id="uAddCount" type="number" min="1" max="50" step="1" value="1" style="max-width:90px" title="How many units">' +
        '<button type="button" class="wf-btn sm gold" id="uAdd">Add units</button>' +
        '<button type="button" class="wf-btn sm" id="uPrint">Print unit labels</button></div>' +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Unit Asset ID</th><th>Serial No.</th><th>Condition</th><th>Status</th><th>Location</th><th>Department / Assigned to</th><th></th></tr></thead><tbody>' +
        (list.length ? list.map(function (u) {
            return "<tr><td><b>" + wfEsc(u.id) + "</b></td><td>" + wfEsc(u.serial || "-") + "</td><td>" + wfEsc(u.condition) + "</td><td>" + unitBadge(u.status) + "</td><td>" + wfEsc(u.location || "-") +
                "</td><td>" + wfEsc(u.department || "-") + (u.assignedTo ? "<br><small>" + wfEsc(u.assignedTo) + "</small>" : "") + '</td><td><button type="button" class="wf-btn sm gold" data-unit="' + wfEsc(u.id) + '">Open</button></td></tr>';
        }).join("") : '<tr><td colspan="7" class="wf-empty">No units for this filter.</td></tr>') + "</tbody></table></div>" +
        '<p class="wf-note">Every unit has its own Asset ID, QR code, status, condition, location, department and history. Units are never deleted; a unit that leaves service is marked Pulled Out.</p>';

    wfModal("Units of " + asset.name, body, [{ text: "Close", onClick: wfCloseModal }], true);

    document.getElementById("uFilter").addEventListener("change", function () { openUnitRegister(assetId, this.value); });
    document.getElementById("uPrint").addEventListener("click", function () { wfCloseModal(); printLabels([asset]); });
    document.getElementById("uAdd").addEventListener("click", function () {
        const n = Number(document.getElementById("uAddCount").value);
        if (!isFinite(n) || n < 1 || n > 50 || Math.floor(n) !== n) { wfToast("Enter a whole number from 1 to 50.", true); return; }
        const made = addUnits(assetId, n, "Added by " + (sessionStorage.getItem("userEmail") || ""));
        if (!made.length) { wfToast("The units could not be added.", true); return; }
        if (typeof tryAuditLog === "function") tryAuditLog(wfMe(), wfRole(), "Added " + made.length + " unit(s) to " + asset.id + ": " + made.map(function (u) { return u.id; }).join(", "));
        wfToast(made.length + " unit(s) added: " + made[0].id + (made.length > 1 ? " to " + made[made.length - 1].id : ""));
        render();
        openUnitRegister(assetId, filter);
    });
    document.querySelectorAll("[data-unit]").forEach(function (b) { b.addEventListener("click", function () { openUnitDetails(b.dataset.unit); }); });

}

// ========================================
// ONE PHYSICAL UNIT
// ========================================
function openUnitDetails(unitId) {

    const u = findUnit(unitId);
    if (!u) return;

    const asset = loadAssets().find(function (a) { return a.id === u.assetId; }) || {};

    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + (v === "" || v == null ? "-" : v) + "</span></div>"; }

    const history = (u.history || []).slice().reverse();
    const svg = unitQrSvg(u.id, 150);

    let body = '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px">' +
        row("Unit Asset ID", "<b>" + wfEsc(u.id) + "</b>") +
        row("Asset name", wfEsc(asset.name)) + row("Category", wfEsc(asset.category)) +
        row("Brand / Model", wfEsc([asset.brand, asset.model].filter(Boolean).join(" ") || "")) +
        row("Serial No.", wfEsc(u.serial)) + row("Condition", wfEsc(u.condition)) + row("Status", unitBadge(u.status)) +
        row("Current location", wfEsc(u.location)) + row("Section / Unit", wfEsc(sectionName(u.unitId))) +
        row("Department", wfEsc(u.department)) +
        row("Assigned to", wfEsc(u.assignedTo ? u.assignedTo + (u.assignedRef ? " (requisition / receipt " + u.assignedRef + ")" : "") : "")) +
        row("IIN", wfEsc(u.iin)) + row("Acquisition date", wfEsc(u.acquiredDate)) + row("Cost", u.cost === "" ? "" : wfEsc(Number(u.cost).toLocaleString("en-US", { minimumFractionDigits: 2 }))) +
        "</div>" +
        '<div style="text-align:center"><div style="background:#fff;padding:6px;border-radius:8px;width:162px;height:162px;margin:auto">' + svg + "</div>" +
        '<small class="wf-note">This QR code identifies this unit only.<br>Scanning it only opens this record.</small></div></div>' +
        '<h4 style="margin:14px 0 4px;color:#edae0f">Movement history of this unit</h4>' +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Date</th><th>Event</th><th>From &rarr; To</th><th>By</th><th>Reference / note</th></tr></thead><tbody>' +
        history.map(function (h) {
            return "<tr><td>" + wfEsc(wfFormatDate(h.date, true)) + "</td><td>" + wfEsc(h.type) + "</td><td>" + wfEsc(h.from || h.to ? (h.from || "-") + " \u2192 " + (h.to || "-") : "") +
                "</td><td>" + wfEsc(h.by) + "</td><td>" + wfEsc([h.ref, h.note].filter(Boolean).join(" - ")) + "</td></tr>";
        }).join("") + "</tbody></table></div>";

    const role = wfRole();
    const canChange = role === "Administrator" || role === "Staff";
    const buttons = [{ text: "Close", onClick: wfCloseModal }, { text: "All units", onClick: function () { openUnitRegister(u.assetId); } }];

    buttons.push({ text: "Download QR", onClick: function () { downloadQrPng(unitQrSvg(u.id, 200), u.id + "-QR.png"); } });
    buttons.push({ text: "Print label", onClick: function () { wfCloseModal(); printLabels([{ id: u.id, name: asset.name + (u.serial ? " (" + u.serial + ")" : ""), location: u.location }]); } });

    if (canChange) {
        buttons.push({ text: "Edit details", onClick: function () { openUnitEdit(u.id); } });
        buttons.push({ text: "Change status", cls: "gold", onClick: function () { openUnitStatus(u.id); } });
    }

    wfModal("Unit " + u.id, body, buttons, true);

}

function openUnitEdit(unitId) {

    const u = findUnit(unitId);
    if (!u) return;

    const sections = typeof loadUnits === "function" ? loadUnits() : [];

    wfModal("Edit unit " + u.id,
        '<label class="wf-note">Serial No.</label><input class="wf-input" id="eSerial" value="' + wfEsc(u.serial) + '">' +
        '<label class="wf-note" style="display:block;margin-top:8px">Condition</label><select class="wf-select" id="eCond">' +
            UNIT_CONDITIONS.map(function (c) { return '<option' + (c === u.condition ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
        '<label class="wf-note" style="display:block;margin-top:8px">Current location</label><input class="wf-input" id="eLoc" value="' + wfEsc(u.location) + '">' +
        '<label class="wf-note" style="display:block;margin-top:8px">Section / Unit</label><select class="wf-select" id="eSec"><option value="">(none)</option>' +
            sections.map(function (s) { return '<option value="' + wfEsc(s.id) + '"' + (s.id === u.unitId ? " selected" : "") + ">" + wfEsc(s.code + " - " + s.name) + "</option>"; }).join("") + "</select>" +
        '<label class="wf-note" style="display:block;margin-top:8px">Department</label><input class="wf-input" id="eDept" value="' + wfEsc(u.department) + '">' +
        '<div style="display:flex;gap:8px;margin-top:8px"><div style="flex:1"><label class="wf-note">Acquisition date</label><input class="wf-input" type="date" id="eDate" value="' + wfEsc(u.acquiredDate) + '"></div>' +
        '<div style="flex:1"><label class="wf-note">Cost</label><input class="wf-input" type="number" min="0" step="0.01" id="eCost" value="' + wfEsc(u.cost) + '"></div></div>' +
        '<p class="wf-note">The status is changed with "Change status" (a reason is required). Every edit is written in the history of this unit.</p>',
        [{ text: "Cancel", onClick: function () { openUnitDetails(u.id); } },
         { text: "Save", cls: "gold", onClick: function () {
            const v = function (id) { return document.getElementById(id).value; };
            const r = editAssetUnit(u.id, { serial: v("eSerial"), condition: v("eCond"), location: v("eLoc"), unitId: v("eSec"), department: v("eDept"), acquiredDate: v("eDate"), cost: v("eCost") });
            if (!r.ok) { wfToast(r.message, true); return; }
            wfToast(r.unchanged ? "Nothing was changed." : "Unit saved.");
            render();
            openUnitDetails(u.id);
         } }]);

}

function openUnitStatus(unitId) {

    const u = findUnit(unitId);
    if (!u) return;

    const allowed = unitAllowedStatuses(u, wfRole());

    if (!allowed.length) {
        wfToast("A " + u.status + " unit cannot be changed here" + (u.status === "Pulled Out" ? " (only the Admin can correct it)." : "."), true);
        return;
    }

    wfModal("Change status - " + u.id,
        '<p class="wf-note">Now: ' + unitBadge(u.status) + '. A unit becomes Assigned only through a release or a receipt.</p>' +
        '<label class="wf-note">New status</label><select class="wf-select" id="sNew">' + allowed.map(function (s) { return "<option>" + wfEsc(s) + "</option>"; }).join("") + "</select>" +
        '<label class="wf-note" style="display:block;margin-top:8px">Reason (required)</label><textarea class="wf-text" id="sReason" placeholder="e.g. Sent for repair / Screen cracked"></textarea>',
        [{ text: "Cancel", onClick: function () { openUnitDetails(u.id); } },
         { text: "Save status", cls: "gold", onClick: function () {
            const next = document.getElementById("sNew").value;
            if (!confirm("Change " + u.id + " from " + u.status + " to " + next + "?")) return;
            const r = setUnitStatus(u.id, next, document.getElementById("sReason").value);
            if (!r.ok) { wfToast(r.message, true); return; }
            wfToast("Status changed to " + next + ".");
            render();
            openUnitDetails(u.id);
         } }]);

}
