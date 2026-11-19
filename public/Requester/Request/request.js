// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// FORMS (REQUISITION / ACKNOWLEDGMENT RECEIPT / PULL-OUT)
// ========================================

// ---------- Safety check ----------
// The print layouts live in Shared/print.js (the Shared folder must be in the
// project root, next to the Admin and Requester folders). If it is missing,
// the page still works; only printing is disabled and a message is shown.
const PRINT_FILES_MISSING = (typeof printRecord === "undefined");

if (PRINT_FILES_MISSING) {
    window.esc = function (text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    };
    window.money = function (n) {
        return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    window.printRecord = function () {
        alert("Cannot print: Shared/print.js was not found.\nMake sure the Shared folder is in the project root, next to the Admin and Requester folders.");
    };
}

const STORE_KEY = "forms";
const COUNTER_KEY = "formCounters";

// ========================================
// FORM DEFINITIONS (one place to change fields)
// ========================================
const FORMS = {

    requisition: {
        label: "Requisition",
        title: "Requisition Form",
        desc: "Request supplies. Fill in the form, save it, then print it for signatures.",
        orient: "landscape",
        minRows: 5,
        hasAmount: true,
        itemKey: "particulars",
        header: [
            { key: "date", label: "Date", type: "date", required: true },
            { key: "department", label: "Department / Office", ph: "e.g. College of Computer Studies", required: true },
            { key: "representativeName", label: "Representative Name", ph: "Person the requisition is for", required: true },
            { key: "position", label: "Position / Designation", ph: "e.g. Faculty", required: true },
            { key: "section", label: "Section", ph: "e.g. Faculty" },
            { key: "month", label: "Month", ph: "e.g. October 2026" },
            { key: "purpose", label: "Purpose / Justification", ph: "Why are the items needed?", required: true }
        ],
        cols: [
            { key: "name", label: "Name (Print Full Name)" },
            { key: "qty", label: "Qty", type: "number", w: "w-qty" },
            { key: "unit", label: "Unit", w: "w-unit" },
            { key: "particulars", label: "Particulars", pick: "all" },
            { key: "price", label: "Unit Price", type: "number", step: "0.01", w: "w-money" },
            { key: "amount", label: "Amount", type: "amount", w: "w-money" },
            { key: "lastRequested", label: "Date Last Requested", type: "date", w: "w-date" },
            { key: "receivedBy", label: "Received By" }
        ],
        details: function (r) { return r.header.department; }
    },

    receipt: {
        label: "Acknowledgment Receipt",
        title: "Acknowledgment Receipt",
        desc: "Prepared by the Property Department when items are given to you. Your receipts are listed below, where you can print them.",
        orient: "landscape",
        minRows: 5,
        viewOnly: true,   // requesters only see their receipts
        itemKey: "item",
        header: [
            { key: "name", label: "Name", ph: "Full name of receiver", required: true },
            { key: "department", label: "Department", ph: "e.g. College of Computer Studies", required: true }
        ],
        cols: [
            { key: "qty", label: "Qty", type: "number", w: "w-qty" },
            { key: "unit", label: "Unit", w: "w-unit" },
            { key: "item", label: "Item", pick: "all" },
            { key: "description", label: "Description" }
        ],
        details: function (r) { return r.header.name + " (" + r.header.department + ")"; }
    },

    pullout: {
        label: "Pull-Out Request",
        title: "Pull-Out Request",
        desc: "Form PROP-POR. Request to take items out of an office or classroom. Prints 3 copies.",
        orient: "portrait",
        minRows: 3,
        itemKey: "item",
        header: [
            { key: "requestingParty", label: "Requesting Party", ph: "Name", required: true },
            { key: "office", label: "Office / Classroom", ph: "e.g. Room 301" },
            { key: "date", label: "Date", type: "date" },
            { key: "pulledOutBy", label: "Pulled-Out by", ph: "Name" },
            { key: "pulledDate", label: "Date Pulled-Out", type: "date" },
            { key: "receivedBy", label: "Received by", ph: "Name" },
            { key: "receivedDate", label: "Date Received", type: "date" }
        ],
        cols: [
            { key: "qty", label: "Qty", type: "number", w: "w-qty" },
            { key: "item", label: "Item/s", pick: "non" },
            { key: "description", label: "Description/s" },
            { key: "reason", label: "Reason" }
        ],
        details: function (r) { return r.header.requestingParty + (r.header.office ? " - " + r.header.office : ""); }
    }
};

let current = "requisition";

// ========================================
// HELPERS
// ========================================
function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
}

