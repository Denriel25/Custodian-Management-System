// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// ASSETS JAVASCRIPT (ADMIN)
//
// Two kinds of assets (see Shared/stock.js):
//   Consumable      supplies, tracked by stock (bond paper, ink)
//   Non-consumable  equipment, tracked by units: available, issued, under maintenance
//
// The inventory is saved in the browser ("assets") and is used by the forms
// (Request, Issuance), the Admin Dashboard and the Inventory Report.
// ========================================

// ---------- Safety check ----------
if (typeof loadAssets === "undefined" || typeof loadUnits === "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
        const banner = document.createElement("div");
        banner.style.cssText = "background:#dc3545;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:14px;";
        banner.textContent = "The Shared folder (stock.js and inventory.js) was not found. Put the Shared folder in the project root, next to Admin and Requester.";
        const navbar = document.querySelector(".navbar");
        if (navbar) navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    });
}


// ========================================
// HELPERS
// ========================================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function el(id) {
    return document.getElementById(id);
}

function log(activity) {
    if (typeof tryAuditLog === "function") {
        tryAuditLog(sessionStorage.getItem("userEmail") || "Admin", "Administrator", activity);
    }
}

function generateAssetID() {

    let highest = 0;

    loadAssets().forEach(function (a) {
        const m = /^AST(\d+)$/.exec(a.id);
        if (m) highest = Math.max(highest, parseInt(m[1], 10));
    });

    return "AST" + String(highest + 1).padStart(3, "0");

}

// "In Stock" -> "in-stock" (the name of the CSS class)
function statusClass(status) {
    return String(status || "available").toLowerCase().replace(/\s+/g, "-");
}

// Make the photo small (max 300 px) so it fits in the browser storage
function shrinkPhoto(file, callback) {

    const reader = new FileReader();

    reader.onload = function (event) {

        const img = new Image();

        img.onload = function () {

            const scale = Math.min(1, 300 / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");

            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

            callback(canvas.toDataURL("image/jpeg", 0.8));

        };

        img.onerror = function () { alert("This file is not a valid image."); };
        img.src = event.target.result;

    };

    reader.readAsDataURL(file);

}

function selectedType() {
    return el("assetType").value === TYPE_CONSUMABLE ? TYPE_CONSUMABLE : TYPE_NON_CONSUMABLE;
}


// ========================================
// PAGE LOAD
// ========================================

let editingId = null;   // id of the asset being edited (null = adding)
let photoData = "";     // photo of the asset in the form

document.addEventListener("DOMContentLoaded", function () {

    if (typeof loadAssets === "undefined" || typeof loadUnits === "undefined") return;

    setupSidebar();
    render();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["assets"], render);
    }

    el("searchAsset").addEventListener("input", render);
    el("addAssetBtn").addEventListener("click", openAddModal);
    el("closeModal").addEventListener("click", closeModal);
    el("cancelBtn").addEventListener("click", closeModal);

    el("assetModal").addEventListener("click", function (e) {
        if (e.target === this) closeModal();
    });

    // the form changes with the type
    el("assetType").addEventListener("change", applyType);

    el("assetPhoto").addEventListener("change", function () {

        const file = this.files[0];

        if (!file) return;

        shrinkPhoto(file, function (dataUrl) {
            photoData = dataUrl;
            showPhoto();
        });

    });

    // import from Excel
    el("importBtn").addEventListener("click", openImport);
    el("closeImport").addEventListener("click", closeImport);
    el("checkImport").addEventListener("click", checkImport);
    el("runImport").addEventListener("click", runImport);
    el("templateBtn").addEventListener("click", downloadTemplate);
    el("importText").addEventListener("input", function () { el("runImport").disabled = true; });
    el("importFile").addEventListener("change", function () {

        const file = this.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = function (event) {
            el("importText").value = event.target.result;
            checkImport();
        };

        reader.readAsText(file);

    });
    el("importModal").addEventListener("click", function (e) {
        if (e.target === this) closeImport();
    });

    // QR code
    el("scanBtn").addEventListener("click", scanAsset);
    el("printLabelsBtn").addEventListener("click", function () { printLabels(loadAssets()); });
    el("closeQr").addEventListener("click", closeQr);
    el("qrEditBtn").addEventListener("click", function () {
        const id = qrAssetId;
        closeQr();
        if (id) openEditModal(id);
    });
    el("qrDownloadBtn").addEventListener("click", downloadQr);
    el("qrPrintBtn").addEventListener("click", function () {
        const asset = loadAssets().find(function (a) { return a.id === qrAssetId; });
        if (asset) printLabels([asset]);
    });

    el("qrModal").addEventListener("click", function (e) {
        if (e.target === this) closeQr();
    });

    el("assetForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveAsset();
    });

});


