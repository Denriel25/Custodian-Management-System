// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// DEMO (MOCK) DATA - FRONTEND SIMULATION ONLY
//
// These are NOT real database records. They exist only so the dashboards and the workflow
// can be shown. They are kept apart from the screens and removed in the backend phase.
//
// SAFETY RULES
//   1. Every demo record has  demo: true  and a DEMO- id (assets: DEMO-AST001 ...).
//   2. Demo data is created ONLY when this browser has no real data at all
//      (no real assets, no real forms) and has never been seeded before.
//   3. Demo data NEVER changes a real record: no real stock, requisition, notification,
//      email, user or movement is edited or deleted.
//   4. resetDemoData() removes ONLY records marked demo: true and makes the same demo
//      records again. Running it again and again gives the same result (no growth, no duplicates).
//   5. A normal page reload never changes anything (the flag below is checked first).
//
//   resetDemoData()  -> remove the demo records and create them again
//   clearDemoData()  -> remove the demo records only
// Needs (load before): users.js, stock.js, realtime.js, workflow.js
// ========================================

const DEMO_FLAG = "demoSeeded_v3";
const DEMO_OLD_FLAG = "demoSeeded_v2";      // the first demo version (its records are left alone)

// a fake handwritten signature (SVG) so the previews and the printed form have something to show
function demoSignature(name) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><text x="10" y="62" font-family="cursive, Brush Script MT, serif" font-size="40" fill="#101a4a" font-style="italic">' +
        String(name).replace(/[<>&]/g, "") + '</text><path d="M10 80 Q150 70 290 82" stroke="#101a4a" stroke-width="2" fill="none"/></svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function demoDaysAgo(n, hour) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hour || 9, 15, 0, 0);
    return d.toISOString();
}

function demoReadList(key) {
    try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function demoWriteList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
}

// ----- is there anything real in this browser? -----
function demoHasRealData() {
    return loadAssets().some(function (a) { return !a.demo; }) ||
           wfLoadAll().some(function (f) { return !f.demo; });
}

// ----- remove ONLY the records marked demo: true -----
function demoRemoveAll() {

    const removed = { forms: 0, assets: 0, units: 0, pullouts: 0, movements: 0, notifications: 0, emails: 0 };

    function keepReal(key, countKey, extra) {
        const all = demoReadList(key);
        const keep = all.filter(function (x) { return !(x && (x.demo === true || (extra && extra(x)))); });
        removed[countKey] = all.length - keep.length;
        if (keep.length !== all.length) demoWriteList(key, keep);
    }

    keepReal("forms", "forms");
    keepReal("assets", "assets");
    // the physical units of a demo equipment record belong to it
    keepReal("assetUnits", "units", function (u) { return String(u.assetId || "").indexOf("DEMO-") === 0; });
    // stock history of a demo asset belongs to that demo asset
    keepReal("pulloutRecords", "pullouts");
    keepReal("stockMovements", "movements", function (m) { return String(m.assetId || "").indexOf("DEMO-") === 0; });
    keepReal("notifications", "notifications");
    keepReal("simEmails", "emails");

    return removed;

}

