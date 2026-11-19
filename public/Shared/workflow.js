// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED REQUISITION WORKFLOW (frontend simulation)
//
//   Requester submits
//     -> Department Head signs (name typed by hand, no account)
//     -> Auditor reviews, then signs        (name = Auditor account)
//     -> Director approves or rejects, signs (name = Admin account, printed as "Director")
//     -> Ready for Release (only when the 3 signatures are complete AND approved)
//     -> Staff / Admin RELEASE the items    (stock goes down only now)
//     -> Requester confirms receipt         -> Completed
//
// Only THREE signatories: Department Head, Auditor, Director. The Requester / Representative is NOT one.
// Approval, signatures and the actual release are separate steps.
//
// NOTE: the role checks here only simulate permissions in the browser. Real authorization
// (Laravel policies, hashed passwords, etc.) is for the backend phase.
//
// Needs (load before): users.js, permissions.js, audit.js, realtime.js, stock.js
// ========================================

const WF_KEY = "forms";

const WF = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    PEND_DEPT: "Pending Department Head Signature",
    PEND_REVIEW: "Pending Auditor Review",
    PEND_AUD_SIGN: "Pending Auditor Signature",
    PEND_DIRECTOR: "Pending Director Approval",
    APPROVED: "Approved",
    READY: "Ready for Release",
    PARTIAL: "Partially Released",
    RELEASED: "Released",
    COMPLETED: "Completed",
    REJECTED: "Rejected"
};

const WF_STATUSES = [WF.DRAFT, WF.SUBMITTED, WF.PEND_DEPT, WF.PEND_REVIEW, WF.PEND_AUD_SIGN, WF.PEND_DIRECTOR,
                     WF.APPROVED, WF.READY, WF.PARTIAL, WF.RELEASED, WF.COMPLETED, WF.REJECTED];

// What each status means (also used by the chat assistant)
const WF_STATUS_HELP = {};
WF_STATUS_HELP[WF.DRAFT] = "Saved but not submitted yet. Only the Requester sees it.";
WF_STATUS_HELP[WF.SUBMITTED] = "The Requester submitted the requisition.";
WF_STATUS_HELP[WF.PEND_DEPT] = "Waiting for the Department Head to sign (name typed by hand, E-Sign or E-Upload).";
WF_STATUS_HELP[WF.PEND_REVIEW] = "The Department Head signed. The Auditor has not reviewed the items and quantities yet.";
WF_STATUS_HELP[WF.PEND_AUD_SIGN] = "The Auditor reviewed it and still has to sign.";
WF_STATUS_HELP[WF.PEND_DIRECTOR] = "Waiting for the Director (Admin account) to approve or reject, and sign.";
WF_STATUS_HELP[WF.APPROVED] = "The Director approved it. It becomes Ready for Release once all three signatures are complete.";
WF_STATUS_HELP[WF.READY] = "Approved and fully signed. Staff can release the items.";
WF_STATUS_HELP[WF.PARTIAL] = "Staff released part of the items. The rest is still waiting (stock or units). Each release has its own receipt.";
WF_STATUS_HELP[WF.RELEASED] = "Staff released the items. Stock went down. Waiting for the Requester to confirm receipt.";
WF_STATUS_HELP[WF.COMPLETED] = "The Requester confirmed receipt. Nothing else to do.";
WF_STATUS_HELP[WF.REJECTED] = "The Director rejected the requisition. The reason is saved in the record.";

// the three signatories, in order
const WF_SIGNERS = [
    { key: "deptHead", label: "Department Head", nameFrom: "Typed by hand (no system account)" },
    { key: "auditor", label: "School Auditor", nameFrom: "Auditor account" },
    { key: "director", label: "Director", nameFrom: "Admin account" }
];

// ----- storage -----
function wfLoadAll() {
    try { return JSON.parse(localStorage.getItem(WF_KEY)) || []; } catch (e) { return []; }
}

function wfSaveAll(list) {
    localStorage.setItem(WF_KEY, JSON.stringify(list));
}

// requisitions only (the workflow does not apply to pull-out requests or receipts)
function wfRequisitions() {
    return wfLoadAll().filter(function (f) { return f.type === "requisition"; });
}

function wfFind(id) {
    return wfLoadAll().find(function (f) { return f.id === id; }) || null;
}

function wfFindByNo(controlNo) {
    return wfRequisitions().find(function (f) { return f.controlNo === controlNo; }) || null;
}

// Older requisitions (made before this workflow) get the new status names once.
function wfMigrate() {

    const all = wfLoadAll();
    let changed = false;
    const now = new Date().toISOString();

    // an old signature ({at, by}) becomes a "legacy" signature: name and date kept, no image (it was on paper)
    function legacySig(x) {
        return x ? { name: x.by || x.name || "(recorded on the paper form)", image: "", method: "legacy", at: x.at || now } : null;
    }

    all.forEach(function (f) {

        if (f.type !== "requisition" || f.sig) return;

        const old = f.signatures || {};
        const oldDean = legacySig(old.dean), oldAud = legacySig(old.auditing), oldCust = legacySig(old.custodian);
        const complete = !!(oldDean && oldAud && oldCust);

        f.sig = { deptHead: null, auditor: null, director: null };
        f.statusHistory = f.statusHistory || [];
        changed = true;

        function push(status, note) { f.status = status; f.statusHistory.push({ status: status, by: "system", date: now, note: note }); }

        if (f.status === "Approved" && complete) {
            // approved AND fully signed under the old process: keep it, it is ready for release
            f.sig = { deptHead: oldDean, auditor: oldAud, director: oldCust };
            f.review = { by: oldAud.name, byEmail: "", at: oldAud.at, notes: "Recorded under the previous paper process", legacy: true };
            f.approval = { decision: "Approved", by: oldCust.name, byEmail: "", at: oldCust.at, reason: "", legacy: true };
            push(WF.READY, "Approved and signed under the previous process; moved to the new workflow");
        } else if (f.status === "Released") {
            if (complete) f.sig = { deptHead: oldDean, auditor: oldAud, director: oldCust };
            f.approval = { decision: "Approved", by: (oldCust && oldCust.name) || "(previous process)", byEmail: "", at: now, reason: "", legacy: true };
            f.statusHistory.push({ status: WF.RELEASED, by: "system", date: now, note: "Released under the previous process" });
        } else if (f.status === "Rejected") {
            f.approval = { decision: "Rejected", by: "(previous process)", byEmail: "", at: now, reason: f.rejectReason || "Rejected under the previous process", legacy: true };
            f.statusHistory.push({ status: WF.REJECTED, by: "system", date: now, note: "Rejected under the previous process" });
        } else if (f.status === "Pending" || f.status === "Approved") {
            // not fully signed under the old process: the signatures that exist are kept, the rest is collected in the new order
            if (oldDean) f.sig.deptHead = oldDean;
            push(f.sig.deptHead ? WF.PEND_REVIEW : WF.PEND_DEPT,
                 (f.status === "Approved" ? "Was approved but not fully signed under the previous process" : "Moved to the new workflow"));
        }

    });

    if (changed) wfSaveAll(all);

}

