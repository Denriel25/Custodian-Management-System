// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED STOCK (ASSETS: CONSUMABLE AND NON-CONSUMABLE)
//
// Two kinds of assets:
//
//   Consumable      supplies that are used up (bond paper, ink).
//                   Tracked by STOCK: "quantity" is what is on hand.
//
//   Non-consumable  inventoriable equipment (laptop, projector, chair).
//                   "quantity" is how many the school owns. Some of them can be
//                   "issued" (given to a person) or "under maintenance" (pulled out
//                   for repair). The rest are available.
//                       available = quantity - issued - maintenance
//
// When the stock changes:
//   - Requisition RELEASED          consumable: stock goes down
//                                   non-consumable: units become issued
//   - Acknowledgment Receipt made   same as above (unless it is for a requisition that
//                                   was already released, then nothing changes again)
//   - Pull-Out Request RELEASED     units leave their assignment or location and go
//                                   under maintenance (non-consumable only)
//   Correcting the Issued count or finishing a repair: edit the asset in Admin > Assets.
//
// Put <script src="../../Shared/stock.js"></script> before the page script.
// ========================================

const ASSETS_KEY = "assets";

const TYPE_CONSUMABLE = "Consumable";
const TYPE_NON_CONSUMABLE = "Non-consumable";


// ========================================
// READ AND SAVE
// ========================================

function toNumber(value) {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
}

// Gives every asset all the fields (also the assets saved by the older version,
// which had no type: they count as non-consumable)
function normalizeAsset(raw) {

    const a = Object.assign({}, raw);
    const legacy = !a.type;

    a.type = a.type === TYPE_CONSUMABLE ? TYPE_CONSUMABLE : TYPE_NON_CONSUMABLE;
    a.quantity = toNumber(a.quantity);
    a.unit = a.unit || "pc";
    a.unitPrice = toNumber(a.unitPrice);
    a.reorderLevel = toNumber(a.reorderLevel);

    // for the Annual Inventory (non-consumable items that belong to a Section / Unit)
    a.unitId = a.unitId || "";
    a.make = a.make || "";
    a.color = a.color || "";
    a.size = a.size || "";
    a.remarks = a.remarks || "";
    a.dateAssigned = a.dateAssigned || "";
    a.iin = Array.isArray(a.iin) ? a.iin : [];
    a.iinUnitId = a.iinUnitId || "";

    if (a.type === TYPE_CONSUMABLE) {
        a.issued = 0;
        a.maintenance = 0;
    } else {
        a.issued = a.issued !== undefined ? toNumber(a.issued) : (legacy && a.status === "Issued" ? a.quantity : 0);
        a.maintenance = a.maintenance !== undefined ? toNumber(a.maintenance) : (legacy && a.status === "Maintenance" ? a.quantity : 0);
    }

    return a;

}

function loadAssets() {

    let list = [];

    try {
        list = JSON.parse(localStorage.getItem(ASSETS_KEY)) || [];
    } catch (e) {
        list = [];
    }

    return list.map(normalizeAsset);

}

