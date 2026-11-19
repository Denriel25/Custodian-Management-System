// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// REQUEST MANAGEMENT JAVASCRIPT (ADMIN)
// Shows every form saved from the Requester "Request" page
// and lets the admin change its status.
//
//   Pending -> Approved -> Released     (or Rejected)
// ========================================

const STORE_KEY = "forms";

const FORM_INFO = {
    requisition: {
        label: "Requisition",
        header: [["department", "Department"], ["section", "Section"], ["month", "Month"]],
        cols: [
            ["name", "Name"], ["qty", "Qty"], ["unit", "Unit"], ["particulars", "Particulars"],
            ["price", "Unit Price"], ["amount", "Amount"], ["lastRequested", "Date Last Requested"], ["receivedBy", "Received By"]
        ],
        details: function (r) { return r.header.department; }
    },
    receipt: {
        label: "Acknowledgment Receipt",
        header: [["name", "Name"], ["department", "Department"]],
        cols: [["qty", "Qty"], ["unit", "Unit"], ["item", "Item"], ["description", "Description"]],
        details: function (r) { return r.header.name + " (" + r.header.department + ")"; }
    },
    pullout: {
        label: "Pull-Out Request",
        header: [
            ["requestingParty", "Requesting Party"], ["office", "Office / Classroom"], ["date", "Date"],
            ["pulledOutBy", "Pulled-Out by"], ["pulledDate", "Date Pulled-Out"],
            ["receivedBy", "Received by"], ["receivedDate", "Date Received"]
        ],
        cols: [["qty", "Qty"], ["item", "Item/s"], ["description", "Description/s"], ["reason", "Reason"]],
        details: function (r) { return r.header.requestingParty + (r.header.office ? " - " + r.header.office : ""); }
    }
};

let openId = null; // id of the form shown in the details window


// ========================================
// DATA
// ========================================

function loadAll() {
    try {
        return (JSON.parse(localStorage.getItem(STORE_KEY)) || []).filter(function (r) {
            return FORM_INFO[r.type] && !(r.type === "requisition" && r.status === "Draft");
        });
    } catch (e) {
        return [];
    }
}

function saveAll(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
}


// ========================================
// HELPERS (esc and money come from Shared/print.js)
// ========================================

function formatDate(dateString) {
    if (!dateString) {
        return "-";
    }

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

// Who the form belongs to. A receipt made for a person without an account is not linked to anyone.
function ownerOf(r) {

    if (r.type === "receipt" && r.source === "admin" && !r.receiverEmail) {
        return "Not linked (no account)";
    }

    return r.requesterEmail || "-";

}

function statusClass(status) {
    if (status === "Approved") return "approved";
    if (status === "Rejected") return "rejected";
    if (status === "Released") return "released";
    return "pending";
}

function statusBadge(status, text) {
    return '<span class="status ' + statusClass(status) + '">' + esc(text || status) + "</span>";
}


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    setupSidebar();
    render();

    // update when another window changes the forms (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms"], render);
    }

    // a notification opens the form: ?open=type|controlNo
    const openRef = new URLSearchParams(window.location.search).get("open");

    if (openRef) {

        const parts = openRef.split("|");
        const found = loadAll().find(function (f) { return f.type === parts[0] && f.controlNo === parts[1]; });

        if (found) openModal(found.id);

    }

    document.getElementById("typeFilter").addEventListener("change", render);
    document.getElementById("statusFilter").addEventListener("change", render);
    document.getElementById("searchBox").addEventListener("input", render);

    document.getElementById("scanBtn").addEventListener("click", scanForm);

    document.getElementById("closeModal").addEventListener("click", closeModal);

    document.getElementById("requestModal").addEventListener("click", function (e) {
        if (e.target === this) {
            closeModal();
        }
    });

});


// ========================================
// TABLE + CARDS
// ========================================

