// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED REALTIME + NOTIFICATIONS
//
//   addNotification(to, message, ref)   save a notification
//        to      "admin" (all admins) or the email of a requester
//        ref     { type, controlNo } of the form (optional)
//   onDataChange(["forms"], handler)    run handler when another open
//                                       window/tab changes that data
//
// It also puts a bell with the unread notifications in the navbar of the pages
// that load this file, and shows a small message when a new one arrives.
// It also shows the name of the person who is logged in at the top right of the page
// (for example "Denriel Dinogan - Requester"). The name comes from the account in Admin > Users.
//
// HOW IT WORKS NOW: the browser tells every other open tab of the same browser
// when the saved data changes (the "storage" event). That is why the Admin and the
// Requester must use the same browser to see each other live. With Laravel, this
// part is replaced by broadcasting (Laravel Reverb + Echo), see docs/DATABASE_DESIGN.md.
// Put <script src="../../Shared/realtime.js"></script> before the page script.
// ========================================

const NOTIFICATIONS_KEY = "notifications";
const NOTIFICATIONS_LIMIT = 200;


// ========================================
// DATA
// ========================================

function rtRead(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
        return [];
    }
}

// The name of the logged-in user, taken from his or her account (Admin > Users). "" if unknown.
function currentUserName() {

    const email = (sessionStorage.getItem("userEmail") || "").toLowerCase();

    if (!email) return "";

    const user = rtRead("users").find(function (u) {
        return String(u.email).toLowerCase() === email;
    });

    return user && user.name ? String(user.name).trim() : "";

}

function addNotification(to, message, ref, demo) {

    // System Settings > Notifications: the simulated notifications can be switched off
    if (typeof notifyAllowed === "function" && !notifyAllowed("enabled")) return;


    if (!to || !message) return;

    const list = rtRead(NOTIFICATIONS_KEY);

    list.push({
        id: Date.now() + "-" + Math.floor(Math.random() * 10000),
        date: new Date().toISOString(),
        to: String(to),
        message: String(message),
        ref: ref || null,
        demo: !!demo,        // demo notifications are the only ones resetDemoData() may remove
        readBy: []
    });

    while (list.length > NOTIFICATIONS_LIMIT) list.shift();

    try {
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn("Notification not saved:", e);
    }

}

// Run "handler" when another window changes one of the saved keys
function onDataChange(keys, handler) {

    window.addEventListener("storage", function (e) {

        if (e.storageArea && e.storageArea !== localStorage) return;

        // e.key is null when all the data was cleared
        if (e.key === null || keys.indexOf(e.key) !== -1) {
            handler(e.key);
        }

    });

}


// ========================================
// BELL IN THE NAVBAR
// ========================================

