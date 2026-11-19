// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// MY REQUESTS JAVASCRIPT
// Reads the forms saved from the Request page
// (Requisition, Acknowledgment Receipt, Pull-Out Request)
// ========================================

const STORE_KEY = "forms";

// How each form type is shown in the table and in the details window
const FORM_INFO = {
    requisition: {
        label: "Requisition",
        header: [
            ["department", "Department"],
            ["section", "Section"],
            ["month", "Month"]
        ],
        cols: [
            ["name", "Name"], ["qty", "Qty"], ["unit", "Unit"], ["particulars", "Particulars"],
            ["price", "Unit Price"], ["amount", "Amount"], ["lastRequested", "Date Last Requested"], ["receivedBy", "Received By"]
        ],
        details: function (r) { return r.header.department; }
    },
    receipt: {
        label: "Acknowledgment Receipt",
        header: [
            ["name", "Name"],
            ["department", "Department"]
        ],
        cols: [["qty", "Qty"], ["unit", "Unit"], ["item", "Item"], ["description", "Description"]],
        details: function (r) { return r.header.name + " (" + r.header.department + ")"; }
    },
    pullout: {
        label: "Pull-Out Request",
        header: [
            ["requestingParty", "Requesting Party"],
            ["office", "Office / Classroom"],
            ["date", "Date"],
            ["pulledOutBy", "Pulled-Out by"],
            ["pulledDate", "Date Pulled-Out"],
            ["receivedBy", "Received by"],
            ["receivedDate", "Date Received"]
        ],
        cols: [["qty", "Qty"], ["item", "Item/s"], ["description", "Description/s"], ["reason", "Reason"]],
        details: function (r) { return r.header.requestingParty + (r.header.office ? " - " + r.header.office : ""); }
    }
};

// Forms currently shown in the table (used by the View button)
let shownForms = [];


// ========================================
// HELPERS
// ========================================

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function money(n) {
    return Number(n || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function loadForms() {
    let all = [];

    try {
        all = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) {
        all = [];
    }

    // Only show the forms of the logged-in requester
    const email = sessionStorage.getItem("userEmail");

    return all
        .filter(function (r) {
            return FORM_INFO[r.type] &&
                (!email || !r.requesterEmail || r.requesterEmail.toLowerCase() === email.toLowerCase());
        })
        .reverse(); // newest first
}

function formatDate(dateString) {
    if (!dateString) {
        return "-";
    }

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    loadRequests();

    // update when another window changes the forms (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms"], loadRequests);
    }

    // a notification opens the form: ?open=type|controlNo
    const openRef = new URLSearchParams(window.location.search).get("open");

    if (openRef) {

        const parts = openRef.split("|");
        const index = shownForms.findIndex(function (r) { return r.type === parts[0] && r.controlNo === parts[1]; });

        if (index !== -1) viewRequest(index);

    }

    // Search
    const searchBox = document.getElementById("searchBox");

    searchBox.addEventListener("input", function () {

        const value = searchBox.value.toLowerCase().trim();

        document.querySelectorAll("#requestTableBody tr").forEach(function (row) {
            row.style.display = row.textContent.toLowerCase().includes(value) ? "" : "none";
        });

    });

});


// ========================================
// LOAD REQUESTS
// ========================================

function loadRequests() {

    shownForms = loadForms();

    const tableBody = document.getElementById("requestTableBody");
    const noRequests = document.getElementById("noRequests");

    updateSummary(shownForms);

    tableBody.innerHTML = "";

    if (shownForms.length === 0) {
        noRequests.style.display = "block";
        return;
    }

    noRequests.style.display = "none";

    shownForms.forEach(function (r, index) {

        const info = FORM_INFO[r.type];
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(info.label) + "</td>" +
            "<td><strong>" + esc(r.controlNo) + "</strong></td>" +
            "<td>" + esc(info.details(r)) + "</td>" +
            "<td>" + r.items.length + "</td>" +
            "<td>" + esc(formatDate(r.dateCreated)) + "</td>" +
            "<td>" + (r.type === "requisition" && typeof wfBadge === "function" ? wfBadge(r.status) : getStatusBadge(r.status, (typeof statusText === "function" ? statusText(r) : r.status))) + "</td>" +
            '<td><button class="view-btn" onclick="viewRequest(' + index + ')">View</button></td>';

        tableBody.appendChild(row);

    });

}


// ========================================
// UPDATE SUMMARY
// ========================================

