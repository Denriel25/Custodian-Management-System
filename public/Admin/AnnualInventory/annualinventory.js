// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// ANNUAL INVENTORY JAVASCRIPT (ADMIN AND STAFF)
//
//   1. Sections / Units     the places (with a code) and the person responsible for each
//   2. New Annual Inventory a Draft copied from the items of a unit (Assets)
//   3. Count                the Staff or the Admin writes the counted quantity and the remarks
//   4. Verify               the count is done: the custodian can certify it on his or her page
//   5. Print                the paper form, signed by the custodian, the Section Chief and the Department Head
//   6. Certify              an ADMINISTRATOR locks it (and can reopen it if there is a mistake)
//
//   Draft -> Verified -> Certified
// ========================================

// ---------- Safety check ----------
const MISSING_FILES = (typeof loadAssets === "undefined" || typeof loadUnits === "undefined" || typeof printAnnual === "undefined");

if (MISSING_FILES) {
    document.addEventListener("DOMContentLoaded", function () {
        const banner = document.createElement("div");
        banner.style.cssText = "background:#dc3545;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:14px;";
        banner.textContent = "The Shared folder (stock.js, inventory.js, print.js) was not found. Put the Shared folder in the project root, next to Admin and Requester.";
        const navbar = document.querySelector(".navbar");
        if (navbar) navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    });
}


// ========================================
// HELPERS (esc and money come from Shared/print.js)
// ========================================

function el(id) {
    return document.getElementById(id);
}

function who() {
    return sessionStorage.getItem("userEmail") || "Admin";
}

function log(activity) {
    if (typeof tryAuditLog === "function") {
        tryAuditLog(who(), (typeof currentRole === "function" && currentRole()) || "Administrator", activity);
    }
}

function allowed(action) {
    return typeof can !== "function" || can(action);
}

function fmt(iso) {

    const d = new Date(iso);

    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

}

function statusSlug(status) {
    return String(status || "draft").toLowerCase();
}

function userName(email) {

    if (!email || typeof loadUsers !== "function") return email || "-";

    const u = loadUsers().find(function (x) { return x.email.toLowerCase() === email.toLowerCase(); });

    return u ? u.name : email;

}

// the user who did a step (from the history of the report)
function lastStep(report, status) {

    const steps = (report.history || []).filter(function (h) { return h.status === status; });

    return steps.length ? steps[steps.length - 1] : null;

}

function unitItems(unitId) {
    return loadAssets().filter(function (a) { return !isConsumable(a) && a.unitId === unitId; });
}

function notify(email, message, id) {
    if (email && typeof addNotification === "function") {
        addNotification(email, message, { type: "annual", controlNo: id });
    }
}


// ========================================
// PAGE LOAD
// ========================================

let openId = null;        // the report shown in the window
let shownStatus = null;   // its status when the window was filled
let editingUnitId = null; // the unit being edited (null = adding)

document.addEventListener("DOMContentLoaded", function () {

    if (MISSING_FILES) return;

    setupSidebar();
    fillYears();
    render();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["annualInventories", "units", "assets"], function () {

            fillYears();
            render();
            renderUnits();

            if (openId && el("reportModal").classList.contains("show")) {

                const r = loadAnnuals().find(function (x) { return x.id === openId; });

                // the status changed, or the report is not being edited (Verified or Certified): show it again.
                // A Draft that is being counted is not touched, so the count that is being typed is not lost.
                if (!r) closeReport();
                else if (r.status !== shownStatus || r.status !== "Draft") openReport(openId);

            }

        });
    }

    el("yearFilter").addEventListener("change", render);
    el("statusFilter").addEventListener("change", render);
    el("searchBox").addEventListener("input", render);

    el("newBtn").addEventListener("click", openNew);
    el("closeNew").addEventListener("click", closeNew);
    el("cancelNew").addEventListener("click", closeNew);
    el("createBtn").addEventListener("click", createReport);

    el("unitsBtn").addEventListener("click", openUnits);
    el("closeUnits").addEventListener("click", closeUnits);
    el("uSave").addEventListener("click", saveUnit);
    el("uCancel").addEventListener("click", clearUnitForm);

    el("closeReport").addEventListener("click", closeReport);
    el("addLineBtn").addEventListener("click", addLine);

    ["newModal", "unitsModal", "reportModal"].forEach(function (id) {
        el(id).addEventListener("click", function (e) {
            if (e.target === this) this.classList.remove("show");
        });
    });

    // a notification opens the report: ?open=AI-2026-MRm102
    const wanted = new URLSearchParams(window.location.search).get("open");

    if (wanted) openReport(wanted);

});


