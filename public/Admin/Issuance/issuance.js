// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// ISSUANCE JAVASCRIPT (ADMIN)
// Issuance = Acknowledgment Receipt (Form PROP-ARII).
// The Admin (Property Staff) prepares the receipt, prints it,
// and the person who receives the items signs it.
// ========================================

const STORE_KEY = "forms";
const COUNTER_KEY = "formCounters";
const MIN_ROWS = 5;


// ========================================
// DATA
// ========================================

function loadStore() {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function loadReceipts() {
    return loadStore().filter(function (r) { return r.type === "receipt"; }).reverse(); // newest first
}

function loadCounters() {
    try {
        return JSON.parse(localStorage.getItem(COUNTER_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Same numbering as the Request page: yy-001, yy-002 ... (restarts every year,
// numbers of deleted forms are not reused)
function nextControlNo() {

    const yy = String(new Date().getFullYear()).slice(-2);
    let highest = loadCounters()["receipt-" + yy] || 0;

    loadStore().forEach(function (r) {
        if (r.type !== "receipt") return;
        const m = /^(\d{2})-(\d+)$/.exec(r.controlNo);
        if (m && m[1] === yy) {
            highest = Math.max(highest, parseInt(m[2], 10));
        }
    });

    return yy + "-" + String(highest + 1).padStart(3, "0");

}

function bumpCounter(controlNo) {

    const m = /^(\d{2})-(\d+)$/.exec(controlNo);

    if (!m) return;

    const key = "receipt-" + m[1];
    const counters = loadCounters();

    counters[key] = Math.max(counters[key] || 0, parseInt(m[2], 10));
    localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));

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

function statusClass(status) {
    if (status === "Approved") return "approved";
    if (status === "Rejected") return "rejected";
    if (status === "Released") return "released";
    return "pending";
}

// esc() and money() come from Shared/print.js


// ========================================
// PAGE LOAD
// ========================================

let currentReceipt = null; // receipt shown in the view window

document.addEventListener("DOMContentLoaded", function () {

    setupSidebar();
    render();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms"], render);
    }

    document.getElementById("searchBox").addEventListener("input", render);

    // New receipt window
    document.getElementById("issueButton").addEventListener("click", function () { receiptPicks = {}; });
    document.getElementById("issueButton").addEventListener("click", openNewModal);
    document.getElementById("closeModal").addEventListener("click", closeNewModal);
    document.getElementById("cancelModal").addEventListener("click", closeNewModal);
    document.getElementById("addRowBtn").addEventListener("click", function () { addRow(); });
    document.getElementById("loadRequisitionBtn").addEventListener("click", loadFromRequisition);
    document.getElementById("receiverAccount").addEventListener("change", accountChosen);

    document.getElementById("saveBtn").addEventListener("click", function () {
        receiptButton = "saveBtn";
        if (saveReceipt()) {
            closeNewModal();
            render();
        }
    });

    document.getElementById("savePrintBtn").addEventListener("click", function () {
        receiptButton = "savePrintBtn";
        const record = saveReceipt();
        if (record) {
            closeNewModal();
            render();
            printRecord(record);
        }
    });

    // View window
    document.getElementById("closeView").addEventListener("click", closeViewModal);
    document.getElementById("closeViewBtn").addEventListener("click", closeViewModal);
    document.getElementById("printViewBtn").addEventListener("click", function () {
        if (currentReceipt) printRecord(currentReceipt);
    });

    ["issueModal", "viewModal"].forEach(function (id) {
        document.getElementById(id).addEventListener("click", function (e) {
            if (e.target === this) {
                this.classList.remove("show");
            }
        });
    });

});


// ========================================
// TABLE + CARDS
// ========================================

function render() {

    const all = loadReceipts();

    // ----- cards -----
    const todayText = new Date().toDateString();

    const todayCount = all.filter(function (r) {
        return new Date(r.dateCreated).toDateString() === todayText;
    }).length;

    const people = {};
    let items = 0;

    all.forEach(function (r) {
        people[(r.header.name || "").toLowerCase()] = true;
        r.items.forEach(function (it) { items += parseFloat(it.qty) || 0; });
    });

    document.getElementById("totalIssued").textContent = all.length;
    document.getElementById("todayIssued").textContent = todayCount;
    document.getElementById("peopleIssued").textContent = Object.keys(people).length;
    document.getElementById("itemsIssued").textContent = items;

    // ----- search -----
    const search = document.getElementById("searchBox").value.toLowerCase().trim();

    const shown = all.filter(function (r) {
        if (!search) return true;
        return (r.controlNo + " " + r.header.name + " " + r.header.department + " " + r.status)
            .toLowerCase().includes(search);
    });

    // ----- rows -----
    const tbody = document.getElementById("issuanceTableBody");
    tbody.innerHTML = "";

    document.getElementById("noReceipts").style.display = shown.length ? "none" : "block";

    shown.forEach(function (r) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td><strong>" + esc(r.controlNo) + "</strong></td>" +
            "<td>" + esc(r.header.name) + "</td>" +
            "<td>" + esc(r.header.department) + "</td>" +
            "<td>" + r.items.length + "</td>" +
            "<td>" + esc(formatDate(r.dateCreated)) + "</td>" +
            '<td><span class="status ' + statusClass(r.status) + '">' + esc(r.status) + "</span></td>" +
            "<td></td>";

        const button = document.createElement("button");
        button.className = "view-btn";
        button.textContent = "View";
        button.addEventListener("click", function () { openViewModal(r); });
        row.lastElementChild.appendChild(button);

        tbody.appendChild(row);

    });

}


// ========================================
// NEW RECEIPT
// ========================================

function addRow() {

    const tr = document.createElement("tr");

    [["qty", "number"], ["unit", "text"], ["item", "text"], ["description", "text"]].forEach(function (c) {

        const td = document.createElement("td");
        const input = document.createElement("input");

        input.type = c[1];
        input.dataset.key = c[0];

        if (c[1] === "number") {
            input.min = "0";
        }

        // choose the item from the inventory (or type a free text)
        if (c[0] === "item") {
            input.setAttribute("list", "assetList");
            input.autocomplete = "off";
            input.addEventListener("input", function () { linkAsset(tr); });
            input.addEventListener("change", function () { linkAsset(tr); });
        }

        td.appendChild(input);
        tr.appendChild(td);

    });

    const tdx = document.createElement("td");
    const btn = document.createElement("button");

    btn.type = "button";
    btn.className = "remove-btn";
    btn.innerHTML = "&times;";
    btn.title = "Remove row";
    btn.addEventListener("click", function () { tr.remove(); });

    tdx.appendChild(btn);
    tr.appendChild(tdx);

    document.getElementById("itemRows").appendChild(tr);

}

// ========================================
// ITEMS FROM THE INVENTORY (needs Shared/stock.js)
// ========================================

// Fill the drop-down list of the "Item" boxes
function refreshAssetList() {

    let list = document.getElementById("assetList");

    if (!list) {
        list = document.createElement("datalist");
        list.id = "assetList";
        document.body.appendChild(list);
    }

    list.innerHTML = "";

    if (typeof loadAssets !== "function") return;

    loadAssets().forEach(function (a) {

        const option = document.createElement("option");

        option.value = a.name;
        option.label = (isConsumable(a) ? "Consumable, " : "Non-consumable, ") + assetAvailable(a) + (isConsumable(a) ? " " + a.unit : "") + " available";
        list.appendChild(option);

    });

}

// The text of a row matches an asset: link it and fill in the unit
function linkAsset(tr) {

    const itemBox = tr.querySelector('[data-key="item"]');
    const text = itemBox.value.trim().toLowerCase();
    const found = (text && typeof loadAssets === "function")
        ? loadAssets().find(function (a) { return a.name.toLowerCase() === text; })
        : null;

    if (!found) {
        delete tr.dataset.assetId;
        itemBox.title = "";
        return;
    }

    tr.dataset.assetId = found.id;
    itemBox.title = "From the inventory: " + found.id;

    const unit = tr.querySelector('[data-key="unit"]');

    if (unit && !unit.value) unit.value = found.unit;

}

// Copy the items of a released requisition into the receipt
function loadFromRequisition() {

    const no = document.getElementById("requisitionNo").value.trim();

    if (!no) {
        alert("Please enter the Control No. of the requisition.");
        return;
    }

    const form = loadStore().find(function (f) { return f.type === "requisition" && f.controlNo === no; });

    if (!form) {
        alert("No requisition found with the number " + no + ".");
        return;
    }

    if (form.status !== "Released") {
        alert("Requisition " + no + " is " + form.status + ". It must be Released first (in Request Management).");
        return;
    }

    document.getElementById("receiverDept").value = form.header.department || "";

    // the receipt goes to the Requester who made the requisition
    const owner = requesterAccounts().find(function (u) {
        return form.requesterEmail && u.email.toLowerCase() === form.requesterEmail.toLowerCase();
    });

    if (owner) {
        document.getElementById("receiverAccount").value = owner.email;
        document.getElementById("receiverName").value = owner.name;
    }

    // use the name written on the first line of the requisition, if any
    const firstName = (form.items.find(function (it) { return it.name; }) || {}).name;
    if (firstName && !document.getElementById("receiverName").value.trim()) {
        document.getElementById("receiverName").value = firstName;
    }

    document.getElementById("itemRows").innerHTML = "";

    form.items.forEach(function (it) {

        addRow();

        const tr = document.querySelector("#itemRows tr:last-child");

        tr.querySelector('[data-key="qty"]').value = it.qty;
        tr.querySelector('[data-key="unit"]').value = it.unit || "";
        tr.querySelector('[data-key="item"]').value = it.particulars || "";

        if (it.assetId) tr.dataset.assetId = it.assetId;

    });

}

// ========================================
// WHICH REQUESTER GETS THE RECEIPT (needs Shared/users.js)
// ========================================

function requesterAccounts() {

    if (typeof loadUsers !== "function") return [];

    return loadUsers().filter(function (u) { return u.role === "Requester" && u.status === "Active"; });

}

function fillAccounts() {

    const select = document.getElementById("receiverAccount");

    select.innerHTML = '<option value="">-- Not linked to an account --</option>';

    requesterAccounts().forEach(function (u) {
        const option = document.createElement("option");
        option.value = u.email;
        option.textContent = u.name + " (" + u.email + ")";
        select.appendChild(option);
    });

}

// Choosing an account fills in the name and the department
function accountChosen() {

    const email = document.getElementById("receiverAccount").value;
    const user = requesterAccounts().find(function (u) { return u.email === email; });

    if (!user) return;

    document.getElementById("receiverName").value = user.name;

    if (user.department) {
        document.getElementById("receiverDept").value = user.department;
    }

}

function openNewModal() {

    document.getElementById("controlNo").value = nextControlNo();
    document.getElementById("receiverName").value = "";
    document.getElementById("receiverDept").value = "";
    document.getElementById("requisitionNo").value = "";
    document.getElementById("itemRows").innerHTML = "";

    fillAccounts();

    refreshAssetList();

    for (let i = 0; i < MIN_ROWS; i++) addRow();

    document.getElementById("issueModal").classList.add("show");

}

function closeNewModal() {
    document.getElementById("issueModal").classList.remove("show");
}

function readItems() {

    const items = [];

    document.querySelectorAll("#itemRows tr").forEach(function (tr) {

        const item = {};
        let hasData = false;

        tr.querySelectorAll("input").forEach(function (input) {
            const v = input.value.trim();
            item[input.dataset.key] = v;
            if (v) hasData = true;
        });

        item.assetId = tr.dataset.assetId || "";   // the asset chosen from the inventory (empty = free text)

        if (hasData) items.push(item);

    });

    return items;

}

// Equipment that uses the per-unit register: the units chosen for each item row (row number -> unit ids)
let receiptPicks = {};
let receiptButton = "saveBtn";

function saveReceipt() {

    const name = document.getElementById("receiverName").value.trim();
    const department = document.getElementById("receiverDept").value.trim();
    const items = readItems();

    if (!name) {
        alert("Please enter the Name of the person receiving the items.");
        return null;
    }

    if (!department) {
        alert("Please enter the Department.");
        return null;
    }

    if (items.length === 0) {
        alert("Please add at least one item.");
        return null;
    }

    for (const it of items) {
        if (!it.qty || !it.item) {
            alert("Each row needs a Qty and an Item.");
            return null;
        }
    }

    // Is it for a requisition that was already released? Then the stock is already updated.
    const requisitionNo = document.getElementById("requisitionNo").value.trim();

    // Only Staff make receipts by hand, and items leave the inventory only through an approved requisition (the Release Queue)
    if (typeof wfRole === "function" && wfRole() !== "Staff") {
        alert("Only Staff make the actual release and its receipt. The Admin supervises.");
        return null;
    }

    if (!requisitionNo) {
        alert("Items are released only through an approved requisition, in the Release Queue. A receipt (PROP-ARII) is made automatically for every release.");
        return null;
    }

    if (requisitionNo) {

        const linked = loadStore().find(function (f) { return f.type === "requisition" && f.controlNo === requisitionNo; });

        if (linked && (linked.releases || []).length) {
            alert("Requisition " + requisitionNo + " already has acknowledgment receipts made by its releases (" + linked.releases.map(function (b) { return b.receiptNo; }).join(", ") + "). A second receipt would be a duplicate.");
            return null;
        }

        if (!linked) {
            alert("No requisition found with the number " + requisitionNo + ".");
            return null;
        }

        if (linked.status !== "Released" && linked.status !== "Completed") {
            alert("Requisition " + requisitionNo + " is " + linked.status + ". It must be Released first (in Request Management).");
            return null;
        }

    } else if (typeof checkStock === "function") {

        // items given directly: the stock must be enough
        const stock = checkStock(items, "issue");

        if (!stock.ok) {
            alert("There is not enough stock:\n- " + stock.problems.join("\n- "));
            return null;
        }

        // equipment that uses the per-unit register: Staff choose the specific units that are handed over
        if (typeof usesUnitRegistry === "function") {

            const assetList = loadAssets();
            const need = [];

            items.forEach(function (it, i) {
                const a = it.assetId ? assetList.find(function (x) { return x.id === it.assetId; }) : null;
                const q = Number(it.qty);
                if (a && usesUnitRegistry(a) && q > 0) {
                    it.unitIds = receiptPicks[i] || [];
                    if (it.unitIds.length !== q) need.push({ key: i, assetId: a.id, name: a.name, qty: q, exact: true });
                }
            });

            if (need.length) {
                openUnitPicker("Select the units to hand over", need, "issue", function (map) {
                    Object.keys(map).forEach(function (k) { receiptPicks[k] = map[k]; });
                    document.getElementById(receiptButton).click();      // save again, now with the units
                });
                return null;
            }

        }

    }

    // the Requester who receives it (he or she will see the receipt in his or her own pages)
    let accountEmail = document.getElementById("receiverAccount").value;

    if (!accountEmail && requisitionNo) {

        const owner = requesterAccounts().find(function (u) {
            const linked = loadStore().find(function (f) { return f.type === "requisition" && f.controlNo === requisitionNo; });
            return linked && linked.requesterEmail && u.email.toLowerCase() === linked.requesterEmail.toLowerCase();
        });

        if (owner) accountEmail = owner.email;

    }

    const controlNo = nextControlNo(); // automatic
    const admin = sessionStorage.getItem("userEmail") || "Admin";
    const now = new Date().toISOString();

    const record = {
        id: Date.now() + "-" + Math.floor(Math.random() * 10000),
        type: "receipt",
        controlNo: controlNo,
        header: { name: name, department: department },
        items: items,
        total: 0,
        status: "Released",          // items are handed over as soon as the receipt is made
        requesterEmail: accountEmail || admin,   // the receiver sees it in his or her pages; without an account only the admin sees it
        receiverEmail: accountEmail,
        issuedBy: admin,
        source: "admin",
        requisitionNo: requisitionNo,
        stockApplied: true,
        statusHistory: [{ status: "Released", by: admin, date: now }],
        dateCreated: now
    };

    // items given directly change the stock now
    if (!requisitionNo && typeof applyStock === "function") {

        const result = applyStock(items, "issue", "Acknowledgment Receipt " + controlNo, { ref: controlNo, assignedTo: name, department: department });

        if (!result.ok) {
            alert("The stock could not be updated:\n- " + result.problems.join("\n- "));
            return null;
        }

    }

    const store = loadStore();
    store.push(record);
    localStorage.setItem(STORE_KEY, JSON.stringify(store));

    bumpCounter(controlNo);

    if (typeof tryAuditLog === "function") {
        tryAuditLog(admin, (typeof currentRole === "function" && currentRole()) || "Staff", "Issued Acknowledgment Receipt " + controlNo + " to " + name);
    }

    // tell the Requester (bell + message in his or her pages)
    if (accountEmail && typeof addNotification === "function") {
        addNotification(accountEmail, "Acknowledgment Receipt " + controlNo + " was issued to you.", { type: "receipt", controlNo: controlNo });
    }

    return record;

}


// ========================================
// VIEW RECEIPT
// ========================================

function detailRow(label, valueHtml) {
    return '<div class="detail-row"><strong>' + esc(label) + "</strong><span>" + valueHtml + "</span></div>";
}

function openViewModal(r) {

    currentReceipt = r;

    let html = "";

    html += detailRow("Control No.", esc(r.controlNo));
    html += detailRow("Issued To", esc(r.header.name));
    html += detailRow("Department", esc(r.header.department));
    html += detailRow("Date Issued", esc(formatDate(r.dateCreated)));
    html += detailRow("Requester Account", esc(r.receiverEmail || "Not linked"));
    html += detailRow("Prepared By", esc(r.issuedBy || "-"));
    if (r.requisitionNo) {
        html += detailRow("Requisition No.", esc(r.requisitionNo));
    }
    html += detailRow("Status", '<span class="status ' + statusClass(r.status) + '">' + esc(r.status) + "</span>");

    let table = "<table><thead><tr><th>Qty</th><th>Unit</th><th>Item</th><th>Description</th></tr></thead><tbody>";

    r.items.forEach(function (it) {
        table += "<tr><td>" + esc(it.qty) + "</td><td>" + esc(it.unit) + "</td><td>" +
                 esc(it.item) + "</td><td>" + esc(it.description) + "</td></tr>";
    });

    table += "</tbody></table>";

    html += '<div class="view-items">' + table + "</div>";

    document.getElementById("viewBody").innerHTML = html;
    document.getElementById("viewModal").classList.add("show");

}

function closeViewModal() {
    currentReceipt = null;
    document.getElementById("viewModal").classList.remove("show");
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
                    window.location.href = "issuance.html";
                    break;

                case "Reports":
                    window.location.href = "../Reports/reports.html";
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


// A pointer to the Ready-for-Release Queue (requisitions are released there; receipts of those releases appear in this list)
document.addEventListener("DOMContentLoaded", function () {

    if (typeof wfQueueRows !== "function") return;

    const host = document.querySelector(".main-content");
    const first = host ? host.querySelector(".cards, .table-section, section") : null;
    if (!host || !first) return;

    const n = wfQueueRows().length;
    const bar = document.createElement("div");
    bar.className = "wf-banner";
    bar.innerHTML = "<b>" + n + "</b> requisition" + (n === 1 ? " is" : "s are") + ' waiting in the <a href="../ReleaseQueue/releasequeue.html" style="color:#edae0f;text-decoration:underline">Ready-for-Release Queue</a>. ' +
        "Each release there makes an acknowledgment receipt that is listed below.";
    host.insertBefore(bar, first);

});


// The Admin supervises: the Admin cannot make receipts by hand (Staff release items and their receipts)
document.addEventListener("DOMContentLoaded", function () {
    if (typeof wfRole !== "function" || wfRole() === "Staff") return;
    const btn = document.getElementById("issueButton");
    if (btn) { btn.disabled = true; btn.title = "Receipts are made by Staff when they release items"; btn.style.opacity = ".5"; btn.style.cursor = "not-allowed"; }
});