// ----- create the demo records (never touches a record that is not marked demo) -----
function demoCreateAll() {

    const yy = String(new Date().getFullYear()).slice(-2);
    const A = "requester@neu.edu.ph", B = "requester2@neu.edu.ph";
    const admin = (userByEmail("admin@neu.edu.ph") || {}).name || "Nelson F. Salisi";
    const aud = (userByEmail("auditor@neu.edu.ph") || {}).name || "Raymund S. Pagaduan";
    const staff = (userByEmail("staff@neu.edu.ph") || {}).name || "Ana Reyes";

    // ----- assets: the stock already includes the demo requisitions that were released -----
    const base = { demo: true, photo: "", brand: "", model: "", serial: "", condition: "New", unitId: "", make: "", color: "", size: "", remarks: "Demo data", issued: 0, maintenance: 0, location: "Property Office", dateAdded: demoDaysAgo(60) };

    const assetDefs = [
        { id: "DEMO-AST001", name: "Bond Paper A4", type: "Consumable", category: "Office Supplies", unit: "ream", quantity: 480, unitPrice: 245, reorderLevel: 50 },
        { id: "DEMO-AST002", name: "Ballpen (Black)", type: "Consumable", category: "Office Supplies", unit: "box", quantity: 31, unitPrice: 120, reorderLevel: 10 },
        { id: "DEMO-AST003", name: "Folder (Long)", type: "Consumable", category: "Office Supplies", unit: "pack", quantity: 8, unitPrice: 95, reorderLevel: 10 },
        { id: "DEMO-AST004", name: "Printer Ink (Black)", type: "Consumable", category: "Office Supplies", unit: "bottle", quantity: 0, unitPrice: 310, reorderLevel: 5 },
        { id: "DEMO-AST005", name: "Stapler Pins", type: "Consumable", category: "Office Supplies", unit: "box", quantity: 120, unitPrice: 25, reorderLevel: 20 },
        { id: "DEMO-AST006", name: "Laptop", type: "Non-consumable", category: "Electronics", unit: "unit", quantity: 6, maintenance: 1, unitPrice: 42000, brand: "Lenovo", model: "ThinkPad E14", serial: "LNV-E14-0001", condition: "Good" },
        { id: "DEMO-AST007", name: "Projector", type: "Non-consumable", category: "Electronics", unit: "unit", quantity: 3, issued: 1, unitPrice: 28500, brand: "Epson", model: "EB-X06", serial: "EPS-X06-0001", condition: "Good" },
        { id: "DEMO-AST008", name: "Office Chair", type: "Non-consumable", category: "Furniture", unit: "unit", quantity: 20, unitPrice: 3200 }
    ];

    const assets = demoReadList("assets");
    assetDefs.forEach(function (d) {
        if (assets.some(function (x) { return x.id === d.id; })) return;   // never overwrite
        assets.push(Object.assign({}, base, d));
    });
    demoWriteList("assets", assets);

    // the physical units of the demo equipment (one record per unit; real records are never touched)
    if (typeof ensureAssetUnits === "function") {
        ensureAssetUnits();
        const units = demoReadList("assetUnits");
        const serials = { "DEMO-AST006": "LNV-E14-", "DEMO-AST007": "EPS-X06-" };
        units.forEach(function (u) {
            if (!u.demo) return;
            const m = /^(DEMO-AST\d+)-U(\d+)$/.exec(u.id);
            if (m && serials[m[1]] && !u.serial) u.serial = serials[m[1]] + String(m[2]).padStart(4, "0");
            // the projector that the released demo requisition gave out
            if (m && m[1] === "DEMO-AST007" && u.status === "Assigned" && !u.assignedRef) {
                u.assignedRef = yy + "-9002";
                u.assignedTo = "Denriel Dinogan";
                u.department = "College of Computer Studies";
                u.history.push({ date: demoDaysAgo(8), type: "Released", from: "Available", to: "Assigned", by: "demo", ref: yy + "-9002", note: "To College of Computer Studies (Denriel Dinogan)" });
            }
        });
        demoWriteList("assetUnits", units);

        // two demo pull-out records: one waiting (For Pull-Out) and one processed (Pulled Out)
        if (typeof applyUnitStatus === "function") {
            const recs = demoReadList("pulloutRecords");
            const mk = function (n, status, unitId, reason, cond, notes, days) {
                return { id: "DEMO-PO-00" + n, demo: true, no: "PO-" + yy + "-900" + n, date: demoDaysAgo(days), status: status, unitIds: [unitId], prev: { [unitId]: "Available" },
                    reason: reason, reasonNote: "", condition: cond, notes: notes, reference: "", createdBy: "staff@neu.edu.ph", createdByName: staff, processedAt: status === "Pulled Out" ? demoDaysAgo(days - 2) : null,
                    processedBy: status === "Pulled Out" ? "staff@neu.edu.ph" : "", processedByName: status === "Pulled Out" ? staff : "", sourceRequest: "",
                    history: [{ date: demoDaysAgo(days), type: "Created", by: "staff@neu.edu.ph", note: "1 unit(s) marked For Pull-Out: " + reason }].concat(status === "Pulled Out" ? [{ date: demoDaysAgo(days - 2), type: "Processed", by: "staff@neu.edu.ph", note: "1 unit(s) are now Pulled Out" }] : []) };
            };
            recs.push(mk(1, "For Pull-Out", "DEMO-AST006-U005", "Damaged beyond repair", "Damaged", "Cracked display and motherboard failure (demo)", 4));
            recs.push(mk(2, "Pulled Out", "DEMO-AST006-U006", "Obsolete", "Fair", "Old model, replaced (demo)", 14));
            demoWriteList("pulloutRecords", recs);
            applyUnitStatus("DEMO-AST006-U005", "For Pull-Out", "Pull-out record", "PO-" + yy + "-9001", "Damaged beyond repair", { condition: "Damaged" });
            applyUnitStatus("DEMO-AST006-U006", "Pulled Out", "Pulled Out", "PO-" + yy + "-9002", "Obsolete", { condition: "Fair" });
        }
    }

    // ----- stock history of the demo consumables -----
    const moves = demoReadList("stockMovements");
    function mv(id, name, unit, type, change, before, reason, days) {
        moves.push({ id: "DEMO-MV" + moves.length + "-" + Math.floor(Math.random() * 1e6), demo: true, date: demoDaysAgo(days), assetId: id, item: name, type: type, change: change, before: before, after: before + change, unit: unit, reason: reason, by: "demo" });
    }
    mv("DEMO-AST001", "Bond Paper A4", "ream", "Stock In", 500, 0, "Opening quantity (demo)", 60);
    mv("DEMO-AST001", "Bond Paper A4", "ream", "Release", -20, 500, "Requisition " + yy + "-9001 released (demo)", 26);
    mv("DEMO-AST002", "Ballpen (Black)", "box", "Stock In", 40, 0, "Opening quantity (demo)", 60);
    mv("DEMO-AST002", "Ballpen (Black)", "box", "Release", -3, 40, "Requisition " + yy + "-9001 released (demo)", 26);
    mv("DEMO-AST002", "Ballpen (Black)", "box", "Release", -6, 37, "Requisition " + yy + "-9010 release " + yy + "-9010-R1 (demo)", 2);
    mv("DEMO-AST003", "Folder (Long)", "pack", "Stock In", 8, 0, "Opening quantity (demo)", 60);
    mv("DEMO-AST004", "Printer Ink (Black)", "bottle", "Stock In", 0, 0, "Opening quantity (demo)", 60);
    mv("DEMO-AST005", "Stapler Pins", "box", "Stock In", 120, 0, "Opening quantity (demo)", 60);
    demoWriteList("stockMovements", moves);

    // ----- requisitions. Control numbers yy-9001... never meet the real numbers (yy-001, yy-002 ...) -----
    // [no, requester, department, representative, position, purpose, items, stage, days ago]
    const defs = [
        ["9001", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Printing of midterm exams", [["DEMO-AST001", "Bond Paper A4", 20, "ream"], ["DEMO-AST002", "Ballpen (Black)", 3, "box"]], "completed", 30],
        ["9002", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Laboratory class presentations", [["DEMO-AST007", "Projector", 1, "unit"]], "released", 12],
        ["9003", B, "College of Engineering", "Maria Lopez", "Department Secretary", "Office filing", [["DEMO-AST003", "Folder (Long)", 5, "pack"], ["DEMO-AST005", "Stapler Pins", 4, "box"]], "ready", 8],
        ["9004", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Department meeting supplies", [["DEMO-AST001", "Bond Paper A4", 5, "ream"]], "director", 6],
        ["9005", B, "College of Engineering", "Maria Lopez", "Department Secretary", "New faculty office setup", [["DEMO-AST008", "Office Chair", 2, "unit"], ["DEMO-AST006", "Laptop", 1, "unit"]], "audsign", 5],
        ["9006", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Enrollment forms", [["DEMO-AST001", "Bond Paper A4", 10, "ream"]], "review", 3],
        ["9007", B, "College of Engineering", "Maria Lopez", "Department Secretary", "Printer maintenance", [["DEMO-AST004", "Printer Ink (Black)", 2, "bottle"]], "dept", 2],
        ["9008", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Request for extra chairs", [["DEMO-AST008", "Office Chair", 30, "unit"]], "rejected", 10],
        ["9009", B, "College of Engineering", "Maria Lopez", "Department Secretary", "Seminar kit", [["DEMO-AST002", "Ballpen (Black)", 2, "box"]], "draft", 1],
        ["9010", A, "College of Computer Studies", "Denriel Dinogan", "Faculty", "Quiz materials", [["DEMO-AST002", "Ballpen (Black)", 10, "box"]], "partial", 9]
    ];

    const all = wfLoadAll();

    const forms = defs.map(function (d, i) {

        const days = d[8], stage = d[7], no = yy + "-" + d[0];
        const f = {
            id: "DEMO-REQ-" + d[0],
            demo: true,
            type: "requisition",
            controlNo: no,
            header: { department: d[2], section: "", month: "", date: demoDaysAgo(days).slice(0, 10), representativeName: d[3], position: d[4], purpose: d[5] },
            items: d[6].map(function (x) { return { assetId: x[0], name: "", particulars: x[1], qty: String(x[2]), unit: x[3], price: "", amount: 0, lastRequested: "", receivedBy: "" }; }),
            total: 0,
            requesterEmail: d[1],
            submittedBy: d[1],
            dateCreated: demoDaysAgo(days),
            sig: { deptHead: null, auditor: null, director: null },
            review: null, approval: null, release: null, acknowledgment: null,
            statusHistory: []
        };

        function push(status, by, daysBack, note) {
            f.status = status;
            f.statusHistory.push({ status: status, by: by, date: demoDaysAgo(Math.max(0, days - daysBack), 10), note: note || "" });
        }

        if (stage === "draft") { push(WF.DRAFT, d[1], 0, "Saved as draft"); return f; }

        push(WF.SUBMITTED, d[1], 0, "Submitted by requester");
        push(WF.PEND_DEPT, "system", 0);
        if (stage === "dept") return f;

        const deptName = d[2].indexOf("Computer") !== -1 ? "Dr. Elena Cruz" : "Engr. Roberto Santos";
        f.sig.deptHead = { name: deptName, image: demoSignature(deptName), method: i % 2 ? "uploaded" : "drawn", at: demoDaysAgo(Math.max(0, days - 1), 11) };
        push(WF.PEND_REVIEW, d[1], 1, "Department Head signature completed");
        if (stage === "review") return f;

        f.review = { by: aud, byEmail: "auditor@neu.edu.ph", at: demoDaysAgo(Math.max(0, days - 2), 9), notes: "" };
        push(WF.PEND_AUD_SIGN, "auditor@neu.edu.ph", 2, "Items and quantities reviewed");
        if (stage === "audsign") return f;

        f.sig.auditor = { name: aud, email: "auditor@neu.edu.ph", image: demoSignature(aud), method: "drawn", at: demoDaysAgo(Math.max(0, days - 2), 14) };
        push(WF.PEND_DIRECTOR, "auditor@neu.edu.ph", 2, "Auditor signature completed");
        if (stage === "director") return f;

        if (stage === "rejected") {
            f.approval = { decision: "Rejected", by: admin, byEmail: "admin@neu.edu.ph", at: demoDaysAgo(Math.max(0, days - 3), 9), reason: "Requested quantity is more than the available stock." };
            push(WF.REJECTED, "admin@neu.edu.ph", 3, "Rejected by the Director");
            return f;
        }

        f.approval = { decision: "Approved", by: admin, byEmail: "admin@neu.edu.ph", at: demoDaysAgo(Math.max(0, days - 3), 9), reason: "" };
        f.sig.director = { name: admin, email: "admin@neu.edu.ph", image: demoSignature(admin), method: "drawn", at: demoDaysAgo(Math.max(0, days - 3), 9) };
        push(WF.APPROVED, "admin@neu.edu.ph", 3, "Approved by the Director");
        push(WF.READY, "system", 3, "All three signatures complete and approved");
        if (stage === "ready") return f;

        // one release batch (a partial one for stage "partial"); the units of the demo projector are the first Assigned unit
        const partial = stage === "partial";
        const relAt = demoDaysAgo(Math.max(0, days - 4), 10);
        const lines = f.items.map(function (it, idx) {
            const asked = parseFloat(it.qty);
            return { index: idx, assetId: it.assetId, name: it.particulars, unit: it.unit, requested: asked, released: partial ? 6 : asked, unitIds: it.assetId === "DEMO-AST007" ? ["DEMO-AST007-U001"] : [] };
        });
        const batch = { no: no + "-R1", at: relAt, by: staff, byEmail: "staff@neu.edu.ph", note: "", receiptNo: "", receiptId: "", acknowledgedAt: null, acknowledgedBy: "", lines: lines };
        f.releases = [batch];
        f.release = { at: relAt, by: staff, byEmail: "staff@neu.edu.ph", lines: lines.map(function (l) { return { name: l.name, unit: l.unit, requested: l.requested, released: l.released, unitIds: l.unitIds }; }) };
        f.stockApplied = true;

        if (partial) { push(WF.PARTIAL, "staff@neu.edu.ph", 4, "Release " + batch.no + " by " + staff + ": part of the items"); return f; }

        push(WF.RELEASED, "staff@neu.edu.ph", 4, "Items released by " + staff);
        if (stage === "released") return f;

        batch.acknowledgedAt = demoDaysAgo(Math.max(0, days - 5), 15);
        batch.acknowledgedBy = d[3];
        f.acknowledgment = { at: batch.acknowledgedAt, by: d[3], byEmail: d[1] };
        push(WF.COMPLETED, d[1], 5, "Receipt confirmed by the requester");
        return f;

    });

    // the acknowledgment receipt (PROP-ARII) of every demo release: demo records, numbered yy-9501...
    let rcNo = 9500;
    forms.forEach(function (f) {
        (f.releases || []).forEach(function (b) {
            rcNo++;
            const rc = {
                id: "DEMO-RC-" + rcNo, demo: true, type: "receipt", controlNo: yy + "-" + rcNo,
                header: { name: f.header.representativeName, department: f.header.department },
                items: b.lines.filter(function (l) { return l.released > 0; }).map(function (l) {
                    return { qty: String(l.released), unit: l.unit, item: l.name, assetId: l.assetId, description: (l.unitIds.length ? "Units: " + l.unitIds.join(", ") + ". " : "") + "Requisition " + f.controlNo + ", release " + b.no };
                }),
                total: 0, status: "Released", requesterEmail: f.requesterEmail, receiverEmail: f.requesterEmail, issuedBy: "staff@neu.edu.ph", issuedByName: staff,
                source: "release", autoRelease: true, requisitionNo: f.controlNo, releaseNo: b.no, stockApplied: true,
                statusHistory: [{ status: "Released", by: "staff@neu.edu.ph", date: b.at }], dateCreated: b.at
            };
            if (b.acknowledgedAt) rc.acknowledged = { at: b.acknowledgedAt, by: b.acknowledgedBy };
            b.receiptNo = rc.controlNo;
            b.receiptId = rc.id;
            all.push(rc);
        });
    });

    forms.forEach(function (f) {
        // never replace a real requisition with the same number
        const clash = all.some(function (x) { return x.type === "requisition" && x.controlNo === f.controlNo && !x.demo; });
        if (!clash && !all.some(function (x) { return x.id === f.id; })) all.push(f);
    });
    wfSaveAll(all);

    // ----- notifications and simulated emails that match the records (all marked demo) -----
    forms.forEach(function (f) {
        const ref = { type: "requisition", controlNo: f.controlNo };
        if (f.status === WF.PEND_REVIEW) { addNotification("auditor", "Requisition " + f.controlNo + " is awaiting Auditor review", ref, true); wfSimulateEmail("auditor", "Requisition " + f.controlNo + " is awaiting Auditor review", f); }
        if (f.status === WF.PEND_AUD_SIGN) addNotification("auditor", "Requisition " + f.controlNo + " was reviewed. It needs your signature.", ref, true);
        if (f.status === WF.PEND_DIRECTOR) { addNotification("admin", "Requisition " + f.controlNo + " is awaiting Director approval", ref, true); wfSimulateEmail("admin", "Requisition " + f.controlNo + " is awaiting Director approval", f); }
        if (f.status === WF.READY) {
            addNotification(f.requesterEmail, "Your requisition " + f.controlNo + " is ready for release.", ref, true);
            addNotification("admin", "Requisition " + f.controlNo + " is ready for release", ref, true);
            wfSimulateEmail(f.requesterEmail, "Your requisition " + f.controlNo + " is ready for release.", f);
        }
        if (f.status === WF.PARTIAL) addNotification(f.requesterEmail, "Items of your requisition " + f.controlNo + " were released (receipt " + f.releases[0].receiptNo + "). Some items are still to be released.", ref, true);
        if (f.status === WF.RELEASED) addNotification(f.requesterEmail, "Items of your requisition " + f.controlNo + " were released. Please confirm receipt.", ref, true);
        if (f.status === WF.REJECTED) addNotification(f.requesterEmail, "Your requisition " + f.controlNo + " was rejected: " + f.approval.reason, ref, true);
    });
    assetDefs.filter(function (a) { return a.type === "Consumable" && (a.quantity <= 0 || a.quantity <= a.reorderLevel); }).forEach(function (a) {
        addNotification("admin", "Low stock: " + a.name + " (" + a.quantity + " " + a.unit + " left)", null, true);
    });

}

function seedDemoData() {

    try {
        if (localStorage.getItem(DEMO_FLAG)) return;                       // already decided: a normal reload changes nothing
        if (typeof loadUsers !== "function" || typeof wfSaveAll !== "function" || typeof loadAssets !== "function") return;

        loadUsers();                                                       // makes sure the default accounts exist

        // a browser that already got the first demo version keeps exactly what it has
        if (localStorage.getItem(DEMO_OLD_FLAG)) { localStorage.setItem(DEMO_FLAG, "inherited"); return; }

        // real data present: do not seed anything (checked again on the next load, nothing is written)
        if (demoHasRealData()) return;

        demoCreateAll();
        localStorage.setItem(DEMO_FLAG, "1");
    } catch (e) {
        console.warn("Demo data was not created:", e);
    }

}

// Which REAL records refer to demo equipment? (they are never deleted; the list is shown before a demo reset or removal)
function demoReferenceReport() {

    const list = [];
    const isDemoRef = function (id) { return String(id || "").toUpperCase().indexOf("DEMO-") === 0; };

    demoReadList("forms").forEach(function (f) {
        if (f.demo) return;
        const hit = [];
        (f.items || []).forEach(function (it) {
            if (isDemoRef(it.assetId)) hit.push(it.assetId);
            (it.unitIds || []).forEach(function (u) { if (isDemoRef(u)) hit.push(u); });
        });
        ((f.release || {}).lines || []).forEach(function (l) { (l.unitIds || []).forEach(function (u) { if (isDemoRef(u)) hit.push(u); }); });
        if (hit.length) list.push({ kind: f.type, no: f.controlNo, what: Array.from(new Set(hit)).join(", ") });
    });

    demoReadList("pulloutRecords").forEach(function (r) {
        if (r.demo) return;
        const hit = (r.unitIds || []).filter(isDemoRef);
        if (hit.length) list.push({ kind: "pull-out record", no: r.no, what: hit.join(", ") });
    });

    return list;

}

// Makes the demo records when there are none yet. Real records are never touched.
function createDemoData() {

    if (demoReadList("assets").some(function (a) { return a.demo; }) || demoReadList("forms").some(function (f) { return f.demo; })) {
        return { ok: false, message: "Demo data already exists. Use Reset demo data to make it again." };
    }

    demoCreateAll();
    localStorage.setItem(DEMO_FLAG, "1");
    return { ok: true };

}

// Removes ONLY records marked demo: true. Returns how many were removed.
function clearDemoData() {
    const removed = demoRemoveAll();
    console.info("Demo records removed:", removed);
    return removed;
}

// Removes the demo records and creates them again. Real records are never touched.
function resetDemoData() {
    const removed = demoRemoveAll();
    demoCreateAll();
    localStorage.setItem(DEMO_FLAG, "1");
    // a REAL requisition that released demo equipment: make the demo units / demo stock agree with its release records
    if (typeof releaseReapplyAfterReset === "function") releaseReapplyAfterReset();
    // an older real pull-out record that points at demo units: make the units agree with the record
    if (typeof pulloutReapplyAfterReset === "function") pulloutReapplyAfterReset();
    console.info("Demo data reset. Removed:", removed);
    location.reload();
}

seedDemoData();
