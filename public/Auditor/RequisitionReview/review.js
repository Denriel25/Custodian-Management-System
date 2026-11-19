// AUDITOR - REQUISITION REVIEW
document.addEventListener("DOMContentLoaded", function () {

    audSetupSidebar();

    const search = document.getElementById("qSearch");
    const status = document.getElementById("qStatus");
    const loading = document.getElementById("loading");

    const table = audPagedTable({
        rows: function () {
            const q = search.value.toLowerCase().trim();
            const base = status.value === "todo" ? audPending() : audVisible();
            return base.filter(function (f) { return !q || (f.controlNo + " " + f.header.department + " " + f.requesterEmail + " " + f.status).toLowerCase().indexOf(q) !== -1; })
                .sort(function (a, b) { return b.dateCreated.localeCompare(a.dateCreated); });
        },
        tbody: "qBody", pager: "qPager", cols: 7, perPage: 8, empty: "No requisitions found.",
        rowHtml: function (f) {
            return "<tr><td><b>" + wfEsc(f.controlNo) + "</b></td><td>" + wfEsc(f.header.department) + "</td><td>" + wfEsc(f.requesterEmail) + "</td><td>" + f.items.length +
                "</td><td>" + wfEsc(wfFormatDate(f.dateCreated)) + "</td><td>" + wfBadge(f.status) + "</td><td>" + audRowActions(f) + "</td></tr>";
        },
        onChange: function () { table.redraw(); }
    });

    // short loading state (simulates waiting for a server)
    loading.style.display = "block";
    document.querySelector(".wf-tablewrap").style.display = "none";
    setTimeout(function () { loading.style.display = "none"; document.querySelector(".wf-tablewrap").style.display = ""; }, 450);

    search.addEventListener("input", function () { table.redraw(true); });
    status.addEventListener("change", function () { table.redraw(true); });
    document.getElementById("mailBtn").addEventListener("click", wfOpenEmailOutbox);
    if (typeof onDataChange === "function") onDataChange(["forms"], function () { table.redraw(); });

    // QR scan: only OPENS the requisition. It never reviews or signs.
    document.getElementById("scanBtn").addEventListener("click", function () {
        if (typeof openScanner === "undefined") { alert("The scanner file (Shared/scanner.js) was not found."); return; }
        openScanner({
            title: "Scan Requisition QR",
            hint: "Scan the QR printed on a requisition, or type its number (for example 26-001). Scanning only opens it.",
            onCode: function (parsed) {
                const no = parsed.controlNo;
                if (!no) return "This code is not a requisition code.";
                const f = audVisible().find(function (x) { return x.controlNo === no; });
                if (!f) return "Requisition " + no + " was not found, or it has not reached the Auditor yet.";
                audOpenDetails(f.id, function () { table.redraw(); });
                return true;
            }
        });
    });

    const open = new URLSearchParams(location.search).get("open");
    if (open) {
        const f = audVisible().find(function (x) { return x.controlNo === open; });
        if (f) audOpenDetails(f.id, function () { table.redraw(); });
    }

});