// ========================================
// TABLE + CARDS
// ========================================

function render() {

    // every non-consumable equipment record has its physical units (a no-op when they already exist)
    if (typeof ensureAssetUnits === "function") ensureAssetUnits();

    const assets = loadAssets();

    el("totalAssets").textContent = assets.length;
    el("consumableAssets").textContent = assets.filter(isConsumable).length;
    el("nonConsumableAssets").textContent = assets.filter(function (a) { return !isConsumable(a); }).length;
    el("lowStockAssets").textContent = assets.filter(isLowStock).length;

    const search = el("searchAsset").value.toLowerCase().trim();

    const shown = assets.filter(function (a) {
        return !search || (a.id + " " + a.name + " " + a.type + " " + a.category + " " + a.brand + " " +
                           a.model + " " + a.serial + " " + a.location + " " + a.make + " " + a.color + " " + a.remarks + " " + iinText(a) + " " + assetStatus(a)).toLowerCase().includes(search);
    });

    const tbody = el("assetTableBody");
    tbody.innerHTML = "";

    el("noAssets").style.display = shown.length ? "none" : "block";

    shown.forEach(function (a) {

        const status = assetStatus(a);
        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + escapeHTML(a.id) + "</td>" +
            "<td>" + escapeHTML(a.name) + "</td>" +
            '<td><span class="type-tag">' + escapeHTML(a.type) + "</span></td>" +
            "<td>" + escapeHTML(a.category) + "</td>" +
            "<td>" + escapeHTML(stockText(a)) + "</td>" +
            "<td>" + escapeHTML(a.location) + "</td>" +
            '<td><span class="status ' + escapeHTML(statusClass(status)) + '">' + escapeHTML(status) + "</span></td>" +
            "<td></td>";

        const actions = row.lastElementChild;

        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () { openEditModal(a.id); });
        actions.appendChild(editBtn);

        actions.appendChild(document.createTextNode(" "));

        const qrBtn = document.createElement("button");
        qrBtn.className = "qr-btn";
        qrBtn.textContent = "QR";
        qrBtn.addEventListener("click", function () { showQr(a.id); });
        actions.appendChild(qrBtn);

        // equipment: every physical unit has its own ID, QR, status and history
        if (typeof usesUnitRegistry === "function" && usesUnitRegistry(a)) {
            actions.appendChild(document.createTextNode(" "));
            const unitsBtn = document.createElement("button");
            unitsBtn.className = "qr-btn units-btn";
            unitsBtn.textContent = "Units";
            unitsBtn.addEventListener("click", function () { openUnitRegister(a.id); });
            actions.appendChild(unitsBtn);
        }

        if (typeof can !== "function" || can("deleteAsset")) {
            actions.appendChild(document.createTextNode(" "));
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-btn";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", function () { deleteAsset(a.id); });
            actions.appendChild(deleteBtn);
        }

        tbody.appendChild(row);

    });

}


// ========================================
// ADD / EDIT WINDOW
// ========================================

function showPhoto() {

    const preview = el("photoPreview");

    preview.innerHTML = "";

    if (photoData) {
        const img = document.createElement("img");
        img.src = photoData;
        img.alt = "Asset photo";
        preview.appendChild(img);
    } else {
        preview.innerHTML = "<span>Asset Photo</span>";
    }

}

// Show the fields of the chosen type and hide the others
function applyType() {

    const consumable = selectedType() === TYPE_CONSUMABLE;

    document.querySelectorAll(".only-consumable").forEach(function (f) {
        f.classList.toggle("show-field", consumable);
    });

    document.querySelectorAll(".only-nonconsumable").forEach(function (f) {
        f.classList.toggle("show-field", !consumable);
    });

    el("quantityLabel").textContent = consumable ? "Stock on Hand" : "Total Quantity";

}

// The Sections / Units to choose from (they are managed in Annual Inventory)
function fillUnits(selected) {

    const select = el("assetUnit");

    select.innerHTML = '<option value="">-- None --</option>';

    loadUnits().forEach(function (u) {
        const option = document.createElement("option");
        option.value = u.id;
        option.textContent = unitLabel(u);
        select.appendChild(option);
    });

    select.value = selected || "";

}

