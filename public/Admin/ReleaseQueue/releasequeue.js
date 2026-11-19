// ADMIN / STAFF - READY-FOR-RELEASE QUEUE (frontend simulation)
// Admin supervises (sees the queue and every record). Staff make the actual release.
// The rules are in Shared/workflow.js (wfRelease). This page only lists, filters and opens the release window.

const RQ_PAGES = {
    "Dashboard": "../Dashboard/dashboard.html", "Request Management": "../RequestManagement/requestmanagement.html", "Inventory Management": "../InventoryManagement/inventorymanagement.html",
    "Assets": "../Assets/assets.html", "Annual Inventory": "../AnnualInventory/annualinventory.html", "Issuance": "../Issuance/issuance.html", "Pull-Out Management": "../PullOut/pullout.html",
    "Reports": "../Reports/reports.html", "Users": "../Users/users.html", "Audit Trail": "../AuditTrail/audittrail.html"
};

let rqTable = null;

function rqRows() {

    const q = document.getElementById("qSearch").value.toLowerCase().trim();
    const st = document.getElementById("qStatus").value;
    const from = document.getElementById("qFrom").value, to = document.getElementById("qTo").value;

    return wfQueueRows().filter(function (f) {
        const approved = String((f.approval && f.approval.at) || f.dateCreated).slice(0, 10);
        if (st !== "all" && f.status !== st) return false;
        if (from && approved < from) return false;
        if (to && approved > to) return false;
        const hay = (f.controlNo + " " + ((f.header || {}).representativeName || "") + " " + f.requesterEmail + " " + ((f.header || {}).department || "") + " " + f.items.map(function (i) { return i.particulars || i.name; }).join(" ")).toLowerCase();
        return !q || hay.indexOf(q) !== -1;
    }).sort(function (a, b) { return String((a.approval || {}).at || a.dateCreated).localeCompare(String((b.approval || {}).at || b.dateCreated)); });   // oldest approval first

}

function rqSignatures(f) {
    const s = f.sig || {};
    function mark(ok, short, label) { return '<span class="' + (ok ? "wf-yes" : "wf-no") + '" title="' + label + (ok ? ": completed" : ": missing") + '" style="white-space:nowrap">' + (ok ? "&#10003;" : "&#10007;") + " " + short + "</span>"; }
    return mark(s.deptHead, "DH", "Department Head signature") + " " + mark(s.auditor, "SA", "School Auditor signature") + "<br>" + mark(s.director, "DIR", "Director signature") + " " + mark(wfApproved(f), "APR", "Director approval");
}

function rqItems(f) {
    const tot = wfReleasedTotals(f), rem = wfRemaining(f);
    return f.items.map(function (it, i) {
        return wfEsc(it.particulars || it.name) + ": " + wfEsc(it.qty) + " / " + wfEsc(tot[i]) + " / <b>" + wfEsc(rem[i]) + "</b> " + wfEsc(it.unit || "");
    }).join("<br>");
}

function rqRefresh() {

    const rows = wfQueueRows();
    const today = new Date().toISOString().slice(0, 10);
    let released = 0;
    wfRequisitions().forEach(function (f) { (f.releases || []).forEach(function (b) { if (String(b.at).slice(0, 10) === today) released++; }); });

    document.getElementById("cReady").textContent = rows.filter(function (f) { return f.status === WF.READY; }).length;
    document.getElementById("cPartial").textContent = rows.filter(function (f) { return f.status === WF.PARTIAL; }).length;
    document.getElementById("cItems").textContent = rows.reduce(function (n, f) { return n + wfRemaining(f).filter(function (r) { return r > 0; }).length; }, 0);
    document.getElementById("cToday").textContent = released;

    if (rqTable) rqTable.redraw();

}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(".sidebar ul li").forEach(function (li) {
        li.addEventListener("click", function () {
            const n = li.textContent.trim();
            if (RQ_PAGES[n]) location.href = RQ_PAGES[n];
            else if (n === "Logout" && confirm("Are you sure you want to logout?")) { if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear(); location.href = "../Login/login.html"; }
        });
    });

    const role = wfRole();
    document.getElementById("roleNote").textContent = role === "Staff" ? "You make the actual release: open a requisition and click Prepare release."
        : "The Admin supervises the queue. Only Staff make the actual release.";

    rqTable = wfPagedTable({
        rows: rqRows, tbody: "qBody", pager: "qPager", cols: 6, perPage: 6, empty: "No requisition is waiting for release.",
        rowHtml: function (f) {
            const h = f.header || {};
            return "<tr><td><b>" + wfEsc(f.controlNo) + "</b>" + (f.demo ? " <small>(demo)</small>" : "") + "<br><small>" + wfEsc(wfFormatDate((f.approval && f.approval.at) || f.dateCreated)) + "</small></td>" +
                "<td>" + wfEsc(h.representativeName || "-") + "<br><small>" + wfEsc(f.requesterEmail) + "</small><br><small>" + wfEsc(h.department) + "</small></td>" +
                "<td>" + rqItems(f) + "</td><td>" + rqSignatures(f) + "</td><td>" + wfBadge(f.status) +
                '</td><td><button type="button" class="wf-btn sm" data-view="' + wfEsc(f.id) + '">View</button> ' +
                (role === "Staff" ? '<button type="button" class="wf-btn sm gold" data-prep="' + wfEsc(f.id) + '">Prepare release</button>' : "") + "</td></tr>";
        },
        onView: function (id) { wfQueueDetails(id, rqRefresh); }
    });

    document.getElementById("qBody").addEventListener("click", function (e) {
        const b = e.target.closest("[data-prep]");
        if (b) wfOpenReleaseWindow(b.dataset.prep, rqRefresh);
    });

    ["qSearch", "qStatus", "qFrom", "qTo"].forEach(function (id) { document.getElementById(id).addEventListener(id === "qSearch" ? "input" : "change", function () { rqTable.redraw(true); }); });

    if (typeof onDataChange === "function") onDataChange(["forms", "assets", "assetUnits"], rqRefresh);
    rqRefresh();

    const open = new URLSearchParams(location.search).get("open");
    if (open) {
        const f = wfFindByNo(open);
        if (f) wfQueueDetails(f.id, rqRefresh); else wfToast("Requisition " + open + " is not in the release queue.", true);
    }

});