function saveAll(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function loadCounters() {
    try { return JSON.parse(localStorage.getItem(COUNTER_KEY)) || {}; }
    catch (e) { return {}; }
}

// Control No. is automatic: yy-001, yy-002 ... (each form type has its own
// counter, and every new year starts again at 001). Numbers of deleted
// forms are never reused.
function currentYY() {
    return String(new Date().getFullYear()).slice(-2);
}

function nextControlNo(type) {
    const yy = currentYY();
    let highest = loadCounters()[type + "-" + yy] || 0;

    // also look at the saved forms, in case the counter was cleared
    loadAll().forEach(function (r) {
        if (r.type !== type || r.demo) return;   // demo records never move the real numbering
        const m = /^(\d{2})-(\d+)$/.exec(r.controlNo);
        if (m && m[1] === yy) {
            highest = Math.max(highest, parseInt(m[2], 10));
        }
    });

    return yy + "-" + String(highest + 1).padStart(3, "0");
}

function bumpCounter(type, controlNo) {
    const m = /^(\d{2})-(\d+)$/.exec(controlNo);
    if (!m) return;
    const key = type + "-" + m[1];
    const counters = loadCounters();
    counters[key] = Math.max(counters[key] || 0, parseInt(m[2], 10));
    localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
}

// ========================================
// BUILD THE FORM FOR THE ACTIVE TAB
// ========================================
function renderForm() {
    const f = FORMS[current];

    document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.type === current);
    });

    document.getElementById("formTitle").textContent = f.title;
    document.getElementById("formDesc").textContent = f.desc;

    // Acknowledgment Receipt: nothing to fill in, only the list of the receipts of this requester
    document.getElementById("formTitle").closest(".card").classList.toggle("view-only", !!f.viewOnly);

    if (f.viewOnly) {
        document.getElementById("controlNo").value = "";
        renderSaved();
        return;
    }

    document.getElementById("controlNo").value = nextControlNo(current);

    // requisition: Submit / Save Draft / Preview; the other forms keep the old buttons
    const isReq = current === "requisition";
    document.getElementById("saveBtn").textContent = isReq ? "Submit Requisition" : "Save";
    document.getElementById("draftBtn").style.display = isReq ? "" : "none";
    document.getElementById("previewBtn").style.display = isReq ? "" : "none";
    document.getElementById("savePrintBtn").textContent = isReq ? "Submit & Print" : "Save & Print";

    // header fields
    const hb = document.getElementById("headerFields");
    hb.innerHTML = "";
    f.header.forEach(function (h) {
        const wrap = document.createElement("div");
        wrap.className = "field";
        const label = document.createElement("label");
        label.textContent = h.label;
        label.htmlFor = "h_" + h.key;
        const input = document.createElement("input");
        input.type = h.type || "text";
        input.id = "h_" + h.key;
        if (h.ph) input.placeholder = h.ph;
        wrap.appendChild(label);
        wrap.appendChild(input);
        hb.appendChild(wrap);
    });

    if (document.getElementById("h_date")) document.getElementById("h_date").value = new Date().toISOString().slice(0, 10);

    // table head
    const head = document.getElementById("itemHead");
    head.innerHTML = "";
    const hr = document.createElement("tr");
    f.cols.forEach(function (c) {
        const th = document.createElement("th");
        th.textContent = c.label;
        if (c.w) th.className = c.w;
        hr.appendChild(th);
    });
    const thx = document.createElement("th");
    thx.className = "w-x";
    hr.appendChild(thx);
    head.appendChild(hr);

    // table foot (total only for requisition)
    const foot = document.getElementById("itemFoot");
    foot.innerHTML = "";
    if (f.hasAmount) {
        const idx = f.cols.findIndex(function (c) { return c.type === "amount"; });
        foot.innerHTML =
            '<tr><td colspan="' + idx + '" class="total-label">TOTAL</td>' +
            '<td id="grandTotal" class="total-value">0.00</td>' +
            '<td colspan="' + (f.cols.length - idx) + '"></td></tr>';
    }

    // rows
    document.getElementById("itemRows").innerHTML = "";
    for (let i = 0; i < f.minRows; i++) addRow();
    recompute();
    refreshAssetList();
    renderSaved();
}