(function () {

    const auditorPage = /\/Auditor\//.test(location.pathname.replace(/\\/g, "/"));
    // the Auditor pages use the same dark layout and bell as the Admin pages
    const adminPage = auditorPage || /\/Admin\//.test(location.pathname.replace(/\\/g, "/"));

    let panel, badge, list, known = {};

    function me() {
        return (sessionStorage.getItem("userEmail") || "anonymous").toLowerCase();
    }

    function mine() {
        return rtRead(NOTIFICATIONS_KEY).filter(function (n) {
            if (auditorPage) return n.to === "auditor" || String(n.to).toLowerCase() === me();
            return adminPage ? n.to === "admin" : String(n.to).toLowerCase() === me();
        });
    }

    function unread(n) {
        return (n.readBy || []).indexOf(me()) === -1;
    }

    function linkFor(n) {

        // an Annual Inventory
        if (n.ref && n.ref.type === "annual") {
            return (adminPage ? "../AnnualInventory/annualinventory.html" : "../RequesterInventory/inventory.html") +
                "?open=" + encodeURIComponent(n.ref.controlNo);
        }

        if (auditorPage) {
            return n.ref ? "../RequisitionReview/review.html?open=" + encodeURIComponent(n.ref.controlNo) : null;
        }

        if (adminPage) {
            return n.ref
                ? "../RequestManagement/requestmanagement.html?open=" + encodeURIComponent(n.ref.type + "|" + n.ref.controlNo)
                : null;
        }

        return n.ref
            ? "../RequesterMyRequests/myrequests.html?open=" + encodeURIComponent(n.ref.type + "|" + n.ref.controlNo)
            : null;

    }

    function esc(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    }

    function ago(iso) {

        const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));

        if (seconds < 60) return "just now";
        if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
        if (seconds < 86400) return Math.floor(seconds / 3600) + " h ago";

        return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    }

    function markRead(ids) {

        const all = rtRead(NOTIFICATIONS_KEY);

        all.forEach(function (n) {
            if (ids.indexOf(n.id) !== -1 && unread(n)) {
                n.readBy = (n.readBy || []).concat([me()]);
            }
        });

        try {
            localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
        } catch (e) { /* ignore */ }

    }

    function go(n) {

        markRead([n.id]);

        const url = linkFor(n);

        if (url) {
            window.location.href = url;
        } else {
            refresh();
        }

    }

    // ----- list in the bell -----
    function refresh() {

        const items = mine().slice().reverse();
        const count = items.filter(unread).length;

        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count ? "block" : "none";

        list.innerHTML = "";

        if (items.length === 0) {
            list.innerHTML = '<div class="rt-empty">No notifications yet.</div>';
            return;
        }

        items.slice(0, 10).forEach(function (n) {

            const row = document.createElement("div");

            row.className = "rt-item" + (unread(n) ? " rt-unread" : "");
            row.innerHTML = "<div>" + esc(n.message) + '</div><small>' + esc(ago(n.date)) + "</small>";
            row.addEventListener("click", function () { go(n); });

            list.appendChild(row);

        });

    }

    // ----- small message at the corner when a new one arrives -----
    function toast(n) {

        let box = document.getElementById("rtToasts");

        if (!box) {
            box = document.createElement("div");
            box.id = "rtToasts";
            box.className = "rt-toasts";
            document.body.appendChild(box);
        }

        const el = document.createElement("div");

        el.className = "rt-toast";
        el.innerHTML = "<strong>New notification</strong><div>" + esc(n.message) + "</div>";
        el.addEventListener("click", function () { go(n); });

        box.appendChild(el);

        while (box.children.length > 3) box.removeChild(box.firstChild);

        setTimeout(function () { el.remove(); }, 6000);

    }

    function styles() {

        const style = document.createElement("style");

        style.textContent =
            ".rt-right{display:flex;align-items:center;gap:18px;}" +
            ".rt-bell{position:relative;}" +
            ".rt-bell>button{background:transparent;border:none;cursor:pointer;color:inherit;padding:4px;display:flex;position:relative;}" +
            ".rt-bell svg{width:22px;height:22px;}" +
            ".rt-badge{position:absolute;top:-4px;right:-6px;background:#dc3545;color:#fff;border-radius:10px;font-size:11px;font-weight:700;padding:1px 6px;display:none;line-height:16px;}" +
            ".rt-panel{position:absolute;right:0;top:36px;width:330px;max-width:85vw;max-height:420px;overflow:auto;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:2500;display:none;text-align:left;}" +
            ".rt-dark .rt-panel{background:#222;color:#fff;border-color:#444;}" +
            ".rt-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(128,128,128,.3);font-weight:600;font-size:14px;}" +
            ".rt-head button{background:none;border:none;color:#16834b;cursor:pointer;font-size:12px;font-weight:600;}" +
            ".rt-dark .rt-head button{color:#edae0f;}" +
            ".rt-item{padding:11px 14px;border-bottom:1px solid rgba(128,128,128,.2);cursor:pointer;font-size:13px;line-height:1.35;}" +
            ".rt-item:hover{background:rgba(128,128,128,.12);}" +
            ".rt-item small{display:block;margin-top:3px;opacity:.65;font-size:11px;}" +
            ".rt-unread{font-weight:600;border-left:3px solid #16834b;}" +
            ".rt-dark .rt-unread{border-left-color:#edae0f;}" +
            ".rt-empty{padding:22px;text-align:center;opacity:.6;font-size:13px;}" +
            ".rt-toasts{position:fixed;right:18px;bottom:88px;display:flex;flex-direction:column;gap:8px;z-index:3500;}" +
            ".rt-toast{background:#16834b;color:#fff;padding:12px 16px;border-radius:10px;max-width:320px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.3);cursor:pointer;}" +
            ".rt-toast strong{display:block;font-size:12px;opacity:.85;margin-bottom:2px;}" +
            ".rt-dark-page .rt-toast{background:#edae0f;color:#000;}" +
            "@media print{.rt-toasts,.rt-bell{display:none !important;}}";

        document.head.appendChild(style);

    }

    // ----- "Name - Role" at the top right, instead of only the role -----
    function showUserName() {

        const navbar = document.querySelector(".navbar");

        if (!navbar) return;

        const account = typeof currentRole === "function" ? currentRole() : "";
        const role = auditorPage ? "Auditor" : adminPage ? (account === "Staff" ? "Staff" : "Administrator") : "Requester";
        const name = currentUserName();

        // the name alone when the account name is just the role (for example "Requester")
        const text = !name || name.toLowerCase() === role.toLowerCase() ? role : name + " - " + role;

        // the label is the small element that only says Admin, Administrator or Requester (or an older "Name - Role")
        navbar.querySelectorAll("*").forEach(function (el) {

            if (el.children.length > 0) return;

            const current = el.textContent.trim();

            if (el.dataset.userLabel === "1" || /^(Admin|Administrator|Staff|Auditor|Requester)$/.test(current)) {
                el.dataset.userLabel = "1";
                el.textContent = text;
                el.title = text;
            }

        });

    }

    // the Users page calls this after saving, so the label of this same window changes too
    window.refreshUserLabel = showUserName;

    function init() {

        showUserName();

        // the name of the account was changed in another window
        onDataChange(["users"], showUserName);

        const navbar = document.querySelector(".navbar");

        if (!navbar || !navbar.lastElementChild) return;

        styles();

        if (adminPage) document.body.classList.add("rt-dark-page");

        const bell = document.createElement("div");

        bell.className = "rt-bell" + (adminPage ? " rt-dark" : "");
        bell.innerHTML =
            '<button type="button" title="Notifications" aria-label="Notifications">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
                '<span class="rt-badge"></span>' +
            "</button>" +
            '<div class="rt-panel"><div class="rt-head"><span>Notifications</span><button type="button">Mark all as read</button></div><div class="rt-list"></div></div>';

        panel = bell.querySelector(".rt-panel");
        badge = bell.querySelector(".rt-badge");
        list = bell.querySelector(".rt-list");

        bell.querySelector("button").addEventListener("click", function (e) {
            e.stopPropagation();
            panel.style.display = panel.style.display === "block" ? "none" : "block";
        });

        bell.querySelector(".rt-head button").addEventListener("click", function (e) {
            e.stopPropagation();
            markRead(mine().map(function (n) { return n.id; }));
            refresh();
        });

        panel.addEventListener("click", function (e) { e.stopPropagation(); });
        document.addEventListener("click", function () { panel.style.display = "none"; });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") panel.style.display = "none"; });

        // put the bell next to the role label at the right of the navbar
        const last = navbar.lastElementChild;
        const wrap = document.createElement("div");

        wrap.className = "rt-right";
        navbar.replaceChild(wrap, last);
        wrap.appendChild(bell);
        wrap.appendChild(last);

        mine().forEach(function (n) { known[n.id] = true; });
        refresh();

        // a notification arrived from another window
        onDataChange([NOTIFICATIONS_KEY], function () {

            mine().forEach(function (n) {
                if (!known[n.id]) {
                    known[n.id] = true;
                    if (unread(n)) toast(n);
                }
            });

            refresh();

        });

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
