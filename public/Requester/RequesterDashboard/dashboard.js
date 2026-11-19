// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// REQUESTER DASHBOARD JAVASCRIPT
// Shows the forms saved from the Request page
// ========================================

const STORE_KEY = "forms";
const RECENT_LIMIT = 5;

const FORM_INFO = {
    requisition: {
        label: "Requisition",
        details: function (r) { return r.header.department; }
    },
    receipt: {
        label: "Acknowledgment Receipt",
        details: function (r) { return r.header.name + " (" + r.header.department + ")"; }
    },
    pullout: {
        label: "Pull-Out Request",
        details: function (r) { return r.header.requestingParty + (r.header.office ? " - " + r.header.office : ""); }
    }
};


// ========================================
// HELPERS
// ========================================

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        return dateString || "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function loadForms() {
    let all = [];

    try {
        all = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) {
        all = [];
    }

    // Only the forms of the logged-in requester
    const email = sessionStorage.getItem("userEmail");

    return all
        .filter(function (r) {
            return FORM_INFO[r.type] &&
                (!email || !r.requesterEmail || r.requesterEmail.toLowerCase() === email.toLowerCase());
        })
        .reverse(); // newest first
}

function statusClass(status) {
    if (status === "Approved") return "approved";
    if (status === "Rejected") return "rejected";
    if (status === "Released") return "released";
    if (status === "Completed") return "completed";
    return "pending";
}


// ========================================
// PAGE LOAD
// ========================================

let dashTable = null;

function myNotifications() {
    let all = [];
    try { all = JSON.parse(localStorage.getItem("notifications")) || []; } catch (e) { all = []; }
    return all.filter(function (n) { return String(n.to).toLowerCase() === wfMe(); }).reverse();
}

function refreshDashboard() {

    // only MY requisitions (a Requester never sees another Requester's records)
    const mine = wfMyRequisitions();

    function count(fn) { return mine.filter(fn).length; }

    const pendingSet = [WF.SUBMITTED, WF.PEND_DEPT, WF.PEND_REVIEW, WF.PEND_AUD_SIGN, WF.PEND_DIRECTOR];

    document.getElementById("cTotal").textContent = mine.length;
    document.getElementById("cPending").textContent = count(function (f) { return pendingSet.indexOf(f.status) !== -1; });
    document.getElementById("cApproved").textContent = count(function (f) { return wfApproved(f); });
    document.getElementById("cRejected").textContent = count(function (f) { return f.status === WF.REJECTED; });
    document.getElementById("cReady").textContent = count(function (f) { return f.status === WF.READY || f.status === WF.PARTIAL; });
    document.getElementById("cReleased").textContent = count(function (f) { return f.status === WF.RELEASED || f.status === WF.COMPLETED; });

    if (dashTable) dashTable.redraw();

    // ----- status tracking: the requisitions that are still moving -----
    const active = mine.filter(function (f) { return [WF.COMPLETED, WF.REJECTED, WF.DRAFT].indexOf(f.status) === -1; }).slice(-2).reverse();
    document.getElementById("tracking").innerHTML = active.length ? active.map(function (f) {
        return '<div style="margin-bottom:10px"><b>' + wfEsc(f.controlNo) + "</b> " + wfBadge(f.status) + wfProgressHtml(f) + "</div>";
    }).join("") : '<div class="wf-empty">No requisition in progress.</div>';

    // ----- graphical summary -----
    const total = Math.max(1, mine.length);
    document.getElementById("statusBars").innerHTML = WF_STATUSES.map(function (st) {
        const n = count(function (f) { return f.status === st; });
        return n ? '<div class="wf-barrow"><span>' + wfEsc(st) + "</span><b>" + n + '</b></div><div class="wf-bar"><span style="width:' + Math.round(n * 100 / total) + '%"></span></div>' : "";
    }).join("") || '<div class="wf-empty">No data yet.</div>';

    // ----- notifications and transactions -----
    const notes = myNotifications().slice(0, 4);
    document.getElementById("recentNotes").innerHTML = notes.length ? notes.map(function (n) {
        const unread = (n.readBy || []).indexOf(wfMe()) === -1;
        return '<div class="wf-list-item">' + (unread ? "<b>" + wfEsc(n.message) + "</b>" : wfEsc(n.message)) + "<small>" + wfEsc(wfFormatDate(n.date, true)) + "</small></div>";
    }).join("") : '<div class="wf-empty">No notifications yet.</div>';

    const trans = [];
    mine.forEach(function (f) {
        if (f.release) trans.push({ at: f.release.at, text: "Items of " + f.controlNo + " released by " + f.release.by });
        if (f.acknowledgment) trans.push({ at: f.acknowledgment.at, text: "You confirmed receipt of " + f.controlNo });
    });
    trans.sort(function (a, b) { return b.at.localeCompare(a.at); });
    document.getElementById("transactions").innerHTML = trans.length ? trans.slice(0, 4).map(function (t) {
        return '<div class="wf-list-item">' + wfEsc(t.text) + "<small>" + wfEsc(wfFormatDate(t.at, true)) + "</small></div>";
    }).join("") : '<div class="wf-empty">No transactions yet.</div>';

}