function addRow() {
    const f = FORMS[current];
    const tr = document.createElement("tr");

    f.cols.forEach(function (c) {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.dataset.key = c.key;

        if (c.type === "amount") {
            input.type = "text";
            input.readOnly = true;
        } else {
            input.type = c.type || "text";
            if (c.type === "number") {
                input.min = "0";
                if (c.step) input.step = c.step;
            }
        }

        if (f.hasAmount && (c.key === "qty" || c.key === "price")) {
            input.addEventListener("input", recompute);
        }

        // choose an item from the inventory (or type a free text)
        if (c.pick) {
            input.setAttribute("list", "assetList");
            input.autocomplete = "off";
            input.addEventListener("input", function () { linkAsset(tr, c); });
            input.addEventListener("change", function () { linkAsset(tr, c); });
        }

        td.appendChild(input);
        tr.appendChild(td);
    });

    const tdx = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remove-btn";
    btn.title = "Remove row";
    btn.innerHTML = "&times;";
    btn.addEventListener("click", function () {
        tr.remove();
        recompute();
    });
    tdx.appendChild(btn);
    tr.appendChild(tdx);

    document.getElementById("itemRows").appendChild(tr);
}

function recompute() {
    if (!FORMS[current].hasAmount) return;
    let total = 0;
    document.querySelectorAll("#itemRows tr").forEach(function (tr) {
        const qty = parseFloat(tr.querySelector('[data-key="qty"]').value) || 0;
        const price = parseFloat(tr.querySelector('[data-key="price"]').value) || 0;
        const amount = qty * price;
        tr.querySelector('[data-key="amount"]').value = amount ? money(amount) : "";
        total += amount;
    });
    document.getElementById("grandTotal").textContent = money(total);
}

// ========================================
// READ + SAVE
// ========================================
// ========================================
// ITEMS FROM THE INVENTORY (needs Shared/stock.js; without it the lines are free text)
// Requisition: any asset.   Pull-Out: non-consumable assets only.
// ========================================
function assetsFor(pick) {

    if (typeof loadAssets !== "function") return [];

    return loadAssets().filter(function (a) {
        return pick === "non" ? !isConsumable(a) : true;
    });

}

// Fill the drop-down list of the "Particulars" / "Item" boxes
function refreshAssetList() {

    let list = document.getElementById("assetList");

    if (!list) {
        list = document.createElement("datalist");
        list.id = "assetList";
        document.body.appendChild(list);
    }

    list.innerHTML = "";

    const pickCol = FORMS[current].cols.find(function (c) { return c.pick; });

    if (!pickCol) return;

    assetsFor(pickCol.pick).forEach(function (a) {

        const option = document.createElement("option");

        option.value = a.name;
        option.label = (isConsumable(a) ? "Consumable, " : "Non-consumable, ") + assetAvailable(a) + (isConsumable(a) ? " " + a.unit : "") + " available";
        list.appendChild(option);

    });

}