function render() {

    const all = loadAll().reverse(); // newest first

    // ----- cards (always count everything) -----
    // requisitions have the new workflow statuses; pull-out requests and receipts keep Pending/Approved/Released/Rejected
    function group(r) {
        if (r.type !== "requisition") return r.status;
        if (r.status === "Ready for Release" || r.status === "Partially Released" || r.status === "Approved") return "Approved";
        if (r.status === "Released" || r.status === "Completed") return "Released";
        if (r.status === "Rejected") return "Rejected";
        return "Pending";
    }
    function count(status) {
        return all.filter(function (r) { return group(r) === status; }).length;
    }

    document.getElementById("totalCount").textContent = all.length;
    document.getElementById("pendingCount").textContent = count("Pending");
    document.getElementById("approvedCount").textContent = count("Approved");
    document.getElementById("releasedCount").textContent = count("Released");
    document.getElementById("rejectedCount").textContent = count("Rejected");

    // ----- filters -----
    const type = document.getElementById("typeFilter").value;
    const status = document.getElementById("statusFilter").value;
    const search = document.getElementById("searchBox").value.toLowerCase().trim();

    const shown = all.filter(function (r) {

        if (type !== "all" && r.type !== type) return false;
        if (status !== "all" && r.status !== status) return false;

        if (!search) return true;

        const info = FORM_INFO[r.type];
        const text = (r.controlNo + " " + info.label + " " + info.details(r) + " " +
                      (r.requesterEmail || "") + " " + r.status).toLowerCase();

        return text.includes(search);

    });

    // ----- rows -----
    const tbody = document.getElementById("requestTableBody");
    tbody.innerHTML = "";

    document.getElementById("noRequests").style.display = shown.length ? "none" : "block";

    shown.forEach(function (r) {

        const info = FORM_INFO[r.type];
        const row = document.createElement("tr");

        row.innerHTML =
            "<td><strong>" + esc(r.controlNo) + "</strong></td>" +
            "<td>" + esc(info.label) + "</td>" +
            "<td>" + esc(ownerOf(r)) + "</td>" +
            "<td>" + esc(info.details(r)) + "</td>" +
            "<td>" + esc(formatDate(r.dateCreated)) + "</td>" +
            "<td>" + (r.type === "requisition" ? wfBadge(r.status) : statusBadge(r.status, typeof statusText === "function" ? statusText(r) : r.status)) + "</td>" +
            "<td></td>";

        const button = document.createElement("button");
        button.className = "view-btn";
        button.textContent = (r.type === "requisition" ? (r.status === "Pending Director Approval" || r.status === "Ready for Release" || r.status === "Partially Released") : r.status === "Pending") ? "Review" : "View";
        button.addEventListener("click", function () { openModal(r.id); });
        row.lastElementChild.appendChild(button);

        tbody.appendChild(row);

    });

}


// ========================================
// DETAILS WINDOW
// ========================================

function detailRow(label, valueHtml) {
    return '<div class="detail-row"><strong>' + esc(label) + "</strong><span>" + valueHtml + "</span></div>";
}