// ----- helpers -----
function wfNow() { return new Date().toISOString(); }

function wfMe() { return (sessionStorage.getItem("userEmail") || "").toLowerCase(); }

function wfMyName() {
    const u = userByEmail(wfMe());
    return u ? u.name : (wfMe() || "Unknown");
}

function wfRole() { return typeof currentRole === "function" ? currentRole() : ""; }

function wfSigCount(f) {
    const s = f.sig || {};
    return WF_SIGNERS.filter(function (x) { return s[x.key]; }).length;
}

function wfAllSigned(f) { return wfSigCount(f) === WF_SIGNERS.length; }

function wfApproved(f) { return !!(f.approval && f.approval.decision === "Approved"); }

// Ready for Release ONLY when: Department Head signed + Auditor reviewed and signed + Director approved and signed
function wfReadyForRelease(f) {
    return wfAllSigned(f) && wfApproved(f) && !!(f.review && f.review.at);
}

function wfPush(f, status, by, note) {
    f.status = status;
    f.statusHistory = (f.statusHistory || []).concat([{ status: status, by: by, date: wfNow(), note: note || "" }]);
}

function wfAudit(activity) {
    if (typeof tryAuditLog === "function") tryAuditLog(wfMe() || "unknown", wfRole() || "-", activity);
}

// kind = the group in System Settings > Notifications (submitted, signatures, decisions, ready, release, acknowledged)
function wfNotify(to, message, f, kind) {
    if (kind && typeof notifyAllowed === "function" && !notifyAllowed("workflow." + kind)) return;     // this kind is switched off
    if (typeof addNotification === "function") addNotification(to, message, { type: "requisition", controlNo: f.controlNo }, !!f.demo);
    wfSimulateEmail(to, message, f);
}

// ----- SIMULATED EMAIL NOTIFICATIONS (frontend only) -----
// No real email is sent. Each notification also creates a "simulated email" saved in the browser,
// so the screens can show what the Laravel mail system will send later.
const WF_EMAIL_KEY = "simEmails";

function wfEmailAddresses(to) {
    const users = (typeof loadUsers === "function") ? loadUsers() : [];
    if (to === "admin") return users.filter(function (u) { return (u.role === "Administrator" || u.role === "Staff") && u.status === "Active"; }).map(function (u) { return u.email; });
    if (to === "auditor") return users.filter(function (u) { return u.role === "Auditor" && u.status === "Active"; }).map(function (u) { return u.email; });
    return to ? [String(to)] : [];
}

function wfSimulateEmail(to, message, f) {

    // System Settings > Notifications: simulated emails can be switched off (nothing is ever really sent)
    if (typeof notifyAllowed === "function" && !notifyAllowed("email")) return;

    let list = [];
    try { list = JSON.parse(localStorage.getItem(WF_EMAIL_KEY)) || []; } catch (e) { list = []; }

    wfEmailAddresses(to).forEach(function (addr) {
        list.push({
            id: Date.now() + "-" + Math.floor(Math.random() * 100000),
            date: wfNow(),
            to: addr,
            subject: "[NEU CMS] Requisition " + f.controlNo,
            body: message + "\n\nOpen the Custodian Management System to continue.",
            controlNo: f.controlNo,
            demo: !!f.demo,
            simulated: true
        });
    });

    while (list.length > 300) list.shift();

    try { localStorage.setItem(WF_EMAIL_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }

}

// Emails addressed to the person logged in (newest first)
function wfMyEmails() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(WF_EMAIL_KEY)) || []; } catch (e) { list = []; }
    return list.filter(function (m) { return String(m.to).toLowerCase() === wfMe(); }).reverse();
}

// Window that shows the simulated emails of the logged-in person
function wfOpenEmailOutbox() {

    const mails = wfMyEmails();
    const body = '<p class="wf-note">Simulated emails. Nothing is sent. This shows what the future Laravel mail service will send to ' + wfEsc(wfMe()) + ".</p>" +
        (mails.length ? mails.slice(0, 30).map(function (m) {
            return '<div class="wf-mail"><b>' + wfEsc(m.subject) + "</b><small>" + wfEsc(wfFormatDate(m.date, true)) + " &middot; to " + wfEsc(m.to) +
                "</small><div>" + wfEsc(m.body).replace(/\n/g, "<br>") + "</div></div>";
        }).join("") : '<div class="wf-empty">No simulated emails yet.</div>');

    wfModal("Simulated Email Notifications", body, [{ text: "Close", onClick: wfCloseModal }], true);

}

// Run a change on one saved form, then save. Returns {ok, message, form}
function wfUpdate(id, change) {

    const all = wfLoadAll();
    const f = all.find(function (x) { return x.id === id; });

    if (!f || f.type !== "requisition") return { ok: false, message: "Requisition not found." };

    const result = change(f, all);

    if (result && result.ok === false) return result;

    wfSaveAll(all);
    return { ok: true, form: f };

}

function wfDeny(message) { return { ok: false, message: message }; }

// ----- 1. Requester -----
// Creates the workflow part of a new requisition (called by the Requester form).
function wfInitRequisition(record, asDraft) {

    record.sig = { deptHead: null, auditor: null, director: null };
    record.review = null;
    record.approval = null;
    record.release = null;
    record.acknowledgment = null;
    record.submittedBy = record.requesterEmail;           // the logged-in account (NOT a signatory)
    record.statusHistory = [];

    if (asDraft) {
        wfPush(record, WF.DRAFT, record.requesterEmail, "Saved as draft");
    } else {
        wfPush(record, WF.SUBMITTED, record.requesterEmail, "Submitted by requester");
        wfPush(record, WF.PEND_DEPT, "system", "Waiting for the Department Head signature");
    }

    return record;

}

function wfAnnounceSubmission(f) {
    wfAudit("Submitted Requisition " + f.controlNo);
    wfNotify("admin", "New requisition " + f.controlNo + " submitted by " + (f.requesterEmail || "a requester"), f, "submitted");
}

function wfSubmitDraft(id) {

    return wfUpdate(id, function (f) {
        if (f.status !== WF.DRAFT) return wfDeny("Only a draft can be submitted.");
        if (wfMe() !== String(f.requesterEmail).toLowerCase()) return wfDeny("Only the Requester who made this draft can submit it.");
        wfPush(f, WF.SUBMITTED, wfMe(), "Submitted by requester");
        wfPush(f, WF.PEND_DEPT, "system", "Waiting for the Department Head signature");
        wfAnnounceSubmission(f);
    });

}

