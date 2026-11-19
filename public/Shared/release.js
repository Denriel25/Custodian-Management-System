// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// RELEASE WINDOW AND RELEASE RECORDS (frontend simulation)
//
//   wfOpenReleaseWindow(id, onDone)   Staff prepare and confirm the ACTUAL release of a fully approved requisition
//   wfQueueDetails(id, onDone)        read-only details of a requisition in the release queue (Admin supervises)
//   (releaseIntegrityCheck and releaseReapplyAfterReset are data-level functions: they are in Shared/workflow.js)
//
// The rules of a release are in Shared/workflow.js (wfRelease). This file is only the screens and the checks.
// A QR code never authorizes a release: scanning only opens a record.
//
// Needs (load before): users.js, stock.js, units.js, workflow.js. Optional: print.js (print the receipt)
// ========================================

// ----- the release window -----
// state keeps what Staff chose while the unit picker is open: { token, picked: {line: [unit ids]}, qty: {line: text}, note }
function wfOpenReleaseWindow(id, onDone, state) {

    const f = wfFind(id);
    if (!f) return;

    if (wfRole() !== "Staff") { wfToast("Only Staff make the actual release. The Admin supervises the release queue.", true); return; }
    if ((f.status !== WF.READY && f.status !== WF.PARTIAL) || !wfReadyForRelease(f)) { wfToast("This requisition is not ready for release: " + wfWhyNotReady(f), true); return; }

    state = state || { token: "rel-" + Date.now() + "-" + Math.floor(Math.random() * 1e6), picked: {}, qty: {}, note: "" };

    const rem = wfRemaining(f);
    const tot = wfReleasedTotals(f);
    const assets = loadAssets();
    const tracked = [];          // equipment lines (units are selected)
    const h = f.header || {};

    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + v + "</span></div>"; }

    let body = row("Requisition", "<b>" + wfEsc(f.controlNo) + "</b> " + wfBadge(f.status)) + row("Requester", wfEsc((h.representativeName || "-") + " (" + f.requesterEmail + ")")) +
        row("Department / Office", wfEsc(h.department)) + wfReleaseAuthHtml(f) +
        '<h4 style="margin:12px 0 4px;color:#edae0f">Items to release</h4><div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>#</th><th>Item</th><th>Approved</th><th>Released</th><th>Remaining</th><th>Available now</th><th>Release this time</th></tr></thead><tbody>';

    f.items.forEach(function (it, i) {

        const a = it.assetId ? assets.find(function (x) { return x.id === it.assetId; }) : null;
        const isUnits = !!a && usesUnitRegistry(a);
        const isCons = !!a && isConsumable(a);
        let avail = "not tracked", cell;

        if (rem[i] <= 0) {
            cell = '<span class="wf-note">fully released</span>';
            avail = "-";
        } else if (isUnits) {
            const n = eligibleUnits(a.id, "issue").length;
            avail = n + " Available unit(s)";
            const chosen = state.picked[i] || [];
            tracked.push({ key: i, assetId: a.id, name: a.name, qty: rem[i], exact: false });
            cell = '<button type="button" class="wf-btn sm" id="pickUnits' + i + '"' + (n === 0 ? " disabled" : "") + ">Select units</button> <span class=\"wf-note\">" +
                (chosen.length ? wfEsc(chosen.length + " selected: " + chosen.join(", ")) : (n === 0 ? "no Available unit" : "none selected")) + "</span>";
        } else if (isCons) {
            const max = Math.max(0, Math.min(rem[i], a.quantity));
            avail = a.quantity + " " + (a.unit || "") + " in stock";
            cell = max > 0 ? '<input type="number" class="relQty" data-i="' + i + '" min="0" max="' + max + '" step="1" value="' + wfEsc(state.qty[i] !== undefined ? state.qty[i] : max) + '">' +
                (a.quantity < rem[i] ? '<div class="wf-note">Only ' + a.quantity + " in stock: the balance of " + (rem[i] - a.quantity) + " stays pending.</div>" : "")
                : '<span class="wf-note" style="color:#ff8a7a">out of stock: nothing can be released</span>';
        } else {
            cell = '<input type="number" class="relQty" data-i="' + i + '" min="0" max="' + rem[i] + '" step="1" value="' + wfEsc(state.qty[i] !== undefined ? state.qty[i] : rem[i]) + '">' +
                '<div class="wf-note">not tracked in the inventory</div>';
        }

        body += "<tr><td>" + (i + 1) + "</td><td>" + wfEsc(it.particulars || it.name) + "</td><td>" + wfEsc(it.qty) + " " + wfEsc(it.unit) + "</td><td>" + wfEsc(tot[i]) + "</td><td>" + wfEsc(rem[i]) + "</td><td>" + wfEsc(avail) + "</td><td>" + cell + "</td></tr>";

    });

    body += '</tbody></table></div><label class="wf-note" style="display:block;margin-top:8px">Remarks (optional)</label><input class="wf-input" id="relNote" value="' + wfEsc(state.note) + '" maxlength="200">' +
        '<p class="wf-note" style="margin-top:8px">The inventory changes only when you confirm. Equipment: select the specific Available units; only those units become Assigned. ' +
        "Each release gets its own acknowledgment receipt (PROP-ARII). You can release part now and the rest later.</p>" + wfReleaseHistoryHtml(f);

    function collect() {
        document.querySelectorAll(".relQty").forEach(function (inp) { state.qty[inp.dataset.i] = inp.value; });
        const n = document.getElementById("relNote");
        if (n) state.note = n.value;
    }

    const buttons = [{ text: "Cancel", onClick: wfCloseModal }];

    if (f.status === WF.PARTIAL) {
        buttons.push({ text: "Close with the balance not released", cls: "red", onClick: function () { collect(); relCloseDialog(id, onDone, state); } });
    }

    buttons.push({ text: "Release these items", cls: "gold", onClick: function () {

        collect();

        const lines = [];
        let problem = "";
        const listing = [];

        f.items.forEach(function (it, i) {
            if (rem[i] <= 0) return;
            const isT = tracked.some(function (t) { return t.key === i; });
            const a = it.assetId ? assets.find(function (x) { return x.id === it.assetId; }) : null;

            if (isT) {
                const ids = state.picked[i] || [];
                lines.push({ index: i, qty: ids.length, unitIds: ids });
                if (ids.length) listing.push(ids.length + " x " + (it.particulars || it.name) + " (" + ids.join(", ") + ")");
            } else {
                const t = String(state.qty[i] !== undefined ? state.qty[i] : "").trim();
                if (t === "" && !document.querySelector('.relQty[data-i="' + i + '"]')) return;          // out of stock line: nothing to release
                const q = t === "" ? 0 : Number(t);
                if (!isFinite(q) || q < 0 || q !== Math.floor(q)) { problem = "Line " + (i + 1) + ": enter a whole number of 0 or more."; return; }
                if (q > rem[i]) { problem = "Line " + (i + 1) + ": " + q + " is more than the remaining " + rem[i] + "."; return; }
                if (a && isConsumable(a) && q > a.quantity) { problem = "Line " + (i + 1) + ": only " + a.quantity + " in stock."; return; }
                lines.push({ index: i, qty: q });
                if (q > 0) listing.push(q + " x " + (it.particulars || it.name));
            }
        });

        if (problem) { wfToast(problem, true); return; }
        if (!listing.length) { wfToast("Nothing is selected. Choose the quantities or the units to release.", true); return; }

        const noUnits = tracked.filter(function (t) { return (state.picked[t.key] || []).length === 0 && rem[t.key] > 0; }).map(function (t) { return t.name; });
        const msg = "Release now?\n\n" + listing.join("\n") + (noUnits.length ? "\n\nNo units are selected for: " + noUnits.join(", ") + ". Nothing is released for these lines now." : "") +
            "\n\nThe inventory and the unit statuses change now, and an acknowledgment receipt is made.";
        if (!confirm(msg)) return;

        const res = wfRelease(id, lines, { token: state.token, note: state.note });

        if (!res.ok) { wfToast(String(res.message).split("\n")[0] + (String(res.message).indexOf("\n") !== -1 ? " (" + String(res.message).split("\n")[1].replace(/^- /, "") + ")" : ""), true); return; }

        relDone(id, onDone);

    } });

    wfModal("Prepare release - " + f.controlNo, body, buttons, true);

    // "Select units": the picker, then back to this window with the choice kept
    tracked.forEach(function (t) {
        const btn = document.getElementById("pickUnits" + t.key);
        if (!btn) return;
        btn.addEventListener("click", function () {
            collect();
            openUnitPicker("Select units - " + t.name, [t], "issue", function (map) {
                state.picked[t.key] = map[t.key];
                wfOpenReleaseWindow(id, onDone, state);
            }, function () { wfOpenReleaseWindow(id, onDone, state); });
        });
    });

}