function openAddModal() {

    editingId = null;
    photoData = "";

    el("assetForm").reset();
    el("modalTitle").textContent = "Add Asset";
    el("assetID").value = generateAssetID();
    el("assetType").value = TYPE_NON_CONSUMABLE;
    el("unit").value = "pc";
    el("quantity").value = 1;
    el("reorderLevel").value = typeof settingsGet === "function" ? settingsGet("inventory.defaultReorderLevel", 0) : 0;
    el("issuedQty").value = 0;
    el("maintenanceQty").value = 0;
    ["quantity", "issuedQty", "maintenanceQty"].forEach(function (id) { el(id).disabled = false; el(id).title = ""; });
    fillUnits("");
    el("iinShown").value = "";

    applyType();
    showPhoto();

    el("assetModal").classList.add("show");

}

function openEditModal(id) {

    const a = loadAssets().find(function (x) { return x.id === id; });

    if (!a) return;

    editingId = id;
    photoData = a.photo || "";

    el("assetForm").reset();
    el("modalTitle").textContent = "Edit Asset";
    el("assetID").value = a.id;
    el("assetType").value = a.type;
    el("assetName").value = a.name;
    el("category").value = a.category;
    el("unit").value = a.unit;
    el("quantity").value = a.quantity;
    el("unitPrice").value = a.unitPrice || "";
    el("reorderLevel").value = a.reorderLevel;
    el("brand").value = a.brand || "";
    el("model").value = a.model || "";
    el("serialNumber").value = a.serial || "";
    el("condition").value = a.condition || "";
    el("issuedQty").value = a.issued;
    el("maintenanceQty").value = a.maintenance;
    el("location").value = a.location;
    fillUnits(a.unitId);
    el("iinShown").value = iinText(a);
    el("make").value = a.make;
    el("color").value = a.color;
    el("size").value = a.size;
    el("dateAssigned").value = a.dateAssigned;
    el("remarks").value = a.remarks;

    applyType();

    // equipment with a unit register: the numbers are calculated from its units
    const derived = typeof usesUnitRegistry === "function" && usesUnitRegistry(a);
    ["quantity", "issuedQty", "maintenanceQty"].forEach(function (id) { el(id).disabled = derived; el(id).title = derived ? "Calculated from the units. Use the Units button to add units or change their status." : ""; });
    showPhoto();

    el("assetModal").classList.add("show");

}

function closeModal() {
    el("assetModal").classList.remove("show");
}


// ========================================
// SAVE + DELETE
// ========================================

function numberOf(id) {
    const n = parseFloat(el(id).value);
    return isNaN(n) ? NaN : n;
}

