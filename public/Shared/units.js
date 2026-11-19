// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// PER-UNIT ASSET REGISTER (non-consumable equipment)   -- frontend simulation
//
// An EQUIPMENT RECORD (in "assets") is the kind of equipment, for example "Laptop".
// A PHYSICAL UNIT (in "assetUnits") is one real laptop. Every unit has:
//     its own Asset ID (AST006-U001), its own QR code, its own status, condition, location,
//     department assignment and its own movement history.
//
//   Status:    Available | Assigned | Under Maintenance | For Pull-Out | Pulled Out
//   Condition: New | Good | Fair | Damaged
//
// The numbers of the equipment record (quantity, issued, maintenance) are NOT typed any more.
// They are calculated from the units, so Annual Inventory, reports and the stock check still work:
//     quantity    = units that are not Pulled Out
//     issued      = Assigned units
//     maintenance = Under Maintenance + For Pull-Out units
//     available   = Available units
//
// Old equipment records are migrated automatically (ensureAssetUnits): nothing is deleted or overwritten.
// A QR code only identifies and opens a unit. It never changes anything.
// Consumables are NOT part of this register (they are counted by quantity).
//
// Needs (load before): stock.js.  Optional: inventory.js (Section / Unit names), workflow.js (wfModal for the picker).
// ========================================

const UNITS_STORE_KEY = "assetUnits";

const UNIT_STATUS = {
    AVAILABLE: "Available",
    ASSIGNED: "Assigned",
    MAINTENANCE: "Under Maintenance",
    FOR_PULLOUT: "For Pull-Out",
    PULLED_OUT: "Pulled Out"
};

const UNIT_STATUSES = [UNIT_STATUS.AVAILABLE, UNIT_STATUS.ASSIGNED, UNIT_STATUS.MAINTENANCE, UNIT_STATUS.FOR_PULLOUT, UNIT_STATUS.PULLED_OUT];
const UNIT_CONDITIONS = ["New", "Good", "Fair", "Damaged"];

// ----- storage -----
function loadAssetUnits() {
    try {
        const v = JSON.parse(localStorage.getItem(UNITS_STORE_KEY));
        return Array.isArray(v) ? v : [];
    } catch (e) {
        return [];
    }
}