// The text of a row matches an asset: link it, and fill in the unit and the price
function linkAsset(tr, col) {

    const text = tr.querySelector('[data-key="' + col.key + '"]').value.trim().toLowerCase();
    const found = text ? assetsFor(col.pick).find(function (a) { return a.name.toLowerCase() === text; }) : null;

    if (!found) {
        delete tr.dataset.assetId;
        tr.querySelector('[data-key="' + col.key + '"]').title = "";
        return;
    }

    tr.dataset.assetId = found.id;
    tr.querySelector('[data-key="' + col.key + '"]').title = "From the inventory: " + found.id;

    const unit = tr.querySelector('[data-key="unit"]');
    const price = tr.querySelector('[data-key="price"]');

    if (unit && !unit.value) unit.value = found.unit;

    if (price && !price.value && found.unitPrice > 0) {
        price.value = found.unitPrice;
        recompute();
    }

}

function readHeader() {
    const header = {};
    FORMS[current].header.forEach(function (h) {
        header[h.key] = document.getElementById("h_" + h.key).value.trim();
    });
    return header;
}

function readItems() {
    const f = FORMS[current];
    const items = [];

    document.querySelectorAll("#itemRows tr").forEach(function (tr) {
        const item = {};
        let hasData = false;

        f.cols.forEach(function (c) {
            const v = tr.querySelector('[data-key="' + c.key + '"]').value.trim();
            if (c.type === "amount") return;
            item[c.key] = v;
            if (v) hasData = true;
        });

        if (!hasData) return; // skip empty rows

        item.assetId = tr.dataset.assetId || "";   // the asset chosen from the inventory (empty = free text)

        if (f.hasAmount) {
            item.amount = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
        }
        items.push(item);
    });

    return items;
}

function saveForm(asDraft) {
    const f = FORMS[current];
    const header = readHeader();
    const items = readItems();

    for (const h of f.header) {
        if (h.required && !header[h.key]) {
            alert("Please enter: " + h.label);
            return null;
        }
    }

    if (items.length === 0) {
        alert("Please add at least one item.");
        return null;
    }

    for (const it of items) {
        if (!it.qty || !it[f.itemKey]) {
            alert("Each row needs a Qty and an " + (f.itemKey === "particulars" ? "Particulars" : "Item") + ".");
            return null;
        }

        // the quantity must be a number greater than zero (no zero, no negative, no text)
        const q = Number(String(it.qty).trim());
        if (!isFinite(q) || q <= 0 || q !== Math.floor(q)) {
            alert("The quantity of \"" + it[f.itemKey] + "\" must be a whole number greater than zero.");
            return null;
        }
    }

    // the stock is checked again when the Admin releases the form; this is only a warning
    if (!asDraft && typeof checkStock === "function") {

        const stock = checkStock(items, current === "pullout" ? "pullout" : "issue");

        if (!stock.ok && !confirm("There is not enough stock:\n- " + stock.problems.join("\n- ") + "\n\nSubmit the form anyway?")) {
            return null;
        }

    }

    const controlNo = nextControlNo(current); // automatic
    const list = loadAll();

    if (list.some(function (r) { return r.type === current && r.controlNo === controlNo; })) {
        alert("Control No. " + controlNo + " already exists. Please use a different one.");
        return null;
    }

    const record = {
        id: Date.now() + "-" + Math.floor(Math.random() * 10000),
        type: current,
        controlNo: controlNo,
        header: header,
        items: items,
        total: f.hasAmount ? items.reduce(function (s, i) { return s + i.amount; }, 0) : 0,
        status: "Pending",   // pull-out requests keep Pending; a requisition gets the workflow statuses below
        requesterEmail: sessionStorage.getItem("userEmail") || "",
        dateCreated: new Date().toISOString()
    };

    // requisition: the logged-in account is saved apart from the typed Representative Name
    if (current === "requisition" && typeof wfInitRequisition === "function") wfInitRequisition(record, !!asDraft);

    list.push(record);
    saveAll(list);
    bumpCounter(current, controlNo);

    if (current === "requisition" && typeof wfAnnounceSubmission === "function") {
        if (asDraft) {
            if (typeof tryAuditLog === "function") tryAuditLog(record.requesterEmail, "Requester", "Saved draft Requisition " + controlNo);
        } else {
            wfAnnounceSubmission(record);   // audit trail, notification and simulated email
        }
        renderSaved();
        return record;
    }

    // Audit Trail
    if (typeof tryAuditLog === "function") {
        tryAuditLog(record.requesterEmail || "Requester", "Requester", "Submitted " + f.label + " " + controlNo);
    }

    // notify the admin (bell + message in the Admin pages)
    if (typeof addNotification === "function") {
        addNotification(
            "admin",
            "New " + f.label + " " + controlNo + " from " + (record.requesterEmail || "a requester"),
            { type: record.type, controlNo: controlNo }
        );
    }
    renderSaved();
    return record;
}