function openModal(id) {

    const r = loadAll().find(function (x) { return x.id === id; });

    if (!r) {
        return;
    }

    openId = id;

    const info = FORM_INFO[r.type];
    let html = "";

    html += detailRow("Form", esc(info.label));
    html += detailRow("Control No.", esc(r.controlNo));
    html += detailRow("Requester", esc(ownerOf(r)));

    info.header.forEach(function (h) {
        const value = r.header[h[0]];
        const isDate = h[0].toLowerCase().indexOf("date") !== -1;
        html += detailRow(h[1], esc(isDate ? formatDate(value) : (value || "-")));
    });

    html += detailRow("Date Submitted", esc(formatDate(r.dateCreated)));
    html += detailRow("Status", r.type === "requisition" ? wfBadge(r.status) : statusBadge(r.status, typeof statusText === "function" ? statusText(r) : r.status));

    if (r.type === "requisition") {
        const rh = r.header || {};
        html += detailRow("Representative", esc((rh.representativeName || "-") + (rh.position ? " (" + rh.position + ")" : "")));
        html += detailRow("Purpose / Justification", esc(rh.purpose || "-"));
    }

    // items table
    let table = "<table><thead><tr>";

    info.cols.forEach(function (c) {
        table += "<th>" + esc(c[1]) + "</th>";
    });

    table += "</tr></thead><tbody>";

    r.items.forEach(function (it) {
        table += "<tr>";
        info.cols.forEach(function (c) {
            let v = it[c[0]];
            if ((c[0] === "price" || c[0] === "amount") && v) {
                v = money(v);
            }
            table += "<td>" + esc(v || "") + "</td>";
        });
        table += "</tr>";
    });

    if (r.type === "requisition") {
        table += '<tr class="total-row"><td colspan="5">TOTAL</td><td>' + money(r.total) + '</td><td colspan="2"></td></tr>';
    }

    table += "</tbody></table>";

    html += '<div class="modal-items">' + table + "</div>";

    // stock check: is there enough in the inventory for the lines chosen from Assets?
    if (((r.type === "requisition" && (r.status === "Pending Director Approval" || r.status === "Ready for Release" || r.status === "Partially Released")) ||
         (r.type !== "requisition" && (r.status === "Pending" || r.status === "Approved"))) &&
        (r.type === "requisition" || r.type === "pullout") && typeof stockLines === "function") {

        const lines = stockLines(r.items, r.type === "pullout" ? "pullout" : "issue");

        if (lines.length) {

            html += '<div class="stock-check"><strong>Stock check</strong><ul>';

            lines.forEach(function (l) {
                html += '<li class="' + (l.ok ? "stock-ok" : "stock-bad") + '">' + (l.ok ? "OK: " : "NOT ENOUGH: ") + esc(l.text) + "</li>";
            });

            html += "</ul></div>";

        }

    }

    // the three signatures of a requisition (they are on paper; the office records them here)
    if (r.type === "requisition") {
        html += '<h4 style="margin:14px 0 6px">Approval and signature progress</h4>' + wfProgressHtml(r) + wfSignatureCards(r) + wfReleaseAuthHtml(r);
        if (r.approval && r.approval.decision === "Rejected") html += detailRow("Rejection reason", esc(r.approval.reason));
        html += wfReleaseHistoryHtml(r);
        if (!(r.releases || []).length && r.release) r.release.lines.forEach(function (l) {
            if (l.unitIds && l.unitIds.length) html += detailRow("Units released", esc(l.name + ": " + l.unitIds.join(", ")));
        });
        if (r.acknowledgment) html += detailRow("Receipt confirmed", esc(wfFormatDate(r.acknowledgment.at, true) + " by " + r.acknowledgment.by));
        html += '<div style="background:#fff;padding:6px;border-radius:8px;width:130px;height:130px;margin-top:8px">' + wfQrSvg(r, 118) + "</div>" +
                '<p style="font-size:11px;color:#888;margin-top:4px">Scanning this QR only opens the requisition. It never approves, signs or releases.</p>';
    }

    document.getElementById("modalBody").innerHTML = html;

    // ticking a signature
    document.querySelectorAll("#modalBody input[data-signer]").forEach(function (box) {
        box.addEventListener("change", function () { toggleSignature(r.id, box.dataset.signer, box.checked); });
    });

    // action buttons depend on the status
    const actions = document.getElementById("modalActions");
    actions.innerHTML = "";

    function addButton(text, className, handler) {
        const b = document.createElement("button");
        b.className = className;
        b.textContent = text;
        b.addEventListener("click", handler);
        actions.appendChild(b);
        return b;
    }

    addButton("Print", "print-btn", function () { printRecord(r); });

    if (r.type === "requisition") {
        requisitionActions(r, addButton, actions);
    } else {

        // Pull-out requests and receipts: the Admin (Director) approves or rejects; Staff make the actual release.
        const role = wfRole();

        function roleNote(text) {
            const p = document.createElement("p");
            p.className = "stock-check";
            p.textContent = text;
            actions.appendChild(p);
        }

        if (r.status === "Pending") {
            if (role === "Administrator") {
                addButton("Reject", "reject-btn", function () { changeStatus(r.id, "Rejected"); });
                addButton("Approve", "approve-btn", function () { changeStatus(r.id, "Approved"); });
            } else {
                roleNote(cannotMessage("changeStatus"));
            }
        } else if (r.status === "Approved") {
            if (role === "Administrator") {
                addButton("Reject", "reject-btn", function () { changeStatus(r.id, "Rejected"); });
                roleNote("Approved. Only Staff make the actual release. The Admin approves or rejects.");
            } else if (role === "Staff") {
                if (typeof allSigned !== "function" || allSigned(r)) {
                    addButton("Release", "release-btn", function () { changeStatus(r.id, "Released"); });
                } else {
                    const wait = addButton("Release (" + signatureCount(r) + " of 3 signatures)", "release-btn", function () {});
                    wait.disabled = true;
                }
            }
        }

    }

    document.getElementById("requestModal").classList.add("show");

}

