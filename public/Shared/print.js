    // ========================================
    // NEU CUSTODIAN MANAGEMENT SYSTEM
    // SHARED PRINT LAYOUTS
    // Used by the Requester "Request" page and the Admin "Request Management" page.
    // Needs: <div id="printArea"></div> in the page and Shared/print.css
    // ========================================

    // Names printed on the signature boxes (edit here if they change)
    const SIGN = {
        auditor: "RAYMUND S. PAGADUAN",
        custodian: "NELSON F. SALISI"
    };

    function esc(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    }

    function money(n) {
        return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ========================================
    // PRINT LAYOUTS (look like the paper forms)
    // ========================================
    // QR code of a form (needs Shared/qr.js; if it is missing the form prints without it)
    function formQr(r, style) {

        if (typeof QR === "undefined" || typeof qrFormPayload === "undefined") return "";

        try {
            return '<div class="qr-form" style="' + style + '">' +
                QR.svg(qrFormPayload(r.type, r.controlNo), { size: 80, border: 1 }) + "</div>";
        } catch (e) {
            return "";
        }

    }

    function emptyCells(n) {
        let s = "";
        for (let i = 0; i < n; i++) s += "<td></td>";
        return s;
    }

    function setPageStyle(orient) {
        let s = document.getElementById("pageStyle");
        if (!s) {
            s = document.createElement("style");
            s.id = "pageStyle";
            document.head.appendChild(s);
        }
        s.textContent = "@page { size: " + orient + "; margin: 10mm; }";
    }

    function printRequisition(r) {
        const h = r.header;
        let rows = "";

        for (let i = 0; i < Math.max(13, r.items.length); i++) {
            const it = r.items[i];
            rows += it
                ? "<tr><td>" + esc(it.name) + '</td><td class="ctr">' + esc(it.qty) + '</td><td class="ctr">' + esc(it.unit) +
                "</td><td>" + esc(it.particulars) + '</td><td class="num">' + (it.price ? money(it.price) : "") +
                '</td><td class="num">' + (it.amount ? money(it.amount) : "") +
                '</td><td class="ctr">' + esc(it.lastRequested) + "</td><td>" + esc(it.receivedBy) + "</td></tr>"
                : "<tr>" + emptyCells(8) + "</tr>";
        }

        return '<div class="paper">' +
            '<div class="top">' +
                '<img src="' + appLogoSrc("../../Admin/Login/neu-logo.png") + '" alt="">' +
                '<div class="uni">' + esc(appInstitution()) + '</div>' +
                '<div class="dept">' + esc(appOffice().toUpperCase()) + '</div>' +
                '<div class="title">REQUISITION FORM</div>' +
                '<div class="box">CONTROL NO:<b>' + esc(r.controlNo) + "</b></div>" +
                formQr(r, "left:0;top:0;width:62px;height:62px") +
            "</div>" +
            '<table class="head"><tr>' +
                '<td style="width:45%">DEPARTMENT: ' + esc(h.department) + "</td>" +
                '<td style="width:35%">SECTION: ' + esc(h.section) + "</td>" +
                "<td>MONTH: " + esc(h.month) + "</td>" +
            "</tr></table>" +
            '<table class="gap"><thead><tr>' +
                '<th style="width:18%">NAME (Print Full Name)</th><th style="width:5%">QTY</th><th style="width:6%">UNIT</th>' +
                '<th>PARTICULARS</th><th style="width:8%">UNIT PRICE</th><th style="width:9%">AMOUNT</th>' +
                '<th style="width:10%">DATE LAST REQUESTED</th><th style="width:14%">RECEIVED BY:</th>' +
            "</tr></thead><tbody>" + rows + "</tbody>" +
            '<tfoot><tr><td colspan="5" style="text-align:right;font-weight:700">TOTAL</td>' +
            '<td class="num" style="font-weight:700">' + money(r.total) + '</td><td colspan="2"></td></tr></tfoot></table>' +
            (h.representativeName || h.purpose ? '<table class="head"><tr>' +
                '<td style="width:45%">REPRESENTATIVE: ' + esc(h.representativeName) + (h.position ? " (" + esc(h.position) + ")" : "") + "</td>" +
                "<td>PURPOSE / JUSTIFICATION: " + esc(h.purpose) + "</td></tr></table>" : "") +
            signatureTable(r) +
        "</div>";
    }

    // Only THREE signatories: Department Head, School Auditor, Director.
    // Names: Department Head = typed by hand, Auditor = Auditor account, Director = Admin account (printed as "DIRECTOR" only).
    function signatureTable(r) {

        const s = r.sig || null;

        function cell(x, fallbackName, title) {
            const img = x && x.image ? '<img src="' + x.image + '" alt="" style="max-height:48px;max-width:180px;display:block;margin:0 auto 2px">' : "";
            const name = x ? x.name : fallbackName;
            return "<td>" + img + (name ? '<span class="name">' + esc(String(name).toUpperCase()) + "</span>" : "") + title + "</td>";
        }

        // older requisitions (without the new workflow) keep the names of the paper form
        const legacy = !s;

        return '<table class="gap"><tr class="sign-label">' +
            '<td style="width:33%">Noted by:</td><td style="width:33%">Reviewed by:</td><td>Approved by:</td></tr>' +
            '<tr class="sign">' +
            cell(s && s.deptHead, "", "DEPARTMENT HEAD") +
            cell(s && s.auditor, legacy ? SIGN.auditor : "", "SCHOOL AUDITOR") +
            cell(s && s.director, legacy ? SIGN.custodian : "", "DIRECTOR") +
            "</tr></table>";
    }

    // Printable release receipt of a released requisition (items actually released, who released, when)
    function printReleaseReceipt(r) {

        const rel = r.release;
        if (!rel) { alert("This requisition has not been released yet."); return; }

        let rows = "";
        rel.lines.forEach(function (l, i) {
            rows += "<tr><td class=\"ctr\">" + (i + 1) + "</td><td>" + esc(l.name) + (l.unitIds && l.unitIds.length ? '<div style="font-size:9px">Units: ' + esc(l.unitIds.join(", ")) + "</div>" : "") + '</td><td class="ctr">' + esc(l.requested) + '</td><td class="ctr">' +
                esc(l.released) + '</td><td class="ctr">' + esc(l.unit) + "</td></tr>";
        });

        const d = new Date(rel.at);
        const when = isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const sg = r.sig || {};

        const html = '<div class="paper">' +
            '<div class="top"><img src="' + appLogoSrc("../../Admin/Login/neu-logo.png") + '" alt=""><div class="uni">' + esc(appInstitution()) + '</div>' +
            '<div class="dept">' + esc(appOffice().toUpperCase()) + '</div><div class="title">RELEASE RECEIPT</div>' +
            '<div class="box">REQUISITION NO:<b>' + esc(r.controlNo) + "</b></div>" + formQr(r, "left:0;top:0;width:62px;height:62px") + "</div>" +
            '<table class="head"><tr><td style="width:50%">DEPARTMENT / OFFICE: ' + esc(r.header.department) + "</td><td>REPRESENTATIVE: " + esc(r.header.representativeName) + "</td></tr>" +
            "<tr><td>RELEASE DATE AND TIME: " + esc(when) + "</td><td>RESPONSIBLE STAFF: " + esc(rel.by) + "</td></tr></table>" +
            '<table class="gap"><thead><tr><th style="width:6%">#</th><th>ITEM DESCRIPTION</th><th style="width:12%">QTY REQUESTED</th><th style="width:12%">QTY RELEASED</th><th style="width:10%">UNIT</th></tr></thead><tbody>' + rows + "</tbody></table>" +
            '<table class="head"><tr><td>Signatures verified: Department Head - ' + esc(sg.deptHead ? sg.deptHead.name : "missing") +
            "; School Auditor - " + esc(sg.auditor ? sg.auditor.name : "missing") + "; Director - " + esc(sg.director ? sg.director.name : "missing") + "</td></tr></table>" +
            '<table class="gap"><tr class="sign-label"><td style="width:50%">Released by:</td><td>Received by (Requester):</td></tr>' +
            '<tr class="sign"><td><span class="name">' + esc(String(rel.by).toUpperCase()) + "</span>PROPERTY STAFF</td>" +
            "<td>" + (r.acknowledgment ? '<span class="name">' + esc(String(r.acknowledgment.by).toUpperCase()) + "</span>Confirmed " + esc(new Date(r.acknowledgment.at).toLocaleDateString("en-US")) : "&nbsp;<br>REQUESTER") + "</td></tr></table>" +
        "</div>";

        setPageStyle("landscape");
        document.getElementById("printArea").innerHTML = html;
        window.print();

    }

    function printReceipt(r) {
        const h = r.header;
        let rows = "";

        for (let i = 0; i < Math.max(10, r.items.length); i++) {
            const it = r.items[i];
            rows += it
                ? '<tr><td class="ctr">' + esc(it.qty) + '</td><td class="ctr">' + esc(it.unit) +
                "</td><td>" + esc(it.item) + "</td><td>" + esc(it.description) + "</td></tr>"
                : "<tr>" + emptyCells(4) + "</tr>";
        }

        return '<div class="paper">' +
            '<div class="top">' +
                '<div class="formno"><small>Form</small>PROP-ARII</div>' +
                '<div class="box"><span class="box-frame">PRO-OSR # ' + esc(r.controlNo) + "</span></div>" +
                formQr(r, "right:0;top:36px;width:58px;height:58px") +
                '<div class="uni-plain">' + esc(appInstitution()) + '</div>' +
                '<div class="dept">' + esc(appOffice().toUpperCase()) + '</div>' +
                '<div class="title" style="font-size:17px;letter-spacing:0">ACKNOWLEDGMENT RECEIPT</div>' +
                '<div class="title" style="font-size:17px;letter-spacing:0;margin-top:0">INVENTORIABLE ITEMS</div>' +
            "</div>" +
            '<table class="head"><tr>' +
                '<td style="width:55%">NAME: ' + esc(h.name) + "</td>" +
                "<td>DEPARTMENT: " + esc(h.department) + "</td>" +
            "</tr></table>" +
            '<table class="gap dark"><thead><tr>' +
                '<th style="width:9%">QTY</th><th style="width:9%">UNIT</th><th style="width:36%">ITEM</th><th>DESCRIPTION</th>' +
            "</tr></thead><tbody>" + rows + "</tbody></table>" +
            '<table class="gap"><tr class="sign-label">' +
                '<td style="width:25%">Prepared by:</td><td style="width:30%">Received by:</td><td style="width:15%"></td><td>Noted by:</td></tr>' +
                '<tr class="sign"><td>' + (r.issuedByName ? '<span class="name">' + esc(String(r.issuedByName).toUpperCase()) + "</span>" : "") + 'PROPERTY STAFF</td><td>' +
                    (r.acknowledged ? '<span class="name">' + esc(String(r.acknowledged.by).toUpperCase()) + "</span>Confirmed " + esc(new Date(r.acknowledged.at).toLocaleDateString("en-US")) : "SIGNATURE OVER PRINTED NAME") + '</td><td>Date Received</td>' +
                '<td><span class="name">' + esc(typeof directorName === "function" ? directorName().toUpperCase() : SIGN.custodian) + "</span>DIRECTOR</td></tr></table>" +
            '<div class="rev">rev. 04072022-05811</div>' +
        "</div>";
    }

    function pulloutCopy(r, label, first) {
        const h = r.header;
        let rows = "";

        for (let i = 0; i < Math.max(3, r.items.length); i++) {
            const it = r.items[i];
            rows += it
                ? '<tr><td class="ctr">' + esc(it.qty) + "</td><td>" + esc(it.item) + "</td><td>" + esc(it.description) +
                "</td><td>" + esc(it.reason) + "</td></tr>"
                : "<tr>" + emptyCells(4) + "</tr>";
        }

        return '<div class="copy">' +
            '<div class="top">' +
                '<div class="formno"><small>Form</small>PROP-POR</div>' +
                '<div class="box"><span class="box-frame">' + esc(label) + "</span></div>" +
                formQr(r, "right:0;top:30px;width:46px;height:46px") +
                (first
                    ? '<img src="' + appLogoSrc("../../Admin/Login/neu-logo.png") + '" alt="" style="left:20%;width:48px">' +
                    '<div class="uni-plain" style="font-size:22px">' + esc(appInstitution()) + '</div>' +
                    '<div class="dept" style="font-size:12px">' + esc(appOffice().toUpperCase()) + '</div>' +
                    '<div style="font-size:10px;font-weight:700">Main Campus</div>'
                    : "") +
                '<div class="title" style="font-size:16px;letter-spacing:0;margin-top:' + (first ? "8px" : "22px") + '">PULL-OUT REQUEST</div>' +
            "</div>" +
            '<table><thead><tr><th style="width:9%">QTY</th><th style="width:30%">ITEM/s</th><th style="width:31%">Description/s</th><th>REASON</th></tr></thead>' +
            "<tbody>" + rows + "</tbody></table>" +
            '<table class="gap"><tr>' +
                '<td style="width:42%"><b>Requesting Party:</b> ' + esc(h.requestingParty) + "</td>" +
                '<td style="width:30%"><b>Office / Classroom:</b> ' + esc(h.office) + "</td>" +
                "<td><b>Date:</b> " + esc(h.date) + "</td></tr></table>" +
            '<table class="gap"><tr>' +
                '<td style="width:28%"><b>Pulled-Out by:</b> ' + esc(h.pulledOutBy) + "</td>" +
                '<td style="width:18%"><b>Date:</b> ' + esc(h.pulledDate) + "</td>" +
                '<td style="width:28%"><b>Received by:</b> ' + esc(h.receivedBy) + "</td>" +
                "<td><b>Date:</b> " + esc(h.receivedDate) + "</td></tr></table>" +
            (first
                ? '<div style="text-align:center;font-weight:700;font-size:10px;margin:4px 0 2px">NOTED BY:</div>' +
                '<table><tr class="sign"><td style="width:50%">Building Administrator</td>' +
                '<td><span class="name">' + SIGN.custodian + "</span>Property Custodian</td></tr></table>"
                : "") +
            '<div class="ctrl-no"><span>' + esc(r.controlNo) + "</span></div>" +
        "</div>";
    }

    function printPullout(r) {
        return '<div class="paper">' +
            pulloutCopy(r, "PROPERTY's copy", true) +
            pulloutCopy(r, "BLDG. ADM's copy", false) +
            pulloutCopy(r, "REQ. PARTY's copy", false) +
        "</div>";
    }

    const PRINT_ORIENTATION = { requisition: "landscape", receipt: "landscape", pullout: "portrait" };

    function printRecord(r) {
        let html = "";

        if (r.type === "requisition") html = printRequisition(r);
        else if (r.type === "receipt") html = printReceipt(r);
        else html = printPullout(r);

        setPageStyle(PRINT_ORIENTATION[r.type] || "landscape");
        document.getElementById("printArea").innerHTML = html;
        window.print();
    }


    // ========================================
    // ANNUAL INVENTORY REPORT (landscape, like the paper form)
    // "report" comes from Shared/inventory.js (an Annual Inventory)
    // ========================================
    function annualPaper(report) {

        const MIN_ROWS = 22;   // the paper has empty lines at the end

        function dateText(value) {

            if (!value) return "";

            const d = new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));

            return isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" });

        }

        let rows = "";
        let total = 0;

        report.items.forEach(function (it) {

            const qty = parseFloat(it.countedQty);
            const shownQty = isNaN(qty) ? (parseFloat(it.qty) || 0) : qty;
            const price = parseFloat(it.unitPrice) || 0;
            const amount = shownQty * price;

            total += amount;

            rows += "<tr>" +
                "<td>" + esc(it.iin) + "</td>" +
                '<td class="ctr">' + dateText(it.date) + "</td>" +
                '<td class="ctr">' + esc(shownQty + (it.unit ? " " + it.unit : "")) + "</td>" +
                "<td>" + esc(it.item) + "</td>" +
                "<td>" + esc(it.brand) + "</td>" +
                "<td>" + esc(it.model) + "</td>" +
                "<td>" + esc(it.make) + "</td>" +
                "<td>" + esc(it.color) + "</td>" +
                "<td>" + esc(it.size) + "</td>" +
                "<td>" + esc(it.serial) + "</td>" +
                '<td class="num">' + (price ? money(price) : "") + "</td>" +
                '<td class="num">' + (amount ? money(amount) : "") + "</td>" +
                "<td>" + esc(it.remarks) + "</td>" +
                "</tr>";

        });

        for (let i = report.items.length; i < MIN_ROWS; i++) {
            rows += "<tr>" + emptyCells(13) + "</tr>";
        }

        if (total > 0) {
            rows += '<tr class="total"><td colspan="11" style="text-align:right">TOTAL</td><td class="num">' + money(total) + "</td><td></td></tr>";
        }

        return '<div class="paper ai">' +
            '<div class="top">' +
                '<img src="' + appLogoSrc("../../Admin/Login/neu-logo.png") + '" alt="">' +
                '<div class="uni">' + esc(appInstitution()) + '</div>' +
                '<div class="dept">' + esc(appOffice().toUpperCase()) + '</div>' +
                '<div class="title" style="font-size:15px;letter-spacing:0">ANNUAL INVENTORY REPORT</div>' +
                '<div class="dept" style="font-size:12px">MAIN CAMPUS</div>' +
            "</div>" +
            (report.status !== "Certified"
                ? '<div class="ai-draft">' + (report.status === "Verified" ? "COUNTED, NOT YET CERTIFIED" : "DRAFT") + " - not valid until it is certified and signed</div>"
                : "") +
            '<table class="head"><tr>' +
                '<td style="width:20%">Name:<br><b>' + esc(report.custodianName) + "</b></td>" +
                '<td style="width:20%">Job Title:<br><b>' + esc(report.jobTitle) + "</b></td>" +
                '<td style="width:20%">Department:<br><b>' + esc(report.department) + "</b></td>" +
                '<td style="width:28%">Section/Unit:<br><b>' + esc(report.section) + "</b></td>" +
                '<td>Year:<br><b>' + esc(report.year) + "</b></td>" +
            "</tr></table>" +
            '<table class="gap ai-items"><thead>' +
                "<tr>" +
                    '<th rowspan="2" style="width:11%">IIN</th><th rowspan="2" style="width:6%">Date</th><th rowspan="2" style="width:6%">Qty</th><th rowspan="2" style="width:15%">Item</th>' +
                    '<th colspan="6">DESCRIPTION</th><th rowspan="2" style="width:6%">Unit Price</th><th rowspan="2" style="width:6%">Amount</th><th rowspan="2">Remarks</th>' +
                "</tr><tr>" +
                    "<th>Brand</th><th>Model</th><th>Make</th><th>Color</th><th>Size</th><th>Serial #</th>" +
                "</tr>" +
            "</thead><tbody>" + rows + "</tbody></table>" +
            '<div class="ai-cert">I honestly certify that all items listed above have been entrusted under my custody by the administration, ' +
            "to be used only for its legitimate purpose. I solemnly swear that I will exercise proper care and protection for these items " +
            "and shall be held liable for any loss or defect of the same due to negligence on my part. I will immediately surrender all these " +
            "items to the Property Office in the event of my termination from the service due to any cause.</div>" +
            '<table class="gap"><tr class="sign-label"><td style="width:34%">Signature &amp; Date:</td><td style="width:33%">Section Chief:</td><td>Department Head:</td></tr>' +
            '<tr class="sign"><td><span class="name">' + esc(report.custodianName) + "</span></td><td></td><td></td></tr></table>" +
        "</div>";

    }

    function printAnnual(report) {

        setPageStyle("landscape");
        document.getElementById("printArea").innerHTML = annualPaper(report);
        window.print();

    }