// what happened: the receipt, what is left
function relDone(id, onDone) {

    const f = wfFind(id);
    const b = (f.releases || [])[(f.releases || []).length - 1];
    const left = [];
    wfRemaining(f).forEach(function (r, i) { if (r > 0) left.push(r + " " + (f.items[i].unit || "") + " " + (f.items[i].particulars || f.items[i].name)); });

    const body = '<div class="wf-list-item"><span class="wf-badge st-released">Recorded</span> Release <b>' + wfEsc(b.no) + "</b> was saved. Acknowledgment receipt <b>" + wfEsc(b.receiptNo) + "</b> (PROP-ARII) was made.</div>" +
        '<div class="wf-tablewrap"><table class="wf-table"><thead><tr><th>Item</th><th>Released</th><th>Units</th></tr></thead><tbody>' +
        b.lines.filter(function (l) { return l.released > 0; }).map(function (l) { return "<tr><td>" + wfEsc(l.name) + "</td><td>" + wfEsc(l.released + " " + (l.unit || "")) + "</td><td>" + wfEsc((l.unitIds || []).join(", ") || "-") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (left.length ? '<div class="wf-lock">Still to release: ' + wfEsc(left.join("; ")) + ". The requisition is now <b>Partially Released</b>.</div>" : '<div class="wf-list-item"><span class="wf-badge st-released">Complete</span> Everything was released. The Requester is asked to confirm receipt.</div>');

    wfModal("Release recorded", body, [
        { text: "Print receipt", onClick: function () {
            const rc = wfLoadAll().find(function (x) { return x.id === b.receiptId; });
            if (rc && typeof printRecord === "function") printRecord(rc); else wfToast("The receipt can be printed from the Issuance page.", true);
        } },
        { text: "Close", cls: "gold", onClick: function () { wfCloseModal(); if (onDone) onDone(); } }
    ], true);

}

function relCloseDialog(id, onDone, state) {

    const f = wfFind(id);
    const left = [];
    wfRemaining(f).forEach(function (r, i) { if (r > 0) left.push(r + " " + (f.items[i].unit || "") + " " + (f.items[i].particulars || f.items[i].name)); });

    wfModal("Close with the balance not released - " + f.controlNo,
        '<p>Not released: <b>' + wfEsc(left.join("; ")) + "</b></p><p class=\"wf-note\">The requisition becomes Released and the Requester is asked to confirm what was received. A reason is required.</p><textarea class=\"wf-text\" id=\"closeReason\"></textarea>",
        [{ text: "Back", onClick: function () { wfOpenReleaseWindow(id, onDone, state); } },
         { text: "Close the release", cls: "red", onClick: function () {
            if (!confirm("Close the release of " + f.controlNo + " without releasing the balance?")) return;
            const r = wfCloseRelease(id, document.getElementById("closeReason").value);
            if (!r.ok) { wfToast(r.message, true); return; }
            wfCloseModal(); wfToast("The release was closed."); if (onDone) onDone();
         } }]);

}

// ----- details of a requisition in the queue (read only; the Admin supervises, Staff can start the release) -----
function wfQueueDetails(id, onDone) {

    const f = wfFind(id);
    if (!f) return;

    const h = f.header || {};
    function row(l, v) { return '<div class="wf-row"><strong>' + wfEsc(l) + "</strong><span>" + v + "</span></div>"; }

    const body = row("Requisition No.", "<b>" + wfEsc(f.controlNo) + "</b> " + wfBadge(f.status)) + row("Requester", wfEsc((h.representativeName || "-") + " (" + f.requesterEmail + ")")) +
        row("Department / Office", wfEsc(h.department)) + row("Date", wfEsc(h.date || wfFormatDate(f.dateCreated))) + row("Purpose", wfEsc(h.purpose || "-")) +
        wfItemsTable(f, true) + wfProgressHtml(f) + wfSignatureCards(f) + wfReleaseAuthHtml(f) + wfReleaseHistoryHtml(f) +
        '<p class="wf-note">The QR code of a requisition only opens it. It never authorizes a release.</p>';

    const buttons = [{ text: "Close", onClick: wfCloseModal }];

    if (wfRole() === "Staff") {
        buttons.push({ text: "Prepare release", cls: "gold", onClick: function () { wfOpenReleaseWindow(id, onDone); } });
    } else if (wfRole() === "Administrator") {
        buttons.push({ text: "Staff make the release (Admin supervises)", disabled: true, title: "Only Staff make the actual release" });
    }

    wfModal("Requisition " + f.controlNo, body, buttons, true);

}