// ========================================
// THE LIST
// ========================================

function fillYears() {

    const select = el("yearFilter");
    const previous = select.value;
    const thisYear = String(new Date().getFullYear());
    const years = {};

    years[thisYear] = true;

    loadAnnuals().forEach(function (r) { years[String(r.year)] = true; });

    select.innerHTML = '<option value="all">All years</option>';

    Object.keys(years).sort().reverse().forEach(function (y) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        select.appendChild(option);
    });

    select.value = previous && (previous === "all" || years[previous]) ? previous : thisYear;

}

function render() {

    const all = loadAnnuals();
    const year = el("yearFilter").value;
    const status = el("statusFilter").value;
    const search = el("searchBox").value.toLowerCase().trim();

    const ofYear = all.filter(function (r) { return year === "all" || String(r.year) === year; });

    el("aiTotal").textContent = ofYear.length;
    el("aiDraft").textContent = ofYear.filter(function (r) { return r.status === "Draft"; }).length;
    el("aiVerified").textContent = ofYear.filter(function (r) { return r.status === "Verified"; }).length;
    el("aiCertified").textContent = ofYear.filter(function (r) { return r.status === "Certified"; }).length;

    const shown = ofYear.filter(function (r) {

        if (status !== "all" && r.status !== status) return false;
        if (!search) return true;

        return (r.year + " " + r.code + " " + r.section + " " + r.department + " " + r.custodianName + " " + r.custodianEmail + " " + r.status)
            .toLowerCase().includes(search);

    }).reverse();

    const tbody = el("aiBody");
    tbody.innerHTML = "";

    el("noReports").style.display = shown.length ? "none" : "block";

    shown.forEach(function (r) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + esc(r.year) + "</td>" +
            "<td><strong>" + esc(r.code) + "</strong> - " + esc(r.section) + "</td>" +
            "<td>" + esc(r.department) + "</td>" +
            "<td>" + esc(r.custodianName || r.custodianEmail || "-") + "</td>" +
            "<td>" + r.items.length + "</td>" +
            "<td>" + money(annualTotal(r)) + "</td>" +
            '<td><span class="status ' + esc(statusSlug(r.status)) + '">' + esc(r.status) + "</span></td>" +
            "<td></td>";

        const button = document.createElement("button");

        button.className = "edit-btn";
        button.textContent = "Open";
        button.addEventListener("click", function () { openReport(r.id); });
        row.lastElementChild.appendChild(button);

        tbody.appendChild(row);

    });

}


// ========================================
// NEW ANNUAL INVENTORY
// ========================================

function openNew() {

    const units = loadUnits();

    el("newYear").value = new Date().getFullYear();

    const select = el("newUnit");

    select.innerHTML = "";

    if (units.length === 0) {
        select.innerHTML = '<option value="">No Section / Unit yet: click "Sections / Units" first</option>';
    }

    units.forEach(function (u) {
        const option = document.createElement("option");
        option.value = u.id;
        option.textContent = unitLabel(u) + " - " + unitItems(u.id).length + " item(s)";
        select.appendChild(option);
    });

    el("newModal").classList.add("show");

}

function closeNew() {
    el("newModal").classList.remove("show");
}

function createReport() {

    const year = el("newYear").value.trim();
    const result = createAnnual(year, el("newUnit").value, who());

    if (!result.ok) {
        alert(result.message);
        return;
    }

    log("Created Annual Inventory " + result.report.year + " for " + result.report.code + " (" + result.report.items.length + " lines)");

    closeNew();
    fillYears();
    el("yearFilter").value = String(result.report.year);
    render();
    openReport(result.report.id);

}


