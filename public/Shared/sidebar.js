// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED SIDEBAR BEHAVIOUR
// The menu items are real links (see each page). This file only
//   - makes the Logout item work with the keyboard,
//   - marks the open page (aria-current) if the page did not,
//   - scrolls the open item into view in a long menu.
// Logout itself is done by each page's existing handler (it calls cmsSignOut() from laravel-bridge.js).
// ========================================
(function () {
    function init() {
        const ul = document.querySelector(".sidebar ul");
        if (!ul) return;

        ul.querySelectorAll("li.sidebar-logout a").forEach(function (a) {
            a.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); a.closest("li").click(); }
            });
        });

        const here = location.pathname.replace(/\\/g, "/").toLowerCase();
        if (!ul.querySelector("li.active")) {
            ul.querySelectorAll("li a[href]").forEach(function (a) {
                if (here.endsWith(a.getAttribute("href").replace(/^\.\.\//, "/").toLowerCase().split("/").pop())) {
                    a.parentElement.classList.add("active");
                    a.setAttribute("aria-current", "page");
                }
            });
        }

        const active = ul.querySelector("li.active");
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
