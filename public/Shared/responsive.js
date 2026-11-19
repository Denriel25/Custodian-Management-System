// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED RESPONSIVE SCRIPT
//
//   - the menu button (top left) that opens the side menu on a phone or tablet
//   - the labels of the table cells, so the tables can be shown as cards on a phone
//
// Used together with Shared/responsive.css. On a desktop it changes nothing you can see.
// Put <script src="../../Shared/responsive.js"></script> at the end of the page.
// ========================================

(function () {

    const SMALL = window.matchMedia("(max-width: 900px)");

    // ----- the menu button and the dark layer -----
    function setupMenu() {

        const sidebar = document.querySelector(".sidebar");
        const navbar = document.querySelector(".navbar");

        if (!sidebar || !navbar || navbar.querySelector(".rs-burger")) return;

        const overlay = document.createElement("div");
        const burger = document.createElement("button");

        overlay.className = "rs-overlay";

        burger.type = "button";
        burger.className = "rs-burger";
        burger.setAttribute("aria-label", "Open the menu");
        burger.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';

        document.body.appendChild(overlay);

        // the button goes next to the title (at the left of the top bar)
        const first = navbar.firstElementChild;
        const wrap = document.createElement("div");

        wrap.className = "rs-left";
        navbar.insertBefore(wrap, first);
        wrap.appendChild(burger);

        if (first) wrap.appendChild(first);

        function setOpen(open) {

            sidebar.classList.toggle("rs-open", open);
            overlay.classList.toggle("rs-show", open);
            document.body.classList.toggle("rs-noscroll", open);
            burger.setAttribute("aria-expanded", open ? "true" : "false");

        }

        burger.addEventListener("click", function () {
            setOpen(!sidebar.classList.contains("rs-open"));
        });

        overlay.addEventListener("click", function () { setOpen(false); });

        // choosing a page closes the menu
        sidebar.addEventListener("click", function (e) {
            if (e.target.closest("li")) setOpen(false);
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") setOpen(false);
        });

        // back to a big screen: the menu is always shown
        function onChange() {
            if (!SMALL.matches) setOpen(false);
        }

        if (SMALL.addEventListener) SMALL.addEventListener("change", onChange);
        else SMALL.addListener(onChange);

    }

    // ----- the label of each cell (the name of its column) -----
    function labelTables(root) {

        (root || document).querySelectorAll("table").forEach(function (table) {

            if (table.closest("#printArea") || table.classList.contains("no-stack")) return;

            const heads = Array.from(table.querySelectorAll("thead th")).map(function (th) {
                return th.textContent.trim();
            });

            if (heads.length === 0) return;

            table.classList.add("rs-stack");

            table.querySelectorAll("tbody tr").forEach(function (tr) {

                let col = 0;

                Array.from(tr.children).forEach(function (cell) {

                    if (cell.tagName === "TD" && !cell.hasAttribute("data-label")) {
                        // a cell that spans several columns (for example "No data") has no label
                        cell.setAttribute("data-label", cell.colSpan > 1 ? "" : (heads[col] || ""));
                    }

                    col += cell.colSpan || 1;

                });

            });

            // the line that adds up has no label
            table.querySelectorAll("tfoot td").forEach(function (cell) {
                if (!cell.hasAttribute("data-label")) cell.setAttribute("data-label", "");
            });

        });

    }

    // is a window (modal) open? the chat button hides itself then, so it does not cover the buttons
    function checkWindows() {

        const open = Array.from(document.querySelectorAll(".modal-overlay, .qs-overlay")).some(function (el) {
            return getComputedStyle(el).display !== "none";
        });

        document.body.classList.toggle("rs-modal-open", open);

    }

    let waiting = false;

    // the lists are drawn again when the data changes: label the new rows too
    function watch() {

        const observer = new MutationObserver(function () {

            if (waiting) return;

            waiting = true;

            setTimeout(function () {
                waiting = false;
                labelTables();
                checkWindows();
            }, 30);

        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

    }

    function init() {

        setupMenu();
        labelTables();
        checkWindows();
        watch();

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
