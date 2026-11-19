// AUDITOR - REVIEW HISTORY (what this Auditor reviewed or signed)
document.addEventListener("DOMContentLoaded", function () {

    audSetupSidebar();

    const el = function (id) { return document.getElementById(id); };

    function rows() {
        const q = el("hSearch").value.toLowerCase().trim();
        const type = el("hType").value;
        const from = el("hFrom").value, to = el("hTo").value;
        const seen = {};
        return audReviewedByMe().concat(audSignedByMe()).filter(function (f) {
            if (seen[f.id]) return false; seen[f.id] = true;
            if (type === "reviewed" && !(f.review && f.review.byEmail === wfMe())) return false;
            if (type === "signed" && !(f.sig.auditor && f.sig.auditor.email === wfMe())) return false;
            const day = ((f.review && f.review.at) || (f.sig.auditor && f.sig.auditor.at) || "").slice(0, 10);
            if (from && day < from) return false;
            if (to && day > to) return false;
            return !q || (f.controlNo + " " + f.header.department + " " + f.status).toLowerCase().indexOf(q) !== -1;
        }).sort(function (a, b) { return (b.review ? b.review.at : "").localeCompare(a.review ? a.review.at : ""); });
    }

    const table = audPagedTable({
        rows: rows, tbody: "hBody", pager: "hPager", cols: 6, perPage: 8, empty: "No review history for these filters.",
        rowHtml: function (f) {
            return "<tr><td><b>" + wfEsc(f.controlNo) + "</b></td><td>" + wfEsc(f.header.department) + "</td><td>" + wfEsc(f.review ? wfFormatDate(f.review.at, true) : "-") +
                "</td><td>" + wfEsc(f.sig.auditor ? wfFormatDate(f.sig.auditor.at, true) : "-") + "</td><td>" + wfBadge(f.status) + "</td><td>" + audRowActions(f) + "</td></tr>";
        },
        onChange: function () { table.redraw(); }
    });

    ["hSearch", "hType", "hFrom", "hTo"].forEach(function (id) {
        el(id).addEventListener(id === "hSearch" ? "input" : "change", function () { table.redraw(true); });
    });

    el("hCsv").addEventListener("click", function () {
        const lines = [["Requisition No.", "Department", "Reviewed", "Signed", "Status"]].concat(rows().map(function (f) {
            return [f.controlNo, f.header.department, f.review ? f.review.at : "", f.sig.auditor ? f.sig.auditor.at : "", f.status];
        }));
        const csv = lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "review-history.csv";
        a.click();
    });

});