function saveAssetUnits(list) {
    try {
        localStorage.setItem(UNITS_STORE_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        return false;
    }
}

function unitsOf(assetId) {
    return loadAssetUnits().filter(function (u) { return u.assetId === assetId; });
}

function findUnit(unitId) {
    const id = String(unitId || "").toUpperCase();
    return loadAssetUnits().find(function (u) { return u.id.toUpperCase() === id; }) || null;
}

// does this equipment record use the per-unit register?
function usesUnitRegistry(asset) {
    return !!asset && !isConsumable(asset) && asset.unitRegistry === true;
}

function unitIdText(assetId, n) {
    return assetId + "-U" + String(n).padStart(3, "0");
}

// "AST006-U001" (also "DEMO-AST006-U001")
function isUnitId(text) {
    return /^(DEMO-)?AST\d+-U\d+$/i.test(String(text || "").trim());
}

function unitNow() { return new Date().toISOString(); }

function unitWho() { return sessionStorage.getItem("userEmail") || "system"; }

function unitEvent(type, from, to, ref, note, when) {
    return { date: when || unitNow(), type: type, from: from || "", to: to || "", by: unitWho(), ref: ref || "", note: note || "" };
}

// ----- the numbers of the equipment record are calculated from its units -----
function unitCounts(assetId, units) {

    const c = { quantity: 0, issued: 0, maintenance: 0, available: 0 };

    (units || unitsOf(assetId)).forEach(function (u) {
        if (u.assetId !== assetId) return;
        if (u.status === UNIT_STATUS.PULLED_OUT) return;
        c.quantity++;
        if (u.status === UNIT_STATUS.ASSIGNED) c.issued++;
        else if (u.status === UNIT_STATUS.MAINTENANCE || u.status === UNIT_STATUS.FOR_PULLOUT) c.maintenance++;
        else c.available++;
    });

    return c;

}

// Writes the calculated numbers into the equipment records (only records that use the register).
function syncUnitCounts(assetIds) {

    const units = loadAssetUnits();
    const assets = loadAssets();
    let changed = false;

    assets.forEach(function (a) {

        if (!usesUnitRegistry(a)) return;
        if (assetIds && assetIds.indexOf(a.id) === -1) return;

        const c = unitCounts(a.id, units);

        if (a.quantity !== c.quantity || a.issued !== c.issued || a.maintenance !== c.maintenance) {
            a.quantity = c.quantity;
            a.issued = c.issued;
            a.maintenance = c.maintenance;
            changed = true;
        }

    });

    if (changed) saveAssets(assets);

}

// ----- creating units -----
function makeUnit(asset, seq, status, extra) {

    const x = extra || {};

    return {
        id: unitIdText(asset.id, seq),
        assetId: asset.id,
        serial: x.serial || "",
        condition: x.condition || "New",
        status: status || UNIT_STATUS.AVAILABLE,
        location: x.location != null ? x.location : (asset.location || ""),
        unitId: x.unitId != null ? x.unitId : (asset.unitId || ""),          // Section / Unit
        department: x.department || "",
        assignedTo: x.assignedTo || "",
        assignedRef: x.assignedRef || "",
        iin: x.iin || "",
        acquiredDate: x.acquiredDate || "",
        cost: x.cost != null ? x.cost : "",
        dateAdded: x.dateAdded || unitNow(),
        demo: !!asset.demo,
        history: x.history || []
    };

}

// Adds "count" new Available units to an equipment record. Returns the new units.
function addUnits(assetId, count, note) {

    const assets = loadAssets();
    const asset = assets.find(function (a) { return a.id === assetId; });

    if (!asset || isConsumable(asset)) return [];

    const n = Math.floor(Number(count));
    if (!isFinite(n) || n < 1) return [];

    const units = loadAssetUnits();
    const made = [];

    let seq = Math.max(asset.unitSeq || 0, units.filter(function (u) { return u.assetId === assetId; }).length);

    for (let i = 0; i < n; i++) {
        seq++;
        // System Settings > Inventory: the condition of NEW units ("same" = like the equipment record)
        const wanted = typeof settingsGet === "function" ? settingsGet("inventory.defaultUnitCondition", "same") : "same";
        const same = asset.condition === "Poor" ? "Fair" : (UNIT_CONDITIONS.indexOf(asset.condition) !== -1 ? asset.condition : "New");
        const u = makeUnit(asset, seq, UNIT_STATUS.AVAILABLE, { condition: UNIT_CONDITIONS.indexOf(wanted) !== -1 ? wanted : same });
        u.history.push(unitEvent("Registered", "", UNIT_STATUS.AVAILABLE, "", note || "Added to the register"));
        units.push(u);
        made.push(u);
    }

    asset.unitRegistry = true;
    asset.unitSeq = seq;

    saveAssets(assets);
    saveAssetUnits(units);
    syncUnitCounts([assetId]);

    return made;

}

// ----- MIGRATION: old equipment records get their units (nothing is deleted or overwritten) -----
// Safe to call on every page load: a record that already has the flag is skipped.
function ensureAssetUnits() {

    try {

        const assets = loadAssets();
        const todo = assets.filter(function (a) { return !isConsumable(a) && !a.unitRegistry; });

        if (todo.length === 0) return 0;

        const units = loadAssetUnits();
        const sections = typeof loadUnits === "function" ? loadUnits() : [];
        let created = 0;

        todo.forEach(function (a) {

            // never register twice (for example after a failed save)
            if (units.some(function (u) { return u.assetId === a.id; })) {
                a.unitRegistry = true;
                a.unitSeq = Math.max(a.unitSeq || 0, units.filter(function (u) { return u.assetId === a.id; }).length);
                return;
            }

            const total = Math.max(0, Math.floor(Number(a.quantity) || 0));
            let issued = Math.max(0, Math.floor(Number(a.issued) || 0));
            let maint = Math.max(0, Math.floor(Number(a.maintenance) || 0));
            let note = "";

            if (issued + maint > total) {                                   // old numbers that do not add up are clamped
                note = " (the old counts did not add up and were limited to the quantity)";
                a.legacyCounts = { quantity: a.quantity, issued: a.issued, maintenance: a.maintenance };   // the original numbers are kept
                issued = Math.min(issued, total);
                maint = Math.min(maint, total - issued);
            }

            // IIN numbers of the old record, in order
            const iinNumbers = [];
            const section = sections.find(function (s) { return s.id === a.iinUnitId; });
            if (section && a.iin) {
                a.iin.forEach(function (r) { for (let k = r[0]; k <= r[1]; k++) iinNumbers.push(section.code + "-" + String(k).padStart(3, "0")); });
            }

            const oldCondition = a.condition;
            const condition = UNIT_CONDITIONS.indexOf(oldCondition) !== -1 ? oldCondition : (oldCondition === "Poor" ? "Fair" : "Good");
            const conditionNote = condition !== oldCondition ? " Old condition \"" + oldCondition + "\" is shown as " + condition + "." : "";
            const born = a.dateAdded || unitNow();

            for (let i = 0; i < total; i++) {

                const status = i < issued ? UNIT_STATUS.ASSIGNED : i < issued + maint ? UNIT_STATUS.MAINTENANCE : UNIT_STATUS.AVAILABLE;

                const u = makeUnit(a, i + 1, status, {
                    condition: condition,
                    serial: total === 1 ? (a.serial || "") : "",           // one serial cannot be given to many units
                    iin: iinNumbers[i] || "",
                    acquiredDate: a.dateAdded ? String(a.dateAdded).slice(0, 10) : "",
                    cost: a.unitPrice != null ? a.unitPrice : "",
                    department: status === UNIT_STATUS.ASSIGNED ? (section ? (section.department || "") : "") : "",
                    dateAdded: born
                });

                u.history.push(unitEvent("Registered", "", UNIT_STATUS.AVAILABLE, "", "Migrated from the equipment record " + a.id + note + conditionNote, born));
                if (status !== UNIT_STATUS.AVAILABLE) u.history.push(unitEvent("Status", UNIT_STATUS.AVAILABLE, status, "", "Status taken from the old counts of the equipment record"));

                units.push(u);
                created++;

            }

            a.unitRegistry = true;
            a.unitSeq = total;

        });

        saveAssetUnits(units);
        saveAssets(assets);
        syncUnitCounts(todo.map(function (a) { return a.id; }));

        return created;

    } catch (e) {
        console.warn("The unit register could not be prepared:", e);
        return 0;
    }

}

// ----- status rules -----
// Who may do what: Staff and Administrator change units. A unit becomes Assigned ONLY through a release or a receipt.
function unitAllowedStatuses(unit, role) {

    const s = unit.status;
    let list = [];

    if (s === UNIT_STATUS.AVAILABLE) list = [UNIT_STATUS.MAINTENANCE, UNIT_STATUS.FOR_PULLOUT, UNIT_STATUS.PULLED_OUT];
    else if (s === UNIT_STATUS.ASSIGNED) list = [UNIT_STATUS.MAINTENANCE, UNIT_STATUS.FOR_PULLOUT, UNIT_STATUS.PULLED_OUT];
    else if (s === UNIT_STATUS.MAINTENANCE) list = [UNIT_STATUS.AVAILABLE, UNIT_STATUS.FOR_PULLOUT, UNIT_STATUS.PULLED_OUT];
    else if (s === UNIT_STATUS.FOR_PULLOUT) list = [UNIT_STATUS.AVAILABLE, UNIT_STATUS.MAINTENANCE, UNIT_STATUS.PULLED_OUT];

    // corrections of a wrong status are for the Administrator
    if (role === "Administrator") {
        if (s === UNIT_STATUS.ASSIGNED || s === UNIT_STATUS.PULLED_OUT) list = list.concat([UNIT_STATUS.AVAILABLE]);
    }

    return list.filter(function (x, i) { return list.indexOf(x) === i; });

}

function unitRole() { return typeof currentRole === "function" ? currentRole() : ""; }

// Manual status change (the unit screen). A reason is required. Returns { ok, message, unit }.
function setUnitStatus(unitId, newStatus, reason) {

    const role = unitRole();

    if (role !== "Administrator" && role !== "Staff") return { ok: false, message: "Only Staff or the Admin can change the status of a unit." };

    const units = loadAssetUnits();
    const u = units.find(function (x) { return x.id === unitId; });

    if (!u) return { ok: false, message: "Unit not found." };
    if (UNIT_STATUSES.indexOf(newStatus) === -1) return { ok: false, message: "Unknown status." };
    if (newStatus === UNIT_STATUS.ASSIGNED) return { ok: false, message: "A unit becomes Assigned only through a release (requisition) or a receipt." };
    if (!reason || !String(reason).trim()) return { ok: false, message: "A reason is required." };
    if (unitAllowedStatuses(u, role).indexOf(newStatus) === -1) {
        return { ok: false, message: "A unit that is " + u.status + " cannot be changed to " + newStatus + (u.status === UNIT_STATUS.PULLED_OUT ? " (only the Admin can correct a Pulled Out unit)." : ".") };
    }

    const from = u.status;
    u.status = newStatus;

    if (newStatus === UNIT_STATUS.AVAILABLE) { u.assignedTo = ""; u.assignedRef = ""; }

    u.history.push(unitEvent(from === UNIT_STATUS.PULLED_OUT || (from === UNIT_STATUS.ASSIGNED && newStatus === UNIT_STATUS.AVAILABLE) ? "Status correction" : "Status", from, newStatus, "", String(reason).trim()));

    if (!saveAssetUnits(units)) return { ok: false, message: "Browser storage is full." };

    syncUnitCounts([u.assetId]);
    if (typeof tryAuditLog === "function") tryAuditLog(unitWho(), role, "Unit " + u.id + ": " + from + " to " + newStatus + " (" + String(reason).trim() + ")");

    return { ok: true, unit: u };

}

// Edits of the details of a unit. changes = { serial, condition, location, unitId, department, acquiredDate, cost }
function editAssetUnit(unitId, changes) {

    const role = unitRole();
    if (role !== "Administrator" && role !== "Staff") return { ok: false, message: "Only Staff or the Admin can edit a unit." };

    const units = loadAssetUnits();
    const u = units.find(function (x) { return x.id === unitId; });
    if (!u) return { ok: false, message: "Unit not found." };

    if (changes.condition != null && UNIT_CONDITIONS.indexOf(changes.condition) === -1) return { ok: false, message: "Condition must be New, Good, Fair or Damaged." };

    if (changes.serial) {
        const s = String(changes.serial).trim().toLowerCase();
        const clash = units.some(function (x) { return x.id !== u.id && x.serial && x.serial.toLowerCase() === s; });
        if (clash) return { ok: false, message: "Another unit already has this serial number." };
    }

    if (changes.cost !== "" && changes.cost != null && (!isFinite(Number(changes.cost)) || Number(changes.cost) < 0)) return { ok: false, message: "The cost must be 0 or more." };

    const labels = { serial: "Serial No.", condition: "Condition", location: "Location", unitId: "Section / Unit", department: "Department", acquiredDate: "Acquisition date", cost: "Cost" };
    const parts = [];

    Object.keys(labels).forEach(function (k) {
        if (changes[k] === undefined) return;
        const next = typeof changes[k] === "string" ? changes[k].trim() : changes[k];
        if (String(u[k] == null ? "" : u[k]) !== String(next)) {
            parts.push(labels[k] + ": \"" + (u[k] == null ? "" : u[k]) + "\" to \"" + next + "\"");
            u[k] = next;
        }
    });

    if (parts.length === 0) return { ok: true, unit: u, unchanged: true };

    u.history.push(unitEvent("Edited", "", "", "", parts.join("; ")));
    if (!saveAssetUnits(units)) return { ok: false, message: "Browser storage is full." };

    if (typeof tryAuditLog === "function") tryAuditLog(unitWho(), role, "Edited unit " + u.id + ": " + parts.join("; "));

    return { ok: true, unit: u };

}

// Internal status change used by the Pull-Out module (its own rules are checked there).
// patch = fields to change at the same time (for example { condition: "Damaged" }).
function applyUnitStatus(unitId, newStatus, eventType, ref, note, patch) {

    const units = loadAssetUnits();
    const u = units.find(function (x) { return x.id === unitId; });
    if (!u) return false;

    const from = u.status;
    const parts = note ? [note] : [];

    if (patch) {
        Object.keys(patch).forEach(function (k) {
            if (String(u[k]) !== String(patch[k])) { parts.push(k + ": \"" + u[k] + "\" to \"" + patch[k] + "\""); u[k] = patch[k]; }
        });
    }

    u.status = newStatus;
    if (newStatus === UNIT_STATUS.AVAILABLE) { u.assignedTo = ""; u.assignedRef = ""; }

    u.history.push(unitEvent(eventType, from, newStatus, ref, parts.join("; ")));
    saveAssetUnits(units);
    syncUnitCounts([u.assetId]);

    return true;

}

// ----- units for the stock functions (release, receipt, pull-out) -----
// Which units may be chosen for this movement?
function eligibleUnits(assetId, mode) {

    return unitsOf(assetId).filter(function (u) {
        if (mode === "pullout") return u.status !== UNIT_STATUS.PULLED_OUT;
        return u.status === UNIT_STATUS.AVAILABLE;
    });

}

// Checks the chosen units of one line. Returns a problem text or "".
function checkUnitSelection(asset, item, mode) {

    const ids = item.unitIds || [];
    const qty = Number(item.qty);

    if (ids.length !== qty) return asset.name + ": select " + qty + " unit" + (qty === 1 ? "" : "s") + " (" + ids.length + " selected).";
    if (new Set(ids).size !== ids.length) return asset.name + ": the same unit was selected twice.";

    const ok = eligibleUnits(asset.id, mode).map(function (u) { return u.id; });
    const bad = ids.filter(function (id) { return ok.indexOf(id) === -1; });

    if (bad.length) return asset.name + ": " + bad.join(", ") + (mode === "pullout" ? " cannot be pulled out." : " is not Available.");

    return "";

}

// Applies a release / receipt / pull-out to the chosen units.
// ctx = { ref, assignedTo, department, note }  Returns text lines for the Audit Trail.
function applyUnitMovement(asset, unitIds, mode, ctx) {

    const units = loadAssetUnits();
    const c = ctx || {};
    const lines = [];

    unitIds.forEach(function (id) {
        const u = units.find(function (x) { return x.id === id; });
        if (!u) return;
        const from = u.status;

        if (mode === "pullout") {
            u.status = UNIT_STATUS.PULLED_OUT;
            u.history.push(unitEvent("Pulled Out", from, u.status, c.ref, c.note));
        } else {
            u.status = UNIT_STATUS.ASSIGNED;
            u.assignedTo = c.assignedTo || "";
            u.assignedRef = c.ref || "";
            if (c.department) u.department = c.department;
            u.history.push(unitEvent("Released", from, u.status, c.ref, (c.department ? "To " + c.department : "") + (c.assignedTo ? " (" + c.assignedTo + ")" : "") + (c.note ? "; " + c.note : "")));
        }

        lines.push(u.id);
    });

    saveAssetUnits(units);
    return lines;

}

// ----- QR of a unit -----
function unitQrPayload(unitId) {
    return typeof qrAssetPayload === "function" ? qrAssetPayload(unitId) : "NEU-CMS|ASSET|" + unitId;
}

function unitQrSvg(unitId, size) {
    return typeof QR !== "undefined" ? QR.svg(unitQrPayload(unitId), { size: size || 160, border: 2 }) : "";
}

// ----- the picker: Staff choose the specific units -----
// lines = [{ key, assetId, name, qty, exact }]  exact = true: exactly qty units; false: 0 up to qty (partial release)
// onDone(map)  map[key] = [unit ids]
function openUnitPicker(title, lines, mode, onDone, onCancel) {

    if (typeof wfModal !== "function") { alert("The unit picker needs Shared/workflow.js."); return; }

    function esc(t) { return typeof wfEsc === "function" ? wfEsc(t) : String(t); }

    let html = '<p class="wf-note">Select the specific physical units. Only the selected units change status.</p>';

    lines.forEach(function (l, li) {
        const list = eligibleUnits(l.assetId, mode);
        html += '<div style="margin:10px 0"><b>' + esc(l.name) + "</b> - " + (l.exact ? "select " + l.qty : "select up to " + l.qty) + ' <span class="wf-note">(<span class="upCount" data-l="' + li + '">0</span> selected)</span>';
        html += list.length ? '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th></th><th>Unit ID</th><th>Serial</th><th>Condition</th><th>Location</th><th>Status</th></tr></thead><tbody>' +
            list.map(function (u) {
                return '<tr><td><input type="checkbox" class="upBox" data-l="' + li + '" value="' + esc(u.id) + '"></td><td>' + esc(u.id) + "</td><td>" + esc(u.serial || "-") + "</td><td>" + esc(u.condition) + "</td><td>" + esc(u.location || "-") + "</td><td>" + esc(u.status) + "</td></tr>";
            }).join("") + "</tbody></table></div>"
            : '<div class="wf-lock">No unit is ' + (mode === "pullout" ? "eligible" : "Available") + " for " + esc(l.name) + ".</div>";
        html += "</div>";
    });

    wfModal(title, html, [
        { text: "Cancel", onClick: function () { wfCloseModal(); if (onCancel) onCancel(); } },
        { text: "Confirm units", cls: "gold", onClick: function () {
            const out = {};
            let problem = "";
            lines.forEach(function (l, li) {
                const ids = Array.prototype.slice.call(document.querySelectorAll('.upBox[data-l="' + li + '"]:checked')).map(function (b) { return b.value; });
                if (ids.length > l.qty) problem = l.name + ": select at most " + l.qty + ".";
                else if (l.exact && ids.length !== l.qty) problem = l.name + ": select exactly " + l.qty + " (" + ids.length + " selected).";
                out[l.key] = ids;
            });
            if (problem) { if (typeof wfToast === "function") wfToast(problem, true); else alert(problem); return; }
            wfCloseModal();
            onDone(out);
        } }
    ], true);

    // live counter and a limit on the boxes
    document.querySelectorAll(".upBox").forEach(function (box) {
        box.addEventListener("change", function () {
            const li = box.dataset.l;
            const checked = document.querySelectorAll('.upBox[data-l="' + li + '"]:checked');
            if (checked.length > lines[li].qty) { box.checked = false; return; }
            document.querySelector('.upCount[data-l="' + li + '"]').textContent = document.querySelectorAll('.upBox[data-l="' + li + '"]:checked').length;
        });
    });

}

// make the units exist as soon as this file is loaded (a no-op after the first time)
if (typeof loadAssets === "function") ensureAssetUnits();