// ----- 2. Department Head (no account: name typed by the requester) -----
// sig = { name, image, method }
function wfSignDeptHead(id, sig) {

    return wfUpdate(id, function (f) {

        if (wfRole() !== "Requester" || wfMe() !== String(f.requesterEmail).toLowerCase()) {
            return wfDeny("Only the Requester of this requisition can record the Department Head signature.");
        }
        if (f.status !== WF.PEND_DEPT) return wfDeny("This requisition is not waiting for the Department Head signature.");
        if (!sig || !sig.name || !sig.image) return wfDeny("The Department Head name and signature are required.");

        f.sig.deptHead = { name: sig.name, image: sig.image, method: sig.method, at: wfNow() };
        wfPush(f, WF.PEND_REVIEW, wfMe(), "Department Head signature completed (" + sig.method + ")");

        wfAudit("Department Head signature completed on Requisition " + f.controlNo + " (" + sig.method + ")");
        wfNotify("admin", "Department Head signature completed on requisition " + f.controlNo, f, "signatures");
        wfNotify("auditor", "Requisition " + f.controlNo + " is awaiting Auditor review", f, "signatures");
        wfNotify(f.requesterEmail, "Department Head signature completed on your requisition " + f.controlNo + ". It is now with the Auditor.", f, "signatures");

    });

}

// The Requester can remove the Department Head signature only while the Auditor has not reviewed yet.
function wfClearDeptHead(id) {

    return wfUpdate(id, function (f) {
        if (wfRole() !== "Requester" || wfMe() !== String(f.requesterEmail).toLowerCase()) return wfDeny("Only the Requester can do this.");
        if (f.status !== WF.PEND_REVIEW) return wfDeny("The signature can only be replaced before the Auditor starts the review.");
        f.sig.deptHead = null;
        wfPush(f, WF.PEND_DEPT, wfMe(), "Department Head signature cleared for replacement");
        wfAudit("Cleared the Department Head signature on Requisition " + f.controlNo);
    });

}

// ----- 3. Auditor -----
function wfAuditorReview(id, notes) {

    return wfUpdate(id, function (f) {
        if (wfRole() !== "Auditor") return wfDeny("Only an Auditor can review a requisition.");
        if (f.status !== WF.PEND_REVIEW) return wfDeny("This requisition is not waiting for Auditor review.");

        const acct = userByEmail(wfMe());
        f.review = { by: acct ? acct.name : wfMyName(), byEmail: wfMe(), at: wfNow(), notes: notes || "" };
        wfPush(f, WF.PEND_AUD_SIGN, wfMe(), "Items and quantities reviewed" + (notes ? ": " + notes : ""));

        wfAudit("Reviewed Requisition " + f.controlNo + " (items and quantities)");
        wfNotify(f.requesterEmail, "Your requisition " + f.controlNo + " was reviewed by the Auditor.", f, "signatures");
    });

}

// The name comes from the Auditor account, never from the form.
function wfSignAuditor(id, sig) {

    return wfUpdate(id, function (f) {
        if (wfRole() !== "Auditor") return wfDeny("Only an Auditor can sign as Auditor.");
        if (f.status !== WF.PEND_AUD_SIGN) return wfDeny("The requisition must be reviewed first.");
        if (!sig || !sig.image) return wfDeny("A signature is required.");

        const acct = userByEmail(wfMe());
        f.sig.auditor = { name: acct ? acct.name : sig.name, email: wfMe(), image: sig.image, method: sig.method, at: wfNow() };
        wfPush(f, WF.PEND_DIRECTOR, wfMe(), "Auditor signature completed (" + sig.method + ")");

        wfAudit("Auditor signature completed on Requisition " + f.controlNo + " (" + sig.method + ")");
        wfNotify("admin", "Requisition " + f.controlNo + " is awaiting Director approval", f, "signatures");
        wfNotify(f.requesterEmail, "Auditor signature completed on your requisition " + f.controlNo + ". Waiting for Director approval.", f, "signatures");
    });

}

// ----- 4. Director = the Admin account -----
// decision: "Approved" | "Rejected".  Staff and the Auditor cannot do this.
function wfDirectorDecision(id, decision, sig, reason) {

    return wfUpdate(id, function (f) {

        if (wfRole() !== "Administrator") return wfDeny("Only the Admin account (Director) can approve or reject a requisition.");
        if (f.status !== WF.PEND_DIRECTOR) return wfDeny("This requisition is not waiting for Director approval.");

        const director = userByEmail(wfMe());
        const name = director ? director.name : directorName();

        if (decision === "Rejected") {

            if (!reason || !reason.trim()) return wfDeny("Please write the reason for the rejection.");

            f.approval = { decision: "Rejected", by: name, byEmail: wfMe(), at: wfNow(), reason: reason.trim() };
            wfPush(f, WF.REJECTED, wfMe(), "Rejected by the Director: " + reason.trim());

            wfAudit("Rejected Requisition " + f.controlNo + ": " + reason.trim());
            wfNotify(f.requesterEmail, "Your requisition " + f.controlNo + " was rejected: " + reason.trim(), f, "decisions");
            return;

        }

        if (!sig || !sig.image) return wfDeny("The Director signature is required to approve.");

        f.approval = { decision: "Approved", by: name, byEmail: wfMe(), at: wfNow(), reason: "" };
        f.sig.director = { name: name, email: wfMe(), image: sig.image, method: sig.method, at: wfNow() };
        wfPush(f, WF.APPROVED, wfMe(), "Approved by the Director");
        wfAudit("Approved Requisition " + f.controlNo + " (Director)");
        wfNotify(f.requesterEmail, "Your requisition " + f.controlNo + " was approved by the Director.", f, "decisions");

        // approval, signatures and release are separate steps: it is Ready only if everything is complete
        if (wfReadyForRelease(f)) {
            wfPush(f, WF.READY, "system", "All three signatures complete and approved");
            wfAudit("Requisition " + f.controlNo + " is Ready for Release");
            wfNotify(f.requesterEmail, "Your requisition " + f.controlNo + " is ready for release.", f, "ready");
            wfNotify("admin", "Requisition " + f.controlNo + " is ready for release", f, "ready");
        }

    });

}

// ----- 5/6. RELEASE: Staff release the items, in one or more batches -----
// Every batch has its own number (26-001-R1, R2 ...), its own acknowledgment receipt (PROP-ARII) and its own history.
// The Admin supervises (sees the queue and every record); only Staff make the actual release.

