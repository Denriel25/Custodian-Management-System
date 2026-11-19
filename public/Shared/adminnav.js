// ========================================
// SHARED ADMIN / STAFF SIDEBAR ADDITIONS
// Adds menu items that older pages do not have in their HTML. Works on every Admin page.
// ========================================
(function () {

    const EXTRA = [
        { after: "Request Management", name: "Inventory Management", href: "../InventoryManagement/inventorymanagement.html" },
        { after: "Issuance", name: "Pull-Out Management", href: "../PullOut/pullout.html" },
        { after: "Issuance", name: "Release Queue", href: "../ReleaseQueue/releasequeue.html" },
        { after: "Audit Trail", name: "System Settings", href: "../Settings/settings.html", adminOnly: true }
    ];

    document.addEventListener("DOMContentLoaded", function () {

        const ul = document.querySelector(".sidebar ul");
        if (!ul) return;

        const here = location.pathname.replace(/\\/g, "/");

        EXTRA.forEach(function (x) {

            // System Settings is for the Admin only: Staff never even see the menu item
            if (x.adminOnly && !(typeof currentRole === "function" && currentRole() === "Administrator")) return;

            const items = Array.prototype.slice.call(ul.querySelectorAll("li"));
            if (items.some(function (li) { return li.textContent.trim() === x.name; })) return;

            const anchor = items.find(function (li) { return li.textContent.trim() === x.after; });
            const li = document.createElement("li");
            li.textContent = x.name;
            if (here.indexOf(x.href.split("/")[1]) !== -1) li.classList.add("active");
            li.addEventListener("click", function () { location.href = x.href; });

            if (anchor && anchor.nextSibling) ul.insertBefore(li, anchor.nextSibling); else ul.appendChild(li);

        });

    });

})();
