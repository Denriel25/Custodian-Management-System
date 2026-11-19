// REQUESTER - NOTIFICATION CENTER (own notifications only; read / unread; timestamps)
const NOTE_KEY = "notifications";
let notePage = 1;
const NOTE_PER_PAGE = 8;

function noteLoadAll() {
    try { return JSON.parse(localStorage.getItem(NOTE_KEY)) || []; } catch (e) { return []; }
}

function noteMine() {
    return noteLoadAll().filter(function (n) { return String(n.to).toLowerCase() === wfMe(); }).reverse();
}

function noteUnread(n) { return (n.readBy || []).indexOf(wfMe()) === -1; }

function noteMark(ids) {
    const all = noteLoadAll();
    all.forEach(function (n) { if (ids.indexOf(n.id) !== -1 && noteUnread(n)) n.readBy = (n.readBy || []).concat([wfMe()]); });
    localStorage.setItem(NOTE_KEY, JSON.stringify(all));
}

function noteRender() {
    const filter = document.getElementById("nFilter").value;
    const rows = noteMine().filter(function (n) { return filter === "all" || (filter === "unread") === noteUnread(n); });
    const pages = Math.max(1, Math.ceil(rows.length / NOTE_PER_PAGE));
    if (notePage > pages) notePage = pages;
    const slice = rows.slice((notePage - 1) * NOTE_PER_PAGE, notePage * NOTE_PER_PAGE);

    document.getElementById("nList").innerHTML = slice.length ? slice.map(function (n) {
        const u = noteUnread(n);
        return '<div class="wf-list-item" style="display:flex;gap:10px;justify-content:space-between;align-items:center">' +
            "<div>" + (u ? "<b>" + wfEsc(n.message) + "</b>" : wfEsc(n.message)) + "<small>" + wfEsc(wfFormatDate(n.date, true)) + (u ? " &middot; unread" : " &middot; read") + "</small></div>" +
            '<div style="display:flex;gap:6px">' + (n.ref ? '<button class="wf-btn sm" data-open="' + wfEsc(n.ref.controlNo) + '" data-id="' + n.id + '">View</button>' : "") +
            (u ? '<button class="wf-btn sm" data-read="' + n.id + '">Mark as read</button>' : "") + "</div></div>";
    }).join("") : '<div class="wf-empty">No notifications.</div>';

    const pager = document.getElementById("nPager");
    pager.innerHTML = "<span>" + rows.length + " notification(s) &middot; page " + notePage + " of " + pages + '</span><button type="button" data-d="-1"' + (notePage <= 1 ? " disabled" : "") +
        '>Prev</button><button type="button" data-d="1"' + (notePage >= pages ? " disabled" : "") + ">Next</button>";
    pager.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { notePage += parseInt(b.dataset.d, 10); noteRender(); }); });

    document.querySelectorAll("[data-read]").forEach(function (b) { b.addEventListener("click", function () { noteMark([b.dataset.read]); noteRender(); }); });
    document.querySelectorAll("[data-open]").forEach(function (b) {
        b.addEventListener("click", function () {
            noteMark([b.dataset.id]);
            const f = wfMyRequisitions().find(function (x) { return x.controlNo === b.dataset.open; });
            if (f) wfRequesterDetails(f.id, noteRender); else wfToast("This record is not available to your account.", true);
            noteRender();
        });
    });
}

function goToPage(name) {
    const pages = { "Dashboard": "../RequesterDashboard/dashboard.html", "Request": "../Request/request.html", "My Requests": "../RequesterMyRequests/myrequests.html",
        "History": "../RequesterHistory/history.html", "My Inventory": "../RequesterInventory/inventory.html" };
    if (pages[name]) location.href = pages[name];
}

function logout() {
    if (!confirm("Are you sure you want to logout?")) return;
    if (typeof cmsSignOut === "function") cmsSignOut(); sessionStorage.clear();
    location.href = "../RequesterLogin/login.html";
}

document.addEventListener("DOMContentLoaded", function () {
    noteRender();
    document.getElementById("nFilter").addEventListener("change", function () { notePage = 1; noteRender(); });
    document.getElementById("markAll").addEventListener("click", function () { noteMark(noteMine().map(function (n) { return n.id; })); noteRender(); });
    document.getElementById("showMail").addEventListener("click", wfOpenEmailOutbox);
    if (typeof onDataChange === "function") onDataChange([NOTE_KEY], noteRender);
});