// ========================================
// SECTIONS / UNITS
// ========================================

function requesterAccounts() {

    if (typeof loadUsers !== "function") return [];

    return loadUsers().filter(function (u) { return u.role === "Requester" && u.status === "Active"; });

}

function openUnits() {

    clearUnitForm();
    renderUnits();
    el("unitsModal").classList.add("show");

}

function closeUnits() {
    el("unitsModal").classList.remove("show");
}

function renderUnits() {

    const units = loadUnits();
    const tbody = el("unitsBody");

    tbody.innerHTML = "";
    el("noUnits").style.display = units.length ? "none" : "block";

    units.forEach(function (u) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td><strong>" + esc(u.code) + "</strong></td>" +
            "<td>" + esc(u.department) + "</td>" +
            "<td>" + esc(u.name) + "</td>" +
            "<td>" + esc(userName(u.custodianEmail)) + "</td>" +
            "<td>" + esc(u.jobTitle || "-") + "</td>" +
            "<td>" + unitItems(u.id).length + "</td>" +
            "<td></td>";

        const actions = row.lastElementChild;

        const edit = document.createElement("button");
        edit.className = "edit-btn";
        edit.textContent = "Edit";
        edit.addEventListener("click", function () { editUnit(u.id); });
        actions.appendChild(edit);

        if (allowed("deleteUnit")) {
            actions.appendChild(document.createTextNode(" "));
            const del = document.createElement("button");
            del.className = "delete-btn";
            del.textContent = "Delete";
            del.addEventListener("click", function () { deleteUnit(u.id); });
            actions.appendChild(del);
        }

        tbody.appendChild(row);

    });

    // the list of custodians
    const select = el("uCustodian");
    const chosen = select.value;

    select.innerHTML = '<option value="">-- None --</option>';

    requesterAccounts().forEach(function (u) {
        const option = document.createElement("option");
        option.value = u.email;
        option.textContent = u.name + " (" + u.email + ")";
        select.appendChild(option);
    });

    select.value = chosen;

}

function clearUnitForm() {

    editingUnitId = null;

    el("unitFormTitle").textContent = "Add a Section / Unit";
    el("uCode").value = "";
    el("uCode").disabled = false;
    el("uDept").value = "";
    el("uName").value = "";
    el("uCustodian").value = "";
    el("uJob").value = "";

}

function editUnit(id) {

    const u = loadUnits().find(function (x) { return x.id === id; });

    if (!u) return;

    editingUnitId = id;

    el("unitFormTitle").textContent = "Edit " + u.code;
    el("uCode").value = u.code;
    el("uCode").disabled = unitItems(id).length > 0;   // the code is inside the IIN numbers already given
    el("uDept").value = u.department;
    el("uName").value = u.name;
    el("uCustodian").value = u.custodianEmail || "";
    el("uJob").value = u.jobTitle || "";

    el("unitsModal").scrollTop = el("unitsModal").scrollHeight;

}

function saveUnit() {

    const units = loadUnits();
    const code = el("uCode").value.trim();
    const department = el("uDept").value.trim();
    const name = el("uName").value.trim();

    if (!code || !department || !name) {
        alert("Please fill in the code, the department and the Section / Unit.");
        return;
    }

    if (!/^[A-Za-z0-9-]+$/.test(code)) {
        alert("The code can only have letters, numbers and hyphens (for example MRm102).");
        return;
    }

    if (units.some(function (u) { return u.id !== editingUnitId && u.code.toLowerCase() === code.toLowerCase(); })) {
        alert("The code " + code + " is already used by another Section / Unit.");
        return;
    }

    if (editingUnitId) {

        const u = units.find(function (x) { return x.id === editingUnitId; });

        if (!u) return;

        if (!el("uCode").disabled) u.code = code;

        u.department = department;
        u.name = name;
        u.custodianEmail = el("uCustodian").value;
        u.jobTitle = el("uJob").value.trim();

        log("Updated Section / Unit " + u.code);

    } else {

        units.push({
            id: nextUnitId(units),
            code: code,
            department: department,
            name: name,
            custodianEmail: el("uCustodian").value,
            jobTitle: el("uJob").value.trim(),
            nextIin: 1
        });

        log("Added Section / Unit " + code + " (" + name + ")");

    }

    if (!saveUnits(units)) {
        alert("The browser storage is full.");
        return;
    }

    clearUnitForm();
    renderUnits();

}