// ========================================
// REQUISITION WORKFLOW ACTIONS (Director approval, release)
// Admin = Director. Staff can release but cannot approve, reject or sign as Director.
// ========================================
function requisitionActions(r, addButton, actions) {

    const role = wfRole();

    function note(text) {
        const p = document.createElement("p");
        p.className = "stock-check";
        p.textContent = text;
        actions.appendChild(p);
    }

    if (r.status === "Pending Director Approval") {

        if (role !== "Administrator") {
            note("Only the Admin account (Director) can approve or reject this requisition. Staff cannot.");
            return;
        }

        addButton("Reject", "reject-btn", function () { directorReject(r); });
        addButton("Approve and Sign", "approve-btn", function () { directorApprove(r); });
        return;

    }

    if (r.status === "Ready for Release" || r.status === "Partially Released") {
        if (role === "Staff") {
            addButton(r.status === "Partially Released" ? "Release the Balance" : "Prepare Release", "release-btn", function () { openReleaseDialog(r.id); });
        } else {
            note("Only Staff make the actual release. The Admin supervises the release queue.");
        }
        const q = document.createElement("a");
        q.href = "../ReleaseQueue/releasequeue.html?open=" + encodeURIComponent(r.controlNo);
        q.textContent = "Open in the Release Queue";
        q.style.cssText = "color:#edae0f;font-size:12px;align-self:center";
        actions.appendChild(q);
        return;
    }

    if (r.status === "Released" || r.status === "Completed") {
        addButton("Print Release Receipt", "print-btn", function () { printReleaseReceipt(r); });
    }

}

function directorApprove(r) {

    const me = userByEmail(sessionStorage.getItem("userEmail"));

    openESign({
        title: "Director Approval - " + r.controlNo,
        signerRole: "Director",
        signerName: me ? me.name : directorName(),
        nameEditable: false,
        nameNote: "name comes from the Admin account; printed as Director",
        onSave: function (sig) {
            if (!confirm("Approve requisition " + r.controlNo + " as Director?")) return;
            const res = wfDirectorDecision(r.id, "Approved", sig, "");
            if (!res.ok) { wfToast(res.message, true); return; }
            wfToast(res.form.status === "Ready for Release" ? "Approved and signed. The requisition is Ready for Release." : "Approved.");
            closeModal();
            render();
            openModal(r.id);
        }
    });

}

function directorReject(r) {

    wfModal("Reject requisition " + r.controlNo,
        '<p>Write the reason. The Requester will see it.</p><textarea class="wf-text" id="rejReason"></textarea>',
        [{ text: "Cancel", onClick: wfCloseModal },
         { text: "Reject requisition", cls: "red", onClick: function () {
            const reason = document.getElementById("rejReason").value.trim();
            if (!reason) { wfToast("Please write the reason.", true); return; }
            if (!confirm("Reject requisition " + r.controlNo + "?")) return;
            const res = wfDirectorDecision(r.id, "Rejected", null, reason);
            if (!res.ok) { wfToast(res.message, true); return; }
            wfCloseModal();
            wfToast("Requisition rejected.");
            closeModal();
            render();
         } }]);

}

// Release: Staff prepare and confirm the actual release in the shared release window (Shared/release.js).
// Signatures and approval are checked again by wfRelease; stock and units change only when Staff confirm.
function openReleaseDialog(id) {

    wfOpenReleaseWindow(id, function () {
        closeModal();
        render();
        openModal(id);
    });

}

function closeModal() {
    openId = null;
    document.getElementById("requestModal").classList.remove("show");
}


// ========================================
// SIGNATURES OF A REQUISITION (needs Shared/signatures.js)
// ========================================

function signatureBlock(r) {

    const signed = r.signatures || {};
    const open = r.status === "Approved";   // they are recorded after the approval, until the release

    if (r.status === "Pending" || r.status === "Rejected") {
        return '<div class="stock-check"><strong>Signatures</strong>' +
            "<p>" + (r.status === "Pending"
                ? "The signatures (Department Dean, Auditing Office, Property Custodian) are recorded after the request is approved."
                : "This request was rejected.") + "</p></div>";
    }

    let html = '<div class="sig-box"><strong>Signatures on the paper form: ' + signatureCount(r) + " of " + SIGNERS.length + "</strong>";

    SIGNERS.forEach(function (sg) {

        const done = signed[sg.key];

        html += '<label class="sig-row"><input type="checkbox" data-signer="' + sg.key + '"' + (done ? " checked" : "") + (open ? "" : " disabled") + "> " +
            esc(sg.label) + (done ? " <small>" + esc(signatureDate(done.at)) + " (recorded by " + esc(done.by) + ")</small>" : " <small>waiting</small>") + "</label>";

    });

    html += "<p>" + (open
        ? (allSigned(r) ? "All three signatures are recorded. You can release the supplies." : "Tick each signature when the paper comes back. The release is possible when the three are ticked.")
        : "The supplies were released.") + "</p></div>";

    return html;

}

