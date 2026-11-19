// ADMIN / STAFF - INVENTORY MANAGEMENT (consumables: Stock In, Stock Out, Adjustment, history)
// Frontend simulation. Equipment stays in Assets. Release to requisitions is done in Request Management.

const IM_PAGES = {
    "Dashboard": "../Dashboard/dashboard.html", "Request Management": "../RequestManagement/requestmanagement.html", "Assets": "../Assets/assets.html",
    "Annual Inventory": "../AnnualInventory/annualinventory.html", "Issuance": "../Issuance/issuance.html", "Reports": "../Reports/reports.html",
    "Users": "../Users/users.html", "Audit Trail": "../AuditTrail/audittrail.html"
};

function imConsumables() { return loadAssets().filter(isConsumable); }

function imBadge(a) {
    const st = assetStatus(a);
    return '<span class="wf-badge ' + (st === "Out of Stock" ? "st-rejected" : st === "Low Stock" ? "st-pending" : "st-released") + '">' + st + "</span>";
}

function imStockDialog(a, kind) {

    const title = kind === "in" ? "Stock In" : kind === "out" ? "Stock Out" : "Adjust stock";
    wfModal(title + " - " + a.name,
        '<p class="wf-note">Current quantity: <b>' + wfEsc(a.quantity) + " " + wfEsc(a.unit) + "</b></p>" +
        '<label class="wf-note">' + (kind === "adjust" ? "Counted quantity" : "Quantity") + '</label><input class="wf-input" id="imQty" type="number" min="0" step="1">' +
        '<label class="wf-note" style="margin-top:8px;display:block">Reason (required)</label><input class="wf-input" id="imReason" placeholder="' +
            (kind === "in" ? "e.g. Delivery from supplier" : kind === "out" ? "e.g. Damaged / used by Property Office" : "e.g. Physical count") + '">',
        [{ text: "Cancel", onClick: wfCloseModal }, { text: "Save", cls: "gold", onClick: function () {
            const r = changeConsumableStock(a.id, kind, document.getElementById("imQty").value, document.getElementById("imReason").value);
            if (!r.ok) { wfToast(r.message, true); return; }
            wfCloseModal(); wfToast(title + " saved."); imRefresh();
        } }]);

}

// the same categories as the Assets page, so every item can be edited in both places
const IM_CATEGORIES = ["Electronics", "Equipment", "Furniture", "Office Supplies", "Audio Device", "Other"];

function imCategorySelect(current) {
    const list = IM_CATEGORIES.indexOf(current) === -1 && current ? IM_CATEGORIES.concat([current]) : IM_CATEGORIES;
    return '<select class="wf-select" id="fCat" style="width:100%">' + list.map(function (c) {
        return '<option value="' + wfEsc(c) + '"' + (c === current ? " selected" : "") + ">" + wfEsc(c) + "</option>";
    }).join("") + "</select>";
}