function updateSummary(list) {

    function count(statuses) {
        return list.filter(function (r) {
            return statuses.indexOf(r.status) !== -1;
        }).length;
    }

    document.getElementById("totalRequests").textContent = list.length;
    // pull-out requests keep the old statuses; requisitions have the workflow statuses
    document.getElementById("pendingRequests").textContent = count(["Pending", "Draft", "Submitted", "Pending Department Head Signature", "Pending Auditor Review", "Pending Auditor Signature", "Pending Director Approval"]);
    document.getElementById("approvedRequests").textContent = count(["Approved", "Ready for Release", "Partially Released", "Released", "Completed"]);
    document.getElementById("rejectedRequests").textContent = count(["Rejected"]);

}


// ========================================
// STATUS BADGE
// ========================================

function getStatusBadge(status, text) {

    let className = "pending";

    if (status === "Approved") {
        className = "approved";
    } else if (status === "Rejected") {
        className = "rejected";
    } else if (status === "Released" || status === "Completed") {
        className = "completed";
    }

    return '<span class="status ' + className + '">' + esc(text || status) + "</span>";

}


// ========================================
// VIEW REQUEST (DETAILS WINDOW)
// ========================================

function detailRow(label, valueHtml) {
    return '<div class="detail-row">' +
        '<span class="detail-label">' + esc(label) + "</span>" +
        '<span class="detail-value">' + valueHtml + "</span>" +
        "</div>";
}

function viewRequest(index) {

    const r = shownForms[index];

    if (!r) {
        return;
    }

    // requisitions use the shared workflow window (signature progress, Department Head signature, confirm receipt)
    if (r.type === "requisition" && typeof wfRequesterDetails === "function") {
        wfRequesterDetails(r.id, loadRequests);
        return;
    }

    const info = FORM_INFO[r.type];

    let html = "";

    html += detailRow("Form", esc(info.label));
    html += detailRow("Control No.", esc(r.controlNo));

    info.header.forEach(function (h) {
        const value = r.header[h[0]];
        html += detailRow(h[1], esc(h[0].toLowerCase().indexOf("date") !== -1 ? formatDate(value) : (value || "-")));
    });

    html += detailRow("Date Submitted", esc(formatDate(r.dateCreated)));
    html += detailRow("Status", getStatusBadge(r.status, (typeof statusText === "function" ? statusText(r) : r.status)));

    // the three signatures of a requisition (Shared/signatures.js)
    if (typeof signatureRows === "function") {
        signatureRows(r).forEach(function (row) { html += detailRow(row[0], esc(row[1])); });
    }

    // Items table
    let table = "<table><thead><tr>";

    info.cols.forEach(function (c) {
        table += "<th>" + esc(c[1]) + "</th>";
    });

    table += "</tr></thead><tbody>";

    r.items.forEach(function (it) {
        table += "<tr>";
        info.cols.forEach(function (c) {
            let v = it[c[0]];
            if ((c[0] === "price" || c[0] === "amount") && v) {
                v = money(v);
            }
            table += "<td>" + esc(v || "") + "</td>";
        });
        table += "</tr>";
    });

    if (r.type === "requisition") {
        table += '<tr class="total-row"><td colspan="5">TOTAL</td><td>' + money(r.total) + '</td><td colspan="2"></td></tr>';
    }

    table += "</tbody></table>";

    html += '<div class="modal-items">' + table + "</div>";

    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalOverlay").style.display = "flex";

}


// ========================================
// CLOSE MODAL
// ========================================

function closeModal() {
    document.getElementById("modalOverlay").style.display = "none";
}

window.addEventListener("click", function (event) {
    if (event.target === document.getElementById("modalOverlay")) {
        closeModal();
    }
});


// ========================================
// SIDEBAR NAVIGATION
// ========================================

function goToPage(menuName) {

    switch (menuName) {

        case "Dashboard":
            window.location.href = "../RequesterDashboard/dashboard.html";
            break;

        case "Notifications":
            window.location.href = "../RequesterNotifications/notifications.html";
            break;

        case "Request":
            window.location.href = "../Request/request.html";
            break;

        case "My Requests":
            window.location.href = "../RequesterMyRequests/myrequests.html";
            break;

        case "History":
            window.location.href = "../RequesterHistory/history.html";
            break;

        case "My Inventory":
            window.location.href = "../RequesterInventory/inventory.html";
            break;

        default:
            console.log("Unknown menu item:", menuName);

    }

}


// ========================================
// LOGOUT
// ========================================

function logout() {

    if (confirm("Are you sure you want to logout?")) {
        if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
        window.location.href = "../RequesterLogin/login.html";
    }

}