function toggleSignature(id, key, checked) {

    const full = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    const form = full.find(function (f) { return f.id === id; });

    if (!form || form.status !== "Approved") return;

    const signer = SIGNERS.find(function (x) { return x.key === key; });
    const label = FORM_INFO[form.type].label;

    // only an Administrator can take a signature away (a mistake is serious: it opens the release)
    if (!checked) {

        if (typeof can === "function" && !can("changeStatus")) {
            alert("Only an Administrator can remove a recorded signature.");
            openModal(id);
            return;
        }

        if (!confirm("Remove the signature of the " + signer.label + " on " + label + " " + form.controlNo + "?")) {
            openModal(id);
            return;
        }

    }

    const admin = sessionStorage.getItem("userEmail") || "Admin";

    setSignature(form, key, admin, checked);
    saveAll(full);

    const count = signatureCount(form);

    if (typeof tryAuditLog === "function") {
        tryAuditLog(admin, (typeof currentRole === "function" && currentRole()) || "Administrator",
            (checked ? "Recorded" : "Removed") + " the signature of the " + signer.label + " on " + label + " " + form.controlNo + " (" + count + " of " + SIGNERS.length + ")");
    }

    // tell the requester where the paper is
    if (checked && form.requesterEmail && form.source !== "admin" && typeof addNotification === "function") {
        addNotification(
            form.requesterEmail,
            count === SIGNERS.length
                ? "All three signatures of your " + label + " " + form.controlNo + " are recorded. It is ready for release."
                : "Your " + label + " " + form.controlNo + ": the signature of the " + signer.label + " was recorded (" + count + " of " + SIGNERS.length + ").",
            { type: form.type, controlNo: form.controlNo }
        );
    }

    render();
    openModal(id);

}

// ========================================
// CHANGE STATUS
// ========================================