// how much of each item was released so far (all batches together)
function wfReleasedTotals(f) {
    const tot = f.items.map(function () { return 0; });
    (f.releases || []).forEach(function (b) { b.lines.forEach(function (l) { tot[l.index] = (tot[l.index] || 0) + (parseFloat(l.released) || 0); }); });
    // an older single release (made before the batches existed) is the whole release of its lines
    if (!(f.releases || []).length && f.release && f.release.lines) f.release.lines.forEach(function (l, i) { tot[i] = parseFloat(l.released) || 0; });
    return tot;
}

function wfRemaining(f) {
    const t = wfReleasedTotals(f);
    return f.items.map(function (it, i) { return Math.max(0, (parseFloat(it.qty) || 0) - t[i]); });
}

function wfFullyReleased(f) {
    return wfRemaining(f).every(function (r) { return r <= 0; });
}

// The release queue: ONLY requisitions with the three signatures, the Auditor review and the Director approval complete,
// and with items still to release (Ready for Release or Partially Released).
function wfQueueRows() {
    return wfRequisitions().filter(function (f) {
        return (f.status === WF.READY || f.status === WF.PARTIAL) && wfReadyForRelease(f) && !wfFullyReleased(f);
    });
}

// receipt number: 26-007 (real) or 26-9501 (receipts of demo requisitions, a separate series)
function wfNextReceiptNo(all, demo) {

    const yy = String(new Date().getFullYear()).slice(-2);
    let highest = demo ? 9500 : 0;

    if (!demo) {
        try { highest = (JSON.parse(localStorage.getItem("formCounters")) || {})["receipt-" + yy] || 0; } catch (e) { highest = 0; }
    }

    all.forEach(function (r) {
        if (r.type !== "receipt") return;
        const m = /^(\d{2})-(\d+)$/.exec(r.controlNo || "");
        if (!m || m[1] !== yy) return;
        const n = parseInt(m[2], 10);
        if (demo ? (r.demo && n > 9500) : (!r.demo && n < 9000)) highest = Math.max(highest, n);
    });

    return yy + "-" + String(highest + 1).padStart(demo ? 4 : 3, "0");

}

// The issuance record of one release: an Acknowledgment Receipt (PROP-ARII) with the items and quantities really released.
function wfCreateReceipt(f, batch, all) {

    const no = wfNextReceiptNo(all, !!f.demo);
    const me = userByEmail(wfMe());

    const receipt = {
        id: "rc-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
        type: "receipt",
        controlNo: no,
        header: { name: (f.header || {}).representativeName || f.requesterEmail, department: (f.header || {}).department || "" },
        items: batch.lines.filter(function (l) { return l.released > 0; }).map(function (l) {
            return { qty: String(l.released), unit: l.unit, item: l.name, assetId: l.assetId || "",
                     description: (l.unitIds && l.unitIds.length ? "Units: " + l.unitIds.join(", ") + ". " : "") + "Requisition " + f.controlNo + ", release " + batch.no };
        }),
        total: 0,
        status: "Released",
        requesterEmail: f.requesterEmail,
        receiverEmail: f.requesterEmail,
        issuedBy: wfMe(),
        issuedByName: me ? me.name : wfMe(),
        source: "release",
        autoRelease: true,                    // made by the release, not typed by hand
        requisitionNo: f.controlNo,
        releaseNo: batch.no,
        stockApplied: true,
        statusHistory: [{ status: "Released", by: wfMe(), date: batch.at }],
        dateCreated: batch.at,
        demo: !!f.demo
    };

    all.push(receipt);

    // real receipts move the receipt counter, so the numbers are never used twice
    if (!f.demo) {
        try {
            const c = JSON.parse(localStorage.getItem("formCounters")) || {};
            const m = /^(\d{2})-(\d+)$/.exec(no);
            c["receipt-" + m[1]] = Math.max(c["receipt-" + m[1]] || 0, parseInt(m[2], 10));
            localStorage.setItem("formCounters", JSON.stringify(c));
        } catch (e) { /* the number is still unique because the receipts are counted too */ }
    }

    return receipt;

}

// lines = [{ index, qty, unitIds }]   qty = quantity of THIS release; for equipment with units the quantity is the number of units selected
// opts  = { token, note }             token = made when the release window opens: the same release cannot be saved twice
function wfRelease(id, lines, opts) {

    opts = opts || {};

    return wfUpdate(id, function (f, all) {

        if (wfRole() !== "Staff") return wfDeny("Only Staff make the actual release. The Admin supervises the release queue.");
        if (f.status !== WF.READY && f.status !== WF.PARTIAL) return wfDeny("Only a requisition that is Ready for Release or Partially Released can be released.");
        if (!wfReadyForRelease(f)) return wfDeny("The three signatures and the Director approval must be complete before release.");
        if (opts.token && (f.releaseTokens || []).indexOf(opts.token) !== -1) return wfDeny("This release was already recorded. Nothing was released twice.");

        const remaining = wfRemaining(f);
        const assetList = typeof loadAssets === "function" ? loadAssets() : [];
        const released = [];
        let total = 0;

        lines = (lines || []).slice().sort(function (x, y) { return x.index - y.index; });   // the lines follow the order of the items

        const seen = {};

        for (const l of lines) {

            const item = f.items[l.index];
            if (!item) return wfDeny("Unknown requisition line " + (l.index + 1) + ".");
            if (seen[l.index]) return wfDeny("Line " + (l.index + 1) + " is given twice.");
            seen[l.index] = true;

            const asset = item.assetId ? assetList.find(function (a) { return a.id === item.assetId; }) : null;
            const tracked = !!asset && typeof usesUnitRegistry === "function" && usesUnitRegistry(asset);
            const q = tracked ? (l.unitIds || []).length : parseFloat(l.qty);

            if (isNaN(q) || q < 0) return wfDeny("The released quantity must be zero or more (line " + (l.index + 1) + ").");
            if (!tracked && q !== Math.floor(q)) return wfDeny("The released quantity must be a whole number (line " + (l.index + 1) + ").");
            if (q > remaining[l.index]) return wfDeny("Line " + (l.index + 1) + ": " + q + " is more than the remaining " + remaining[l.index] + ". Nothing was released.");

            total += q;
            released.push(Object.assign({}, item, { qty: q, requestedQty: parseFloat(item.qty) || 0, lineIndex: l.index }, tracked ? { unitIds: (l.unitIds || []).slice() } : {}));

        }

        if (total <= 0) return wfDeny("Release at least one item.");

        const toApply = released.filter(function (r) { return r.qty > 0; });
        const n = (f.releases || []).length + 1;
        const relNo = f.controlNo + "-R" + n;

        // inventory goes down ONLY now, with the quantity actually released
        if (typeof checkStock === "function" && typeof applyStock === "function") {
            const check = checkStock(toApply, "issue", true);
            if (!check.ok) return wfDeny("Cannot release:\n- " + check.problems.join("\n- "));
            const done = applyStock(toApply, "issue", "Requisition " + f.controlNo + " release " + relNo,
                { ref: f.controlNo, assignedTo: (f.header || {}).representativeName || "", department: (f.header || {}).department || "", note: "Release " + relNo });
            if (done && done.ok === false) return wfDeny("Stock error:\n- " + done.problems.join("\n- "));
            f.stockApplied = true;
        }

        const me = userByEmail(wfMe());
        const at = wfNow();

        const batch = {
            no: relNo, at: at, by: me ? me.name : wfMe(), byEmail: wfMe(), note: String(opts.note || "").trim(), receiptNo: "", receiptId: "",
            acknowledgedAt: null, acknowledgedBy: "",
            lines: released.map(function (r) {
                return { index: r.lineIndex, assetId: r.assetId || "", name: r.particulars || r.name, unit: r.unit, requested: r.requestedQty, released: r.qty, unitIds: r.unitIds || [] };
            })
        };

        const receipt = wfCreateReceipt(f, batch, all);
        batch.receiptNo = receipt.controlNo;
        batch.receiptId = receipt.id;

        f.releases = (f.releases || []).concat([batch]);
        if (opts.token) f.releaseTokens = (f.releaseTokens || []).concat([opts.token]);

        // the cumulative view (older screens read f.release): one line per item, in the order of the items
        const tot = wfReleasedTotals(f);
        f.release = {
            at: at, by: batch.by, byEmail: wfMe(),
            lines: f.items.map(function (it, i) {
                const ids = [];
                f.releases.forEach(function (b) { b.lines.forEach(function (l) { if (l.index === i) (l.unitIds || []).forEach(function (u) { ids.push(u); }); }); });
                return { name: it.particulars || it.name, unit: it.unit, requested: parseFloat(it.qty) || 0, released: tot[i], unitIds: ids };
            })
        };

        const complete = wfFullyReleased(f);
        wfPush(f, complete ? WF.RELEASED : WF.PARTIAL, wfMe(), "Release " + relNo + " by " + batch.by + " (receipt " + receipt.controlNo + ")" + (complete ? ": everything was released" : ": part of the items"));

        wfAudit("Released items of Requisition " + f.controlNo + " (release " + relNo + ", receipt " + receipt.controlNo + "): " +
            batch.lines.filter(function (l) { return l.released > 0; }).map(function (l) { return l.released + " " + (l.unit || "") + " " + l.name + (l.unitIds.length ? " [" + l.unitIds.join(", ") + "]" : ""); }).join("; "));

        const left = wfRemaining(f).reduce(function (a, b) { return a + b; }, 0);
        wfNotify(f.requesterEmail, "Items of your requisition " + f.controlNo + " were released (receipt " + receipt.controlNo + ")." + (complete ? " Please confirm receipt." : " Some items are still to be released. You can confirm what you received."), f, "release");

        f.lastReleaseReceipt = receipt.controlNo;

    });

}

