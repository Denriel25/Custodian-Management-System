// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// AUDIT TRAIL JAVASCRIPT (ADMIN)
// Shows the activities saved by Shared/audit.js:
// logins, submitted forms and status changes. Read-only.
// ========================================

const FORM_LABELS = {
    requisition: "Requisition",
    receipt: "Acknowledgment Receipt",
    pullout: "Pull-Out Request"
};

let logs = []; // all logs, oldest first, with a Log ID


// ========================================
// HELPERS
// ========================================

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function loadLogs() {

    let raw = [];

    try {
        raw = JSON.parse(localStorage.getItem(AUDIT_KEY)) || [];
    } catch (e) {
        raw = [];
    }

    return raw.map(function (entry, index) {

        // Older entries (first version) had action / formType / controlNo instead of activity
        let activity = entry.activity;

        if (!activity) {
            activity = (entry.action || "Updated") + " " +
                (FORM_LABELS[entry.formType] || "form") + " " + (entry.controlNo || "");
        }

        return {
            id: "LOG" + String(index + 1).padStart(3, "0"),
            user: entry.user || "Unknown",
            role: entry.role || "Administrator",
            activity: activity.trim(),
            date: new Date(entry.date)
        };

    });

}

function formatDate(d) {
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function formatTime(d) {
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    setupSidebar();

    logs = loadLogs();

    updateCards();
    render();

    // update when another window writes to the audit trail (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["auditLog"], function () {
            logs = loadLogs();
            updateCards();
            render();
        });
    }

    document.getElementById("roleFilter").addEventListener("change", render);
    document.getElementById("searchBox").addEventListener("input", render);

});


// ========================================
// CARDS
// ========================================

function updateCards() {

    const today = formatDate(new Date());

    const todayCount = logs.filter(function (l) {
        return formatDate(l.date) === today;
    }).length;

    const loginCount = logs.filter(function (l) {
        return l.activity.toLowerCase().indexOf("logged in") === 0;
    }).length;

    document.getElementById("totalLogs").textContent = logs.length;
    document.getElementById("todayLogs").textContent = todayCount;
    document.getElementById("loginLogs").textContent = loginCount;
    document.getElementById("transactionLogs").textContent = logs.length - loginCount;

}


// ========================================
// TABLE (newest first)
// ========================================

function render() {

    const role = document.getElementById("roleFilter").value;
    const search = document.getElementById("searchBox").value.toLowerCase().trim();

    const shown = logs
        .filter(function (l) {

            if (role !== "all" && l.role !== role) return false;
            if (!search) return true;

            return (l.id + " " + l.user + " " + l.role + " " + l.activity + " " +
                    formatDate(l.date)).toLowerCase().includes(search);

        })
        .reverse();

    const tbody = document.getElementById("logTableBody");
    tbody.innerHTML = "";

    document.getElementById("noLogs").style.display = shown.length ? "none" : "block";

    shown.forEach(function (l) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(l.id) + "</td>" +
            "<td>" + esc(l.user) + "</td>" +
            "<td>" + esc(l.role) + "</td>" +
            "<td>" + esc(l.activity) + "</td>" +
            "<td>" + esc(formatDate(l.date)) + "</td>" +
            "<td>" + esc(formatTime(l.date)) + "</td>";

        tbody.appendChild(row);

    });

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
                    window.location.href = "../Reports/reports.html";
                    break;

                case "Users":
                    window.location.href = "../Users/users.html";
                    break;

                case "Audit Trail":
                    window.location.href = "audittrail.html";
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