function changeStatus(id, newStatus) {

    const list = loadAll();
    const r = list.find(function (x) { return x.id === id; });

    if (!r) {
        return;
    }

    const label = FORM_INFO[r.type].label;

    // who may do what (checked here too, not only by hiding the buttons)
    const who = wfRole();
    if (newStatus === "Released" && who !== "Staff") { alert("Only Staff make the actual release. The Admin approves or rejects."); return; }
    if ((newStatus === "Approved" || newStatus === "Rejected") && who !== "Administrator") { alert(cannotMessage("changeStatus")); return; }

    if (newStatus === "Released" && typeof allSigned === "function" && !allSigned(r)) {
        alert("Cannot release " + label + " " + r.controlNo + ".\n\nIt has " + signatureCount(r) + " of 3 signatures. " +
              "Record the signatures of the Department Dean, the Auditing Office and the Property Custodian first.");
        return;
    }

    // releasing gives the items out, so the stock must be enough
    const changesStock = newStatus === "Released" && !r.stockApplied &&
        (r.type === "requisition" || r.type === "pullout") && typeof applyStock === "function";

    const mode = r.type === "pullout" ? "pullout" : "issue";

    // equipment that uses the per-unit register: Staff choose the specific units to pull out first
    if (changesStock && typeof usesUnitRegistry === "function") {

        const assetList = loadAssets();
        const need = [];

        r.items.forEach(function (it, i) {
            const a = it.assetId ? assetList.find(function (x) { return x.id === it.assetId; }) : null;
            const q = Number(it.qty);
            if (a && usesUnitRegistry(a) && q > 0 && (!it.unitIds || it.unitIds.length !== q)) {
                need.push({ key: i, assetId: a.id, name: a.name, qty: q, exact: true });
            }
        });

        if (need.length) {
            openUnitPicker("Select the units to pull out - " + r.controlNo, need, mode, function (map) {
                const full = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
                const t = full.find(function (x) { return x.id === id; });
                need.forEach(function (n) { t.items[n.key].unitIds = map[n.key]; });
                saveAll(full);
                changeStatus(id, newStatus);
            });
            return;
        }

    }

    if (changesStock) {

        const check = checkStock(r.items, mode, true);

        if (!check.ok) {
            alert("Cannot release " + label + " " + r.controlNo + ".\n\n- " + check.problems.join("\n- ") +
                  "\n\nAdd stock in Assets, or reject the form.");
            return;
        }

    }

    if (!confirm(newStatus + " " + label + " " + r.controlNo + "?")) {
        return;
    }

    if (changesStock) {

        const result = applyStock(r.items, mode, label + " " + r.controlNo + " released", { ref: r.controlNo, assignedTo: "", department: "" });

        if (!result.ok) {
            alert("Cannot release " + label + " " + r.controlNo + ".\n\n- " + result.problems.join("\n- "));
            return;
        }

        // the units that were pulled out are also written as a pull-out record (Pull-Out Management)
        if (r.type === "pullout" && typeof recordPulloutFromRequest === "function") {
            const pulled = [];
            r.items.forEach(function (it) { (it.unitIds || []).forEach(function (uid) { pulled.push(uid); }); });
            recordPulloutFromRequest(r, pulled);
        }

    }

    const oldStatus = r.status;
    const now = new Date().toISOString();
    const admin = sessionStorage.getItem("userEmail") || "Admin";

    r.status = newStatus;
    r.statusHistory = (r.statusHistory || []).concat([{ status: newStatus, by: admin, date: now }]);

    // saveAll must keep forms of unknown types too, so write the full stored list
    const full = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    const target = full.find(function (x) { return x.id === id; });
    target.status = r.status;
    target.statusHistory = r.statusHistory;
    if (changesStock) target.stockApplied = true;
    saveAll(full);

    // for the Audit Trail page
    if (typeof tryAuditLog === "function") {
        tryAuditLog(
            admin,
            "Administrator",
            newStatus + " " + label + " " + r.controlNo + " (" + oldStatus + " > " + newStatus + ")"
        );
    }

    // tell the requester (bell + message in the Requester pages)
    if (typeof addNotification === "function" && r.requesterEmail && r.source !== "admin") {

        const verbs = {
            Approved: "was approved",
            Released: "is released. You can claim it",
            Rejected: "was rejected"
        };

        addNotification(
            r.requesterEmail,
            "Your " + label + " " + r.controlNo + " " + (verbs[newStatus] || "is now " + newStatus) + ".",
            { type: r.type, controlNo: r.controlNo }
        );

    }

    closeModal();
    render();

}


// ========================================
// SCAN THE QR CODE OF A FORM (needs Shared/qr.js and Shared/scanner.js)
// ========================================

function scanForm() {

    if (typeof openScanner === "undefined" || typeof QR === "undefined") {
        alert("The QR code files were not found. Put the Shared folder (qr.js and scanner.js) in the project root, next to Admin and Requester.");
        return;
    }

    openScanner({
        title: "Scan Form QR",
        hint: "Scan the QR code printed on a form, or type its control number (for example 26-001).",
        onCode: function (parsed) {

            // QR printed on a form: we know the type and the number
            if (parsed.kind === "form") {

                const form = loadAll().find(function (f) {
                    return f.type === parsed.type && f.controlNo === parsed.controlNo;
                });

                if (!form) return "No form found with the number " + parsed.controlNo + ".";

                openModal(form.id);
                return true;

            }

            // only the number was typed: the same number can exist in each form type
            if (parsed.kind === "form-number") {

                const matches = loadAll().filter(function (f) { return f.controlNo === parsed.controlNo; });

                if (matches.length === 0) return "No form found with the number " + parsed.controlNo + ".";

                if (matches.length === 1) {
                    openModal(matches[0].id);
                    return true;
                }

                // several forms: show them in the list so the right one can be chosen
                document.getElementById("typeFilter").value = "all";
                document.getElementById("statusFilter").value = "all";
                document.getElementById("searchBox").value = parsed.controlNo;
                render();
                return true;

            }

            if (parsed.kind === "asset") {
                return "This is the code of an asset. Scan it in Assets.";
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
                    window.location.href = "requestmanagement.html";
                    break;

                case "Assets":
                    window.location.href = "../Assets/assets.html";
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