// Staff can close a partially released requisition with its remaining balance not released (a reason is required).
function wfCloseRelease(id, reason) {

    return wfUpdate(id, function (f) {

        if (wfRole() !== "Staff") return wfDeny("Only Staff can close a release.");
        if (f.status !== WF.PARTIAL) return wfDeny("Only a Partially Released requisition can be closed with its balance.");
        if (!reason || !String(reason).trim()) return wfDeny("A reason is required.");

        const left = [];
        wfRemaining(f).forEach(function (r, i) { if (r > 0) left.push(r + " " + (f.items[i].unit || "") + " " + (f.items[i].particulars || f.items[i].name)); });

        f.release = Object.assign({}, f.release, { closedShort: { reason: String(reason).trim(), by: wfMe(), at: wfNow(), left: left } });
        wfPush(f, WF.RELEASED, wfMe(), "Closed with the remaining balance not released: " + String(reason).trim());

        wfAudit("Closed the release of Requisition " + f.controlNo + " with a balance (" + left.join("; ") + "): " + String(reason).trim());
        wfNotify(f.requesterEmail, "The release of your requisition " + f.controlNo + " was closed. Not released: " + left.join("; ") + ". Reason: " + String(reason).trim() + ". Please confirm what you received.", f, "release");

    });

}

// ----- 7. Requester confirms receipt (of one release, or of everything released so far) -----
function wfAcknowledge(id, releaseNo) {

    return wfUpdate(id, function (f, all) {

        if (wfRole() !== "Requester" || wfMe() !== String(f.requesterEmail).toLowerCase()) return wfDeny("Only the Requester of this requisition can confirm receipt.");
        if (f.status !== WF.RELEASED && f.status !== WF.PARTIAL) return wfDeny("There is nothing to confirm yet.");

        const batches = f.releases || [];
        const now = wfNow();

        if (batches.length) {

            const todo = batches.filter(function (b) { return !b.acknowledgedAt && (!releaseNo || b.no === releaseNo); });
            if (!todo.length) return wfDeny(releaseNo ? "This release was already confirmed or does not exist." : "Everything released so far was already confirmed.");

            todo.forEach(function (b) {
                b.acknowledgedAt = now;
                b.acknowledgedBy = wfMyName();
                const rc = all.find(function (x) { return x.id === b.receiptId; });
                if (rc) rc.acknowledged = { at: now, by: wfMyName() };
            });

            wfAudit("Requester confirmed receipt of " + todo.map(function (b) { return b.no; }).join(", ") + " (Requisition " + f.controlNo + ")");

        } else {
            wfAudit("Requester confirmed receipt of Requisition " + f.controlNo);
        }

        // Completed = everything is released AND everything is confirmed
        if (f.status === WF.RELEASED && batches.every(function (b) { return b.acknowledgedAt; })) {
            f.acknowledgment = { at: now, by: wfMyName(), byEmail: wfMe() };
            wfPush(f, WF.COMPLETED, wfMe(), "Receipt confirmed by the requester");
        }

        wfNotify("admin", "Requester acknowledged receipt of requisition " + f.controlNo, f, "acknowledged");

    });

}

// ----- display helpers -----
function wfBadgeClass(status) {
    switch (status) {
        case WF.REJECTED: return "st-rejected";
        case WF.RELEASED: return "st-released";
        case WF.COMPLETED: return "st-completed";
        case WF.READY:
        case WF.PARTIAL:
        case WF.APPROVED: return "st-ready";
        case WF.DRAFT: return "st-draft";
        default: return "st-pending";
    }
}

function wfBadge(status) {
    const d = document.createElement("div");
    d.textContent = status;
    return '<span class="wf-badge ' + wfBadgeClass(status) + '">' + d.innerHTML + "</span>";
}

