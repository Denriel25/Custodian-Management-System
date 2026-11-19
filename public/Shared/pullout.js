// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// PULL-OUT RECORDS (frontend simulation)
//
// A pull-out record takes specific physical units (Shared/units.js) out of service:
//     Create record  -> the units become  For Pull-Out
//     Process        -> the units become  Pulled Out   (they stay in the register with their history; nothing is deleted)
//     Cancel         -> the units go back to the status they had before the record (a reason is required)
//
// Only Staff and the Admin can create, process or cancel a record.
// A pull-out request of a Requester that Staff release in Request Management also creates a record (already Pulled Out).
// Records are never deleted. Demo records (demo: true) are the only ones resetDemoData() may remove.
//
// Needs (load before): users.js, stock.js, units.js, audit.js (optional), realtime.js (optional)
// ========================================

const PULLOUT_KEY = "pulloutRecords";

const PULLOUT_REASONS = ["Damaged beyond repair", "Obsolete", "For disposal", "Replaced by a new unit", "Lost or missing", "Other"];

const PULLOUT_STATUS = { FOR: "For Pull-Out", DONE: "Pulled Out", CANCELLED: "Cancelled" };

function loadPulloutRecords() {
    try {
        const v = JSON.parse(localStorage.getItem(PULLOUT_KEY));
        return Array.isArray(v) ? v : [];
    } catch (e) {
        return [];
    }
}