function deleteUnit(id) {

    const u = loadUnits().find(function (x) { return x.id === id; });

    if (!u) return;

    if (unitItems(id).length > 0) {
        alert(u.code + " still has items in Assets. Move or delete them first.");
        return;
    }

    if (loadAnnuals().some(function (r) { return r.unitId === id; })) {
        alert(u.code + " has an Annual Inventory. It cannot be deleted.");
        return;
    }

    if (!confirm("Delete the Section / Unit " + u.code + "?")) return;

    saveUnits(loadUnits().filter(function (x) { return x.id !== id; }));
    log("Deleted Section / Unit " + u.code);
    clearUnitForm();
    renderUnits();

}


// ========================================
// ONE ANNUAL INVENTORY
// ========================================

let current = null;   // the report in the window, with the edits that are not saved yet

function describe(it) {

    return [it.brand, it.model, it.make, it.color, it.size, it.serial ? "S/N " + it.serial : ""]
        .filter(Boolean).join(" · ") || "-";

}

function openReport(id) {

    const r = loadAnnuals().find(function (x) { return x.id === id; });

    if (!r) {
        alert("Annual Inventory not found.");
        return;
    }

    openId = id;
    shownStatus = r.status;
    current = JSON.parse(JSON.stringify(r));

    el("reportTitle").textContent = "Annual Inventory " + r.year + " - " + r.code;

    drawInfo();
    drawLines();
    drawButtons();

    el("addLineBox").style.display = r.status === "Draft" ? "block" : "none";
    el("reportModal").classList.add("show");

}

function closeReport() {
    openId = null;
    current = null;
    el("reportModal").classList.remove("show");
}

function drawInfo() {

    const r = current;
    const verified = lastStep(r, "Verified");
    const certified = r.status === "Certified" ? lastStep(r, "Certified") : null;

    function item(label, value) {
        return "<div><strong>" + esc(label) + "</strong>" + esc(value || "-") + "</div>";
    }

    el("reportInfo").innerHTML =
        item("Section / Unit", r.code + " - " + r.section) +
        item("Department", r.department) +
        item("Custodian", r.custodianName || r.custodianEmail) +
        item("Job Title", r.jobTitle) +
        item("Year", r.year) +
        '<div><strong>Status</strong><span class="status ' + esc(statusSlug(r.status)) + '">' + esc(r.status) + "</span>" +
            (r.custodianCertifiedAt ? '<span class="ai-badge ok">Certified by the custodian ' + esc(fmt(r.custodianCertifiedAt)) + "</span>" : "") + "</div>" +
        item("Created", fmt(r.createdAt) + " by " + userName(r.createdBy)) +
        (verified && r.status !== "Draft" ? item("Counted", fmt(verified.date) + " by " + userName(verified.by)) : "") +
        (certified ? item("Certified", fmt(certified.date) + " by " + userName(certified.by)) : "");

    const notes = {
        Draft: "Count the items. Write the Counted quantity (it is the quantity that is printed) and the Remarks, then click Verify.",
        Verified: "The count is done. Print it and get the signatures (custodian, Section Chief and Department Head). An Administrator then certifies it.",
        Certified: "This Annual Inventory is certified and locked. Only an Administrator can reopen it."
    };

    let note = notes[r.status] || "";

    if (r.status === "Verified" && !allowed("certifyInventory")) note += " " + cannotMessage("certifyInventory");
    if (r.status === "Certified" && !allowed("reopenInventory")) note = notes.Certified;

    el("reportNote").textContent = note;

}