// Why is it NOT ready for release? Plain sentence (also used by the chat assistant).
function wfWhyNotReady(f) {

    if (f.status === WF.REJECTED) return "It was rejected" + (f.approval && f.approval.reason ? ": " + f.approval.reason : ".");
    if (f.status === WF.RELEASED || f.status === WF.COMPLETED) return "It was already released.";
    if (f.status === WF.READY) return "It IS ready for release.";
    if (f.status === WF.PARTIAL) {
        const left = [];
        wfRemaining(f).forEach(function (r, i) { if (r > 0) left.push(r + " " + (f.items[i].unit || "") + " " + (f.items[i].particulars || f.items[i].name)); });
        return "Part of it was released. Still to release: " + left.join("; ") + ".";
    }

    const missing = [];
    if (f.status === WF.DRAFT) return "It is still a draft. Submit it first.";
    if (!f.sig.deptHead) missing.push("the Department Head signature");
    if (!f.review) missing.push("the Auditor review");
    if (!f.sig.auditor) missing.push("the Auditor signature");
    if (!wfApproved(f)) missing.push("the Director approval");
    if (!f.sig.director) missing.push("the Director signature");

    return "Still missing: " + missing.join(", ") + ".";

}

function wfFormatDate(iso, withTime) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) +
        (withTime ? ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "");
}

function wfEsc(t) {
    const d = document.createElement("div");
    d.textContent = t == null ? "" : String(t);
    return d.innerHTML;
}

// Release authorization: may the items of this requisition be released now?
//   Authorized = three signatures complete + Director approved + status Ready for Release.
function wfReleaseAuthHtml(f) {

    let cls, label, text;

    if (f.status === WF.RELEASED || f.status === WF.COMPLETED) {
        cls = "st-released"; label = "RELEASED";
        text = "The items were released" + (f.release ? " on " + wfFormatDate(f.release.at, true) + " by " + f.release.by : "") + ".";
    } else if (f.status === WF.REJECTED) {
        cls = "st-rejected"; label = "NOT AUTHORIZED";
        text = "The requisition was rejected" + (f.approval && f.approval.reason ? ": " + f.approval.reason : ".");
    } else if ((f.status === WF.READY || f.status === WF.PARTIAL) && wfReadyForRelease(f)) {
        cls = "st-ready"; label = "AUTHORIZED";
        text = f.status === WF.PARTIAL ? "The three signatures are complete and the Director approved. Staff can release the remaining balance."
                                       : "The three signatures are complete and the Director approved. Staff can release the items.";
    } else {
        cls = "st-pending"; label = "NOT AUTHORIZED";
        text = wfWhyNotReady(f);
    }

    return '<div class="wf-row"><strong>Release authorization</strong><span><span class="wf-badge ' + cls + '">' + label + "</span> " + wfEsc(text) + "</span></div>";

}

// Progress strip: the 3 signatures + approval + release
function wfProgressHtml(f) {

    const s = f.sig || {};
    const steps = [
        { label: "Department Head", done: !!s.deptHead, who: s.deptHead && s.deptHead.name },
        { label: "Auditor review", done: !!f.review, who: f.review && f.review.by },
        { label: "Auditor signature", done: !!s.auditor, who: s.auditor && s.auditor.name },
        { label: "Director approval", done: !!(f.approval && f.approval.decision === "Approved"), rejected: f.approval && f.approval.decision === "Rejected", who: f.approval && f.approval.by },
        { label: "Director signature", done: !!s.director, who: s.director && s.director.name },
        { label: f.status === WF.PARTIAL ? "Partly released" : "Released", done: f.status === WF.RELEASED || f.status === WF.COMPLETED, who: f.release ? (f.status === WF.PARTIAL ? "balance waiting" : f.release.by) : "" }
    ];

    return '<div class="wf-progress">' + steps.map(function (st) {
        return '<div class="wf-step ' + (st.done ? "done" : st.rejected ? "bad" : "") + '"><i>' + (st.done ? "&#10003;" : st.rejected ? "&#10007;" : "&#9675;") + "</i><b>" +
            wfEsc(st.label) + "</b><small>" + wfEsc(st.who || (st.done ? "" : "waiting")) + "</small></div>";
    }).join("") + "</div>";

}

// Items table of a requisition (read only). With withRelease: approved, released so far and remaining quantities.
function wfItemsTable(f, withRelease) {

    const tot = wfReleasedTotals(f);
    const rem = wfRemaining(f);
    const partial = f.status === WF.PARTIAL || (f.release && f.release.closedShort);

    let html = '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>#</th><th>Item description</th><th>' + (withRelease ? "Approved qty" : "Qty") + "</th><th>Unit</th>" +
        (withRelease ? "<th>Released</th>" + (partial || rem.some(function (r) { return r > 0; }) ? "<th>Remaining</th>" : "") : "") + "</tr></thead><tbody>";

    f.items.forEach(function (it, i) {
        const ids = f.release && f.release.lines && f.release.lines[i] ? (f.release.lines[i].unitIds || []) : [];
        html += "<tr><td>" + (i + 1) + "</td><td>" + wfEsc(it.particulars || it.name) + "</td><td>" + wfEsc(it.qty) + "</td><td>" + wfEsc(it.unit) + "</td>" +
            (withRelease ? "<td>" + (f.release || (f.releases || []).length ? wfEsc(tot[i]) + (ids.length ? '<br><small style="color:#999">' + wfEsc(ids.join(", ")) + "</small>" : "") : "-") + "</td>" +
                (partial || rem.some(function (r) { return r > 0; }) ? "<td>" + wfEsc(rem[i]) + "</td>" : "") : "") + "</tr>";
    });

    return html + "</tbody></table></div>";

}

// The releases of a requisition: number, date, who, receipt (PROP-ARII), items and whether the Requester confirmed. Read only.
function wfReleaseHistoryHtml(f) {

    const batches = f.releases || [];

    if (!batches.length) {
        return f.release ? '<div class="wf-row"><strong>Released</strong><span>' + wfEsc(wfFormatDate(f.release.at, true)) + " by " + wfEsc(f.release.by) + "</span></div>" : "";
    }

    let html = '<h4 style="margin:14px 0 4px;color:#edae0f">Release history</h4><div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Release</th><th>Date</th><th>Released by</th><th>Receipt (PROP-ARII)</th><th>Items released</th><th>Requester</th></tr></thead><tbody>' +
        batches.map(function (b) {
            return "<tr><td><b>" + wfEsc(b.no) + "</b></td><td>" + wfEsc(wfFormatDate(b.at, true)) + "</td><td>" + wfEsc(b.by) + "</td><td>" + wfEsc(b.receiptNo) + "</td><td>" +
                b.lines.filter(function (l) { return l.released > 0; }).map(function (l) { return wfEsc(l.released + " " + (l.unit || "") + " " + l.name + (l.unitIds && l.unitIds.length ? " [" + l.unitIds.join(", ") + "]" : "")); }).join("<br>") +
                "</td><td>" + (b.acknowledgedAt ? "Confirmed " + wfEsc(wfFormatDate(b.acknowledgedAt)) : "Not confirmed yet") + "</td></tr>";
        }).join("") + "</tbody></table></div>";

    if (f.release && f.release.closedShort) {
        html += '<div class="wf-lock">Closed with the remaining balance not released (' + wfEsc(f.release.closedShort.left.join("; ")) + "). Reason: " + wfEsc(f.release.closedShort.reason) + "</div>";
    }

    return html;

}