function savePulloutRecords(list) {
    try { localStorage.setItem(PULLOUT_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

function pulloutMe() { return (sessionStorage.getItem("userEmail") || "").toLowerCase(); }

function pulloutRole() { return typeof currentRole === "function" ? currentRole() : ""; }

function pulloutCanWork() { const r = pulloutRole(); return r === "Administrator" || r === "Staff"; }

function pulloutPersonName() {
    const u = typeof userByEmail === "function" ? userByEmail(pulloutMe()) : null;
    return u ? u.name : pulloutMe();
}

function pulloutAudit(text) {
    if (typeof tryAuditLog === "function") tryAuditLog(pulloutMe() || "system", pulloutRole() || "-", text);
}

// Demo units belong to the demo data. A record that uses them is a DEMO record, so a demo reset can remove it
// together with the units and the two always agree. A real record never depends on a demo unit.
function isDemoUnit(u) {
    return !!u && (u.demo === true || String(u.id || "").toUpperCase().indexOf("DEMO-") === 0);
}

// PO-26-001 for real records, PO-26-9001... for demo records (the two series never meet)
function nextPulloutNo(demo) {

    const yy = String(new Date().getFullYear()).slice(-2);
    let highest = demo ? 9000 : 0;

    loadPulloutRecords().forEach(function (r) {
        const m = /^PO-(\d{2})-(\d+)$/.exec(r.no || "");
        if (!m || m[1] !== yy) return;
        const n = parseInt(m[2], 10);
        if (demo ? (r.demo && n > 9000) : (!r.demo && n < 9000)) highest = Math.max(highest, n);
    });

    return "PO-" + yy + "-" + String(highest + 1).padStart(demo ? 4 : 3, "0");

}

// units that can be put in a new record: still in service and not already waiting for a pull-out
function pulloutEligibleUnits() {

    const assets = loadAssets();

    return loadAssetUnits().filter(function (u) {
        return u.status !== UNIT_STATUS.PULLED_OUT && u.status !== UNIT_STATUS.FOR_PULLOUT;
    }).map(function (u) {
        const a = assets.find(function (x) { return x.id === u.assetId; });
        return Object.assign({}, u, { equipment: a ? a.name : "", category: a ? a.category : "" });
    });

}

function pulloutEvent(type, note) {
    return { date: new Date().toISOString(), type: type, by: pulloutMe(), note: note || "" };
}

// input = { unitIds, reason, reasonNote, condition, notes, reference }
function createPulloutRecord(input) {

    if (!pulloutCanWork()) return { ok: false, message: "Only Staff or the Admin can create a pull-out record." };

    const ids = (input.unitIds || []).filter(function (x, i, a) { return a.indexOf(x) === i; });

    if (ids.length === 0) return { ok: false, message: "Select at least one unit." };
    if (ids.length > 50) return { ok: false, message: "A record can have at most 50 units." };
    if (PULLOUT_REASONS.indexOf(input.reason) === -1) return { ok: false, message: "Choose the reason for the pull-out." };
    if (input.reason === "Other" && !String(input.reasonNote || "").trim()) return { ok: false, message: "Describe the reason." };
    if (UNIT_CONDITIONS.indexOf(input.condition) === -1) return { ok: false, message: "Choose the condition of the units (New, Good, Fair or Damaged)." };

    const units = loadAssetUnits();
    const prev = {};
    const flags = [];

    for (const id of ids) {
        const u = units.find(function (x) { return x.id === id; });
        if (!u) return { ok: false, message: "Unit " + id + " was not found." };
        if (u.status === UNIT_STATUS.PULLED_OUT) return { ok: false, message: id + " is already Pulled Out." };
        if (u.status === UNIT_STATUS.FOR_PULLOUT) return { ok: false, message: id + " is already waiting for a pull-out." };
        prev[id] = u.status;
        flags.push(isDemoUnit(u));
    }

    // demo units and real units are never mixed in one record
    const demo = flags.every(Boolean);
    if (!demo && flags.some(Boolean)) {
        return { ok: false, message: "Do not mix demo units and real units in one record. Make one record for each." };
    }

    const no = nextPulloutNo(demo);
    const reasonText = input.reason + (String(input.reasonNote || "").trim() ? " - " + String(input.reasonNote).trim() : "");

    const record = {
        id: no, no: no, date: new Date().toISOString(), status: PULLOUT_STATUS.FOR, unitIds: ids, prev: prev,
        reason: input.reason, reasonNote: String(input.reasonNote || "").trim(), condition: input.condition,
        notes: String(input.notes || "").trim(), reference: String(input.reference || "").trim(),
        createdBy: pulloutMe(), createdByName: pulloutPersonName(), processedAt: null, processedBy: "", sourceRequest: "", demo: demo,
        history: [pulloutEvent("Created", ids.length + " unit(s) marked For Pull-Out: " + reasonText + (demo ? " (demo units: this is a demo record)" : ""))]
    };

    const list = loadPulloutRecords();
    list.push(record);
    if (!savePulloutRecords(list)) return { ok: false, message: "Browser storage is full." };

    ids.forEach(function (id) {
        applyUnitStatus(id, UNIT_STATUS.FOR_PULLOUT, "Pull-out record", no, reasonText, { condition: input.condition });
    });

    pulloutAudit("Pull-out record " + no + " created: " + ids.join(", ") + " (" + reasonText + ")" + (demo ? " [demo]" : ""));
    if (typeof addNotification === "function" && pulloutRole() === "Staff") addNotification("admin", "Pull-out record " + no + " was created: " + ids.length + " unit(s) marked For Pull-Out (" + input.reason + ").", null, demo);

    return { ok: true, record: record };

}

// For Pull-Out -> Pulled Out
function processPulloutRecord(id) {

    if (!pulloutCanWork()) return { ok: false, message: "Only Staff or the Admin can process a pull-out record." };

    const list = loadPulloutRecords();
    const rec = list.find(function (r) { return r.id === id; });

    if (!rec) return { ok: false, message: "Record not found." };
    if (rec.status !== PULLOUT_STATUS.FOR) return { ok: false, message: "Only a record that is For Pull-Out can be processed." };

    const units = loadAssetUnits();
    const wrong = rec.unitIds.filter(function (uid) {
        const u = units.find(function (x) { return x.id === uid; });
        return !u || u.status !== UNIT_STATUS.FOR_PULLOUT;
    });

    if (wrong.length) return { ok: false, message: "These units are no longer For Pull-Out: " + wrong.join(", ") + ". Cancel this record and make a new one." };

    rec.unitIds.forEach(function (uid) {
        applyUnitStatus(uid, UNIT_STATUS.PULLED_OUT, "Pulled Out", rec.no, "Pull-out record " + rec.no);
    });

    rec.status = PULLOUT_STATUS.DONE;
    rec.processedAt = new Date().toISOString();
    rec.processedBy = pulloutMe();
    rec.processedByName = pulloutPersonName();
    rec.history.push(pulloutEvent("Processed", rec.unitIds.length + " unit(s) are now Pulled Out"));

    if (!savePulloutRecords(list)) return { ok: false, message: "Browser storage is full." };

    pulloutAudit("Pull-out record " + rec.no + " processed: " + rec.unitIds.join(", ") + " Pulled Out");

    return { ok: true, record: rec };

}

// A record that is still For Pull-Out can be cancelled (a reason is required). The units get their earlier status back.
function cancelPulloutRecord(id, reason) {

    if (!pulloutCanWork()) return { ok: false, message: "Only Staff or the Admin can cancel a pull-out record." };
    if (!reason || !String(reason).trim()) return { ok: false, message: "A reason is required." };

    const list = loadPulloutRecords();
    const rec = list.find(function (r) { return r.id === id; });

    if (!rec) return { ok: false, message: "Record not found." };
    if (rec.status !== PULLOUT_STATUS.FOR) return { ok: false, message: "Only a record that is For Pull-Out can be cancelled." };

    const units = loadAssetUnits();

    rec.unitIds.forEach(function (uid) {
        const u = units.find(function (x) { return x.id === uid; });
        if (u && u.status === UNIT_STATUS.FOR_PULLOUT) {
            applyUnitStatus(uid, rec.prev[uid] || UNIT_STATUS.AVAILABLE, "Pull-out cancelled", rec.no, String(reason).trim());
        }
    });

    rec.status = PULLOUT_STATUS.CANCELLED;
    rec.history.push(pulloutEvent("Cancelled", String(reason).trim()));

    if (!savePulloutRecords(list)) return { ok: false, message: "Browser storage is full." };

    pulloutAudit("Pull-out record " + rec.no + " cancelled (" + String(reason).trim() + ")");

    return { ok: true, record: rec };

}

// A Requester's pull-out request that Staff released in Request Management also leaves a record (the units are already Pulled Out).
// Real units and demo units are never in the same record: each kind gets its own record.
function recordPulloutFromRequest(form, unitIds) {

    const ids = (unitIds || []).filter(Boolean);
    if (ids.length === 0) return null;

    const all = loadAssetUnits();
    const demoIds = ids.filter(function (id) { return isDemoUnit(all.find(function (u) { return u.id === id; }) || { id: id }); });
    const realIds = ids.filter(function (id) { return demoIds.indexOf(id) === -1; });
    let last = null;

    [[realIds, false], [demoIds, true]].forEach(function (pair) {
        if (pair[0].length) last = makeRequestRecord(form, pair[0], pair[1]) || last;
    });

    return last;

}

function makeRequestRecord(form, ids, demo) {

    const list = loadPulloutRecords();
    if (list.some(function (r) { return r.sourceRequest === form.controlNo && !!r.demo === demo; })) return null;   // never twice

    const no = nextPulloutNo(demo);
    const first = (form.items || [])[0] || {};

    const rec = {
        id: no, no: no, date: new Date().toISOString(), status: PULLOUT_STATUS.DONE, unitIds: ids, prev: {},
        reason: "Other", reasonNote: first.reason ? String(first.reason) : "Pull-out request " + form.controlNo, condition: (findUnit(ids[0]) || {}).condition || "Fair",
        notes: "Released from pull-out request " + form.controlNo + (first.description ? " (" + first.description + ")" : ""), reference: form.controlNo,
        createdBy: pulloutMe(), createdByName: pulloutPersonName(), processedAt: new Date().toISOString(), processedBy: pulloutMe(), processedByName: pulloutPersonName(),
        sourceRequest: form.controlNo, demo: demo,
        history: [pulloutEvent("Created", "From the pull-out request " + form.controlNo + (demo ? " (demo units: this is a demo record)" : "")), pulloutEvent("Processed", ids.length + " unit(s) Pulled Out")]
    };

    list.push(rec);
    savePulloutRecords(list);

    return rec;

}

// ----- integrity: do the pull-out records and the unit statuses agree? -----
// Returns a list of { level: "problem" | "note", no, text }. Nothing is changed.
function pulloutIntegrityCheck() {

    const units = loadAssetUnits();
    const issues = [];

    loadPulloutRecords().forEach(function (r) {

        let usesDemo = false, usesReal = false;

        r.unitIds.forEach(function (uid) {

            const u = units.find(function (x) { return x.id === uid; });

            if (!u) {
                issues.push({ level: "problem", no: r.no, text: "unit " + uid + " is not in the register any more" + (String(uid).toUpperCase().indexOf("DEMO-") === 0 ? " (its demo data was removed)" : "") + "." });
                if (String(uid).toUpperCase().indexOf("DEMO-") === 0) usesDemo = true;
                return;
            }

            if (isDemoUnit(u)) usesDemo = true; else usesReal = true;

            if (r.status === PULLOUT_STATUS.FOR && u.status !== UNIT_STATUS.FOR_PULLOUT) issues.push({ level: "problem", no: r.no, text: "the record is For Pull-Out but " + uid + " is " + u.status + "." });
            if (r.status === PULLOUT_STATUS.DONE && u.status !== UNIT_STATUS.PULLED_OUT) issues.push({ level: "problem", no: r.no, text: "the record is Pulled Out but " + uid + " is " + u.status + "." });

        });

        if (!r.demo && usesDemo) issues.push({ level: "note", no: r.no, text: "this real record uses demo units (older record). A demo reset keeps it and sets those units to match the record." });
        if (r.demo && usesReal) issues.push({ level: "problem", no: r.no, text: "this demo record uses real units." });

    });

    return issues;

}

// After a demo reset the demo units are made again in their first state. An OLDER real record that still points at demo units
// gets those units set to the status the record says, so the record and the units agree. Real units are never touched.
function pulloutReapplyAfterReset() {

    let changed = 0;

    loadPulloutRecords().forEach(function (r) {

        if (r.demo || (r.status !== PULLOUT_STATUS.FOR && r.status !== PULLOUT_STATUS.DONE)) return;

        const want = r.status === PULLOUT_STATUS.FOR ? UNIT_STATUS.FOR_PULLOUT : UNIT_STATUS.PULLED_OUT;

        r.unitIds.forEach(function (uid) {
            const u = findUnit(uid);
            if (!u || !isDemoUnit(u) || u.status === want) return;
            applyUnitStatus(uid, want, "Re-applied", r.no, "Set to match the pull-out record " + r.no + " after the demo data was made again");
            changed++;
        });

    });

    return changed;

}