function drawLines() {

    const r = current;
    const editable = r.status === "Draft";
    const tbody = el("linesBody");

    tbody.innerHTML = "";

    r.items.forEach(function (it, i) {

        const row = document.createElement("tr");
        const amount = annualAmount(it);
        const differs = !it.manual && String(annualQty(it)) !== String(parseFloat(it.qty));

        row.innerHTML =
            "<td>" + esc(it.iin || "-") + "</td>" +
            "<td>" + esc(it.item) + (it.manual ? '<span class="ai-flag">added in the count</span>' : "") + "</td>" +
            "<td>" + esc(describe(it)) + "</td>" +
            "<td>" + esc(it.qty + (it.unit ? " " + it.unit : "")) + "</td>" +
            '<td class="counted"></td>' +
            "<td>" + (it.unitPrice ? money(it.unitPrice) : "-") + "</td>" +
            '<td class="amount">' + (amount ? money(amount) : "-") + "</td>" +
            '<td class="remarks"></td>' +
            '<td class="remove"></td>';

        const counted = row.querySelector(".counted");
        const remarks = row.querySelector(".remarks");

        if (editable) {

            const qtyBox = document.createElement("input");

            qtyBox.type = "number";
            qtyBox.min = "0";
            qtyBox.step = "1";
            qtyBox.value = annualQty(it);
            qtyBox.className = "ai-line-input" + (differs ? " differs" : "");
            qtyBox.addEventListener("input", function () {

                it.countedQty = qtyBox.value === "" ? "" : parseFloat(qtyBox.value);

                const same = it.manual || String(annualQty(it)) === String(parseFloat(it.qty));
                qtyBox.classList.toggle("differs", !same);

                const now = annualAmount(it);
                row.querySelector(".amount").textContent = now ? money(now) : "-";
                el("reportTotal").textContent = money(annualTotal(current));

            });
            counted.appendChild(qtyBox);

            const remarksBox = document.createElement("input");

            remarksBox.type = "text";
            remarksBox.value = it.remarks || "";
            remarksBox.className = "ai-line-input";
            remarksBox.placeholder = "e.g. good condition";
            remarksBox.addEventListener("input", function () { it.remarks = remarksBox.value; });
            remarks.appendChild(remarksBox);

            if (it.manual) {
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "delete-btn";
                remove.textContent = "x";
                remove.title = "Remove this line";
                remove.addEventListener("click", function () {
                    current.items.splice(i, 1);
                    drawLines();
                });
                row.querySelector(".remove").appendChild(remove);
            }

        } else {

            counted.textContent = annualQty(it) + (differs ? " (records: " + it.qty + ")" : "");
            remarks.textContent = it.remarks || "-";

        }

        tbody.appendChild(row);

    });

    el("reportTotal").textContent = money(annualTotal(r));

}

function drawButtons() {

    const r = current;
    const box = el("reportButtons");

    box.innerHTML = "";

    function add(text, className, handler) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = className;
        b.textContent = text;
        b.addEventListener("click", handler);
        box.appendChild(b);
    }

    add("Close", "cancel-btn", closeReport);
    add("Print", "cancel-btn", function () { printAnnual(current); });

    if (r.status === "Draft") {

        if (allowed("deleteInventory")) add("Delete", "cancel-btn", deleteReport);

        add("Save changes", "cancel-btn", function () { if (saveEdits(true)) openReport(openId); });
        add("Verify (counted)", "save-btn", verifyReport);

    } else if (r.status === "Verified") {

        add("Back to Draft", "cancel-btn", backToDraft);

        if (allowed("certifyInventory")) add("Certify", "save-btn", certifyReport);

    } else if (r.status === "Certified") {

        if (allowed("reopenInventory")) add("Reopen", "cancel-btn", reopenReport);

    }

}

