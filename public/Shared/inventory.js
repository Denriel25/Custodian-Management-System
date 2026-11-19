// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED INVENTORY: SECTIONS / UNITS, IIN AND THE ANNUAL INVENTORY
//
// Section / Unit   a place and the person responsible for it, with a code.
//                  Example: code MRm102, department DISD, section "Computer Lab / Room 102".
//
// IIN              Item Inventory Number. Every non-consumable item that belongs to a Section / Unit
//                  gets numbers that continue in that unit: an item with 2 units gets MRm102-001-002,
//                  the next item with 1 unit gets MRm102-003, and so on. A number is never used again.
//
// Annual Inventory a yearly list of what a Section / Unit holds. It is a SNAPSHOT: it is copied
//                  from Assets when it is created, so it does not change when Assets change.
//                  Draft -> Verified (counted) -> Certified (signed, locked).
//
// Needs Shared/stock.js. Put <script src="../../Shared/inventory.js"></script> after it.
// ========================================

const UNITS_KEY = "units";
const ANNUAL_KEY = "annualInventories";


// ========================================
// SECTIONS / UNITS
// ========================================

function loadUnits() {
    try {
        return JSON.parse(localStorage.getItem(UNITS_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveUnits(list) {
    try {
        localStorage.setItem(UNITS_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        return false;
    }
}

function nextUnitId(units) {

    let highest = 0;

    units.forEach(function (u) {
        const m = /^UNT(\d+)$/.exec(u.id);
        if (m) highest = Math.max(highest, parseInt(m[1], 10));
    });

    return "UNT" + String(highest + 1).padStart(3, "0");

}

function unitLabel(u) {
    return u.code + " - " + u.name + (u.department ? " (" + u.department + ")" : "");
}


// ========================================
// IIN
// ========================================

function pad3(n) {
    return String(n).padStart(3, "0");
}

// how many numbers the asset has
function iinCount(asset) {
    return (asset.iin || []).reduce(function (sum, r) { return sum + (r[1] - r[0] + 1); }, 0);
}

// "MRm102-001-002" or "MRm102-003" (several ranges are joined with a comma)
function iinText(asset, units) {

    if (!asset.iin || asset.iin.length === 0) return "";

    const unit = (units || loadUnits()).find(function (u) { return u.id === asset.iinUnitId; });

    if (!unit) return "";

    return asset.iin.map(function (r) {
        return unit.code + "-" + pad3(r[0]) + (r[1] > r[0] ? "-" + pad3(r[1]) : "");
    }).join(", ");

}

// The first number of the asset (to put the items in order)
function iinFirst(asset) {
    return asset.iin && asset.iin.length ? asset.iin[0][0] : Infinity;
}

// Gives the numbers to a non-consumable asset of a unit. The numbers follow the quantity:
//   - more units than numbers: new numbers are added at the end of the unit's list
//   - fewer units: the last numbers are dropped (and never used again)
//   - another unit: the old numbers are dropped and new ones are given in the new unit
// "units" is changed too (the next number of the unit), so the caller must save both.
function assignIin(asset, units) {

    if (isConsumable(asset) || !asset.unitId) {
        asset.iin = [];
        asset.iinUnitId = "";
        return;
    }

    const unit = units.find(function (u) { return u.id === asset.unitId; });

    if (!unit) return;

    if (asset.iinUnitId !== asset.unitId) {
        asset.iin = [];
        asset.iinUnitId = asset.unitId;
    }

    asset.iin = asset.iin || [];

    const have = iinCount(asset);
    const want = Math.max(0, Math.round(asset.quantity));

    if (want > have) {

        const start = unit.nextIin || 1;
        const add = want - have;
        const last = asset.iin[asset.iin.length - 1];

        if (last && last[1] === start - 1) {
            last[1] += add;                       // continues the last range
        } else {
            asset.iin.push([start, start + add - 1]);
        }

        unit.nextIin = start + add;

    } else if (want < have) {

        let remove = have - want;

        while (remove > 0 && asset.iin.length) {

            const last = asset.iin[asset.iin.length - 1];
            const length = last[1] - last[0] + 1;

            if (length <= remove) {
                asset.iin.pop();
                remove -= length;
            } else {
                last[1] -= remove;
                remove = 0;
            }

        }

    }

}


// ========================================
// ANNUAL INVENTORY
// ========================================

function loadAnnuals() {
    try {
        return JSON.parse(localStorage.getItem(ANNUAL_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveAnnuals(list) {
    try {
        localStorage.setItem(ANNUAL_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        return false;
    }
}

// the quantity that is printed: the counted one
function annualQty(line) {
    const n = parseFloat(line.countedQty);
    return isNaN(n) ? (parseFloat(line.qty) || 0) : n;
}

function annualAmount(line) {
    return annualQty(line) * (parseFloat(line.unitPrice) || 0);
}

function annualTotal(report) {
    return report.items.reduce(function (sum, line) { return sum + annualAmount(line); }, 0);
}

function annualId(year, unit) {
    return "AI-" + year + "-" + unit.code;
}

// A new Annual Inventory (a Draft) for a unit and a year, copied from Assets.
// Returns { ok: true, report } or { ok: false, message }
function createAnnual(year, unitId, who) {

    const unit = loadUnits().find(function (u) { return u.id === unitId; });

    if (!unit) return { ok: false, message: "Please choose a Section / Unit." };

    if (!/^\d{4}$/.test(String(year))) return { ok: false, message: "Please enter the year (4 digits)." };

    const list = loadAnnuals();

    if (list.some(function (r) { return r.year === Number(year) && r.unitId === unitId; })) {
        return { ok: false, message: "There is already an Annual Inventory " + year + " for " + unit.code + "." };
    }

    const assets = loadAssets()
        .filter(function (a) { return !isConsumable(a) && a.unitId === unitId; })
        .sort(function (a, b) { return iinFirst(a) - iinFirst(b); });

    if (assets.length === 0) {
        return { ok: false, message: "There are no non-consumable items in " + unit.code + " yet. Add them in Assets (or import them) first." };
    }

    const units = loadUnits();

    let custodianName = "";

    if (unit.custodianEmail && typeof loadUsers === "function") {
        const user = loadUsers().find(function (u) { return u.email.toLowerCase() === unit.custodianEmail.toLowerCase(); });
        custodianName = user ? user.name : "";
    }

    const now = new Date().toISOString();

    const report = {
        id: annualId(year, unit),
        year: Number(year),
        unitId: unit.id,
        code: unit.code,
        department: unit.department,
        section: unit.name,
        custodianEmail: unit.custodianEmail || "",
        custodianName: custodianName,
        jobTitle: unit.jobTitle || "",
        status: "Draft",
        items: assets.map(function (a) {
            return {
                assetId: a.id,
                iin: iinText(a, units),
                date: a.dateAssigned || "",
                qty: a.quantity,
                countedQty: a.quantity,
                unit: a.unit,
                item: a.name,
                brand: a.brand || "",
                model: a.model || "",
                make: a.make || "",
                color: a.color || "",
                size: a.size || "",
                serial: a.serial || "",
                unitPrice: a.unitPrice || 0,
                remarks: a.remarks || "",
                manual: false
            };
        }),
        createdAt: now,
        createdBy: who,
        history: [{ status: "Draft", by: who, date: now, note: "Created from the assets of the unit" }]
    };

    list.push(report);

    if (!saveAnnuals(list)) return { ok: false, message: "The browser storage is full." };

    return { ok: true, report: report };

}

// Changes the status of a report and writes it in its history. The caller saves the list.
function setAnnualStatus(report, status, who, note) {

    report.status = status;
    report.history = (report.history || []).concat([{ status: status, by: who, date: new Date().toISOString(), note: note || "" }]);

}