// Signature boxes with image, name, method and date (preview in details windows)
function wfSignatureCards(f) {

    const s = f.sig || {};

    return '<div class="wf-sigs">' + WF_SIGNERS.map(function (sg) {
        const x = s[sg.key];
        return '<div class="wf-sig"><b>' + wfEsc(sg.label) + "</b>" +
            (x ? (x.image ? '<img src="' + x.image + '" alt="Signature of ' + wfEsc(sg.label) + '">' : "") + '<div class="nm">' + wfEsc(x.name) + "</div><small>" +
                 wfEsc(x.method === "uploaded" ? "Uploaded (E-Upload)" : x.method === "legacy" ? "Signed on the paper form" : "Drawn (E-Sign)") + " &middot; " + wfEsc(wfFormatDate(x.at)) + "</small>"
               : '<div class="wf-none">Not signed yet</div><small>Name from: ' + wfEsc(sg.nameFrom) + "</small>") +
            "</div>";
    }).join("") + "</div>";

}

// QR payload for a requisition (uses the same format as qr.js when available)
function wfQrSvg(f, size) {
    if (typeof QR === "undefined" || typeof qrFormPayload === "undefined") return "";
    try { return QR.svg(qrFormPayload("requisition", f.controlNo), { size: size || 140, border: 2 }); } catch (e) { return ""; }
}

// Generic dark modal used by the new screens
function wfModal(title, bodyHtml, buttons, wide) {

    const old = document.getElementById("wfModal");
    if (old) old.remove();

    const back = document.createElement("div");
    back.className = "wf-back";
    back.id = "wfModal";
    back.innerHTML = '<div class="wf-modal' + (wide ? " wide" : "") + '"><div class="wf-mhead"><h3>' + wfEsc(title) + '</h3><button type="button" class="wf-x" aria-label="Close">&times;</button></div>' +
        '<div class="wf-mbody">' + bodyHtml + '</div><div class="wf-mfoot"></div></div>';

    document.body.appendChild(back);

    const foot = back.querySelector(".wf-mfoot");

    (buttons || []).forEach(function (b) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "wf-btn " + (b.cls || "");
        el.textContent = b.text;
        if (b.disabled) { el.disabled = true; el.title = b.title || ""; }
        el.addEventListener("click", function () { if (b.onClick) b.onClick(el, back); });
        foot.appendChild(el);
    });

    function close() { back.remove(); }
    back.querySelector(".wf-x").addEventListener("click", close);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });

    return { close: close, el: back };

}

function wfCloseModal() {
    const m = document.getElementById("wfModal");
    if (m) m.remove();
}

// small non-blocking message
function wfToast(msg, bad) {
    let box = document.getElementById("wfToasts");
    if (!box) { box = document.createElement("div"); box.id = "wfToasts"; box.className = "wf-toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "wf-toast" + (bad ? " bad" : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, typeof settingsToastMs === "function" ? settingsToastMs() : 4500);
}

// ========================================
// REQUESTER SCREENS (shared by Request, My Requests and the Requester Dashboard)
// ========================================

// Step 2: the Department Head has no account. The Requester types the name and records the signature.
function wfDeptHeadFlow(id, onDone) {

    openESign({
        title: "Department Head Signature",
        signerRole: "Department Head",
        signerName: "",
        nameEditable: true,
        nameNote: "type the Department Head name (no system account)",
        onSave: function (sig) {
            const r = wfSignDeptHead(id, sig);
            if (!r.ok) { wfToast(r.message, true); return; }
            wfToast("Department Head signature saved. The requisition now goes to the Auditor.");
            if (onDone) onDone();
        }
    });

}

// Details window for the Requester. A Requester only opens his or her own requisitions.
function wfRequesterDetails(id, onDone) {

    const f = wfFind(id);
    if (!f) return;

    if (String(f.requesterEmail).toLowerCase() !== wfMe()) {
        wfToast("You can only open your own requisitions.", true);
        return;
    }

    const h = f.header || {};
    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + v + "</span></div>"; }

    let body = row("Requisition No.", wfEsc(f.controlNo)) + row("Status", wfBadge(f.status)) +
        row("Department / Office", wfEsc(h.department)) +
        row("Representative", wfEsc(h.representativeName || "-") + (h.position ? " (" + wfEsc(h.position) + ")" : "")) +
        row("Purpose / Justification", wfEsc(h.purpose || "-")) +
        row("Submitted by (your account)", wfEsc(f.requesterEmail)) +
        wfItemsTable(f, !!f.release) + wfProgressHtml(f) + wfSignatureCards(f) + wfReleaseAuthHtml(f);

    if (f.status === WF.REJECTED && f.approval) body += row("Rejection reason", wfEsc(f.approval.reason));
    body += wfReleaseHistoryHtml(f);
    if (f.acknowledgment) body += row("Receipt confirmed", wfEsc(wfFormatDate(f.acknowledgment.at, true)));

    body += '<h4 style="margin:14px 0 4px;color:#edae0f">Status history</h4>' + (f.statusHistory || []).slice().reverse().map(function (x) {
        return '<div class="wf-list-item">' + wfEsc(x.status) + "<small>" + wfEsc(wfFormatDate(x.date, true)) + (x.note ? " &middot; " + wfEsc(x.note) : "") + "</small></div>";
    }).join("");

    body += '<div style="display:flex;gap:14px;align-items:center;margin-top:12px"><div style="background:#fff;padding:6px;border-radius:8px;width:120px;height:120px">' + wfQrSvg(f, 108) +
            '</div><span class="wf-note">Requisition QR code. Scanning only opens the record. It never signs, approves or releases.</span></div>';

    const done = function () { if (onDone) onDone(); wfRequesterDetails(id, onDone); };
    const buttons = [{ text: "Close", onClick: wfCloseModal }];

    buttons.push({ text: "Print", onClick: function () { if (typeof printRecord === "function") printRecord(f); else wfToast("Printing needs Shared/print.js", true); } });

    if (f.status === WF.DRAFT) {
        buttons.push({ text: "Submit requisition", cls: "gold", onClick: function () {
            if (!confirm("Submit requisition " + f.controlNo + "?")) return;
            const r = wfSubmitDraft(id); if (!r.ok) { wfToast(r.message, true); return; } wfToast("Submitted."); wfCloseModal(); if (onDone) onDone();
        } });
    }
    if (f.status === WF.PEND_DEPT) buttons.push({ text: "Add Department Head signature", cls: "gold", onClick: function () { wfCloseModal(); wfDeptHeadFlow(id, done); } });
    if (f.status === WF.PEND_REVIEW) {
        buttons.push({ text: "Replace Department Head signature", onClick: function () {
            if (!confirm("Remove the Department Head signature so it can be replaced?")) return;
            const r = wfClearDeptHead(id); if (!r.ok) { wfToast(r.message, true); return; } wfCloseModal(); wfDeptHeadFlow(id, done);
        } });
    }   

    wfModal("Requisition " + f.controlNo, body, buttons, true);

}