function saveAsset() {

    const assets = loadAssets();
    const type = selectedType();
    const consumable = type === TYPE_CONSUMABLE;

    const data = {
        type: type,
        name: el("assetName").value.trim(),
        category: el("category").value,
        unit: el("unit").value.trim(),
        quantity: numberOf("quantity"),
        unitPrice: el("unitPrice").value === "" ? 0 : numberOf("unitPrice"),
        location: el("location").value.trim(),
        photo: photoData,
        brand: "",
        model: "",
        serial: "",
        condition: "",
        unitId: "",
        make: "",
        color: "",
        size: "",
        dateAssigned: "",
        remarks: "",
        issued: 0,
        maintenance: 0,
        reorderLevel: 0
    };

    // the Section / Unit (non-consumable only) gives the location when it is empty
    const unitId = consumable ? "" : el("assetUnit").value;
    const unitChosen = loadUnits().find(function (u) { return u.id === unitId; });

    if (!data.location && unitChosen) data.location = unitChosen.name;

    if (!data.name || !data.category || !data.unit || !data.location) {
        alert("Please fill in the name, category, unit and location.");
        return;
    }

    if (isNaN(data.unitPrice) || data.unitPrice < 0) {
        alert("The unit price must not be negative.");
        return;
    }

    if (consumable) {

        data.reorderLevel = numberOf("reorderLevel");
        data.brand = el("brand").value.trim();

        if (isNaN(data.quantity) || data.quantity < 0) {
            alert("The stock on hand must be 0 or more.");
            return;
        }

        if (isNaN(data.reorderLevel) || data.reorderLevel < 0) {
            alert("The reorder level must be 0 or more.");
            return;
        }

    } else {

        data.brand = el("brand").value.trim();
        data.model = el("model").value.trim();
        data.serial = el("serialNumber").value.trim();
        data.condition = el("condition").value;
        data.unitId = unitId;
        data.make = el("make").value.trim();
        data.color = el("color").value.trim();
        data.size = el("size").value.trim();
        data.dateAssigned = el("dateAssigned").value;
        data.remarks = el("remarks").value.trim();
        data.issued = numberOf("issuedQty");
        data.maintenance = numberOf("maintenanceQty");

        // the brand and the condition are optional (tables, chairs and door closers have no brand)

        if (isNaN(data.quantity) || data.quantity < 1) {
            alert("The total quantity must be at least 1.");
            return;
        }

        if (isNaN(data.issued) || data.issued < 0 || isNaN(data.maintenance) || data.maintenance < 0) {
            alert("Issued and Under Maintenance must be 0 or more.");
            return;
        }

        if (data.issued + data.maintenance > data.quantity) {
            alert("Issued + Under Maintenance (" + (data.issued + data.maintenance) + ") cannot be more than the total quantity (" + data.quantity + ").");
            return;
        }

        // a serial number identifies one item, so it must not be repeated
        if (data.serial) {
            const taken = assets.some(function (a) {
                return a.id !== editingId && a.serial && a.serial.toLowerCase() === data.serial.toLowerCase();
            });

            if (taken) {
                alert("This serial number is already used by another asset.");
                return;
            }
        }

    }

    let asset;
    let stockLog = null;   // a change of the stock of a consumable is written in the movement history

    if (editingId) {

        asset = assets.find(function (a) { return a.id === editingId; });

        if (!asset) { alert("Unable to update the asset."); return; }

        // equipment with a unit register: it stays equipment, and its numbers come from its units
        if (typeof usesUnitRegistry === "function" && usesUnitRegistry(asset)) {
            if (consumable) { alert("This equipment has individual units, so it cannot be changed to a consumable."); return; }
            data.quantity = asset.quantity;
            data.issued = asset.issued;
            data.maintenance = asset.maintenance;
        }

        // changing the stock here is a stock adjustment: it needs a reason and it is recorded
        if (consumable && isConsumable(asset) && Number(asset.quantity) !== Number(data.quantity)) {
            const why = (prompt("The stock of " + asset.name + " changes from " + asset.quantity + " to " + data.quantity + ".\nWrite the reason (required):") || "").trim();

            if (!why) {
                alert("A reason is required to change the stock quantity.");
                return;
            }

            stockLog = { type: "Adjustment", change: data.quantity - asset.quantity, before: asset.quantity, reason: why + " (edited in Assets)" };
        }

        Object.assign(asset, data);

    } else {

        asset = Object.assign({ id: generateAssetID(), dateAdded: new Date().toISOString() }, data);
        assets.push(asset);

        if (consumable && data.quantity > 0) {
            stockLog = { type: "Stock In", change: data.quantity, before: 0, reason: "Opening quantity (added in Assets)" };
        }

    }

    // the numbers (IIN) follow the unit and the quantity
    const units = loadUnits();

    assignIin(asset, units);
    saveUnits(units);

    if (!saveAssets(assets)) {
        alert("The asset could not be saved. The browser storage is full (try a smaller photo).");
        return;
    }

    log((editingId ? "Updated" : "Added") + " asset " + asset.id + " (" + asset.name + ", " + asset.type + ")");

    // a new non-consumable gets its physical units (one record, one ID and one QR code per unit)
    if (!consumable && typeof ensureAssetUnits === "function") ensureAssetUnits();

    if (stockLog && typeof logStockMovement === "function") {
        logStockMovement(asset, stockLog.type, stockLog.change, stockLog.before, stockLog.reason);
    }

    closeModal();
    render();

}

