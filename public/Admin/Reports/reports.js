// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// REPORTS JAVASCRIPT (ADMIN)
// Reports are built from the real data of the system and printed.
// In the print window, choose "Save as PDF" to keep a PDF copy.
//
//   Request Report            - all forms and their status
//   Requisition Cost Report   - amounts of the requisitions
//   Issuance Report           - acknowledgment receipts
//   Audit Trail Report        - activity logs
// ========================================

// ---------- Safety check ----------
// This page needs the Shared folder (print.js, print.css, audit.js) in the project
// root, next to the Admin and Requester folders. If it is missing, the page still
// opens and a message tells you what to fix.
const PROBLEMS = [];

if (typeof esc === "undefined" || typeof setPageStyle === "undefined" || typeof SIGN === "undefined") {

    PROBLEMS.push("The Shared folder (print.js) was not found. Put the Shared folder in the project root, next to Admin and Requester.");

    window.esc = function (text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    };
    window.money = function (n) {
        return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    window.setPageStyle = function () {};
    window.SIGN = { auditor: "RAYMUND S. PAGADUAN", custodian: "NELSON F. SALISI" };

}

if (typeof AUDIT_KEY === "undefined") {
    window.AUDIT_KEY = "auditLog";
}

const FORMS_KEY = "forms";
const HISTORY_KEY = "reportHistory";

const FORM_LABELS = {
    requisition: "Requisition",
    receipt: "Acknowledgment Receipt",
    pullout: "Pull-Out Request"
};

const STATUSES = ["Pending", "Approved", "Released", "Rejected"];


// ========================================
// DATA
// ========================================

function readJSON(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
        return [];
    }
}

function loadForms() {
    // a Draft requisition is private to its Requester, so it is never part of a report
    return readJSON(FORMS_KEY).filter(function (r) { return FORM_LABELS[r.type] && !(r.type === "requisition" && r.status === "Draft"); });
}

// Requisitions have the workflow statuses; pull-out requests and receipts keep Pending / Approved / Released / Rejected.
// The summary columns group the workflow statuses like this:
//   Pending  = Submitted, Pending Department Head Signature, Pending Auditor Review, Pending Auditor Signature, Pending Director Approval
//   Approved = Approved, Ready for Release          Released = Released, Completed          Rejected = Rejected
function statusGroup(r) {
    if (r.type !== "requisition") return r.status;
    switch (r.status) {
        case "Approved": case "Ready for Release": case "Partially Released": return "Approved";
        case "Released": case "Completed": return "Released";
        case "Rejected": return "Rejected";
        default: return "Pending";
    }
}

// control number, with a label when the record is demo data
function noText(r) { return (r.controlNo || r.no) + (r.demo ? " (demo)" : ""); }

const ASSETS_KEY_FOR_REPORT = "assets";

// Audit logs, oldest first, each with a Log ID (same as the Audit Trail page)
function loadLogs() {
    return readJSON(AUDIT_KEY).map(function (e, i) {

        let activity = e.activity;

        if (!activity) {
            activity = ((e.action || "Updated") + " " + (FORM_LABELS[e.formType] || "form") + " " + (e.controlNo || "")).trim();
        }

        return {
            id: "LOG" + String(i + 1).padStart(3, "0"),
            user: e.user || "Unknown",
            role: e.role || "Administrator",
            activity: activity,
            date: e.date
        };

    });
}

function loadHistory() {
    return readJSON(HISTORY_KEY);
}


// ========================================
// HELPERS (esc, money, setPageStyle, SIGN come from Shared/print.js)
// ========================================

function formatDate(dateString) {

    const d = new Date(dateString);

    if (isNaN(d.getTime())) {
        return dateString || "-";
    }

    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

}

function formatTime(dateString) {

    const d = new Date(dateString);

    if (isNaN(d.getTime())) {
        return "-";
    }

    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

}

// "2026-10-06" -> start / end of that day (local time)
function startOf(dateText) {
    return dateText ? new Date(dateText + "T00:00:00") : null;
}

function endOf(dateText) {
    return dateText ? new Date(dateText + "T23:59:59.999") : null;
}

