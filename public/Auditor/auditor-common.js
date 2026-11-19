// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// AUDITOR PAGES - COMMON CODE (frontend simulation)
// The Auditor can: view requisitions, review items and quantities, sign, see the review history.
// The Auditor CANNOT: approve/reject, release, change inventory, manage users, edit requisition details.
// ========================================

const AUD_PAGES = {
    "Dashboard": "../AuditorDashboard/dashboard.html",
    "Requisition Review": "../RequisitionReview/review.html",
    "Review History": "../ReviewHistory/history.html"
};

function audSetupSidebar() {
    document.querySelectorAll(".sidebar ul li").forEach(function (li) {
        li.addEventListener("click", function () {
            const name = li.textContent.trim();
            if (name === "Logout") {
                if (confirm("Are you sure you want to logout?")) {
                    if (typeof tryAuditLog === "function") tryAuditLog(wfMe(), "Auditor", "Logged out");
                    if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
                    location.href = "../../Admin/Login/login.html";
                }
            } else if (AUD_PAGES[name]) {
                location.href = AUD_PAGES[name];
            }
        });
    });
}

// requisitions the Auditor can see: everything that reached the Auditor stage or later (no drafts, nothing waiting for the Department Head)
function audVisible() {
    return wfRequisitions().filter(function (f) {
        return f.status !== WF.DRAFT && f.status !== WF.SUBMITTED && f.status !== WF.PEND_DEPT;
    });
}

function audPending() {
    return audVisible().filter(function (f) { return f.status === WF.PEND_REVIEW || f.status === WF.PEND_AUD_SIGN; });
}

function audReviewedByMe() {
    return audVisible().filter(function (f) { return f.review && f.review.byEmail === wfMe(); });
}

function audSignedByMe() {
    return audVisible().filter(function (f) { return f.sig && f.sig.auditor && f.sig.auditor.email === wfMe(); });
}

// Simple paged table. cfg = { rows, tbody, pager, perPage, rowHtml(f), empty, cols, onRender }
function audPagedTable(cfg) {
    const perPage = cfg.perPage || 5;
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

        pager.innerHTML = '<span>' + rows.length + " record(s) &middot; page " + page + " of " + pages + '</span>' +
            '<button type="button" data-d="-1"' + (page <= 1 ? " disabled" : "") + '>Prev</button>' +
            '<button type="button" data-d="1"' + (page >= pages ? " disabled" : "") + '>Next</button>';

        pager.querySelectorAll("button").forEach(function (b) {
            b.addEventListener("click", function () { page += parseInt(b.dataset.d, 10); draw(); });
        });

        tbody.querySelectorAll("[data-view]").forEach(function (b) {
            b.addEventListener("click", function () { audOpenDetails(b.dataset.view, cfg.onChange); });
        });
    }

    draw();
    return { redraw: function (resetPage) { if (resetPage) page = 1; draw(); } };
}

function audRowActions(f) {
    return '<button type="button" class="wf-btn sm gold" data-view="' + f.id + '">' + (f.status === WF.PEND_REVIEW || f.status === WF.PEND_AUD_SIGN ? "Review" : "View") + "</button>";
}

// ----- details window (read only for the Auditor, except the review and the signature) -----
function audOpenDetails(id, onChange) {

    const f = wfFind(id);
    if (!f) return;

    const h = f.header || {};
    const dh = f.sig && f.sig.deptHead;

    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + v + "</span></div>"; }

    let body = row("Requisition No.", wfEsc(f.controlNo)) + row("Status", wfBadge(f.status)) +
        row("Date", wfEsc(h.date || wfFormatDate(f.dateCreated))) +
        row("Department / Office", wfEsc(h.department)) +
        row("Representative", wfEsc(h.representativeName || "-") + (h.position ? " (" + wfEsc(h.position) + ")" : "")) +
        row("Submitted by (account)", wfEsc(f.requesterEmail)) +
        row("Purpose / Justification", wfEsc(h.purpose || "-")) +
        '<h4 style="margin:14px 0 4px;color:#edae0f">Items and quantities</h4>' + wfItemsTable(f, false) +
        '<h4 style="margin:14px 0 4px;color:#edae0f">Supporting documents</h4>' +
        '<div class="wf-note">Department Head signature and the requisition QR code (scanning only opens the record; it never signs or approves).</div>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">' +
            '<div style="flex:1;min-width:220px">' + wfSignatureCards(f) + "</div>" +
            '<div style="background:#fff;padding:6px;border-radius:8px;width:150px;height:150px">' + wfQrSvg(f, 138) + "</div>" +
        "</div>" +
        wfProgressHtml(f) + wfReleaseAuthHtml(f) + wfReleaseHistoryHtml(f);

    if (f.review) body += row("Reviewed by", wfEsc(f.review.by) + " on " + wfEsc(wfFormatDate(f.review.at, true)) + (f.review.notes ? "<br><small>Notes: " + wfEsc(f.review.notes) + "</small>" : ""));

    const buttons = [{ text: "Close", onClick: wfCloseModal }];
    const isAuditor = wfRole() === "Auditor";

    if (isAuditor && f.status === WF.PEND_REVIEW) {
        buttons.push({
            text: "Mark as Reviewed", cls: "gold", onClick: function () {
                wfModal("Confirm review", '<p>I reviewed the item descriptions and quantities of requisition <b>' + wfEsc(f.controlNo) + '</b>.</p>' +
                    '<label class="wf-note" style="display:block;margin-top:10px">Review notes (optional)</label><textarea class="wf-text" id="audNotes"></textarea>',
                    [{ text: "Back", onClick: function () { audOpenDetails(id, onChange); } },
                     { text: "Confirm review", cls: "gold", onClick: function () {
                        const r = wfAuditorReview(id, document.getElementById("audNotes").value.trim());
                        if (!r.ok) { wfToast(r.message, true); return; }
                        wfToast("Requisition reviewed. You can now sign it.");
                        if (onChange) onChange();
                        audOpenDetails(id, onChange);
                     } }]);
            }
        });
    }

    if (isAuditor && f.status === WF.PEND_AUD_SIGN) {
        buttons.push({
            text: "Sign as Auditor", cls: "gold", onClick: function () {
                const acct = userByEmail(wfMe());
                openESign({
                    title: "Auditor Signature - " + f.controlNo,
                    signerRole: "School Auditor",
                    signerName: acct ? acct.name : "",
                    nameEditable: false,
                    nameNote: "name comes from the Auditor account",
                    onSave: function (sig) {
                        const r = wfSignAuditor(id, sig);
                        if (!r.ok) { wfToast(r.message, true); return; }
                        wfToast("Signature saved. Sent to the Director for approval.");
                        if (onChange) onChange();
                        audOpenDetails(id, onChange);
                    }
                });
            }
        });
    }

    const lock = isAuditor ? '<div class="wf-lock">The Auditor can review and sign only. Final approval, release, inventory changes and editing of the requisition are not available to this role.</div>' : "";

    wfModal("Requisition Details", body + lock, buttons, true);
}