function imItemDialog(a) {

    const edit = !!a;
    wfModal(edit ? "Edit item" : "Add consumable item",
        '<label class="wf-note">Item name</label><input class="wf-input" id="fName" value="' + wfEsc(edit ? a.name : "") + '">' +
        '<label class="wf-note" style="margin-top:8px;display:block">Category</label>' + imCategorySelect(edit ? a.category : "Office Supplies") + '' +
        '<div style="display:flex;gap:8px;margin-top:8px"><div style="flex:1"><label class="wf-note">Unit</label><input class="wf-input" id="fUnit" value="' + wfEsc(edit ? a.unit : settingsGet("inventory.defaultConsumableUnit", "pc")) + '"></div>' +
        '<div style="flex:1"><label class="wf-note">Unit price</label><input class="wf-input" id="fPrice" type="number" min="0" value="' + wfEsc(edit ? a.unitPrice : 0) + '"></div>' +
        '<div style="flex:1"><label class="wf-note">Reorder level</label><input class="wf-input" id="fReorder" type="number" min="0" value="' + wfEsc(edit ? a.reorderLevel : settingsGet("inventory.defaultReorderLevel", 10)) + '"></div></div>' +
        (edit ? '<p class="wf-note">To change the quantity use Stock In, Stock Out or Adjust, so the history stays correct.</p>' :
            '<label class="wf-note" style="margin-top:8px;display:block">Opening quantity</label><input class="wf-input" id="fQty" type="number" min="0" value="0">'),
        [{ text: "Cancel", onClick: wfCloseModal }, { text: "Save", cls: "gold", onClick: function () {

            const v = function (id) { return document.getElementById(id).value.trim(); };
            const name = v("fName");
            if (!name || !v("fUnit")) { wfToast("Name and unit are required.", true); return; }
            if (parseFloat(v("fPrice")) < 0 || parseFloat(v("fReorder")) < 0) { wfToast("Numbers cannot be negative.", true); return; }
            if (!edit) {
                const openQty = v("fQty") === "" ? 0 : Number(v("fQty"));
                if (!isFinite(openQty) || openQty < 0) { wfToast("The opening quantity must be 0 or more.", true); return; }
            }

            const all = loadAssets();
            if (all.some(function (x) { return x.id !== (a && a.id) && x.name.toLowerCase() === name.toLowerCase(); })) { wfToast("An item with this name already exists.", true); return; }

            if (edit) {
                const t = all.find(function (x) { return x.id === a.id; });
                t.name = name; t.category = v("fCat"); t.unit = v("fUnit"); t.unitPrice = parseFloat(v("fPrice")) || 0; t.reorderLevel = parseFloat(v("fReorder")) || 0;
                saveAssets(all);
                tryAuditLog(wfMe(), wfRole(), "Edited consumable item " + name);
            } else {
                let highest = 0;
                all.forEach(function (x) { const m = /^AST(\d+)$/.exec(x.id); if (m) highest = Math.max(highest, parseInt(m[1], 10)); });
                const n = {
                    id: "AST" + String(highest + 1).padStart(3, "0"), dateAdded: new Date().toISOString(), type: TYPE_CONSUMABLE, name: name, category: v("fCat"), unit: v("fUnit"),
                    quantity: parseFloat(v("fQty")) || 0, unitPrice: parseFloat(v("fPrice")) || 0, reorderLevel: parseFloat(v("fReorder")) || 0,
                    location: "Property Office", photo: "", brand: "", model: "", serial: "", condition: "New", issued: 0, maintenance: 0
                };
                all.push(n); saveAssets(all);
                if (n.quantity > 0) logStockMovement(n, "Stock In", n.quantity, 0, "Opening quantity");
                tryAuditLog(wfMe(), wfRole(), "Added consumable item " + name);
            }
            wfCloseModal(); wfToast("Item saved."); imRefresh();
        } }]);

}

let itemTable, moveTable;

function imRefresh() {

    const items = imConsumables();
    document.getElementById("cItems").textContent = items.length;
    document.getElementById("cLow").textContent = items.filter(function (a) { return assetStatus(a) === "Low Stock"; }).length;
    document.getElementById("cOut").textContent = items.filter(function (a) { return assetStatus(a) === "Out of Stock"; }).length;

    const bad = items.filter(isLowStock);
    document.getElementById("alertPanel").style.display = bad.length ? "" : "none";
    document.getElementById("alerts").innerHTML = bad.map(function (a) {
        return '<div class="wf-list-item">' + imBadge(a) + " <b>" + wfEsc(a.name) + "</b> - " + wfEsc(a.quantity) + " " + wfEsc(a.unit) + " left (reorder at " + wfEsc(a.reorderLevel) + ")</div>";
    }).join("");

    if (itemTable) itemTable.redraw();
    if (moveTable) moveTable.redraw();

}