// Returns true when it was saved
function saveAssets(list) {

    try {
        localStorage.setItem(ASSETS_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        return false;
    }

}


// ========================================
// STATUS AND NUMBERS
// ========================================

function isConsumable(a) {
    return a.type === TYPE_CONSUMABLE;
}

// How many can be given out now
function assetAvailable(a) {

    if (isConsumable(a)) return a.quantity;

    return Math.max(0, a.quantity - a.issued - a.maintenance);

}

function isLowStock(a) {

    if (!isConsumable(a)) return false;

    // the reorder level of the item (System Settings can give a fallback level to items that have none)
    const level = typeof effectiveReorder === "function" ? effectiveReorder(a) : a.reorderLevel;

    return a.quantity <= 0 || (level > 0 && a.quantity <= level);

}

// The status is worked out from the numbers, nobody types it
function assetStatus(a) {

    if (isConsumable(a)) {
        if (a.quantity <= 0) return "Out of Stock";
        if (isLowStock(a)) return "Low Stock";
        return "In Stock";
    }

    if (assetAvailable(a) > 0) return "Available";
    if (a.issued > 0) return "Issued";
    if (a.maintenance > 0) return "Maintenance";

    return "Unavailable";

}

// Short text for lists, for example "12 ream" or "3 of 5 available"
function stockText(a) {

    if (isConsumable(a)) return a.quantity + " " + a.unit;

    return assetAvailable(a) + " of " + a.quantity + " available";

}


// ========================================
// STOCK CHANGES
//   items: the lines of a form. Only the lines with an assetId are counted.
//   mode:  "issue"   requisition released, or receipt made
//          "pullout" pull-out request released
// ========================================

// { assetId: total quantity }
function totalsByAsset(items) {

    const totals = {};

    (items || []).forEach(function (it) {

        const qty = toNumber(it.qty);

        if (it.assetId && qty > 0) {
            totals[it.assetId] = (totals[it.assetId] || 0) + qty;
        }

    });

    return totals;

}

// How many can leave for this kind of movement
function availableFor(a, mode) {

    if (mode === "pullout") {
        if (isConsumable(a)) return 0;
        if (typeof usesUnitRegistry === "function" && usesUnitRegistry(a)) return a.quantity;   // any unit that is not Pulled Out
        return a.quantity - a.maintenance;   // issued units can be pulled out too
    }

    return assetAvailable(a);

}

// One line of text for each asset: for showing "need 5, available 12"
function stockLines(items, mode) {

    const assets = loadAssets();
    const totals = totalsByAsset(items);
    const lines = [];

    Object.keys(totals).forEach(function (id) {

        const a = assets.find(function (x) { return x.id === id; });

        if (!a) {
            lines.push({ ok: true, text: id + ": not found in Assets (the stock will not change)" });
            return;
        }

        if (mode === "pullout" && isConsumable(a)) {
            lines.push({ ok: false, text: a.name + ": a pull-out is only for non-consumable items" });
            return;
        }

        const have = availableFor(a, mode);

        lines.push({
            ok: totals[id] <= have,
            text: a.name + ": need " + totals[id] + ", " + (mode === "pullout" ? "can be pulled out " : "available ") + have + (isConsumable(a) ? " " + a.unit : "")
        });

    });

    return lines;

}

// Equipment that uses the per-unit register: the lines must name the specific units (item.unitIds).
function unitProblems(items, mode) {

    if (typeof usesUnitRegistry !== "function") return [];

    const assets = loadAssets();
    const problems = [];
    const used = {};

    (items || []).forEach(function (it) {

        if (!it.assetId) return;

        const qty = toNumber(it.qty);
        if (!(qty > 0)) return;

        const a = assets.find(function (x) { return x.id === it.assetId; });
        if (!a || !usesUnitRegistry(a)) return;

        const p = checkUnitSelection(a, { qty: qty, unitIds: it.unitIds || [] }, mode);
        if (p) problems.push(p);

        (it.unitIds || []).forEach(function (id) {
            if (used[id]) problems.push(a.name + ": " + id + " is selected on two lines.");
            used[id] = true;
        });

    });

    return problems;

}

// needUnits = true when the movement really happens (the units must be chosen); false for a simple "is there enough" check
function checkStock(items, mode, needUnits) {

    const problems = stockLines(items, mode)
        .filter(function (l) { return !l.ok; })
        .map(function (l) { return l.text; });

    if (needUnits) unitProblems(items, mode).forEach(function (p) { problems.push(p); });

    return { ok: problems.length === 0, problems: problems };

}

// Changes the stock. Nothing is changed if one line is not possible.
//   ctx (optional) = { ref, assignedTo, department }  who/what the units are released to (written in the history of each unit)
function applyStock(items, mode, note, ctx) {

    const check = checkStock(items, mode, true);

    if (!check.ok) return { ok: false, problems: check.problems, changes: [] };

    const assets = loadAssets();
    const totals = totalsByAsset(items);
    const changes = [];
    const registryUnits = {};          // assetId -> unit ids that moved (equipment that uses the per-unit register)

    // units chosen on the lines, per equipment
    (items || []).forEach(function (it) {
        const a = assets.find(function (x) { return x.id === it.assetId; });
        if (a && typeof usesUnitRegistry === "function" && usesUnitRegistry(a) && toNumber(it.qty) > 0) {
            registryUnits[a.id] = (registryUnits[a.id] || []).concat(it.unitIds || []);
        }
    });

    // 1) the specific units change status (the equipment numbers are calculated from them afterwards)
    Object.keys(registryUnits).forEach(function (id) {
        const a = assets.find(function (x) { return x.id === id; });
        applyUnitMovement(a, registryUnits[id], mode === "pullout" ? "pullout" : "issue", Object.assign({ note: note || "" }, ctx || {}));
    });

    // 2) everything else is counted by quantity, as before
    Object.keys(totals).forEach(function (id) {

        const a = assets.find(function (x) { return x.id === id; });

        if (!a || registryUnits[id]) return;

        const qty = totals[id];

        if (mode === "pullout") {

            // units that were issued leave their assignment first, then the available ones
            a.issued -= Math.min(a.issued, qty);
            a.maintenance += qty;
            changes.push(a.name + ": " + qty + " pulled out (under maintenance: " + a.maintenance + ")");

        } else if (isConsumable(a)) {

            a.quantity -= qty;
            changes.push(a.name + ": stock -" + qty + " (now " + a.quantity + " " + a.unit + ")");

        } else {

            a.issued += qty;
            changes.push(a.name + ": " + qty + " issued (available now " + assetAvailable(a) + ")");

        }

    });

    if (!saveAssets(assets)) {
        return { ok: false, problems: ["The stock could not be saved (browser storage is full)."], changes: [] };
    }

    // the numbers of the registry equipment are calculated from its units
    if (Object.keys(registryUnits).length && typeof syncUnitCounts === "function") syncUnitCounts(Object.keys(registryUnits));

    const fresh = loadAssets();

    Object.keys(registryUnits).forEach(function (id) {
        const a = fresh.find(function (x) { return x.id === id; });
        changes.push(a.name + ": " + registryUnits[id].length + " unit(s) " + (mode === "pullout" ? "pulled out" : "assigned") + " (" + registryUnits[id].join(", ") + "); available now " + assetAvailable(a));
    });

    // movement history (Inventory Management)
    Object.keys(totals).forEach(function (id) {
        const a = fresh.find(function (x) { return x.id === id; });
        // a consumable is logged by its stock; a non-consumable by its AVAILABLE units (its total does not change when units are issued)
        const unitText = registryUnits[id] ? " [units: " + registryUnits[id].join(", ") + "]" : "";
        if (a) logStockMovement(a, mode === "pullout" ? "Pull-Out" : "Release", -totals[id], (isConsumable(a) ? a.quantity : assetAvailable(a)) + totals[id], (note || "") + unitText);
    });

    // write the changes in the Audit Trail
    if (typeof tryAuditLog === "function") {
        const who = sessionStorage.getItem("userEmail") || "Admin";
        const role = typeof currentRole === "function" && currentRole() ? currentRole() : "Staff";
        changes.forEach(function (c) {
            tryAuditLog(who, role, "Stock: " + c + (note ? " [" + note + "]" : ""));
        });
    }

    return { ok: true, problems: [], changes: changes };

}


// ========================================
// STOCK MOVEMENT HISTORY (Inventory Management)
//   type: "Stock In" | "Stock Out" | "Adjustment" | "Release" | "Pull-Out" | "Opening"
//   Every change of the quantity is written here: who, when, how many, before and after.
//   Frontend simulation: kept in localStorage. A real backend will use a stock_movements table.
// ========================================
const MOVES_KEY = "stockMovements";

function loadMovements() {
    try { return JSON.parse(localStorage.getItem(MOVES_KEY)) || []; } catch (e) { return []; }
}

function logStockMovement(asset, type, change, before, reason, when) {

    const list = loadMovements();

    list.push({
        id: "MV" + Date.now() + Math.floor(Math.random() * 1000),
        date: when || new Date().toISOString(),
        assetId: asset.id,
        item: asset.name,
        type: type,
        change: change,
        before: before,
        after: before + change,
        unit: asset.unit,
        reason: reason || "",
        by: sessionStorage.getItem("userEmail") || "system"
    });

    while (list.length > 20000) list.shift();   // practically unlimited: the history must not lose entries

    try { localStorage.setItem(MOVES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }

}

// kind: "in" | "out" | "adjust" (adjust = set the counted quantity). Consumables only.
function changeConsumableStock(assetId, kind, qty, reason) {

    const assets = loadAssets();
    const a = assets.find(function (x) { return x.id === assetId; });

    if (!a) return { ok: false, message: "Item not found." };
    if (!isConsumable(a)) return { ok: false, message: "Only consumable items are changed here." };

    const n = parseFloat(qty);
    if (isNaN(n) || n < 0 || (kind !== "adjust" && n <= 0)) return { ok: false, message: "Enter a valid quantity." };
    if (!reason || !String(reason).trim()) return { ok: false, message: "A reason is required." };
    if (kind === "out" && n > a.quantity) return { ok: false, message: "Only " + a.quantity + " " + a.unit + " in stock." };

    const before = a.quantity;
    a.quantity = kind === "in" ? before + n : kind === "out" ? before - n : n;

    if (!saveAssets(assets)) return { ok: false, message: "Browser storage is full." };

    const label = kind === "in" ? "Stock In" : kind === "out" ? "Stock Out" : "Adjustment";
    logStockMovement(a, label, a.quantity - before, before, String(reason).trim());

    if (typeof tryAuditLog === "function") tryAuditLog(sessionStorage.getItem("userEmail") || "-", (typeof currentRole === "function" ? currentRole() : "Staff"), label + ": " + a.name + " " + before + " -> " + a.quantity + " (" + String(reason).trim() + ")");
    if (typeof addNotification === "function" && isLowStock(a) && a.quantity < before &&
        (typeof notifyAllowed !== "function" || notifyAllowed(a.quantity <= 0 ? "outOfStock" : "lowStock"))) {
        addNotification("admin", (a.quantity <= 0 ? "Out of stock: " : "Low stock: ") + a.name + " (" + a.quantity + " " + a.unit + " left)", null);
    }

    return { ok: true, asset: a };

}