function deleteAsset(id) {

    const assets = loadAssets();
    const asset = assets.find(function (a) { return a.id === id; });

    if (!asset) return;

    // equipment with physical units: units that were used keep their history, so they cannot be deleted here
    if (typeof usesUnitRegistry === "function" && usesUnitRegistry(asset)) {
        const used = unitsOf(id).filter(function (u) { return u.status !== "Available" || (u.history || []).length > 1; });
        if (used.length) {
            alert(asset.name + " has " + used.length + " unit(s) with a history or a status other than Available (" + used.slice(0, 3).map(function (u) { return u.id; }).join(", ") +
                  (used.length > 3 ? ", ..." : "") + ").\nThey cannot be deleted. Use Pull-Out to remove a unit from use.");
            return;
        }
    }

    if (!confirm("Delete asset " + asset.id + " (" + asset.name + ")?")) {
        return;
    }

    // its untouched units go with it
    if (typeof usesUnitRegistry === "function" && usesUnitRegistry(asset)) {
        saveAssetUnits(loadAssetUnits().filter(function (u) { return u.assetId !== id; }));
    }

    saveAssets(assets.filter(function (a) { return a.id !== id; }));
    log("Deleted asset " + asset.id + " (" + asset.name + ")");
    render();

}


// ========================================
// IMPORT FROM EXCEL (a pasted table or a .csv file)
// Every row is a NON-CONSUMABLE item of a Section / Unit. The IIN numbers follow the order of the rows.
// ========================================

const IMPORT_TITLES = {
    unitCode: ["unit code", "section code", "section unit code", "code", "room code", "section unit", "sectionunit"],
    item: ["item", "item name", "name"],
    qty: ["qty", "quantity", "qty unit"],
    unit: ["unit", "uom", "unit of measure"],
    brand: ["brand"],
    model: ["model"],
    make: ["make"],
    color: ["color", "colour"],
    size: ["size"],
    serial: ["serial", "serial #", "serial no", "serial no.", "serial number"],
    price: ["unit price", "price", "unit cost", "cost"],
    date: ["date", "date acquired", "date assigned"],
    condition: ["condition"],
    remarks: ["remarks", "remark", "notes"],
    category: ["category"]
};

const IMPORT_CATEGORIES = ["Electronics", "Equipment", "Furniture", "Office Supplies", "Audio Device", "Other"];
const IMPORT_CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"];

let importRows = [];   // the rows that passed the check

// Splits the text into rows and cells. Excel gives tabs; a .csv file gives commas (or semicolons).
function parseDelimited(text) {

    const firstLine = text.split(/\r?\n/).find(function (l) { return l.trim() !== ""; }) || "";
    const count = function (ch) { return firstLine.split(ch).length - 1; };

    let delimiter = ",";

    if (count("\t") > 0) delimiter = "\t";
    else if (count(";") > count(",")) delimiter = ";";

    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {

        const ch = text[i];

        if (quoted) {

            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;

        } else if (ch === '"' && cell === "") {
            // a quote only opens a quoted cell at the START of the cell ("Bag Cabinet, 20 shelves").
            // A quote in the middle is just a character, for example 22" (22 inches).
            quoted = true;
        } else if (ch === delimiter) {
            row.push(cell);
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += ch;
        }

    }

    row.push(cell);
    rows.push(row);

    // rows with nothing in them are skipped
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });

}

function titleKey(text) {

    const plain = String(text).toLowerCase().replace(/[^a-z0-9#. ]/g, " ").replace(/\s+/g, " ").trim();

    return Object.keys(IMPORT_TITLES).find(function (k) { return IMPORT_TITLES[k].indexOf(plain) !== -1; }) || null;

}

function importDate(value) {

    const v = String(value || "").trim();

    if (!v) return "";

    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);

    if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");

    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v);

    if (m) {
        const year = m[3].length === 2 ? "20" + m[3] : m[3];
        return year + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
    }

    return null;   // not understood

}

function pickFrom(list, value) {

    const found = list.find(function (x) { return x.toLowerCase() === String(value || "").trim().toLowerCase(); });

    return found || "";

}