// ========================================
// SAVED LIST
// ========================================
// A requester sees only his or her own forms (the same rule as My Requests and History)
function belongsToMe(r) {

    const email = sessionStorage.getItem("userEmail");

    return !email || !r.requesterEmail || r.requesterEmail.toLowerCase() === email.toLowerCase();

}

function renderSaved() {
    const tbody = document.getElementById("savedRows");
    // each tab lists the forms of its own type, and only the forms of this requester
    const list = loadAll().filter(belongsToMe).filter(function (r) { return r.type === current; }).reverse();
    tbody.innerHTML = "";

    document.getElementById("emptyMsg").textContent = FORMS[current].viewOnly
        ? "No receipts yet. They appear here when the Property Department gives items to you."
        : "No forms saved yet.";

    document.getElementById("emptyMsg").style.display = list.length ? "none" : "block";

    list.forEach(function (r) {
        const f = FORMS[r.type];
        if (!f) return;

        const tr = document.createElement("tr");
        tr.innerHTML =
            '<td><span class="type-tag">' + esc(f.label) + "</span></td>" +
            "<td><b>" + esc(r.controlNo) + "</b></td>" +
            "<td>" + esc(f.details(r)) + "</td>" +
            "<td>" + r.items.length + "</td>" +
            "<td>" + esc(new Date(r.dateCreated).toLocaleDateString()) + "</td>" +
            "<td>" + (r.type === "requisition" && typeof wfBadge === "function" ? wfBadge(r.status) : '<span class="badge badge-' + esc(r.status) + '">' + esc((typeof statusText === "function" ? statusText(r) : r.status)) + "</span>") + "</td>" +
            "<td></td>";

        const actions = tr.lastElementChild;

        if (r.type === "requisition" && typeof wfRequesterDetails === "function") {
            const viewBtn = document.createElement("button");
            viewBtn.className = "btn btn-dark btn-sm";
            viewBtn.textContent = "View";
            viewBtn.addEventListener("click", function () { wfRequesterDetails(r.id, renderSaved); });
            actions.appendChild(viewBtn);
        }

        const printBtn = document.createElement("button");
        printBtn.className = "btn btn-light btn-sm";
        printBtn.textContent = "Print";
        printBtn.addEventListener("click", function () { printRecord(r); });
        actions.appendChild(printBtn);

        if (r.status === "Pending" || r.status === "Draft" || r.status === "Pending Department Head Signature") {
            const delBtn = document.createElement("button");
            delBtn.className = "btn btn-danger btn-sm";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", function () {
                if (!belongsToMe(r)) {
                    alert("You can only delete your own forms.");
                    return;
                }

                if (confirm("Delete " + f.label + " " + r.controlNo + "?")) {
                    saveAll(loadAll().filter(function (x) { return x.id !== r.id; }));
                    if (typeof tryAuditLog === "function") {
                        tryAuditLog(r.requesterEmail || "Requester", "Requester", "Deleted " + f.label + " " + r.controlNo);
                    }

                    if (typeof addNotification === "function") {
                        addNotification("admin", (r.requesterEmail || "A requester") + " deleted " + f.label + " " + r.controlNo, null);
                    }
                    renderSaved();
                }
            });
            actions.appendChild(delBtn);
        }

        tbody.appendChild(tr);
    });
}