function imMoves() {
    const q = document.getElementById("mSearch").value.toLowerCase().trim(), t = document.getElementById("mType").value;
    const from = document.getElementById("mFrom").value, to = document.getElementById("mTo").value;
    return loadMovements().filter(function (m) {
        const day = m.date.slice(0, 10);
        if (t !== "all" && m.type !== t) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        return !q || (m.item + " " + m.reason + " " + m.by).toLowerCase().indexOf(q) !== -1;
    }).reverse();
}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(".sidebar ul li").forEach(function (li) {
        li.addEventListener("click", function () {
            const n = li.textContent.trim();
            if (IM_PAGES[n]) location.href = IM_PAGES[n];
            else if (n === "Logout" && confirm("Are you sure you want to logout?")) { if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear(); location.href = "../Login/login.html"; }
        });
    });

    const iSearch = document.getElementById("iSearch"), iStatus = document.getElementById("iStatus");

    itemTable = wfPagedTable({
        rows: function () {
            const q = iSearch.value.toLowerCase().trim();
            return imConsumables().filter(function (a) {
                return (iStatus.value === "all" || assetStatus(a) === iStatus.value) && (!q || (a.name + " " + a.category).toLowerCase().indexOf(q) !== -1);
            });
        },
        tbody: "iBody", pager: "iPager", cols: 7, perPage: 6, empty: "No consumable items.",
        rowHtml: function (a) {
            return "<tr><td><b>" + wfEsc(a.name) + "</b><br><small>" + wfEsc(a.id) + "</small></td><td>" + wfEsc(a.category) + "</td><td>" + wfEsc(a.unit) + "</td><td>" + wfEsc(a.quantity) + "</td><td>" + wfEsc(a.reorderLevel) +
                "</td><td>" + imBadge(a) + '</td><td style="white-space:nowrap">' +
                ['in:Stock In', 'out:Stock Out', 'adjust:Adjust', 'edit:Edit'].map(function (x) { const p = x.split(":"); return '<button type="button" class="wf-btn sm" data-act="' + p[0] + '" data-id="' + a.id + '">' + p[1] + "</button> "; }).join("") + "</td></tr>";
        }
    });

    document.getElementById("iBody").addEventListener("click", function (e) {
        const b = e.target.closest("[data-act]"); if (!b) return;
        const a = imConsumables().find(function (x) { return x.id === b.dataset.id; });
        if (!a) return;
        if (b.dataset.act === "edit") imItemDialog(a); else imStockDialog(a, b.dataset.act);
    });

    moveTable = wfPagedTable({
        rows: imMoves, tbody: "mBody", pager: "mPager", cols: 8, perPage: 8, empty: "No stock movements yet.",
        rowHtml: function (m) {
            return "<tr><td>" + wfEsc(wfFormatDate(m.date, true)) + "</td><td>" + wfEsc(m.item) + "</td><td>" + wfEsc(m.type) + '</td><td style="color:' + (m.change < 0 ? "#ff8a7a" : "#4fd88a") + '">' +
                (m.change > 0 ? "+" : "") + wfEsc(m.change) + "</td><td>" + wfEsc(m.before) + "</td><td>" + wfEsc(m.after) + "</td><td>" + wfEsc(m.reason) + "</td><td>" + wfEsc(m.by) + "</td></tr>";
        }
    });

    document.getElementById("addItem").addEventListener("click", function () { imItemDialog(null); });
    // System Settings > Inventory: the filter that is shown first
    const firstFilter = settingsGet("inventory.defaultStatusFilter", "all");
    if (firstFilter !== "all") { iStatus.value = firstFilter; itemTable.redraw(true); }

    iSearch.addEventListener("input", function () { itemTable.redraw(true); });
    iStatus.addEventListener("change", function () { itemTable.redraw(true); });
    ["mSearch", "mType", "mFrom", "mTo"].forEach(function (id) { document.getElementById(id).addEventListener(id === "mSearch" ? "input" : "change", function () { moveTable.redraw(true); }); });

    document.getElementById("mCsv").addEventListener("click", function () {
        const rows = [["Date", "Item", "Type", "Change", "Before", "After", "Reason", "By"]].concat(imMoves().map(function (m) { return [m.date, m.item, m.type, m.change, m.before, m.after, m.reason, m.by]; }));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n")], { type: "text/csv" }));
        a.download = "stock-movements.csv"; a.click();
    });

    if (typeof onDataChange === "function") onDataChange(["assets", "stockMovements"], imRefresh);
    imRefresh();

});