// Reads the pasted table. Returns { rows, errors, columns } and changes nothing.
function readImport() {

    const text = el("importText").value;
    const table = parseDelimited(text);
    const result = { rows: [], errors: [], columns: [] };

    if (table.length < 2) {
        result.errors.push("Paste the table with its first row of titles and at least one row of items.");
        return result;
    }

    // the titles of the columns
    const keys = table[0].map(titleKey);

    result.columns = keys.filter(Boolean);

    if (keys.indexOf("item") === -1 || keys.indexOf("qty") === -1) {
        result.errors.push('The first row must have the titles "Item" and "Qty". The titles found: ' + table[0].map(function (t) { return t.trim(); }).join(", "));
        return result;
    }

    const units = loadUnits();
    const defaultUnit = el("importUnit").value;
    const takenSerials = {};

    loadAssets().forEach(function (a) { if (a.serial) takenSerials[a.serial.toLowerCase()] = true; });

    table.slice(1).forEach(function (cells, index) {

        const n = index + 2;   // the row number in Excel
        const get = function (key) {
            const i = keys.indexOf(key);
            return i === -1 ? "" : String(cells[i] || "").trim();
        };

        const problems = [];

        // item and quantity ("41 units" gives 41 and "units")
        const item = get("item");
        const qtyMatch = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(get("qty"));
        const qty = qtyMatch ? Math.round(parseFloat(qtyMatch[1].replace(",", "."))) : NaN;

        if (!item) problems.push("no item");
        if (!(qty >= 1)) problems.push('the Qty "' + get("qty") + '" is not a number of 1 or more');

        // the Section / Unit
        const code = get("unitCode");
        const unit = code
            ? units.find(function (u) { return u.code.toLowerCase() === code.toLowerCase(); })
            : units.find(function (u) { return u.id === defaultUnit; });

        if (!unit) problems.push(code ? 'the Section / Unit "' + code + '" does not exist' : "no Section / Unit (choose one above or add a Unit Code column)");

        // the date and the price
        const date = importDate(get("date"));

        if (date === null) problems.push('the date "' + get("date") + '" is not understood (use month/day/year)');

        const priceText = get("price").replace(/[₱,\s]/g, "");
        const price = priceText === "" ? 0 : parseFloat(priceText);

        if (isNaN(price) || price < 0) problems.push('the price "' + get("price") + '" is not a number');

        // the serial number must be new
        const serial = get("serial");

        if (serial) {

            if (takenSerials[serial.toLowerCase()]) problems.push('the serial number "' + serial + '" is already used');
            else takenSerials[serial.toLowerCase()] = true;

        }

        if (problems.length) {
            result.errors.push("Row " + n + (item ? " (" + item + ")" : "") + ": " + problems.join("; "));
            return;
        }

        const remarks = get("remarks");
        let condition = pickFrom(IMPORT_CONDITIONS, get("condition"));

        if (!condition && /good/i.test(remarks)) condition = "Good";

        result.rows.push({
            name: item,
            quantity: qty,
            unit: get("unit") || (qtyMatch && qtyMatch[2].trim()) || "pc",
            brand: get("brand"),
            model: get("model"),
            make: get("make"),
            color: get("color"),
            size: get("size"),
            serial: serial,
            unitPrice: price,
            dateAssigned: date,
            condition: condition,
            remarks: remarks,
            category: pickFrom(IMPORT_CATEGORIES, get("category")) || (get("category") ? "Other" : "Equipment"),
            unitId: unit.id,
            unitCode: unit.code
        });

    });

    return result;

}

function openImport() {

    const select = el("importUnit");

    select.innerHTML = '<option value="">-- Use the Unit Code column --</option>';

    loadUnits().forEach(function (u) {
        const option = document.createElement("option");
        option.value = u.id;
        option.textContent = unitLabel(u);
        select.appendChild(option);
    });

    el("importText").value = "";
    el("importFile").value = "";
    el("importResult").innerHTML = "";
    el("runImport").disabled = true;
    importRows = [];

    el("importModal").classList.add("show");

}

function closeImport() {
    el("importModal").classList.remove("show");
}

function checkImport() {

    const result = readImport();
    const box = el("importResult");

    importRows = [];
    el("runImport").disabled = true;

    if (result.errors.length) {

        let html = '<div class="bad">' + (result.rows.length ? result.rows.length + " row(s) are fine, " : "") + result.errors.length +
                   " problem(s). Fix them in Excel and paste again (nothing was imported):</div><ul>";

        result.errors.slice(0, 50).forEach(function (e) { html += "<li>" + escapeHTML(e) + "</li>"; });

        if (result.errors.length > 50) html += "<li>... and " + (result.errors.length - 50) + " more</li>";

        box.innerHTML = html + "</ul>";
        return;

    }

    importRows = result.rows;

    let html = '<div class="ok">' + result.rows.length + " row(s) are ready. " +
               result.rows.reduce(function (s, r) { return s + r.quantity; }, 0) + " unit(s) in total. Click Import.</div>" +
               "<table><thead><tr><th>Section / Unit</th><th>Item</th><th>Qty</th><th>Brand</th><th>Serial</th><th>Remarks</th></tr></thead><tbody>";

    result.rows.slice(0, 8).forEach(function (r) {
        html += "<tr><td>" + escapeHTML(r.unitCode) + "</td><td>" + escapeHTML(r.name) + "</td><td>" + escapeHTML(r.quantity + " " + r.unit) +
                "</td><td>" + escapeHTML(r.brand) + "</td><td>" + escapeHTML(r.serial) + "</td><td>" + escapeHTML(r.remarks) + "</td></tr>";
    });

    if (result.rows.length > 8) html += '<tr><td colspan="6">... and ' + (result.rows.length - 8) + " more row(s)</td></tr>";

    box.innerHTML = html + "</tbody></table>";
    el("runImport").disabled = false;

}