// Preview of the requisition before it is submitted (nothing is saved)
function previewRequisition() {
    const f = FORMS.requisition;
    const header = readHeader();
    const items = readItems();
    const miss = f.header.filter(function (h) { return h.required && !header[h.key]; }).map(function (h) { return h.label; });

    let html = '<div class="wf-row"><strong>Requisition No.</strong><span>' + esc(document.getElementById("controlNo").value) + "</span></div>";
    f.header.forEach(function (h) { html += '<div class="wf-row"><strong>' + esc(h.label) + "</strong><span>" + esc(header[h.key] || "-") + "</span></div>"; });
    html += '<div class="wf-row"><strong>Submitted by (your account)</strong><span>' + esc(sessionStorage.getItem("userEmail") || "") + "</span></div>";
    html += '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>#</th><th>Item description</th><th>Qty</th><th>Unit</th></tr></thead><tbody>' +
        (items.length ? items.map(function (it, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.particulars) + "</td><td>" + esc(it.qty) + "</td><td>" + esc(it.unit) + "</td></tr>"; }).join("") : '<tr><td colspan="4">No items yet.</td></tr>') +
        "</tbody></table></div>";
    html += '<p class="wf-note">Signatories after you submit: Department Head (you record the signature), School Auditor, Director. The Representative is not a signatory.</p>';
    if (miss.length) html += '<div class="wf-lock">Still required: ' + esc(miss.join(", ")) + "</div>";
    wfModal("Preview requisition", html, [{ text: "Close", onClick: wfCloseModal }], true);
}

// ========================================
// NAVIGATION
// ========================================
function goToPage(menuName) {
    const pages = {
        "Dashboard": "../RequesterDashboard/dashboard.html",
        "Create Requisition": "../Request/request.html",
        "My Requests": "../RequesterMyRequests/myrequests.html",
        "Notifications": "../RequesterNotifications/notifications.html",
        "History": "../RequesterHistory/history.html",
        "My Inventory": "../RequesterInventory/inventory.html"
    };
    if (pages[menuName]) window.location.href = pages[menuName];
}

function logout() {
    if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
    window.location.href = "../RequesterLogin/login.html";
}

// ========================================
// START
// ========================================
document.addEventListener("DOMContentLoaded", function () {

    if (PRINT_FILES_MISSING) {
        const banner = document.createElement("div");
        banner.style.cssText = "background:#fdecea;color:#c0392b;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:13px;";
        banner.textContent = "Printing is disabled: the Shared folder (print.js and print.css) was not found. " +
            "Put the Shared folder in the project root, next to the Admin and Requester folders.";
        const navbar = document.querySelector(".navbar");
        navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    }

    renderForm();
    renderSaved();

    // update when another window changes the forms (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms"], renderSaved);
    }

    // the inventory changed in another window (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["assets"], refreshAssetList);
    }

    document.querySelectorAll(".tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            current = tab.dataset.type;
            renderForm();
        });
    });

    document.getElementById("addRowBtn").addEventListener("click", addRow);

    document.getElementById("clearBtn").addEventListener("click", function () {
        if (confirm("Clear the form?")) renderForm();
    });

    document.getElementById("saveBtn").addEventListener("click", function () {
        const record = saveForm();
        if (record) {
            alert(current === "requisition" ? "Requisition " + record.controlNo + " submitted. Next step: the Department Head signature (see My Requests)." : "Saved.");
            renderForm();
        }
    });

    document.getElementById("draftBtn").addEventListener("click", function () {
        const record = saveForm(true);
        if (record) {
            alert("Draft " + record.controlNo + " saved. Submit it from the list below when it is ready.");
            renderForm();
        }
    });

    document.getElementById("previewBtn").addEventListener("click", previewRequisition);

    document.getElementById("savePrintBtn").addEventListener("click", function () {
        const record = saveForm();
        if (record) {
            renderForm();
            printRecord(record);
        }
    });
});