function inRange(isoDate, from, to) {

    const d = new Date(isoDate);

    if (isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;

    return true;

}

// Inventory and User reports show the situation today, so they have no period
const SNAPSHOT_REPORTS = ["Inventory Report", "User Report"];

function periodText(p) {

    if (SNAPSHOT_REPORTS.indexOf(p.type) !== -1) {
        return "As of " + formatDate(p.date || new Date().toISOString());
    }

    if (!p.from && !p.to) return "All dates";
    if (p.from && !p.to) return "From " + formatDate(p.from + "T00:00:00");
    if (!p.from && p.to) return "Up to " + formatDate(p.to + "T00:00:00");

    return formatDate(p.from + "T00:00:00") + " to " + formatDate(p.to + "T00:00:00");

}

function formDetails(r) {

    if (r.type === "requisition") return r.header.department;
    if (r.type === "receipt") return r.header.name + " (" + r.header.department + ")";

    return r.header.requestingParty + (r.header.office ? " - " + r.header.office : "");

}

function table(headers, rows, numericCols) {

    numericCols = numericCols || [];

    let html = "<table><thead><tr>";

    headers.forEach(function (h) { html += "<th>" + esc(h) + "</th>"; });

    html += "</tr></thead><tbody>";

    rows.forEach(function (row) {

        html += row.total ? '<tr class="total">' : "<tr>";

        row.cells.forEach(function (c, i) {
            html += "<td" + (numericCols.indexOf(i) !== -1 ? ' class="num"' : "") + ">" + esc(c) + "</td>";
        });

        html += "</tr>";

    });

    return html + "</tbody></table>";

}

function plain(cells) {
    return { cells: cells };
}

function emptyNote() {
    return '<p class="empty">No records for the selected period.</p>';
}


// ========================================
// REPORT BODIES
// ========================================

function requestReport(p) {

    const from = startOf(p.from), to = endOf(p.to);
    const list = loadForms().filter(function (r) { return inRange(r.dateCreated, from, to); });

    if (list.length === 0) return emptyNote();

    // summary: form type x status
    const summary = [];
    const totals = { Pending: 0, Approved: 0, Released: 0, Rejected: 0, all: 0 };

    Object.keys(FORM_LABELS).forEach(function (type) {

        const mine = list.filter(function (r) { return r.type === type; });
        const cells = [FORM_LABELS[type]];

        STATUSES.forEach(function (s) {
            const n = mine.filter(function (r) { return statusGroup(r) === s; }).length;
            totals[s] += n;
            cells.push(n);
        });

        cells.push(mine.length);
        totals.all += mine.length;
        summary.push(plain(cells));

    });

    summary.push({ total: true, cells: ["TOTAL", totals.Pending, totals.Approved, totals.Released, totals.Rejected, totals.all] });

    // list (oldest first)
    const rows = list.map(function (r) {
        return plain([noText(r), FORM_LABELS[r.type], r.requesterEmail || "-", formDetails(r), formatDate(r.dateCreated), r.status]);
    });

    // requisitions: how many are at each step of the workflow
    const steps = (typeof WF_STATUSES !== "undefined" ? WF_STATUSES : []).filter(function (st) { return st !== "Draft"; });
    const reqs = list.filter(function (r) { return r.type === "requisition"; });
    const stepRows = steps.map(function (st) {
        return plain([st, reqs.filter(function (r) { return r.status === st; }).length]);
    }).filter(function (row) { return row.cells[1] > 0; });

    return "<h4>Summary</h4>" +
        table(["Form", "Pending", "Approved", "Released", "Rejected", "Total"], summary, [1, 2, 3, 4, 5]) +
        (stepRows.length ? "<h4>Requisitions by workflow status</h4>" + table(["Status", "Requisitions"], stepRows, [1]) : "") +
        "<h4>List of Forms</h4>" +
        table(["Control No.", "Form", "Requester", "Details", "Date", "Status"], rows);

}

function costReport(p) {

    const from = startOf(p.from), to = endOf(p.to);

    const list = loadForms().filter(function (r) {
        return r.type === "requisition" && inRange(r.dateCreated, from, to);
    });

    if (list.length === 0) return emptyNote();

    // total per department (rejected requisitions are not counted)
    const groups = {};
    let grand = 0;

    list.forEach(function (r) {

        const key = (r.header.department || "-").trim().toLowerCase();

        if (!groups[key]) {
            groups[key] = { name: r.header.department || "-", count: 0, total: 0 };
        }

        groups[key].count++;

        if (r.status !== "Rejected") {
            groups[key].total += r.total || 0;
            grand += r.total || 0;
        }

    });

    const summary = Object.keys(groups).sort().map(function (k) {
        return plain([groups[k].name, groups[k].count, money(groups[k].total)]);
    });

    summary.push({ total: true, cells: ["TOTAL (rejected not counted)", list.length, money(grand)] });

    const rows = list.map(function (r) {
        return plain([noText(r), r.header.department, r.header.month || "-", formatDate(r.dateCreated), r.items.length, money(r.total), r.status]);
    });

    return "<h4>Total per Department</h4>" +
        table(["Department", "Requisitions", "Amount"], summary, [1, 2]) +
        "<h4>List of Requisitions</h4>" +
        table(["Control No.", "Department", "Month", "Date", "Items", "Amount", "Status"], rows, [4, 5]);

}

function issuanceReport(p) {

    const from = startOf(p.from), to = endOf(p.to);

    // receipts made by a release belong to their requisition (listed in "Released Requisitions"), so they are not counted twice
    const receipts = loadForms().filter(function (r) {
        return r.type === "receipt" && !r.autoRelease && inRange(r.dateCreated, from, to);
    });

    // requisitions whose items were really released (the release record, not the request date, decides)
    const released = loadForms().filter(function (r) {
        return r.type === "requisition" && ((r.releases || []).length || r.release) && ((r.releases || []).some(function (b) { return inRange(b.at, from, to); }) || inRange(r.release.at, from, to));
    });

    if (receipts.length === 0 && released.length === 0) return emptyNote();

    let qty = 0;

    const rows = receipts.map(function (r) {

        const items = r.items.map(function (it) {
            qty += parseFloat(it.qty) || 0;
            return (it.qty + " " + (it.unit || "") + " " + it.item).replace(/\s+/g, " ").trim();
        }).join("; ");

        return plain([noText(r), r.header.name, r.header.department, formatDate(r.dateCreated), items, r.issuedBy || r.requesterEmail || "-"]);

    });

    let relQty = 0;

    const relRows = released.map(function (r) {

        const items = r.release.lines.map(function (l) {
            relQty += parseFloat(l.released) || 0;
            return (l.released + " of " + l.requested + " " + (l.unit || "") + " " + l.name).replace(/\s+/g, " ").trim();
        }).join("; ");

        const receiptNos = (r.releases || []).map(function (b) { return b.receiptNo; }).filter(Boolean).join(", ");

        return plain([noText(r), (r.header.representativeName || "-") + " (" + (r.header.department || "-") + ")", formatDate(r.release.at), items + (receiptNos ? " [receipts: " + receiptNos + "]" : ""), r.release.by || "-",
                      r.acknowledgment ? "Confirmed " + formatDate(r.acknowledgment.at) : (r.status === "Partially Released" ? "Balance pending" : "Waiting")]);

    });

    let html = "<h4>Summary</h4>" +
        table(["Source", "Records", "Total Quantity Issued"], [plain(["Acknowledgment receipts", receipts.length, qty]), plain(["Released requisitions", released.length, relQty])], [1, 2]);

    if (released.length) {
        html += "<h4>Released Requisitions</h4>" +
            table(["Requisition No.", "Released To", "Release Date", "Items (released of requested)", "Released By", "Receipt"], relRows);
    }

    if (receipts.length) {
        html += "<h4>List of Receipts</h4>" +
            table(["Control No.", "Issued To", "Department", "Date", "Items", "Prepared By"], rows);
    }

    return html;

}

// ----- Pull-Out Report: the pull-out records of the period (units, reason, condition, status) -----
function pulloutReport(p) {

    const from = startOf(p.from), to = endOf(p.to);
    const list = readJSON("pulloutRecords").filter(function (r) { return inRange(r.date, from, to); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    if (list.length === 0) return emptyNote();

    const units = readJSON("assetUnits");
    const assets = readJSON(ASSETS_KEY_FOR_REPORT);
    const countUnits = function (rs) { return rs.reduce(function (s, r) { return s + r.unitIds.length; }, 0); };

    const byStatus = ["For Pull-Out", "Pulled Out", "Cancelled"].map(function (st) {
        const rs = list.filter(function (r) { return r.status === st; });
        return plain([st, rs.length, countUnits(rs)]);
    });
    byStatus.push({ total: true, cells: ["TOTAL", list.length, countUnits(list)] });

    const reasons = Array.from(new Set(list.map(function (r) { return r.reason; }))).map(function (reason) {
        const rs = list.filter(function (r) { return r.reason === reason; });
        return plain([reason, rs.length, countUnits(rs)]);
    });

    const rows = list.map(function (r) {
        const names = r.unitIds.map(function (id) {
            const u = units.find(function (x) { return x.id === id; });
            const a = u ? assets.find(function (x) { return x.id === u.assetId; }) : null;
            return id + (a ? " (" + a.name + ")" : "");
        }).join("; ");
        return plain([noText(r), formatDate(r.date), names, r.reason + (r.reasonNote ? " - " + r.reasonNote : ""), r.condition, r.status, r.createdByName || r.createdBy || "-"]);
    });

    return "<h4>Summary by Status</h4>" + table(["Status", "Records", "Units"], byStatus, [1, 2]) +
        "<h4>Summary by Reason</h4>" + table(["Reason", "Records", "Units"], reasons, [1, 2]) +
        "<h4>List of Pull-Out Records</h4>" + table(["Record No.", "Date", "Units", "Reason", "Condition", "Status", "Created By"], rows);

}

function auditReport(p) {

    const from = startOf(p.from), to = endOf(p.to);
    const list = loadLogs().filter(function (l) { return inRange(l.date, from, to); });

    if (list.length === 0) return emptyNote();

    const rows = list.map(function (l) {
        return plain([l.id, l.user, l.role, l.activity, formatDate(l.date), formatTime(l.date)]);
    });

    return table(["Log ID", "User", "Role", "Activity", "Date", "Time"], rows);

}

function inventoryReport() {

    if (typeof loadAssets !== "function") {
        return '<p class="empty">The Shared folder (stock.js) was not found, so the inventory cannot be read.</p>';
    }

    const assets = loadAssets();

    if (assets.length === 0) return emptyNote();

    // summary per type
    const types = [TYPE_CONSUMABLE, TYPE_NON_CONSUMABLE];
    const sums = { items: 0, total: 0, available: 0, issued: 0, maintenance: 0, low: 0 };

    const summary = types.map(function (type) {

        const mine = assets.filter(function (a) { return a.type === type; });

        const row = {
            items: mine.length,
            total: mine.reduce(function (s, a) { return s + a.quantity; }, 0),
            available: mine.reduce(function (s, a) { return s + assetAvailable(a); }, 0),
            issued: mine.reduce(function (s, a) { return s + a.issued; }, 0),
            maintenance: mine.reduce(function (s, a) { return s + a.maintenance; }, 0),
            low: mine.filter(isLowStock).length
        };

        Object.keys(sums).forEach(function (k) { sums[k] += row[k]; });

        return plain([type, row.items, row.total, row.available, row.issued, row.maintenance, row.low]);

    });

    summary.push({ total: true, cells: ["TOTAL", sums.items, sums.total, sums.available, sums.issued, sums.maintenance, sums.low] });

    const rows = assets.map(function (a) {
        return plain([a.id, a.name, a.type, a.category, stockText(a), a.location, assetStatus(a)]);
    });

    // supplies that need to be bought again
    const low = assets.filter(isLowStock).map(function (a) {
        return plain([a.id, a.name, a.quantity + " " + a.unit, a.reorderLevel, assetStatus(a)]);
    });

    return "<h4>Summary per Type</h4>" +
        table(["Type", "Items", "Total Qty / Stock", "Available", "Issued", "Maintenance", "Low / Out of Stock"], summary, [1, 2, 3, 4, 5, 6]) +
        "<h4>List of Assets</h4>" +
        table(["Asset ID", "Asset Name", "Type", "Category", "Stock", "Location", "Status"], rows) +
        "<h4>Supplies to Restock (low or out of stock)</h4>" +
        (low.length
            ? table(["Asset ID", "Asset Name", "Stock", "Reorder Level", "Status"], low, [3])
            : '<p class="empty">No supply is low on stock.</p>');

}

function userReport() {

    const users = readJSON("users");

    if (users.length === 0) return emptyNote();

    function count(role, status) {
        return users.filter(function (u) { return u.role === role && (!status || u.status === status); }).length;
    }

    const summary = ["Administrator", "Staff", "Auditor", "Requester"].map(function (role) {
        return plain([role, count(role), count(role, "Active"), count(role, "Inactive")]);
    }).concat([
        { total: true, cells: ["TOTAL", users.length, users.filter(function (u) { return u.status === "Active"; }).length, users.filter(function (u) { return u.status !== "Active"; }).length] }
    ]);

    // passwords are never printed
    const rows = users.map(function (u) {
        return plain([u.id, u.name, u.email, u.department || "-", u.role, u.status]);
    });

    return "<h4>Summary</h4>" +
        table(["Role", "Users", "Active", "Inactive"], summary, [1, 2, 3]) +
        "<h4>List of Users</h4>" +
        table(["User ID", "Full Name", "Email", "Department", "Role", "Status"], rows);

}

const BUILDERS = {
    "Request Report": requestReport,
    "Requisition Cost Report": costReport,
    "Issuance Report": issuanceReport,
    "Pull-Out Report": pulloutReport,
    "Audit Trail Report": auditReport,
    "Inventory Report": inventoryReport,
    "User Report": userReport
};


// ========================================
// PRINT A REPORT
// ========================================

function printReport(p) {

    const build = BUILDERS[p.type];

    if (!build) {
        alert("Unknown report type.");
        return;
    }

    document.getElementById("printArea").innerHTML =
        '<div class="report">' +
            '<div class="r-head">' +
                '<img src="' + appLogoSrc("../../Admin/Login/neu-logo.png") + '" alt="">' +
                '<div class="uni">' + esc(appInstitution()) + '</div>' +
                '<div class="dept">' + esc(appOffice().toUpperCase()) + '</div>' +
                '<div class="title">' + esc(p.type.toUpperCase()) + "</div>" +
                '<div class="period">Period: ' + esc(periodText(SNAPSHOT_REPORTS.indexOf(p.type) !== -1 ? Object.assign({}, p, { date: new Date().toISOString() }) : p)) + "</div>" +
            "</div>" +
            build(p) +
            '<div class="r-sign">' +
                '<div>Prepared by:<div class="line">' + esc(p.preparedBy) + "</div></div>" +
                '<div>Noted by:<div class="line">' + (typeof directorName === "function" ? esc(directorName()) : "&nbsp;") + "<br>DIRECTOR</div></div>" +
            "</div>" +
            '<div class="r-foot">Generated on ' + esc(new Date().toLocaleString("en-US")) + "</div>" +
        "</div>";

    setPageStyle("portrait");
    window.print();

}


// Set the text of an element (does nothing if the element is not on the page)
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Attach an event only if the element exists
function on(id, eventName, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(eventName, handler);
}

function showProblems() {

    // an old reports.html does not have the new elements
    ["totalForms", "generateBtn", "reportTableBody"].forEach(function (id) {
        if (!document.getElementById(id) && id !== "generateBtn") {
            PROBLEMS.push("reports.html is the old version. Replace it with the new reports.html.");
        }
    });

    if (!document.getElementById("generateBtn") && document.getElementById("generatePDF")) {
        PROBLEMS.push("reports.html is the old version. Replace it with the new reports.html.");
    }

    if (PROBLEMS.length === 0) return;

    const unique = PROBLEMS.filter(function (p, i) { return PROBLEMS.indexOf(p) === i; });
    const banner = document.createElement("div");

    banner.style.cssText = "background:#dc3545;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:14px;";
    banner.textContent = unique.join(" ");

    const navbar = document.querySelector(".navbar");

    if (navbar && navbar.parentNode) {
        navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    }

}

// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    setupSidebar();

    // Attach the buttons first, so they work even if something else is missing
    on("searchReport", "input", render);

    on("openGenerateModal", "click", openModal);
    on("closeModal", "click", closeModal);
    on("cancelModal", "click", closeModal);

    on("reportModal", "click", function (e) {
        if (e.target === this) closeModal();
    });

    // new button id, or the id used by the old reports.html
    on(document.getElementById("generateBtn") ? "generateBtn" : "generatePDF", "click", generateReport);

    try {
        render();
    } catch (e) {
        console.error("Could not show the reports list:", e);
    }

    showProblems();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms", "auditLog", "assets", "users", "reportHistory"], render);
    }

});