function runImport() {

    // the table is read again, in case it was changed after the check
    const result = readImport();

    if (result.errors.length || result.rows.length === 0) {
        checkImport();
        return;
    }

    const assets = loadAssets();
    const units = loadUnits();

    let highest = 0;

    assets.forEach(function (a) {
        const m = /^AST(\d+)$/.exec(a.id);
        if (m) highest = Math.max(highest, parseInt(m[1], 10));
    });

    const now = new Date().toISOString();

    result.rows.forEach(function (r) {

        highest++;

        const asset = {
            id: "AST" + String(highest).padStart(3, "0"),
            dateAdded: now,
            type: TYPE_NON_CONSUMABLE,
            name: r.name,
            category: r.category,
            unit: r.unit,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            location: (units.find(function (u) { return u.id === r.unitId; }) || {}).name || "",
            photo: "",
            brand: r.brand,
            model: r.model,
            serial: r.serial,
            condition: r.condition,
            unitId: r.unitId,
            make: r.make,
            color: r.color,
            size: r.size,
            dateAssigned: r.dateAssigned,
            remarks: r.remarks,
            issued: 0,
            maintenance: 0,
            reorderLevel: 0
        };

        assignIin(asset, units);   // the IIN follows the order of the rows
        assets.push(asset);

    });

    if (!saveAssets(assets) || !saveUnits(units)) {
        alert("The items could not be saved. The browser storage is full.");
        return;
    }

    log("Imported " + result.rows.length + " item(s) (" + result.rows.reduce(function (s, r) { return s + r.quantity; }, 0) + " units) from a table");

    closeImport();
    render();

    alert(result.rows.length + " item(s) imported.");

}

function downloadTemplate() {

    const text =
        "Unit Code,Item,Qty,Brand,Model,Make,Color,Size,Serial,Unit Price,Date,Condition,Remarks,Category\r\n" +
        "MRm102,Aircon (inverter),2 units,Hitachi,,window type,white,2 hp,,,,Good,good condition,Electronics\r\n" +
        "MRm102,Monoblock chair,33 pcs,,,plastic,beige,,,,,Good,good condition,Furniture\r\n";

    const link = document.createElement("a");

    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    link.download = "assets-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

}


// ========================================
// QR CODE (needs Shared/qr.js and Shared/scanner.js)
// ========================================

let qrAssetId = null;   // asset shown in the QR window

function qrAvailable() {

    if (typeof QR === "undefined") {
        alert("The QR code files were not found. Put the Shared folder (qr.js and scanner.js) in the project root, next to Admin and Requester.");
        return false;
    }

    return true;

}