// Generic paged table. cfg = { rows(), tbody, pager, cols, perPage, empty, rowHtml(f), onView(id) }
function wfPagedTable(cfg) {
    // System Settings > Inventory: "rows per page" (auto = the page decides)
    const perPage = typeof settingsRows === "function" ? settingsRows(cfg.perPage || 5) : (cfg.perPage || 5);
    let page = 1;
    const tbody = document.getElementById(cfg.tbody);
    const pager = document.getElementById(cfg.pager);

    function draw() {
        const rows = cfg.rows();
        const pages = Math.max(1, Math.ceil(rows.length / perPage));
        if (page > pages) page = pages;
        const slice = rows.slice((page - 1) * perPage, page * perPage);

        tbody.innerHTML = slice.length ? slice.map(cfg.rowHtml).join("") :
            '<tr><td colspan="' + cfg.cols + '" class="wf-empty">' + (cfg.empty || "Nothing to show.") + "</td></tr>";

        pager.innerHTML = "<span>" + rows.length + " record(s) &middot; page " + page + " of " + pages + "</span>" +
            '<button type="button" data-d="-1"' + (page <= 1 ? " disabled" : "") + ">Prev</button>" +
            '<button type="button" data-d="1"' + (page >= pages ? " disabled" : "") + ">Next</button>";

        pager.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { page += parseInt(b.dataset.d, 10); draw(); }); });
        tbody.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () { if (cfg.onView) cfg.onView(b.dataset.view); }); });
    }

    draw();
    return { redraw: function (reset) { if (reset) page = 1; draw(); } };
}

// Requisitions of the logged-in Requester only (never anybody else's, drafts included because they are his or hers)
function wfMyRequisitions() {
    return wfRequisitions().filter(function (f) { return String(f.requesterEmail).toLowerCase() === wfMe(); });
}

// ========================================
// RELEASE RECORDS: CHECKS AND DEMO RE-ALIGNMENT (data level; the screens are in Shared/release.js)
//   releaseIntegrityCheck()      do the release records and the unit statuses agree?  (changes nothing)
//   releaseReapplyAfterReset()   after the demo data is made again: make the DEMO units / stock agree with what REAL
//                                requisitions say they released (only demo records change, never a real record)
// ========================================
function relNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function relIsDemoId(id) { return String(id || "").toUpperCase().indexOf("DEMO-") === 0; }

// Every batch line with units: the unit must exist, and must not be Available (it was released). Returns [{ level, no, text }]
function releaseIntegrityCheck() {

    const issues = [];
    const units = loadAssetUnits();

    wfRequisitions().forEach(function (f) {

        const lines = (f.releases || []).length ? [].concat.apply([], f.releases.map(function (b) { return b.lines.map(function (l) { return Object.assign({ rel: b.no }, l); }); })) :
                      ((f.release && f.release.lines) || []).map(function (l) { return Object.assign({ rel: "release" }, l); });

        lines.forEach(function (l) {
            (l.unitIds || []).forEach(function (uid) {
                const u = units.find(function (x) { return x.id === uid; });
                if (!u) {
                    issues.push({ level: "problem", no: f.controlNo, text: "release " + l.rel + ": unit " + uid + " is not in the register" + (relIsDemoId(uid) ? " (its demo data was removed)." : ".") });
                } else if (u.status === UNIT_STATUS.AVAILABLE) {
                    issues.push({ level: "problem", no: f.controlNo, text: "release " + l.rel + ": " + uid + " was released but is Available." });
                }
                if (!f.demo && relIsDemoId(uid)) issues.push({ level: "note", no: f.controlNo, text: "this real requisition released demo unit " + uid + ". A demo reset sets the demo unit to match the release." });
            });
        });

    });

    return issues;

}

// After the demo data was made again the demo units are Available and the demo stock is full again. A REAL requisition that released
// demo equipment keeps saying so. This makes the DEMO units (Assigned) and the DEMO consumable stock agree with those records.
// Only demo records are changed. A real record is never touched. Returns how many things were aligned.
function releaseReapplyAfterReset() {

    let n = 0;
    const moves = typeof loadMovements === "function" ? loadMovements() : [];

    wfRequisitions().forEach(function (f) {

        if (f.demo) return;

        const h = f.header || {};
        const lines = (f.releases || []).length ? [].concat.apply([], f.releases.map(function (b) { return b.lines.map(function (l) { return Object.assign({ rel: b.no }, l); }); })) :
                      ((f.release && f.release.lines) || []).map(function (l) { return Object.assign({ rel: "release" }, l); });

        lines.forEach(function (l) {

            (l.unitIds || []).forEach(function (uid) {
                const u = relIsDemoId(uid) ? findUnit(uid) : null;
                if (u && u.status === UNIT_STATUS.AVAILABLE) {
                    applyUnitStatus(uid, UNIT_STATUS.ASSIGNED, "Re-applied", f.controlNo, "Set to match release " + l.rel + " after the demo data was made again",
                        { assignedTo: h.representativeName || "", assignedRef: f.controlNo, department: h.department || "" });
                    n++;
                }
            });

            // demo consumables: take the released quantity out of the new demo stock (once per release)
            if (l.assetId && relIsDemoId(l.assetId) && !(l.unitIds && l.unitIds.length) && relNum(l.released) > 0) {
                const key = "[reapplied " + l.rel + "]";
                if (moves.some(function (m) { return m.assetId === l.assetId && String(m.reason).indexOf(key) !== -1 && String(m.reason).indexOf(f.controlNo) !== -1; })) return;
                const assets = loadAssets();
                const a = assets.find(function (x) { return x.id === l.assetId; });
                if (a && isConsumable(a)) {
                    const before = a.quantity;
                    a.quantity = Math.max(0, a.quantity - relNum(l.released));
                    saveAssets(assets);
                    logStockMovement(a, "Release", a.quantity - before, before, "Requisition " + f.controlNo + " release " + l.rel + " " + key);
                    n++;
                }
            }

        });

    });

    return n;

}

wfMigrate();