// ========================================
// CARDS + HISTORY TABLE
// ========================================

function render() {

    // ----- cards (real data) -----
    const forms = loadForms();

    let amount = 0;

    forms.forEach(function (r) {
        if (r.type === "requisition" && r.status !== "Rejected") amount += r.total || 0;
    });

    setText("totalForms", forms.length);
    setText("requisitionAmount", money(amount));
    setText("receiptsIssued", forms.filter(function (r) { return r.type === "receipt"; }).length);
    setText("activityLogs", loadLogs().length);

    // ----- generated reports -----
    const searchBox = document.getElementById("searchReport");
    const tbody = document.getElementById("reportTableBody");

    if (!searchBox || !tbody) return;

    const search = searchBox.value.toLowerCase().trim();

    const all = loadHistory().map(function (h, i) {
        h.id = "RPT" + String(i + 1).padStart(3, "0");
        return h;
    }).reverse();

    const shown = all.filter(function (h) {
        return !search || (h.id + " " + h.type + " " + h.preparedBy).toLowerCase().includes(search);
    });

    tbody.innerHTML = "";

    const noReports = document.getElementById("noReports");
    if (noReports) noReports.style.display = shown.length ? "none" : "block";

    shown.forEach(function (h) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(h.id) + "</td>" +
            "<td>" + esc(h.type) + "</td>" +
            "<td>" + esc(periodText(h)) + "</td>" +
            "<td>" + esc(formatDate(h.date)) + "</td>" +
            "<td>" + esc(h.preparedBy) + "</td>" +
            "<td></td>";

        const button = document.createElement("button");
        button.className = "view-btn";
        button.textContent = "Print";
        button.addEventListener("click", function () { printReport(h); });
        row.lastElementChild.appendChild(button);

        tbody.appendChild(row);

    });

}