function showQr(id) {

    if (!qrAvailable()) return;

    const a = loadAssets().find(function (x) { return x.id === id; });

    if (!a) return;

    qrAssetId = id;

    el("qrImage").innerHTML = QR.svg(qrAssetPayload(a.id), { size: 200 });

    function row(label, value) {
        return "<div><strong>" + escapeHTML(label) + "</strong>" + escapeHTML(value === 0 ? "0" : (value || "-")) + "</div>";
    }

    let html =
        row("Asset ID", a.id) +
        row("Name", a.name) +
        row("Type", a.type) +
        row("Category", a.category);

    if (isConsumable(a)) {
        html += row("Stock", a.quantity + " " + a.unit);
        html += row("Reorder at", a.reorderLevel);
    } else {
        html += row("Quantity", a.quantity + " total");
        html += row("Available", assetAvailable(a));
        html += row("Issued", a.issued);
        html += row("Maintenance", a.maintenance);
        html += row("Condition", a.condition);
        html += row("Serial No.", a.serial);
        html += row("IIN", iinText(a));
    }

    html += row("Location", a.location);

    if (!isConsumable(a)) {
        const section = loadUnits().find(function (u) { return u.id === a.unitId; });
        html += row("Department / Section", section ? section.name : "");
    }

    html += row("Status", assetStatus(a));

    // recent history of this asset: stock movements and the Audit Trail entries that name it
    const events = [];
    (typeof loadMovements === "function" ? loadMovements() : []).forEach(function (m) {
        if (m.assetId === a.id) events.push({ date: m.date, text: m.type + " " + (m.change > 0 ? "+" : "") + m.change + " (" + m.before + " to " + m.after + ")" + (m.reason ? ": " + m.reason : "") });
    });
    try {
        (JSON.parse(localStorage.getItem("auditLog")) || []).forEach(function (l) {
            if (String(l.activity || "").indexOf(a.id) !== -1) events.push({ date: l.date, text: l.activity });
        });
    } catch (e) { /* no audit log */ }
    events.sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });

    html += "<div><strong>History</strong>" + (events.length
        ? events.slice(0, 5).map(function (e) { return escapeHTML(new Date(e.date).toLocaleDateString("en-US") + " - " + e.text); }).join("<br>")
        : "No recorded activity yet.") + "</div>";

    el("qrInfo").innerHTML = html;

    el("qrModal").classList.add("show");

}

// Download the QR code of the open asset as a PNG image (the QR only identifies the asset)
function downloadQr() {

    const a = loadAssets().find(function (x) { return x.id === qrAssetId; });
    const svg = a ? el("qrImage").querySelector("svg") : null;

    if (!a || !svg) return;

    let xml = new XMLSerializer().serializeToString(svg);
    if (xml.indexOf("xmlns=") === -1) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

    const img = new Image();

    img.onload = function () {
        const size = 600;                                   // a big image prints sharper
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, size, size);

        canvas.toBlob(function (blob) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = a.id + "-QR.png";
            link.click();
            setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
        }, "image/png");
    };

    img.onerror = function () { alert("The QR image could not be created."); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

}

function closeQr() {
    qrAssetId = null;
    el("qrModal").classList.remove("show");
}

// Print the QR labels of the given assets (3 labels per row)
function printLabels(list) {

    if (!qrAvailable()) return;

    // equipment with units: one label for EACH unit
    if (typeof expandLabelList === "function") list = expandLabelList(list);

    if (list.length === 0) {
        alert("There are no assets yet.");
        return;
    }

    let html = '<div class="qr-sheet">';

    list.forEach(function (a) {
        html += '<div class="qr-label">' +
            '<div class="org">NEW ERA UNIVERSITY</div>' +
            QR.svg(qrAssetPayload(a.id), { size: 120, border: 1 }) +
            '<div class="code">' + escapeHTML(a.id) + "</div>" +
            '<div class="name">' + escapeHTML(a.name) + "</div>" +
            '<div class="where">' + escapeHTML(a.location) + "</div>" +
            "</div>";
    });

    html += "</div>";

    el("printArea").innerHTML = html;

    let style = document.getElementById("pageStyle");

    if (!style) {
        style = document.createElement("style");
        style.id = "pageStyle";
        document.head.appendChild(style);
    }

    style.textContent = "@page { size: portrait; margin: 10mm; }";

    window.print();

}

// Scan the QR label of an asset
function scanAsset() {

    if (typeof openScanner === "undefined" || !qrAvailable()) return;

    openScanner({
        title: "Scan Asset QR",
        hint: "Scan the QR label of an asset, or type its code (for example AST001).",
        onCode: function (parsed) {

            if (parsed.kind === "asset") {

                // the code of ONE physical unit: open exactly that unit (scanning only opens, it never changes anything)
                if (typeof isUnitId === "function" && isUnitId(parsed.id)) {
                    const unit = findUnit(parsed.id);
                    if (!unit) return "No unit with the code " + parsed.id + ".";
                    openUnitDetails(unit.id);
                    return true;
                }

                const found = loadAssets().find(function (a) { return a.id.toLowerCase() === parsed.id.toLowerCase(); });

                if (!found) return "No asset with the code " + parsed.id + ".";

                showQr(found.id);
                return true;

            }

            if (parsed.kind === "form" || parsed.kind === "form-number") {
                return "This is the code of a form. Scan it in Request Management.";
            }

            return "This code is not recognized.";

        }
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
                    window.location.href = "assets.html";
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
