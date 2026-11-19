// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED PERMISSIONS (Administrator and Staff)
//
// The Admin side has two roles that use the same pages:
//
//   Administrator   can do everything
//   Staff           prepares the work (inventory, assets, issuance, release) but cannot
//                   approve or reject a requisition, cannot sign as Director, cannot delete,
//                   cannot certify an annual inventory, and cannot open Users or System Settings
//   Auditor         separate dashboard: reviews and signs requisitions only
//   Requester       own pages: creates requisitions and confirms receipt
//
//   can("changeStatus")      -> true or false for the logged-in person
//
// NOTE: this only hides the buttons and the pages in the browser (it is a prototype).
// With Laravel the same rules must be checked on the server (Policies / Gates).
//
// Put <script src="../../Shared/permissions.js"></script> before the page script.
// ========================================

// What a Staff account cannot do. Everything not listed is allowed.
const STAFF_CANNOT = {
    changeStatus: "approve or reject a request (Director approval)",
    directorSign: "sign as Director",
    deleteAsset: "delete an asset",
    manageUsers: "open Users",
    manageSettings: "open System Settings",
    certifyInventory: "certify an annual inventory",
    reopenInventory: "reopen a certified annual inventory",
    deleteInventory: "delete an annual inventory",
    deleteUnit: "delete a Section / Unit",
    userReport: "print the User Report",
    auditReport: "print the Audit Trail Report"
};

// "Administrator", "Staff", "Auditor" or "Requester" (from the account), "" when nobody is logged in
function currentRole() {

    const email = (sessionStorage.getItem("userEmail") || "").toLowerCase();

    if (!email) return "";

    let users = [];

    try {
        users = JSON.parse(localStorage.getItem("users")) || [];
    } catch (e) {
        users = [];
    }

    const user = users.find(function (u) { return String(u.email).toLowerCase() === email; });

    return user ? user.role : "";

}

function can(action) {
    return !(currentRole() === "Staff" && STAFF_CANNOT[action]);
}

// "Only an Administrator can approve, release or reject a request."
function cannotMessage(action) {
    return "Only an Administrator can " + (STAFF_CANNOT[action] || "do this") + ".";
}

(function () {

    const path = location.pathname.replace(/\\/g, "/");

    // pages that a Staff account cannot open
    // ----- role guard: each role only opens its own pages (frontend simulation, NOT real security) -----
    const role = currentRole();
    const inAdmin = path.indexOf("/Admin/") !== -1 && path.indexOf("/Admin/Login/") === -1;
    const inAuditor = path.indexOf("/Auditor/") !== -1;
    const inRequester = path.indexOf("/Requester/") !== -1 && path.indexOf("/RequesterLogin/") === -1;

    // not logged in: every page except the login pages goes to its login page (frontend simulation, NOT real security)
    if (!role && (inAdmin || inAuditor || inRequester)) {
        const rootPath = path.substring(0, path.search(/\/(Admin|Auditor|Requester)\//));
        document.documentElement.style.display = "none";
        location.replace(rootPath + (inRequester ? "/Requester/RequesterLogin/login.html" : "/Admin/Login/login.html"));
    }

    if (role) {
        let home = "";
        if ((inAdmin && (role === "Auditor" || role === "Requester")) ||
            (inAuditor && role !== "Auditor") ||
            (inRequester && role !== "Requester")) {
            home = role === "Auditor" ? "/Auditor/AuditorDashboard/dashboard.html"
                 : role === "Requester" ? "/Requester/RequesterDashboard/dashboard.html"
                 : "/Admin/Dashboard/dashboard.html";
            const root = path.substring(0, path.search(/\/(Admin|Auditor|Requester)\//));
            document.documentElement.style.display = "none";
            location.replace(root + home);
        }
    }

    const closed = [
        { part: "/Admin/Users/", action: "manageUsers", menu: "Users" },
        { part: "/Admin/Settings/", action: "manageSettings", menu: "System Settings" }
    ];

    closed.forEach(function (c) {
        if (path.indexOf(c.part) !== -1 && !can(c.action)) {
            // not for this person: go to the Dashboard (the page is hidden meanwhile)
            document.documentElement.style.display = "none";
            location.replace("../Dashboard/dashboard.html");
        }
    });

    // the menu does not show what the person cannot open
    function hideMenu() {

        document.querySelectorAll(".sidebar li").forEach(function (li) {

            closed.forEach(function (c) {
                if (li.textContent.trim() === c.menu && !can(c.action)) li.style.display = "none";
            });

        });

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", hideMenu);
    } else {
        hideMenu();
    }

})();