function setupDashboardTable() {

    const search = document.getElementById("dSearch");
    const status = document.getElementById("dStatus");

    WF_STATUSES.forEach(function (st) { const o = document.createElement("option"); o.value = st; o.textContent = st; status.appendChild(o); });

    dashTable = wfPagedTable({
        rows: function () {
            const q = search.value.toLowerCase().trim();
            return wfMyRequisitions().filter(function (f) {
                if (status.value !== "all" && f.status !== status.value) return false;
                return !q || (f.controlNo + " " + f.header.department + " " + f.status).toLowerCase().indexOf(q) !== -1;
            }).sort(function (a, b) { return b.dateCreated.localeCompare(a.dateCreated); });
        },
        tbody: "requestTableBody", pager: "dPager", cols: 6, perPage: 5, empty: 'No requisitions yet. Click "Create Requisition" to start.',
        rowHtml: function (f) {
            return "<tr><td><b>" + wfEsc(f.controlNo) + "</b></td><td>" + wfEsc(f.header.department) + "</td><td>" + f.items.length + "</td><td>" + wfEsc(wfFormatDate(f.dateCreated)) +
                "</td><td>" + wfBadge(f.status) + '</td><td><button type="button" class="wf-btn sm gold" data-view="' + f.id + '">View Details</button></td></tr>';
        },
        onView: function (id) { wfRequesterDetails(id, refreshDashboard); }
    });

    search.addEventListener("input", function () { dashTable.redraw(true); });
    status.addEventListener("change", function () { dashTable.redraw(true); });

}

document.addEventListener("DOMContentLoaded", function () {

    setupDashboardTable();
    refreshDashboard();

    if (typeof onDataChange === "function") {
        onDataChange(["forms", "notifications"], refreshDashboard);
    }

    document.getElementById("allNotes").addEventListener("click", function () { window.location.href = "../RequesterNotifications/notifications.html"; });
    document.getElementById("allHistory").addEventListener("click", function () { window.location.href = "../RequesterHistory/history.html"; });

    // ----- Sidebar menu -----
    const menuItems = document.querySelectorAll(".sidebar ul li");

    menuItems.forEach(function (item) {

        item.addEventListener("click", function () {

            const menuName = item.textContent.trim();

            menuItems.forEach(function (menu) {
                menu.classList.remove("active");
            });

            item.classList.add("active");

            switch (menuName) {

                case "Dashboard":
                    window.location.href = "../RequesterDashboard/dashboard.html";
                    break;

                case "Request":
                case "Create Requisition":
                    window.location.href = "../Request/request.html";
                    break;

                case "Notifications":
                    window.location.href = "../RequesterNotifications/notifications.html";
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

                case "Logout":
                    if (confirm("Are you sure you want to logout?")) {
                        if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
                        window.location.href = "../RequesterLogin/login.html";
                    } else {
                        item.classList.remove("active");
                        menuItems[0].classList.add("active");
                    }
                    break;

            }

        });

    });

    // ----- "Make a Request" button -----
    document.getElementById("requestButton").addEventListener("click", function () {
        window.location.href = "../Request/request.html";
    });

});


// ========================================
// MOBILE SIDEBAR
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.querySelector(".sidebar");

    if (mobileMenuBtn && sidebar) {

        mobileMenuBtn.addEventListener("click", function () {
            sidebar.classList.toggle("active");
        });

        sidebar.querySelectorAll("li").forEach(function (item) {
            item.addEventListener("click", function () {
                sidebar.classList.remove("active");
            });
        });

    }

});