// the new line found during the count
function addLine() {

    const item = el("mItem").value.trim();
    const qty = parseFloat(el("mQty").value);

    if (!item || !(qty >= 1)) {
        alert("Please write the item and a quantity of at least 1.");
        return;
    }

    current.items.push({
        assetId: "",
        iin: "",
        date: "",
        qty: qty,
        countedQty: qty,
        unit: el("mUnit").value.trim() || "pc",
        item: item,
        brand: el("mBrand").value.trim(),
        model: el("mModel").value.trim(),
        make: el("mMake").value.trim(),
        color: el("mColor").value.trim(),
        size: el("mSize").value.trim(),
        serial: el("mSerial").value.trim(),
        unitPrice: parseFloat(el("mPrice").value) || 0,
        remarks: el("mRemarks").value.trim(),
        manual: true
    });

    ["mItem", "mBrand", "mModel", "mMake", "mColor", "mSize", "mSerial", "mPrice", "mRemarks"].forEach(function (id) { el(id).value = ""; });
    el("mQty").value = 1;
    el("mUnit").value = "pc";

    drawLines();

}

// keeps the edits of the window in the saved list
function saveEdits(showMessage) {

    for (const it of current.items) {

        const n = parseFloat(it.countedQty);

        if (it.countedQty !== "" && (isNaN(n) || n < 0)) {
            alert("The counted quantity of " + it.item + " must be 0 or more.");
            return false;
        }

        if (it.countedQty === "") it.countedQty = it.qty;

    }

    const list = loadAnnuals();
    const index = list.findIndex(function (x) { return x.id === openId; });

    if (index === -1) return false;

    // do not overwrite a change that another window made to the status
    if (list[index].status !== current.status) {
        alert("This Annual Inventory was changed in another window. It will be opened again.");
        openReport(openId);
        return false;
    }

    list[index].items = current.items;

    if (!saveAnnuals(list)) {
        alert("The browser storage is full.");
        return false;
    }

    if (showMessage) log("Saved the count of Annual Inventory " + current.year + " - " + current.code);

    return true;

}

function changeStatus(status, note, activity, afterSave) {

    const list = loadAnnuals();
    const index = list.findIndex(function (x) { return x.id === openId; });

    if (index === -1) return;

    setAnnualStatus(list[index], status, who(), note);

    if (afterSave) afterSave(list[index]);

    saveAnnuals(list);
    log(activity + " Annual Inventory " + list[index].year + " - " + list[index].code);

}

function verifyReport() {

    if (current.items.length === 0) {
        alert("There is no line to verify.");
        return;
    }

    if (!saveEdits(false)) return;

    if (!confirm("The count is done? Verified: the lines cannot be changed unless you go back to Draft.")) return;

    changeStatus("Verified", "Count finished", "Verified");

    notify(current.custodianEmail, "Annual Inventory " + current.year + " (" + current.code + ") is ready for your certification.", current.id);

    openReport(openId);

}

function backToDraft() {

    if (!confirm("Go back to Draft? The certification of the custodian (if any) is removed.")) return;

    changeStatus("Draft", "Back to Draft to change the count", "Back to Draft:", function (r) {
        delete r.custodianCertifiedAt;
        delete r.custodianCertifiedBy;
    });

    openReport(openId);

}

function certifyReport() {

    if (!allowed("certifyInventory")) {
        alert(cannotMessage("certifyInventory"));
        return;
    }

    if (!confirm("Certify and lock this Annual Inventory? Do it when the paper has the signatures.")) return;

    changeStatus("Certified", "Signed", "Certified");

    notify(current.custodianEmail, "Annual Inventory " + current.year + " (" + current.code + ") was certified.", current.id);

    openReport(openId);

}

function reopenReport() {

    if (!allowed("reopenInventory")) {
        alert(cannotMessage("reopenInventory"));
        return;
    }

    if (!confirm("Reopen this Annual Inventory? It goes back to Draft and the certifications are removed.")) return;

    changeStatus("Draft", "Reopened", "Reopened", function (r) {
        delete r.custodianCertifiedAt;
        delete r.custodianCertifiedBy;
    });

    openReport(openId);

}

function deleteReport() {

    if (!allowed("deleteInventory")) {
        alert(cannotMessage("deleteInventory"));
        return;
    }

    if (!confirm("Delete this Draft? It cannot be undone.")) return;

    const r = current;

    saveAnnuals(loadAnnuals().filter(function (x) { return x.id !== openId; }));
    log("Deleted Draft Annual Inventory " + r.year + " - " + r.code);
    closeReport();

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
                    window.location.href = "annualinventory.html";
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