// ========================================
// GENERATE WINDOW
// ========================================

function openModal() {

    // only an Administrator can print the User Report and the Audit Trail Report
    Array.from(document.getElementById("reportType").options).forEach(function (o) {
        const hidden = typeof can === "function" &&
            ((o.value === "User Report" && !can("userReport")) || (o.value === "Audit Trail Report" && !can("auditReport")));
        o.hidden = hidden;
        o.disabled = hidden;
    });
    document.getElementById("reportType").value = "Request Report";

    document.getElementById("dateFrom").value = "";
    document.getElementById("dateTo").value = "";
    document.getElementById("preparedBy").value = (typeof currentUserName === "function" && currentUserName()) || "Administrator";
    document.getElementById("reportModal").style.display = "flex";

}

function closeModal() {
    document.getElementById("reportModal").style.display = "none";
}

function generateReport() {

    const p = {
        type: document.getElementById("reportType").value,
        from: document.getElementById("dateFrom").value,
        to: document.getElementById("dateTo").value,
        preparedBy: document.getElementById("preparedBy").value.trim(),
        date: new Date().toISOString()
    };

    if (!p.preparedBy) {
        alert("Please enter who prepared the report.");
        return;
    }

    if (p.from && p.to && p.from > p.to) {
        alert("'Date From' must not be later than 'Date To'.");
        return;
    }

    // keep it in the list of generated reports
    const history = loadHistory();
    history.push(p);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    if (typeof tryAuditLog === "function") {
        tryAuditLog(sessionStorage.getItem("userEmail") || "Admin", (typeof currentRole === "function" && currentRole()) || "Staff", "Generated " + p.type);
    }

    closeModal();
    render();
    printReport(p);

}


// ========================================
// SIDEBAR + LOGOUT
// ========================================

function setupSidebar() {

    document.querySelectorAll(".sidebar ul li").forEach(function (item) {

        item.addEventListener("click", function () {

            switch (item.textContent.trim()) {

                case "Dashboard":
                    window.location.href = "../Dashboard/dashboard.html";
                    break;

                case "Request Management":
                    window.location.href = "../RequestManagement/requestmanagement.html";
                    break;

                case "Assets":
                    window.location.href = "../Assets/assets.html";
                    break;

                case "Annual Inventory":
                    window.location.href = "../AnnualInventory/annualinventory.html";
                    break;

                case "Issuance":
                    window.location.href = "../Issuance/issuance.html";
                    break;

                case "Reports":
                    window.location.href = "reports.html";
                    break;

                case "Users":
                    window.location.href = "../Users/users.html";
                    break;

                case "Audit Trail":
                    window.location.href = "../AuditTrail/audittrail.html";
                    break;

                case "Logout":
                    logout();
                    break;

            }

        });

    });

}

function logout() {

    if (confirm("Are you sure you want to logout?")) {
        if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
        window.location.href = "../Login/login.html";
    }

}
