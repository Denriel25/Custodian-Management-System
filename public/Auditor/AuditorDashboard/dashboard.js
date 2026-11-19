// AUDITOR DASHBOARD - numbers and tables are calculated from the saved (demo) requisitions
document.addEventListener("DOMContentLoaded", function () {

    audSetupSidebar();

    const search = document.getElementById("pSearch");

    function text(f) { return (f.controlNo + " " + (f.header.department || "") + " " + f.requesterEmail).toLowerCase(); }

    const pending = audPagedTable({
        rows: function () { const q = search.value.toLowerCase().trim(); return audPending().filter(function (f) { return !q || text(f).indexOf(q) !== -1; }); },
        tbody: "pBody", pager: "pPager", cols: 6, perPage: 5, empty: "No requisitions are waiting for review.",
        rowHtml: function (f) { return "<tr><td><b>" + wfEsc(f.controlNo) + "</b></td><td>" + wfEsc(f.header.department) + "</td><td>" + wfEsc(f.requesterEmail) + "</td><td>" + wfEsc(wfFormatDate(f.dateCreated)) + "</td><td>" + wfBadge(f.status) + "</td><td>" + audRowActions(f) + "</td></tr>"; },
        onChange: refresh
    });

    const reviewed = audPagedTable({
        rows: function () { return audReviewedByMe().sort(function (a, b) { return b.review.at.localeCompare(a.review.at); }); },
        tbody: "rBody", pager: "rPager", cols: 4, perPage: 3, empty: "You have not reviewed any requisition yet.",
        rowHtml: function (f) { return "<tr><td>" + wfEsc(f.controlNo) + "</td><td>" + wfEsc(wfFormatDate(f.review.at)) + "</td><td>" + wfBadge(f.status) + "</td><td>" + audRowActions(f) + "</td></tr>"; },
        onChange: refresh
    });

    const signed = audPagedTable({
        rows: function () { return audSignedByMe().sort(function (a, b) { return b.sig.auditor.at.localeCompare(a.sig.auditor.at); }); },
        tbody: "sBody", pager: "sPager", cols: 4, perPage: 3, empty: "You have not signed any requisition yet.",
        rowHtml: function (f) { return "<tr><td>" + wfEsc(f.controlNo) + "</td><td>" + wfEsc(wfFormatDate(f.sig.auditor.at)) + "</td><td>" + wfBadge(f.status) + "</td><td>" + audRowActions(f) + "</td></tr>"; },
        onChange: refresh
    });

    function cards() {
        document.getElementById("cPending").textContent = audPending().length;
        document.getElementById("cReviewed").textContent = audReviewedByMe().length;
        document.getElementById("cSigned").textContent = audSignedByMe().length;
    }

    function activities() {
        let log = [];
        try { log = JSON.parse(localStorage.getItem("auditLog")) || []; } catch (e) { log = []; }
        const mine = log.filter(function (l) { return String(l.user).toLowerCase() === wfMe() && /Reviewed|Auditor signature/.test(l.activity); }).reverse().slice(0, 6);
        document.getElementById("activities").innerHTML = mine.length ? mine.map(function (l) {
            return '<div class="wf-list-item">' + wfEsc(l.activity) + "<small>" + wfEsc(wfFormatDate(l.date, true)) + "</small></div>";
        }).join("") : '<div class="wf-empty">No review activity yet.</div>';
    }

    function docs() {
        const list = audPending().slice(0, 4);
        document.getElementById("docs").innerHTML = list.length ? list.map(function (f) {
            return '<div class="wf-list-item"><b>' + wfEsc(f.controlNo) + "</b> &middot; " + wfEsc(f.header.department) +
                "<small>Department Head signature: " + (f.sig.deptHead ? wfEsc(f.sig.deptHead.name) + " (" + wfEsc(signMethodText(f.sig.deptHead)) + ")" : "missing") + "</small></div>";
        }).join("") : '<div class="wf-empty">No documents waiting.</div>';
    }

    function refresh() { cards(); pending.redraw(); reviewed.redraw(); signed.redraw(); activities(); docs(); }

    search.addEventListener("input", function () { pending.redraw(true); });
    if (typeof onDataChange === "function") onDataChange(["forms"], refresh);
    refresh();

});
