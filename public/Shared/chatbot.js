// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED CHATBOT (AI assistant through Laravel, with the built-in helper as a fallback)
//
// A chat button at the bottom right of the pages that load this file.
//
// Messages are sent to Laravel (POST api/chat), which asks the AI service with data the logged-in
// person may see. The API key stays on the server. If the AI is not configured, busy or offline,
// the built-in key-word helper below answers instead, so the chat never just fails.
//
// The built-in helper understands:
//
//   - how to do things ("How do I request?", "Paano mag-request?")
//   - the status of a form ("Status of 26-001")
//   - the stock of an item ("Stock of bond paper", "Meron bang laptop?")
//   - lists and numbers ("My pending forms", "Low stock")
//   - opening a page ("Open reports")
//
// A Requester only gets answers about his or her OWN forms. The Admin can ask about all forms.
// The answers are written in English.
//
// Put <script src="../../Shared/chatbot.js"></script> after realtime.js.
// Shared/stock.js is needed for the questions about the stock.
// ========================================

(function () {

    const adminPage = /\/Admin\//.test(location.pathname.replace(/\\/g, "/"));
    const auditorPage = /\/Auditor\//.test(location.pathname.replace(/\\/g, "/"));   // the Auditor has his or her own pages
    const LOG_KEY = "chatLog";
    const OWNER_KEY = "chatOwner";
    const OPEN_KEY = "chatOpen";
    const MAX_LOG = 40;

    const FORM_LABELS = {
        requisition: "Requisition",
        receipt: "Acknowledgment Receipt",
        pullout: "Pull-Out Request"
    };

    const STATUS_MEANING = {
        Pending: "It was submitted and is waiting for the Property Department to review it.",
        Approved: "It was approved. The next step is the release.",
        Released: "It was released: the items are given out.",
        Rejected: "It was rejected."
    };

    // where each page is (the pages of the same side are in sibling folders)
    const PAGES = auditorPage
        ? {
            dashboard: ["Dashboard", "../AuditorDashboard/dashboard.html"],
            review: ["Requisition Review", "../RequisitionReview/review.html"],
            history: ["Review History", "../ReviewHistory/history.html"]
        }
        : adminPage
        ? {
            dashboard: ["Dashboard", "../Dashboard/dashboard.html"],
            requests: ["Request Management", "../RequestManagement/requestmanagement.html"],
            assets: ["Assets", "../Assets/assets.html"],
            issuance: ["Issuance", "../Issuance/issuance.html"],
            reports: ["Reports", "../Reports/reports.html"],
            users: ["Users", "../Users/users.html"],
            audit: ["Audit Trail", "../AuditTrail/audittrail.html"],
            annual: ["Annual Inventory", "../AnnualInventory/annualinventory.html"]
        }
        : {
            dashboard: ["Dashboard", "../RequesterDashboard/dashboard.html"],
            request: ["Request", "../Request/request.html"],
            myrequests: ["My Requests", "../RequesterMyRequests/myrequests.html"],
            history: ["History", "../RequesterHistory/history.html"],
            inventory: ["My Inventory", "../RequesterInventory/inventory.html"]
        };

    function link(key) {
        return { label: "Open " + PAGES[key][0], href: PAGES[key][1] };
    }


    // ========================================
    // DATA (read from the browser, like the pages do)
    // ========================================

    function readJSON(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            return [];
        }
    }

    function myEmail() {
        return (sessionStorage.getItem("userEmail") || "").toLowerCase();
    }

    // The Admin sees all the forms. A Requester sees only his or her own.
    function visibleForms() {

        const email = myEmail();

        return readJSON("forms").filter(function (r) {

            if (!FORM_LABELS[r.type]) return false;

            // a Draft requisition is private to its Requester
            if (r.type === "requisition" && r.status === "Draft" && (adminPage || auditorPage)) return false;

            // the Auditor only sees requisitions that reached the Auditor stage
            if (auditorPage) {
                return r.type === "requisition" && ["Draft", "Submitted", "Pending Department Head Signature"].indexOf(r.status) === -1;
            }

            if (adminPage) return true;

            return !email || !r.requesterEmail || String(r.requesterEmail).toLowerCase() === email;

        });

    }

    function inventory() {
        return typeof loadAssets === "function" ? loadAssets() : null;
    }

    function dateText(iso) {

        const d = new Date(iso);

        return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    }

    function firstName() {

        const full = typeof currentUserName === "function" ? currentUserName() : "";

        return full ? full.split(" ")[0] : "";

    }


    // ========================================
    // UNDERSTANDING THE TEXT
    // ========================================

    function plainText(text) {
        return " " + String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";
    }

    // does the text contain the word or phrase? (short words must be whole words)
    function has(plain, phrase) {

        const p = plainText(phrase);

        return phrase.length <= 4 ? plain.indexOf(p) !== -1 : plain.indexOf(p.trim()) !== -1;

    }

    function hasAny(plain, phrases) {
        return phrases.some(function (p) { return has(plain, p); });
    }

    function pickFormType(plain) {

        if (hasAny(plain, ["pull out", "pullout", "pull-out"])) return "pullout";
        if (hasAny(plain, ["receipt", "acknowledgment", "acknowledgement"])) return "receipt";
        if (hasAny(plain, ["requisition"])) return "requisition";

        return null;

    }

    // the item of the inventory that the text talks about (the longest name found)
    function findAsset(plain) {

        const assets = inventory();

        if (!assets) return null;

        let best = null;
        let bestScore = 0;

        assets.forEach(function (a) {

            const name = plainText(a.name).trim();

            if (name.length < 3) return;

            let score = 0;

            if (plain.indexOf(name) !== -1) {
                score = name.length + 100;                       // the full name was written
            } else {
                name.split(" ").forEach(function (word) {        // or one word of the name ("laptop" for "Dell Laptop")
                    if (word.length >= 4 && has(plain, word)) score = Math.max(score, word.length);
                });
            }

            if (score > bestScore) {
                bestScore = score;
                best = a;
            }

        });

        return best;

    }


    // ========================================
    // THE ANSWERS
    // answer = { lines: [text], list: [text], actions: [{label, href}], chips: [text] }
    // ========================================

    function say(lines, extra) {
        return Object.assign({ lines: [].concat(lines), list: [], actions: [], chips: [] }, extra || {});
    }

    // Exactly three signatories: Department Head, School Auditor, Director
    const SIGNER_NAMES = [["deptHead", "Department Head"], ["auditor", "School Auditor"], ["director", "Director"]];

    function signedCount(r) {
        const sg = r.sig || {};
        return SIGNER_NAMES.filter(function (n) { return sg[n[0]]; }).length;
    }

    // "Pending Auditor Review (1/3 signed)" for a requisition that is still in the workflow
    function statusLabel(r) {
        return r.type === "requisition" && ["Draft", "Rejected"].indexOf(r.status) === -1 ? r.status + " (" + signedCount(r) + "/3 signed)" : r.status;
    }

    // requisitions have workflow statuses; the questions "pending / approved / released / rejected" use these groups
    function groupOf(r) {
        if (r.type !== "requisition") return r.status;
        if (r.status === "Ready for Release" || r.status === "Partially Released" || r.status === "Approved") return "Approved";
        if (r.status === "Released" || r.status === "Completed") return "Released";
        if (r.status === "Rejected") return "Rejected";
        if (r.status === "Draft") return "Draft";
        return "Pending";
    }

    // a group word (Pending...) or an exact status (Ready for Release, Completed)
    function matchStatus(r, status) {
        return ["Pending", "Approved", "Released", "Rejected"].indexOf(status) !== -1 ? groupOf(r) === status : r.status === status;
    }

    function statusMeaning(r) {
        if (r.type === "requisition" && typeof WF_STATUS_HELP !== "undefined" && WF_STATUS_HELP[r.status]) return WF_STATUS_HELP[r.status];
        return STATUS_MEANING[r.status] || "";
    }

    function pick(forAdmin, forAuditor, forRequester) {
        return adminPage ? forAdmin : auditorPage ? forAuditor : forRequester;
    }

    function roleChips(kind) {
        if (kind === "status") return pick(["Pending requests"], ["Pending review", "What do I sign?"], ["My forms", "My pending forms"]);
        if (kind === "empty") return pick(["Pending requests", "Low stock"], ["Pending review"], ["How do I request?", "Stock of an item"]);
        return pick(["Pending requests", "Low stock", "How do I release a form?", "Why is a requisition not ready?"],
                    ["Pending review", "How do I review?", "What can the Auditor do?", "Why is a requisition not ready?"],
                    ["How do I request?", "My pending forms", "Why is my requisition not ready?", "What do the statuses mean?"]);
    }

    // "Why is it not ready for release?"  (one requisition, or every requisition that is not ready)
    function answerWhyNotReady(controlNo) {

        let list = visibleForms().filter(function (r) { return r.type === "requisition"; });
        if (controlNo) list = list.filter(function (r) { return r.controlNo === controlNo; });

        if (controlNo && list.length === 0) {
            return say("I cannot find requisition " + controlNo + (adminPage || auditorPage ? "." : " among your forms.") + " Please check the number.", { chips: roleChips("status") });
        }

        function why(r) {
            if (typeof wfWhyNotReady === "function") return wfWhyNotReady(r);
            return r.status === "Ready for Release" ? "It IS ready for release." : "Its status is " + r.status + ".";
        }

        if (controlNo) {
            const r = list[0];
            const out = say(["Requisition " + r.controlNo + " is " + r.status.toUpperCase() + ".", why(r), statusMeaning(r)].filter(Boolean));
            if (r.status !== "Ready for Release" && r.status !== "Released" && r.status !== "Completed" && r.status !== "Rejected" && r.status !== "Draft") {
                out.lines.push("A requisition is ready for release only after: the Department Head signed, the School Auditor reviewed and signed, and the Director approved and signed.");
            }
            if (r.status === "Ready for Release" && !auditorPage) out.lines.push("If the release still does not work, check that the stock is enough (Inventory Management).");
            out.actions.push(formLink(r));
            return out;
        }

        const open = list.filter(function (r) { return ["Ready for Release", "Released", "Completed", "Rejected", "Draft"].indexOf(r.status) === -1; });

        if (open.length === 0) {
            return say("Every requisition that I can see is either ready for release, already released, rejected" + (adminPage || auditorPage ? "." : " or still a draft."), { chips: roleChips("status") });
        }

        const out = say((adminPage || auditorPage ? "There are " : "You have ") + open.length + " requisition" + (open.length === 1 ? "" : "s") + " that " + (open.length === 1 ? "is" : "are") + " not ready for release yet:");
        open.slice(0, 5).forEach(function (r) { out.list.push(r.controlNo + " (" + r.status + "): " + why(r)); });
        out.chips = ["Status of " + open[0].controlNo];
        return out;

    }

    // the Auditor's work queue
    function answerAuditorQueue() {

        const waiting = visibleForms().filter(function (r) { return r.status === "Pending Auditor Review" || r.status === "Pending Auditor Signature"; });

        if (waiting.length === 0) return say("Nothing is waiting for you right now. No requisition needs review or your signature.", { actions: [link("review")], chips: ["What can the Auditor do?"] });

        const out = say("There " + (waiting.length === 1 ? "is " : "are ") + waiting.length + " requisition" + (waiting.length === 1 ? "" : "s") + " waiting for you:");
        waiting.slice(0, 5).forEach(function (r) {
            out.list.push(r.controlNo + ": " + (r.status === "Pending Auditor Review" ? "needs your review" : "reviewed, needs your signature"));
        });
        out.actions.push(link("review"));
        return out;

    }

    function formLine(r) {

        const owner = (adminPage || auditorPage) ? " - " + (r.type === "receipt" && !r.receiverEmail && r.source === "admin" ? "no account" : (r.requesterEmail || "-")) : "";

        return FORM_LABELS[r.type] + " " + r.controlNo + ": " + statusLabel(r) + owner;

    }

    function formLink(r) {

        const ref = "?open=" + encodeURIComponent(r.type + "|" + r.controlNo);

        const label = "Open " + FORM_LABELS[r.type] + " " + r.controlNo;

        if (auditorPage) return { label: label, href: PAGES.review[1] + "?open=" + encodeURIComponent(r.controlNo) };

        return adminPage
            ? { label: label, href: PAGES.requests[1] + ref }
            : { label: label, href: PAGES.myrequests[1] + ref };

    }

    function answerStatus(controlNo, type) {

        let matches = visibleForms().filter(function (r) { return r.controlNo === controlNo; });

        if (type) matches = matches.filter(function (r) { return r.type === type; });

        if (matches.length === 0) {
            return say(
                "I cannot find the number " + controlNo + (adminPage ? "." : auditorPage ? ", or it has not reached the Auditor yet." : " among your forms.") + " Please check the number.",
                { chips: roleChips("status") }
            );
        }

        const out = say([], {});

        matches.forEach(function (r) {

            out.lines.push(FORM_LABELS[r.type] + " " + r.controlNo + " is " + r.status.toUpperCase() +
                           (dateText(r.dateCreated) ? " (submitted " + dateText(r.dateCreated) + ")" : "") + ".");
            out.lines.push(statusMeaning(r));

            if (r.type === "requisition" && r.status !== "Draft") {
                const sg = r.sig || {};
                out.lines.push("Signatures: " + signedCount(r) + " of 3 (" +
                    SIGNER_NAMES.map(function (n) { return n[1] + ": " + (sg[n[0]] ? "signed" : "waiting"); }).join("; ") + ").");
                if (r.review) out.lines.push("Auditor review: done.");
                if (r.approval) out.lines.push("Director decision: " + r.approval.decision + ".");
                if (["Released", "Completed", "Rejected"].indexOf(r.status) === -1 && typeof wfWhyNotReady === "function") out.lines.push("Release: " + wfWhyNotReady(r));
            }

            if (adminPage || auditorPage) out.lines.push("Requester: " + (r.requesterEmail || "-") + ".");

            if (r.type === "receipt" && !adminPage && !auditorPage) {
                out.lines.push("This receipt was prepared by the Property Department. You can print it in Request > Acknowledgment Receipt.");
            }

            out.actions.push(formLink(r));

        });

        out.lines = out.lines.filter(Boolean);

        return out;

    }

    function answerList(status, type) {

        let list = visibleForms();

        if (status) list = list.filter(function (r) { return matchStatus(r, status); });
        if (type) list = list.filter(function (r) { return r.type === type; });

        // "form(s)", "pending form(s)", "acknowledgment receipt(s)"
        function whatIs(n) {
            const noun = type ? FORM_LABELS[type].toLowerCase() : "form";
            return (status ? status.toLowerCase() + " " : "") + noun + (n === 1 ? "" : "s");
        }

        const what = whatIs(list.length);
        const who = (adminPage || auditorPage) ? (list.length === 1 ? "There is " : "There are ") : "You have ";

        if (list.length === 0) {
            return say(((adminPage || auditorPage) ? "There are no " : "You have no ") + whatIs(0) + ".", {
                chips: roleChips("empty")
            });
        }

        const shown = list.slice().reverse().slice(0, 5);
        const out = say(who + list.length + " " + what + (list.length > shown.length ? ". The latest " + shown.length + ":" : ":"));

        shown.forEach(function (r) { out.list.push(formLine(r)); });

        out.actions.push(adminPage ? link("requests") : auditorPage ? link("review") : link("myrequests"));

        return out;

    }

    function answerStock(asset) {

        if (typeof assetAvailable !== "function") {
            return say("I cannot read the inventory now. Please open the Assets page.");
        }

        const consumable = isConsumable(asset);
        const out = say([]);

        if (consumable) {

            out.lines.push(asset.name + " (consumable): " + asset.quantity + " " + asset.unit + " in stock. Status: " + assetStatus(asset) + ".");

            if (adminPage && asset.reorderLevel > 0) out.lines.push("Reorder level: " + asset.reorderLevel + " " + asset.unit + ".");

        } else {

            out.lines.push(asset.name + " (non-consumable): " + assetAvailable(asset) + " of " + asset.quantity + " available.");

            if (adminPage) out.lines.push(asset.issued + " issued, " + asset.maintenance + " under maintenance.");

        }

        if (assetAvailable(asset) <= 0) out.lines.push("None is available now.");

        out.actions.push(adminPage ? link("assets") : auditorPage ? link("dashboard") : link("request"));

        return out;

    }

    function answerLowStock() {

        const assets = inventory();

        if (!assets) return say("I cannot read the inventory now.");

        const low = assets.filter(isLowStock);

        if (low.length === 0) return say("No supply is low on stock.");

        const out = say(low.length + " supply item(s) are low or out of stock:");

        low.forEach(function (a) {
            out.list.push(a.name + ": " + a.quantity + " " + a.unit + " (reorder at " + a.reorderLevel + ") - " + assetStatus(a));
        });

        out.actions.push(link("assets"));

        return out;

    }

    function answerCounts() {

        const forms = readJSON("forms").filter(function (r) { return FORM_LABELS[r.type]; });
        const assets = inventory() || [];
        const users = readJSON("users");
        const today = new Date().toDateString();

        const logsToday = readJSON("auditLog").filter(function (l) { return new Date(l.date).toDateString() === today; }).length;

        const out = say("Here are the numbers now:");

        out.list.push("Forms: " + forms.length + " (" + forms.filter(function (r) { return groupOf(r) === "Pending"; }).length + " pending)");
        out.list.push("Assets: " + assets.length);
        out.list.push("Users: " + users.length);
        out.list.push("Activities today: " + logsToday);

        out.actions.push(link("dashboard"));

        return out;

    }

    function answerAnnual() {

        const reports = readJSON("annualInventories");
        const out = say([]);

        if (adminPage) {

            const year = String(new Date().getFullYear());
            const ofYear = reports.filter(function (r) { return String(r.year) === year; });

            if (reports.length === 0) {
                out.lines.push("There is no Annual Inventory yet. Add the Sections / Units, give the items a Section / Unit in Assets, then create one.");
            } else {
                const count = function (st) { return ofYear.filter(function (r) { return r.status === st; }).length; };
                out.lines.push("Annual Inventory " + year + ": " + ofYear.length + " report(s): " + count("Draft") + " draft, " + count("Verified") + " counted, " + count("Certified") + " certified.");

                const waiting = ofYear.filter(function (r) { return r.status === "Verified"; });
                waiting.slice(0, 5).forEach(function (r) {
                    out.list.push(r.code + " - " + r.section + ": counted" + (r.custodianCertifiedAt ? ", the custodian certified it" : ", waiting for the custodian") + ". Ready to certify.");
                });
            }

            out.actions.push(link("annual"));
            return out;

        }

        const mine = reports.filter(function (r) {
            return r.status !== "Draft" && r.custodianEmail && String(r.custodianEmail).toLowerCase() === myEmail();
        });

        if (mine.length === 0) {
            out.lines.push("You have no Annual Inventory yet. When the Property Department finishes counting the items of your Section / Unit, it appears in My Inventory.");
        } else {
            const waiting = mine.filter(function (r) { return r.status === "Verified" && !r.custodianCertifiedAt; });
            out.lines.push("You have " + mine.length + " Annual Inventory(ies)" + (waiting.length ? ", " + waiting.length + " waiting for your certification." : "."));
            mine.slice().reverse().slice(0, 5).forEach(function (r) {
                out.list.push(r.year + " " + r.code + " - " + r.section + ": " + r.status + (r.custodianCertifiedAt ? " (you certified it)" : ""));
            });
        }

        out.actions.push(link("inventory"));
        return out;

    }

    function answerPageLink(key) {

        return say("Here is the page.", { actions: [link(key)] });

    }


    const SIGNATORIES_TEXT = "A requisition has exactly three signatories: the Department Head, the School Auditor and the Director. " +
        "The Department Head has no account: the Requester types the name and records the signature (draw it, or upload an image). " +
        "The School Auditor reviews the items and signs in the Auditor account. The Director is the Admin account: it approves or rejects, then signs. " +
        "The Requester or Representative is not a signatory. When all three are done and the Director approved, the requisition becomes Ready for Release.";

    function statusListText() {
        const list = [];
        if (typeof WF_STATUSES !== "undefined" && typeof WF_STATUS_HELP !== "undefined") {
            WF_STATUSES.forEach(function (st) {
                if (st === "Draft" && (adminPage || auditorPage)) return;
                list.push(st + ": " + WF_STATUS_HELP[st]);
            });
        }
        list.push("Pull-out requests and receipts use Pending, Approved, Released and Rejected.");
        return list;
    }

    // ----- how to do things (FAQ) -----
    // keys: words or phrases to look for. The answer with the most matching text wins.
    const FAQ_COMMON = [
        {
            keys: ["signature", "signatures", "sign the", "pirma", "dean", "auditing office", "auditing", "who signs"],
            lines: [SIGNATORIES_TEXT, pick("Staff can release a ready requisition, but cannot approve, reject or sign as Director.", "You review the items and quantities, then sign as School Auditor. You cannot approve, reject or release.", "After you submit, record the Department Head signature in My Requests (View, then Add Department Head signature).")]
        },
        {
            keys: ["what is ready for release", "ready for release mean", "what is completed", "what is a draft", "what does ready", "status mean", "statuses", "what is pending", "what is approved", "what is released", "what is rejected", "pending mean", "approved mean", "released mean", "rejected mean", "what does pending", "what does approved", "what does released", "what does rejected", "ano ang pending", "ano ang approved", "ano ang released", "ano ang rejected", "ibig sabihin", "meaning of status"],
            lines: ["The status of a requisition:"],
            get list() { return statusListText(); }
        },
        {
            keys: ["consumable", "non consumable", "nonconsumable", "inventoriable", "difference between supplies"],
            lines: ["There are two kinds of items:"],
            list: [
                "Consumable: supplies that are used up (bond paper, ink). They are counted by stock.",
                "Non-consumable: equipment (laptop, projector, chair). They are counted by units: available, issued, under maintenance."
            ]
        },
        {
            keys: ["control number", "control no", "numero ng form", "form number"],
            lines: ["The Control No. (for example 26-001) is given automatically when a form is saved: the year, then the number. Each kind of form has its own count, and it starts again every year."]
        },
        {
            keys: ["notification", "bell", "abiso", "notify"],
            lines: ["The bell at the top right shows your notifications. A small message also appears when something new arrives. Click a notification to open the form, or \"Mark all as read\" to clear the number."]
        },
        {
            keys: ["qr code", "qr", "scan"],
            lines: pick(
                ["Every requisition has its own QR code, and every physical unit of equipment has its own Asset ID and QR label (Assets, Units). In Request Management click \"Scan QR\" (or type the number) to open a requisition. In Assets use \"Scan QR\" to open the exact unit. A QR code only opens the record. It never approves, signs, releases or changes anything."],
                ["In Requisition Review click \"Scan Requisition QR\" (or type the number) to open a requisition. A QR code only opens the record. It never reviews, signs or approves anything."],
                ["Every printed requisition has a QR code with its Control No. The Property Department scans it to open the record. It only opens the record. It never approves or releases anything."])
        },
        {
            keys: ["print", "pdf", "i print", "mag print", "save as pdf"],
            lines: ["To print a form, click \"Print\" next to it in the list. In the print window choose your printer, or \"Save as PDF\" to keep a PDF copy."]
        },
        {
            keys: ["password", "forgot", "nakalimutan", "login problem", "cannot login", "hindi makapag login"],
            lines: ["Passwords are managed by the administrator (Admin > Users). If you cannot log in, please ask the administrator to check your account."]
        }
    ];

    const FAQ_REQUESTER = [
        {
            keys: ["my inventory", "annual inventory", "certify", "custodian", "inventory report", "iin", "what is the iin", "what is iin", "ano ang iin", "taunang inventory", "sino ang custodian"],
            lines: ["If you are the custodian of a Section / Unit, the Property Department prepares and counts its Annual Inventory each year. In My Inventory you can:"],
            list: [
                "See the list of the items under your custody.",
                "Print it, to sign the paper.",
                "Click Certify when the list is correct (an Administrator then locks it)."
            ],
            actions: ["inventory"]
        },
        {
            keys: ["how do i request", "how to request", "make a request", "submit a request", "create a request", "paano mag request", "paano magrequest", "paano humingi", "mag request", "magrequest", "humingi", "request ng", "requisition form", "how to ask for"],
            lines: ["To ask for supplies or equipment:"],
            list: [
                "1. Open Create Requisition (the \"Requisition Form\" tab).",
                "2. Fill in the Date, Department / Office, Representative Name, Position and Purpose.",
                "3. In \"Particulars\" pick an item from the list (or type it) and enter a quantity greater than zero.",
                "4. Click \"Submit Requisition\" (or \"Save Draft\" to finish later, or \"Preview\" to check it).",
                "5. In My Requests open the requisition and add the Department Head signature: type the Department Head name, then draw the signature or upload an image.",
                "6. The School Auditor reviews and signs, then the Director approves and signs. You get a notification (and a simulated email) at each step.",
                "7. When it is Ready for Release, the Property Department releases the items. Then confirm the receipt in My Requests."
            ],
            actions: ["request"]
        },
        {
            keys: ["pull out", "pullout", "pull-out", "i pull out", "ipaayos", "ipa repair", "repair", "ilipat ang"],
            lines: ["A Pull-Out Request is for taking a non-consumable item (laptop, printer...) out of its place, for example to be repaired:"],
            list: [
                "1. Open Request and choose the \"Pull-Out Request\" tab.",
                "2. Fill in the Requesting Party and the Office / Classroom.",
                "3. Pick the item, the Qty and write the Reason.",
                "4. Save or \"Save & Print\" (it prints 3 copies)."
            ],
            actions: ["request"]
        },
        {
            keys: ["acknowledgment receipt", "acknowledgement receipt", "my receipts", "receipt"],
            lines: ["An Acknowledgment Receipt is the paper that says you received the items. The Property Department prepares it when items are given to you. You can see and print yours in Request > \"Acknowledgment Receipt\" tab."],
            actions: ["request"]
        },
        {
            keys: ["history", "my requests", "difference between", "kasaysayan"],
            lines: ["My Requests shows all your forms with their status. History shows only the forms that are finished (released or rejected)."],
            actions: ["myrequests", "history"]
        },
        {
            keys: ["delete", "cancel", "edit", "change my request", "burahin", "kanselahin", "mali ang request", "wrong request"],
            lines: ["You can delete a requisition only while it is a Draft or waiting for the Department Head signature (a pull-out request: while it is Pending): open Create Requisition, find it in the list below the form and click Delete. A form cannot be edited, so delete it and submit a new one."],
            actions: ["request"]
        },
        {
            keys: ["who approves", "how do i approve", "how to approve", "who signs", "approval", "sino ang nag approve", "signature", "pirma"],
            lines: ["The Director (the Admin account) approves or rejects the requisition, after the Department Head and the School Auditor signed. Staff and the Auditor cannot approve. " + SIGNATORIES_TEXT]
        },
        {
            keys: ["not enough stock", "out of stock", "no stock", "kulang ang stock", "walang stock"],
            lines: ["If the stock is not enough you only get a warning when you submit. The Property Department cannot release the form until there is enough stock, so you can ask them when it will be available."]
        }
    ];

    const FAQ_ADMIN = [
        {
            keys: ["annual inventory", "annual", "physical count", "count the items", "certify the inventory", "verify the inventory", "taunang"],
            lines: ["The Annual Inventory is the yearly list of the items of a Section / Unit, like the paper \"Annual Inventory Report\":"],
            list: [
                "1. In Annual Inventory click \"Sections / Units\" and add the code (for example MRm102), the department, the section and the custodian (a Requester account).",
                "2. In Assets give each non-consumable item its Section / Unit (the IIN numbers are automatic), or use Import to paste the table from Excel.",
                "3. Click \"+ New Annual Inventory\", choose the year and the Section / Unit.",
                "4. Count: write the Counted quantity and the Remarks, then click Verify.",
                "5. Print it for the signatures. The custodian can also certify it online. An Administrator certifies it to lock it."
            ],
            actions: ["annual"]
        },
        {
            keys: ["import", "excel", "csv", "paste the table", "mag import", "upload items"],
            lines: ["To add many items at once, open Assets and click \"Import\":"],
            list: [
                "1. Copy the table from Excel with its first row of titles (Item, Qty, Brand, Model, Make, Color, Size, Serial, Unit Price, Date, Remarks...) and paste it, or choose a .csv file.",
                "2. Choose the Section / Unit (or add a \"Unit Code\" column), then click Check.",
                "3. If there is no problem, click Import. The IIN numbers follow the order of the rows."
            ],
            actions: ["assets"]
        },
        {
            keys: ["iin", "what is the iin", "what is iin", "what is an iin", "ano ang iin", "iin number", "iin numbers", "item inventory number", "inventory number", "inventory no"],
            lines: ["The IIN (Item Inventory Number) is given automatically to every non-consumable item of a Section / Unit, and it continues in that unit. For example, 2 air-conditioners get MRm102-001-002 and the next item gets MRm102-003. A number is never used again."],
            actions: ["assets"]
        },
        {
            keys: ["pull out", "pullout", "pull-out", "for pull out", "pulled out", "how do i pull out", "pull out a unit"],
            lines: ["Pull-Out Management takes specific physical units out of service:"],
            list: [
                "1. Open Pull-Out Management and click New Pull-Out Record.",
                "2. Search and select the units, choose the reason and the condition, and add the supporting information.",
                "3. The units become For Pull-Out.",
                "4. Open the record and click Process pull-out. The units become Pulled Out. Units and their history are never deleted.",
                "A record that is still For Pull-Out can be cancelled with a reason. A pull-out request from a Requester that you release in Request Management also leaves a record."
            ]
        },
        {
            keys: ["staff", "what can staff", "role", "roles", "permission", "admin and staff", "administrator and staff"],
            lines: ["There are four roles in the system:"],
            list: [
                "Administrator (the Director): approves or rejects requisitions and signs as Director, manages users, can do everything.",
                "Staff: manages inventory, assets, issuance and release, and can open the Audit Trail. Staff cannot approve, reject or sign as Director, delete, certify an annual inventory, or open Users.",
                "Auditor: has a separate dashboard. Reviews requisitions and signs as School Auditor only.",
                "Requester: creates requisitions, records the Department Head signature and confirms receipt."
            ]
        },
        {
            keys: ["approve", "release", "reject", "paano mag approve", "paano mag release", "process a request", "review a request", "review request", "how do i review", "how to review"],
            lines: ["The steps of a requisition:"],
            list: [
                "1. The Requester submits it and records the Department Head signature.",
                "2. The School Auditor reviews the items and signs (Auditor account).",
                "3. The Director (Admin account only) opens Request Management, clicks Review, checks the items and the Stock check, then clicks \"Approve and Sign\" or \"Reject\" (with a reason). Staff cannot do this.",
                "4. When the three signatures are complete and the Director approved, the status becomes Ready for Release.",
                "5. Staff open the requisition in the Release Queue and click Prepare release. For equipment they select the specific Available units; for consumables they enter the quantity (checked against the stock). The inventory changes only when they confirm, and each release makes an acknowledgment receipt (PROP-ARII). The Admin supervises the queue.",
                "6. If only part was released the status is Partially Released and the rest is released later (or Staff close the release with a reason). The Requester confirms receipt and the requisition is Completed."
            ],
            actions: ["requests"]
        },
        {
            keys: ["issue a receipt", "acknowledgment receipt", "acknowledgement receipt", "new receipt", "issuance", "receipt", "paano gumawa ng receipt"],
            lines: ["To prepare an Acknowledgment Receipt, open Issuance and click \"+ New Receipt\":"],
            list: [
                "1. Choose the Requester account that gets the receipt (the name is filled in).",
                "2. Pick the items from the inventory and enter the quantities.",
                "3. If it is for a released requisition, enter its number and click \"Load items\" (the stock is not changed again).",
                "4. Save or \"Save & Print\". The Requester sees the receipt in his or her own pages."
            ],
            actions: ["issuance"]
        },
        {
            keys: ["add asset", "new asset", "add item", "inventory", "magdagdag ng asset", "add an asset", "restock"],
            lines: ["In Assets click \"+ Add Asset\" and choose the Type:"],
            list: [
                "Consumable (supplies): enter the Stock on Hand, the unit, the price and the reorder level.",
                "Non-consumable (equipment): enter the brand, serial number, condition and total quantity.",
                "To restock supplies, edit the item and raise the Stock on Hand."
            ],
            actions: ["assets"]
        },
        {
            keys: ["repair done", "finished repair", "tapos na ang repair", "under maintenance", "maintenance"],
            lines: ["Open Assets, click Edit on the item and change the numbers: correct \"Issued\" if the count is wrong, and lower \"Under Maintenance\" when a repair is done. The units left are Available."],
            actions: ["assets"]
        },
        {
            keys: ["report", "reports", "ulat"],
            lines: ["In Reports click \"+ Generate Report\", choose the type (Request, Requisition Cost, Issuance, Audit Trail, Inventory or User), the dates if needed, and click \"Generate & Print\". Choose \"Save as PDF\" in the print window to keep a PDF."],
            actions: ["reports"]
        },
        {
            keys: ["add user", "new user", "create account", "account", "user account", "mag add ng user", "inactive"],
            lines: ["In Users click \"+ Add User\", fill in the name, email, role and password. An Inactive account cannot log in. The system always keeps at least one active Administrator."],
            actions: ["users"]
        },
        {
            keys: ["audit", "log", "activity", "history of changes"],
            lines: ["The Audit Trail lists every login, submitted form, status change and stock change. It is read-only."],
            actions: ["audit"]
        },
        {
            keys: ["cannot release", "can not release", "can t release", "can t i release", "why can t i release", "why cant i release", "cant release", "unable to release", "not able to release", "won t release", "release failed", "not enough stock", "stock is not enough", "hindi ma release", "hindi mai release", "kulang ang stock"],
            lines: ["A requisition appears in the Release Queue only when it is Ready for Release or Partially Released (three signatures and the Director approval complete). Only Staff make the release, and the stock or the units must be enough. Ask me \"Why is 26-001 not ready for release?\" to see what is missing. If the stock is not enough, use Stock In or Adjust in Inventory Management, or reject the requisition."],
            actions: ["assets"]
        }
    ];

    const FAQ_AUDITOR = [
        {
            keys: ["what can the auditor", "auditor do", "auditor role", "my role", "what can i do", "permission", "can i approve", "how do i approve", "how to approve", "can i release", "ano ang gawain"],
            lines: ["As the School Auditor you can:"],
            list: [
                "See the requisitions that reached the Auditor stage.",
                "Review the item descriptions and quantities, and mark the requisition as reviewed.",
                "Sign as School Auditor (your name comes from your account).",
                "Open your Review History.",
                "You cannot approve or reject, release items, change the inventory, manage users, or edit a requisition."
            ],
            actions: ["review"]
        },
        {
            keys: ["how do i review", "how to review", "review a requisition", "mark as reviewed", "sign as auditor", "how do i sign", "how to sign", "what do i sign", "what do i review", "paano mag review"],
            lines: ["To review and sign a requisition:"],
            list: [
                "1. Open Requisition Review and click \"Review\" on the requisition.",
                "2. Check the items, the quantities, the purpose and the Department Head signature.",
                "3. Click \"Mark as Reviewed\" (you can add notes) and confirm.",
                "4. Click \"Sign as Auditor\". Your name comes from your account. Draw the signature, or upload a PNG or JPG image (up to 2 MB), then click Confirm and Save.",
                "5. The requisition goes to the Director for approval."
            ],
            actions: ["review"]
        },
        {
            keys: ["review history", "what did i review", "what did i sign", "my history", "history"],
            lines: ["Review History lists the requisitions that you reviewed or signed. You can search, filter by date and export a CSV."],
            actions: ["history"]
        }
    ];

    const FAQ_SIGN_METHODS = {
        keys: ["e sign", "esign", "e upload", "eupload", "upload signature", "draw signature", "signature image", "how do i draw"],
        lines: ["There are two ways to add a signature:"],
        list: [
            "E-Sign: draw the signature in the box with a mouse, a finger or a stylus. Use Clear / Redraw to start again, then Preview.",
            "E-Upload: choose a PNG, JPG or JPEG image of a handwritten signature (up to 2 MB). You can replace or remove it before saving.",
            "Nothing is saved until you click Confirm and Save and confirm the question."
        ]
    };
    FAQ_COMMON.push(FAQ_SIGN_METHODS);
    FAQ_COMMON.push({
        keys: ["contact", "who can i contact", "help desk", "phone number", "email address", "where is the office", "what is this system", "about this system", "who do i ask"],
        get lines() {
            const g = typeof settingsGet === "function" ? settingsGet("general", {}) : {};
            const out = [(g.systemName || "Custodian Management System") + " of " + (g.institution || "New Era University") + " (" + (g.office || "Property Department") + ")."];
            if (g.description) out.push(g.description);
            const c = [g.contactEmail && "Email: " + g.contactEmail, g.contactPhone && "Phone: " + g.contactPhone, g.contactAddress && "Address: " + g.contactAddress].filter(Boolean);
            out.push(c.length ? "Contact: " + c.join(". ") + "." : "No contact information has been set yet. The Admin can add it in System Settings.");
            return out;
        }
    });
    FAQ_COMMON.push({
        keys: ["what can the auditor", "auditor do", "who is the auditor", "school auditor do", "role of the auditor"],
        lines: ["The School Auditor has a separate dashboard. The Auditor reviews the items and quantities of a requisition and signs as School Auditor. The Auditor cannot approve or reject, release items, change the inventory, manage users or edit a requisition."]
    });

    function faqAnswer(plain) {

        const lists = auditorPage ? [FAQ_AUDITOR, FAQ_COMMON] : adminPage ? [FAQ_ADMIN, FAQ_COMMON] : [FAQ_REQUESTER, FAQ_COMMON];

        let best = null;
        let bestScore = 0;

        lists.forEach(function (list, listIndex) {

            list.forEach(function (item) {

                let score = 0;

                item.keys.forEach(function (k) {
                    if (has(plain, k)) score += k.length;
                });

                // the answers of the user's own side win when the score is the same
                if (score > bestScore || (score === bestScore && score > 0 && listIndex === 0 && best && best.listIndex !== 0)) {
                    bestScore = score;
                    best = { item: item, listIndex: listIndex };
                }

            });

        });

        if (!best || bestScore < 4) return null;

        return say(best.item.lines, {
            list: [].concat(best.item.list || []),
            actions: (best.item.actions || []).map(link)
        });

    }


    // ----- the main brain: one text in, one answer out -----
    function reply(text) {

        const raw = String(text).trim();
        const plain = plainText(raw);
        const asset = findAsset(plain);
        const type = pickFormType(plain);
        const numberMatch = raw.match(/\b(\d{2})\s?-\s?(\d{1,})\b/);
        const assetCode = raw.match(/\b(?:DEMO-)?AST\d+\b/i);

        // greetings and thanks
        if (hasAny(plain, ["hi", "hello", "hey", "kumusta", "magandang", "good morning", "good afternoon", "good evening"]) && plain.trim().split(" ").length <= 4) {

            const name = firstName();

            return say("Hello" + (name ? ", " + name : "") + "! I am the Custodian Assistant. Ask me how to do something, the status of a form, or the stock of an item.", {
                chips: defaultChips()
            });

        }

        if (hasAny(plain, ["thank", "thanks", "salamat", "ok na", "okay na"]) && plain.trim().split(" ").length <= 5) {
            return say("You are welcome! Ask me anything else.", { chips: defaultChips() });
        }

        if (hasAny(plain, ["bye", "paalam"]) && plain.trim().split(" ").length <= 3) {
            return say("Goodbye!");
        }

        // "Why is it not ready for release?" (with or without a Control No.)
        if (hasAny(plain, ["not ready", "isn t ready", "isnt ready", "why can t", "why cant", "why is it not", "why isn t", "why isnt", "hindi pa ready", "bakit hindi", "not yet released"]) &&
            hasAny(plain, ["release", "ready", "released", "requisition", "request", "form"]) &&
            !hasAny(plain, ["how do i release", "how to release", "paano mag release", "what is", "what does", "mean"])) {
            return answerWhyNotReady(numberMatch ? numberMatch[1] + "-" + numberMatch[2].padStart(3, "0") : null);
        }

        // the Auditor's queue
        if (auditorPage && hasAny(plain, ["pending", "waiting", "to review", "to sign", "for me", "my queue", "needs my", "need my", "pending review"]) && !hasAny(plain, ["what is", "mean"])) {
            return answerAuditorQueue();
        }

        // the status of a form (the text has a Control No.)
        if (numberMatch) {
            return answerStatus(numberMatch[1] + "-" + numberMatch[2].padStart(3, "0"), type);
        }

        // a question about WHO signs or approves is a question about the process, not a request for a list
        if (hasAny(plain, ["who signs", "who sign", "who approves", "who will sign", "who is signing", "signature", "signatures", "sino ang pipirma", "sino ang nag approve", "pirma"])) {

            const process = faqAnswer(plain);

            if (process) return process;

        }

        // an asset code, or the name of an item with a word about stock
        if (assetCode && inventory()) {

            const found = inventory().find(function (a) { return a.id.toUpperCase() === assetCode[0].toUpperCase(); });

            return found ? answerStock(found) : say("I cannot find the asset " + assetCode[0].toUpperCase() + ".");

        }

        const stockWords = ["stock", "available", "availability", "meron", "mayroon", "may ", "natitira", "ilan ang", "ilan pa", "left", "remaining", "inventory", "how many"];

        if (asset && (hasAny(plain, stockWords) || plain.trim().split(" ").length <= 3)) {
            return answerStock(asset);
        }

        // the Annual Inventory (a status question, not "how do I")
        if (!auditorPage && hasAny(plain, ["annual inventory", "my inventory", "taunang inventory"]) &&
            hasAny(plain, ["status", "how many", "ilan", "waiting", "to certify", "pending", "list", "show", "do i have", "mayroon", "meron", "ready"]) &&
            !hasAny(plain, ["how do i", "how to", "paano"])) {
            return answerAnnual();
        }

        // low stock and numbers (Admin)
        if (hasAny(plain, ["low stock", "restock", "reorder", "kulang", "paubos", "nauubos", "running out"])) {
            return adminPage
                ? answerLowStock()
                : say("The stock is managed by the Property Department. You can ask me the stock of an item, for example \"Stock of bond paper\".");
        }

        if (adminPage && hasAny(plain, ["how many users", "how many assets", "numbers", "summary", "overview", "ilan ang user", "ilan ang asset", "today", "ngayon"])) {
            return answerCounts();
        }

        // lists of forms ("my pending forms", "pending requests", "ilan ang pending")
        const statusWords = { "partially released": "Partially Released", "ready for release": "Ready for Release", completed: "Completed", draft: "Draft", pending: "Pending", approved: "Approved", released: "Released", rejected: "Rejected" };
        const statusFound = Object.keys(statusWords).find(function (w) { return has(plain, w); });
        const listWords = ["how many", "ilan", "list", "show", "ipakita", "my ", "ko", "mga", "forms", "requests", "request ko", "all", "lahat", "latest", "recent", "bilang"];

        if (statusFound && hasAny(plain, listWords) && !hasAny(plain, ["what is", "what does", "mean", "ibig sabihin", "ano ang pending"])) {
            return answerList(statusWords[statusFound], type);
        }

        if (hasAny(plain, ["my forms", "my requests", "my request", "forms ko", "request ko", "aking", "all my", "list my", "show my", "my receipts", "my pull out", "my requisition"]) ||
            (type && hasAny(plain, ["my", "ko", "list", "show", "ilan"]))) {
            return answerList(null, type);
        }

        if (adminPage && hasAny(plain, ["latest request", "recent request", "new request", "bagong request"])) {
            return answerList(null, type);
        }

        // opening a page
        if (hasAny(plain, ["open", "go to", "punta", "buksan", "take me", "dalhin"])) {

            const targets = auditorPage
                ? [["history", ["review history", "history"]], ["review", ["requisition review", "review", "requisitions"]], ["dashboard", ["dashboard"]]]
                : adminPage
                ? [["annual", ["annual inventory", "annual"]], ["requests", ["request management", "requests"]], ["assets", ["assets", "inventory"]], ["issuance", ["issuance", "receipt"]], ["reports", ["reports", "report"]], ["users", ["users", "user"]], ["audit", ["audit"]], ["dashboard", ["dashboard"]]]
                : [["inventory", ["my inventory", "inventory"]], ["myrequests", ["my requests"]], ["history", ["history"]], ["dashboard", ["dashboard"]], ["request", ["request", "requisition", "pull out", "receipt"]]];

            const hit = targets.find(function (t) { return hasAny(plain, t[1]); });

            if (hit) return answerPageLink(hit[0]);

        }

        // how to do things
        const faq = faqAnswer(plain);

        if (faq) return faq;

        // an item name alone, or a "status" question without a number
        if (hasAny(plain, ["status"])) {
            return say("Please tell me the Control No. of the form, for example \"Status of 26-001\".", {
                chips: roleChips("status")
            });
        }

        return say("I am sorry, I did not understand that. I can help with these:", {
            list: auditorPage
                ? ["How to review and sign a requisition", "The requisitions waiting for you", "Why a requisition is not ready for release", "What the Auditor can and cannot do"]
                : adminPage
                ? ["How to approve, release or reject a request", "The status of a form (for example 26-001)", "The stock of an item, or the low stock list", "How to issue a receipt, add an asset, import items, or do the annual inventory"]
                : ["How to request items or make a pull-out request", "The status of your form (for example 26-001)", "The stock of an item", "Your pending forms, receipts, history and your Annual Inventory"],
            chips: defaultChips()
        });

    }

    function defaultChips() {

        return roleChips("default");

    }


    // ========================================
    // THE CHAT WINDOW
    // ========================================

    let box, messages, input, chipsBox, button;

    function styles() {

        const style = document.createElement("style");

        style.textContent =
            ".cb-button{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:#16834b;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:3400;display:flex;align-items:center;justify-content:center;}" +
            ".cb-admin .cb-button{background:#edae0f;color:#000;}" +
            ".cb-button svg{width:26px;height:26px;}" +
            ".cb-box{position:fixed;right:18px;bottom:86px;width:360px;max-width:calc(100vw - 36px);height:480px;max-height:calc(100vh - 110px);background:#fff;color:#222;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:3400;display:none;flex-direction:column;overflow:hidden;font-family:inherit;border:1px solid #ddd;}" +
            ".cb-admin .cb-box{background:#222;color:#fff;border-color:#444;}" +
            ".cb-head{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:#16834b;color:#fff;font-weight:600;font-size:15px;}" +
            ".cb-admin .cb-head{background:#edae0f;color:#000;}" +
            ".cb-head small{display:block;font-weight:400;font-size:11px;opacity:.85;}" +
            ".cb-head button{background:none;border:none;color:inherit;font-size:24px;cursor:pointer;line-height:1;}" +
            ".cb-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.45;}" +
            ".cb-msg{max-width:88%;padding:9px 12px;border-radius:12px;word-wrap:break-word;}" +
            ".cb-msg p{margin:0 0 5px;}" +
            ".cb-msg p:last-child{margin-bottom:0;}" +
            ".cb-msg ul{margin:4px 0 4px 16px;padding:0;}" +
            ".cb-msg li{margin-bottom:3px;}" +
            ".cb-bot{align-self:flex-start;background:#f0f2f1;color:#222;}" +
            ".cb-admin .cb-bot{background:#333;color:#fff;}" +
            ".cb-user{align-self:flex-end;background:#16834b;color:#fff;}" +
            ".cb-admin .cb-user{background:#edae0f;color:#000;}" +
            ".cb-action{display:inline-block;margin:6px 6px 0 0;padding:6px 12px;border-radius:16px;background:#16834b;color:#fff !important;text-decoration:none;font-size:12px;font-weight:600;}" +
            ".cb-admin .cb-action{background:#edae0f;color:#000 !important;}" +
            ".cb-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;}" +
            ".cb-chip{border:1px solid #16834b;color:#16834b;background:transparent;border-radius:16px;padding:5px 11px;font-size:12px;cursor:pointer;}" +
            ".cb-admin .cb-chip{border-color:#edae0f;color:#edae0f;}" +
            ".cb-chip:hover{background:rgba(22,131,75,.12);}" +
            ".cb-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(128,128,128,.3);}" +
            ".cb-form input{flex:1;min-width:0;padding:10px 12px;border-radius:20px;border:1px solid #ccc;font-size:13px;outline:none;background:#fff;color:#222;}" +
            ".cb-admin .cb-form input{background:#333;color:#fff;border-color:#555;}" +
            ".cb-form button{border:none;border-radius:20px;padding:0 16px;background:#16834b;color:#fff;font-weight:600;cursor:pointer;}" +
            ".cb-admin .cb-form button{background:#edae0f;color:#000;}" +
            ".cb-typing{opacity:.6;font-style:italic;}" +
            "@media print{.cb-button,.cb-box{display:none !important;}}";

        document.head.appendChild(style);

    }

    // ----- saved conversation (it stays while the user goes from page to page) -----
    function loadLog() {
        try {
            return JSON.parse(sessionStorage.getItem(LOG_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveLog(log) {
        try {
            sessionStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
        } catch (e) { /* ignore */ }
    }

    function addMessage(from, content, save) {

        const div = document.createElement("div");

        div.className = "cb-msg " + (from === "user" ? "cb-user" : "cb-bot");

        if (from === "user") {
            div.textContent = content.text;
        } else {

            (content.lines || []).forEach(function (t) {
                const p = document.createElement("p");
                p.textContent = t;
                div.appendChild(p);
            });

            if (content.list && content.list.length) {
                const ul = document.createElement("ul");
                content.list.forEach(function (t) {
                    const li = document.createElement("li");
                    li.textContent = t;
                    ul.appendChild(li);
                });
                div.appendChild(ul);
            }

            (content.actions || []).forEach(function (a) {
                const link = document.createElement("a");
                link.className = "cb-action";
                link.href = a.href;
                link.textContent = a.label;
                div.appendChild(link);
            });

        }

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        if (save) {
            const log = loadLog();
            log.push({ from: from, content: content });
            saveLog(log);
        }

        return div;

    }

    function showChips(chips) {

        chipsBox.innerHTML = "";

        (chips && chips.length ? chips : []).forEach(function (text) {

            const chip = document.createElement("button");

            chip.type = "button";
            chip.className = "cb-chip";
            chip.textContent = text;
            chip.addEventListener("click", function () { ask(text); });
            chipsBox.appendChild(chip);

        });

    }

    // ----- AI answer text -> the chat bubble format { lines, list, actions } -----
    function aiAnswer(text) {

        const out = say([], {});
        const clean = String(text).replace(/\r/g, "").replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s.,;:!?)]|$)/gm, "$1$2").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");

        clean.split("\n").forEach(function (raw) {

            const line = raw.trim().replace(/^#{1,6}\s+/, "");

            if (!line) return;

            const item = /^(?:[-*\u2022]\s+|\d+[.)]\s+)(.*)$/.exec(line);

            if (item) out.list.push(item[1]); else out.lines.push(line);

        });

        // a button for each page the answer talks about (at most two)
        Object.keys(PAGES).forEach(function (key) {
            if (out.actions.length < 2 && clean.toLowerCase().indexOf(PAGES[key][0].toLowerCase()) !== -1 && PAGES[key][0] !== "Dashboard") {
                out.actions.push(link(key));
            }
        });

        if (!out.lines.length && !out.list.length) out.lines.push(clean.trim());

        return out;

    }

    let busy = false;
    let noticeShown = false;

    // the built-in helper answers when the AI cannot (the reason is told once)
    function helperAnswer(text, why) {

        let answer;

        try {
            answer = reply(text);
        } catch (e) {
            console.error(e);
            answer = say("Sorry, something went wrong. Please try again.");
        }

        if (why && !noticeShown) {
            noticeShown = true;
            answer.lines.unshift(why + " This is a basic answer.");
        }

        return answer;

    }

    function finish(typing, answer) {

        typing.remove();
        addMessage("bot", answer, true);
        showChips(answer.chips);

        busy = false;
        input.disabled = false;
        input.focus();

    }

    function ask(text) {

        text = String(text || "").trim();

        if (!text || busy) return;

        busy = true;
        input.value = "";
        input.disabled = true;
        chipsBox.innerHTML = "";

        addMessage("user", { text: text }, true);

        const typing = document.createElement("div");

        typing.className = "cb-msg cb-bot cb-typing";
        typing.textContent = "typing...";
        typing.setAttribute("aria-live", "polite");
        messages.appendChild(typing);
        messages.scrollTop = messages.scrollHeight;

        // no server connection (for example the page was opened as a plain file): helper only
        if (typeof cmsApi !== "function") {
            setTimeout(function () { finish(typing, helperAnswer(text, "")); }, 350);
            return;
        }

        cmsApi("POST", "api/chat", { message: text, page: location.pathname }).then(function (res) {

            if (res.ok && res.data && res.data.reply) {
                finish(typing, aiAnswer(res.data.reply));
                return;
            }

            if (res.status === 401 || res.status === 419) {
                finish(typing, say("Your session has ended. Please log in again."));
                return;
            }

            const why = res.status === 422
                ? "" // a validation message (for example too long): show it, then the helper
                : ((res.data && res.data.message) || "The AI assistant is not available right now.");
            const note = res.status === 422 ? ((res.data && res.data.message) || "Please shorten your question.") : "";

            if (note) { finish(typing, say(note)); return; }

            finish(typing, helperAnswer(text, why));

        }).catch(function () {
            finish(typing, helperAnswer(text, "I could not reach the server."));
        });

    }

    function setOpen(open) {

        box.style.display = open ? "flex" : "none";

        try {
            sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
        } catch (e) { /* ignore */ }

        if (open) {
            input.focus();
            messages.scrollTop = messages.scrollHeight;
        }

    }

    function init() {

        if (!document.body) return;

        // the conversation belongs to the person who is logged in
        if (sessionStorage.getItem(OWNER_KEY) !== myEmail()) {
            sessionStorage.removeItem(LOG_KEY);
            sessionStorage.removeItem(OPEN_KEY);
            sessionStorage.setItem(OWNER_KEY, myEmail());
        }

        styles();

        const wrap = document.createElement("div");

        wrap.className = (adminPage || auditorPage) ? "cb-admin" : "";
        wrap.innerHTML =
            '<button type="button" class="cb-button" title="Chat with the assistant" aria-label="Open the chat assistant">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            "</button>" +
            '<div class="cb-box" role="dialog" aria-label="Custodian Assistant">' +
                '<div class="cb-head"><div>Custodian Assistant<small>Ask me about forms, status and stock</small></div><button type="button" aria-label="Close the chat">&times;</button></div>' +
                '<div class="cb-messages"></div>' +
                '<div class="cb-chips"></div>' +
                '<form class="cb-form"><input type="text" placeholder="Type your question..." autocomplete="off"><button type="submit">Send</button></form>' +
            "</div>";

        document.body.appendChild(wrap);

        button = wrap.querySelector(".cb-button");
        box = wrap.querySelector(".cb-box");
        messages = wrap.querySelector(".cb-messages");
        chipsBox = wrap.querySelector(".cb-chips");
        input = wrap.querySelector("input");

        button.addEventListener("click", function () {
            setOpen(box.style.display !== "flex");
        });

        wrap.querySelector(".cb-head button").addEventListener("click", function () { setOpen(false); });

        wrap.querySelector("form").addEventListener("submit", function (e) {
            e.preventDefault();
            ask(input.value);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && box.style.display === "flex") setOpen(false);
        });

        // bring the conversation back, or start a new one
        const log = loadLog();

        function greet() {
            const name = firstName();
            addMessage("bot", say("Hello" + (name ? ", " + name : "") + "! I am the Custodian Assistant. Ask me how to do something, the status of a form, or the stock of an item.", {}), true);
        }

        if (log.length) {
            log.forEach(function (m) { addMessage(m.from, m.content, false); });
        } else if (typeof cmsApi === "function") {
            // a new tab or a new login: restore the saved conversation from Laravel
            greet();
            cmsApi("GET", "api/chat/history").then(function (res) {
                const saved = (res.ok && res.data && res.data.messages) || [];
                if (!saved.length) return;
                messages.innerHTML = "";
                try { sessionStorage.removeItem(LOG_KEY); } catch (e) { /* ignore */ }
                saved.forEach(function (m) {
                    addMessage(m.from, m.from === "user" ? { text: m.text } : aiAnswer(m.text), true);
                });
            }).catch(function () { /* the greeting stays */ });
        } else {
            greet();
        }

        showChips(defaultChips());

        if (sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
