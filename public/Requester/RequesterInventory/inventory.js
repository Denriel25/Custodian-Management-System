// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// MY INVENTORY JAVASCRIPT (REQUESTER)
//
// The Annual Inventory of the Section / Unit that this requester is responsible for
// (the custodian). The Property Department prepares and counts it. Here the custodian
//   - checks the list,
//   - prints it (to sign the paper),
//   - and certifies it online. An Administrator locks it after the paper is signed.
// A requester sees only his or her own Annual Inventories.
// ========================================

// ---------- Safety check ----------
const MISSING_FILES = (typeof loadAnnuals === "undefined" || typeof loadAssets === "undefined" || typeof printAnnual === "undefined");

if (MISSING_FILES) {
    document.addEventListener("DOMContentLoaded", function () {
        const banner = document.createElement("div");
        banner.style.cssText = "background:#fdecea;color:#c0392b;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:14px;";
        banner.textContent = "The Shared folder (stock.js, inventory.js, print.js) was not found. Put the Shared folder in the project root, next to Admin and Requester.";
        const navbar = document.querySelector(".navbar");
        if (navbar) navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    });
}

const CERTIFICATION_TEXT =
    "I honestly certify that all items listed above have been entrusted under my custody by the administration, " +
    "to be used only for its legitimate purpose. I solemnly swear that I will exercise proper care and protection for these items " +
    "and shall be held liable for any loss or defect of the same due to negligence on my part. I will immediately surrender all these " +
    "items to the Property Office in the event of my termination from the service due to any cause.";


// ========================================
// HELPERS (esc and money come from Shared/print.js)
// ========================================

function el(id) {
    return document.getElementById(id);
}

function myEmail() {
    return (sessionStorage.getItem("userEmail") || "").toLowerCase();
}

function myName() {
    return typeof currentUserName === "function" && currentUserName() ? currentUserName() : (sessionStorage.getItem("userEmail") || "A custodian");
}

function fmt(iso) {

    const d = new Date(iso);

    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

}

function slug(status) {
    return String(status || "draft").toLowerCase();
}

// My reports: the ones of my Section / Unit, once the count is done (a Draft is still being prepared)
function myReports() {

    return loadAnnuals().filter(function (r) {
        return r.status !== "Draft" && r.custodianEmail && r.custodianEmail.toLowerCase() === myEmail();
    });

}

function myUnits() {

    return loadUnits().filter(function (u) {
        return u.custodianEmail && u.custodianEmail.toLowerCase() === myEmail();
    });

}

function describe(it) {

    return [it.brand, it.model, it.make, it.color, it.size, it.serial ? "S/N " + it.serial : ""]
        .filter(Boolean).join(" · ") || "-";

}


// ========================================
// PAGE LOAD
// ========================================

let openId = null;
let shownStatus = null;

document.addEventListener("DOMContentLoaded", function () {

    if (MISSING_FILES) return;

    render();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["annualInventories", "assets", "units"], function () {

            render();

            if (openId && el("miModal").style.display === "flex") {

                const r = myReports().find(function (x) { return x.id === openId; });

                if (!r) closeReport();
                else if (r.status !== shownStatus) openReport(openId);

            }

        });
    }

    el("miClose").addEventListener("click", closeReport);

    el("miModal").addEventListener("click", function (e) {
        if (e.target === this) closeReport();
    });

    // a notification opens the report: ?open=AI-2026-MRm102
    const wanted = new URLSearchParams(window.location.search).get("open");

    if (wanted) openReport(wanted);

});


// ========================================
// THE LISTS
// ========================================

function render() {

    const reports = myReports().slice().reverse();

    el("miTotal").textContent = reports.length;
    el("miWaiting").textContent = reports.filter(function (r) { return r.status === "Verified" && !r.custodianCertifiedAt; }).length;
    el("miCertified").textContent = reports.filter(function (r) { return r.status === "Certified"; }).length;

    const tbody = el("miBody");

    tbody.innerHTML = "";
    el("miEmpty").style.display = reports.length ? "none" : "block";

    reports.forEach(function (r) {

        const mine = r.custodianCertifiedAt ? "Certified " + fmt(r.custodianCertifiedAt) : (r.status === "Verified" ? "Waiting for you" : "-");
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(r.year) + "</td>" +
            "<td><strong>" + esc(r.code) + "</strong> - " + esc(r.section) + "</td>" +
            "<td>" + esc(r.department) + "</td>" +
            "<td>" + r.items.length + "</td>" +
            "<td>" + money(annualTotal(r)) + "</td>" +
            '<td><span class="status ' + esc(slug(r.status)) + '">' + esc(r.status) + "</span></td>" +
            "<td>" + esc(mine) + "</td>" +
            "<td></td>";

        const button = document.createElement("button");

        button.className = "view-btn";
        button.textContent = r.status === "Verified" && !r.custodianCertifiedAt ? "Review" : "View";
        button.addEventListener("click", function () { openReport(r.id); });
        row.lastElementChild.appendChild(button);

        tbody.appendChild(row);

    });

    renderLive();

}

// the items in the records of my Section / Unit today
function renderLive() {

    const box = el("liveBox");
    const units = myUnits();

    box.innerHTML = "";

    if (units.length === 0) {
        box.innerHTML = '<p class="mi-note">You are not the custodian of a Section / Unit yet. The Property Department sets this up.</p>';
        return;
    }

    units.forEach(function (u) {

        const items = loadAssets()
            .filter(function (a) { return !isConsumable(a) && a.unitId === u.id; })
            .sort(function (a, b) { return iinFirst(a) - iinFirst(b); });

        const wrap = document.createElement("div");

        wrap.className = "live-unit";
        wrap.innerHTML = "<h3>" + esc(u.code) + " - " + esc(u.name) + " <small>(" + esc(u.department) + ", " + items.length + " item(s))</small></h3>";

        if (items.length === 0) {
            wrap.innerHTML += '<p class="mi-note">No item yet.</p>';
        } else {

            let rows = "";

            items.forEach(function (a) {
                rows += "<tr><td>" + esc(iinText(a) || "-") + "</td><td>" + esc(a.name) + "</td><td>" + esc(a.quantity + " " + a.unit) +
                        "</td><td>" + esc(describe(a)) + "</td><td>" + esc(a.remarks || "-") + "</td></tr>";
            });

            wrap.innerHTML += '<div class="table-wrapper"><table><thead><tr><th>IIN</th><th>Item</th><th>Qty</th><th>Description</th><th>Remarks</th></tr></thead><tbody>' + rows + "</tbody></table></div>";

        }

        box.appendChild(wrap);

    });

}


// ========================================
// ONE ANNUAL INVENTORY
// ========================================

function openReport(id) {

    const r = myReports().find(function (x) { return x.id === id; });

    if (!r) {
        alert("This Annual Inventory is not available. It may still be in preparation, or it is not yours.");
        return;
    }

    openId = id;
    shownStatus = r.status;

    el("miTitle").textContent = "Annual Inventory " + r.year + " - " + r.code;

    function item(label, value) {
        return "<div><strong>" + esc(label) + "</strong>" + esc(value || "-") + "</div>";
    }

    el("miInfo").innerHTML =
        item("Name", r.custodianName || myName()) +
        item("Job Title", r.jobTitle) +
        item("Department", r.department) +
        item("Section / Unit", r.section) +
        item("Year", r.year) +
        '<div><strong>Status</strong><span class="status ' + esc(slug(r.status)) + '">' + esc(r.status) + "</span></div>";

    const lines = el("miLines");

    lines.innerHTML = "";

    r.items.forEach(function (it) {

        const qty = annualQty(it);
        const amount = annualAmount(it);
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(it.iin || "-") + "</td>" +
            "<td>" + esc(it.item) + "</td>" +
            "<td>" + esc(describe(it)) + "</td>" +
            "<td>" + esc(qty + (it.unit ? " " + it.unit : "")) + "</td>" +
            "<td>" + (it.unitPrice ? money(it.unitPrice) : "-") + "</td>" +
            "<td>" + (amount ? money(amount) : "-") + "</td>" +
            "<td>" + esc(it.remarks || "-") + "</td>";

        lines.appendChild(row);

    });

    el("miSum").textContent = money(annualTotal(r));
    el("miCertText").textContent = CERTIFICATION_TEXT;

    let note = "";

    if (r.status === "Certified") {
        note = "This Annual Inventory is certified and locked by the Property Department.";
    } else if (r.custodianCertifiedAt) {
        note = "You certified it on " + fmt(r.custodianCertifiedAt) + ". The Property Department locks it after the paper is signed.";
    } else {
        note = "Check the list. If it is correct, print it for your signature and click Certify. If something is wrong, tell the Property Department before you certify.";
    }

    el("miNote").textContent = note;

    // buttons
    const box = el("miButtons");

    box.innerHTML = "";

    function add(text, className, handler) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = className;
        b.textContent = text;
        b.addEventListener("click", handler);
        box.appendChild(b);
    }

    add("Close", "close-modal-btn", closeReport);
    add("Print", "view-btn", function () { printAnnual(r); });

    if (r.status === "Verified" && !r.custodianCertifiedAt) {
        add("Certify", "certify-btn", function () { certify(id); });
    }

    el("miModal").style.display = "flex";

}

function closeReport() {
    openId = null;
    el("miModal").style.display = "none";
}

// the custodian certifies the list (the paper still needs the signatures)
function certify(id) {

    const list = loadAnnuals();
    const r = list.find(function (x) { return x.id === id; });

    if (!r || r.status !== "Verified" || r.custodianEmail.toLowerCase() !== myEmail()) {
        alert("This Annual Inventory cannot be certified now.");
        return;
    }

    if (!confirm(CERTIFICATION_TEXT + "\n\nDo you certify the Annual Inventory " + r.year + " of " + r.code + "?")) return;

    r.custodianCertifiedAt = new Date().toISOString();
    r.custodianCertifiedBy = sessionStorage.getItem("userEmail") || r.custodianEmail;
    r.history = (r.history || []).concat([{ status: r.status, by: r.custodianCertifiedBy, date: r.custodianCertifiedAt, note: "Certified by the custodian" }]);

    if (!saveAnnuals(list)) {
        alert("The browser storage is full.");
        return;
    }

    if (typeof tryAuditLog === "function") {
        tryAuditLog(r.custodianCertifiedBy, "Requester", "Certified (custodian) Annual Inventory " + r.year + " - " + r.code);
    }

    if (typeof addNotification === "function") {
        addNotification("admin", myName() + " certified the Annual Inventory " + r.year + " (" + r.code + ").", { type: "annual", controlNo: r.id });
    }

    render();
    openReport(id);

}


// ========================================
// SIDEBAR + LOGOUT
// ========================================

function goToPage(menuName) {

    const pages = {
        "Dashboard": "../RequesterDashboard/dashboard.html",
        "Request": "../Request/request.html",
        "Notifications": "../RequesterNotifications/notifications.html",
        "My Requests": "../RequesterMyRequests/myrequests.html",
        "History": "../RequesterHistory/history.html",
        "My Inventory": "../RequesterInventory/inventory.html"
    };

    if (pages[menuName]) window.location.href = pages[menuName];

}

function logout() {

    if (confirm("Are you sure you want to logout?")) {
        if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
        window.location.href = "../RequesterLogin/login.html";
    }

}
