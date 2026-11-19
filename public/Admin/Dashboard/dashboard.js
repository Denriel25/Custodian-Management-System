// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// ADMIN DASHBOARD JAVASCRIPT
// Numbers, chart and recent list come from the forms
// saved on the Requester "Request" page.
// ========================================

const STORE_KEY = "forms";
const RECENT_LIMIT = 5;
const MONTHS_SHOWN = 6;

const FORM_INFO = {
    requisition: {
        label: "Requisition",
        color: "#edae0f",
        details: function (r) { return r.header.department; }
    },
    receipt: {
        label: "Acknowledgment Receipt",
        color: "#28a745",
        details: function (r) { return r.header.name + " (" + r.header.department + ")"; }
    },
    pullout: {
        label: "Pull-Out Request",
        color: "#0dcaf0",
        details: function (r) { return r.header.requestingParty + (r.header.office ? " - " + r.header.office : ""); }
    }
};


// ========================================
// HELPERS
// ========================================

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        return dateString || "-";
    }

    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function loadForms() {
    try {
        return (JSON.parse(localStorage.getItem(STORE_KEY)) || []).filter(function (r) {
            return FORM_INFO[r.type] && !(r.type === "requisition" && r.status === "Draft");
        });
    } catch (e) {
        return [];
    }
}

function statusClass(status) {
    if (status === "Approved") return "approved";
    if (status === "Rejected") return "rejected";
    if (status === "Released") return "released";
    return "pending";
}

// The last N months, oldest first, e.g. [{key:"2026-05", label:"May 2026"}, ...]
function lastMonths(n) {

    const list = [];
    const now = new Date();

    for (let i = n - 1; i >= 0; i--) {

        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);

        list.push({
            key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
            label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        });

    }

    return list;

}

// How many forms of each type were submitted in each month
function monthlyCounts(forms, months) {

    const counts = {};

    Object.keys(FORM_INFO).forEach(function (type) {
        counts[type] = months.map(function () { return 0; });
    });

    forms.forEach(function (r) {

        const d = new Date(r.dateCreated);

        if (isNaN(d.getTime())) return;

        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        const index = months.findIndex(function (m) { return m.key === key; });

        if (index !== -1) {
            counts[r.type][index]++;
        }

    });

    return counts;

}


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    setupSidebar();

    const forms = loadForms();

    showCards(forms);
    showRecent(forms);
    showChart(forms);

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["forms", "assets", "users"], function () {
            const fresh = loadForms();
            showCards(fresh);
            showRecent(fresh);
            showChart(fresh);
        });
    }

    document.getElementById("goRequests").addEventListener("click", function () {
        window.location.href = "../RequestManagement/requestmanagement.html";
    });

});


// ========================================
// CARDS
// ========================================

function countSaved(key) {
    try {
        const list = JSON.parse(localStorage.getItem(key));
        return Array.isArray(list) ? list.length : 0;
    } catch (e) {
        return 0;
    }
}

function showCards(forms) {

    // requisitions use the workflow statuses; pull-out requests and receipts keep the old ones
    function group(r) {
        if (r.type !== "requisition") return r.status;
        if (r.status === "Ready for Release" || r.status === "Partially Released" || r.status === "Approved") return "Approved";
        if (r.status === "Released" || r.status === "Completed") return "Released";
        if (r.status === "Rejected") return "Rejected";
        return "Pending";
    }
    function count(status) {
        return forms.filter(function (r) { return group(r) === status; }).length;
    }

    document.getElementById("pendingCount").textContent = count("Pending");
    document.getElementById("approvedCount").textContent = count("Approved");
    document.getElementById("releasedCount").textContent = count("Released");
    document.getElementById("totalCount").textContent = forms.length;

    // assets and users are saved by the Assets and Users pages
    document.getElementById("assetCount").textContent = countSaved("assets");
    document.getElementById("userCount").textContent = countSaved("users");

    // supplies that are low or out of stock (needs Shared/stock.js)
    document.getElementById("lowStockCount").textContent =
        typeof loadAssets === "function" ? loadAssets().filter(isLowStock).length : 0;

}


// ========================================
// RECENT REQUESTS
// ========================================

function showRecent(forms) {

    const tbody = document.getElementById("recentBody");
    tbody.innerHTML = "";

    document.getElementById("noRecent").style.display = forms.length ? "none" : "block";

    forms.slice().reverse().slice(0, RECENT_LIMIT).forEach(function (r) {

        const info = FORM_INFO[r.type];
        const row = document.createElement("tr");

        row.innerHTML =
            "<td><strong>" + esc(r.controlNo) + "</strong></td>" +
            "<td>" + esc(info.label) + "</td>" +
            "<td>" + esc(r.requesterEmail || "-") + "</td>" +
            "<td>" + esc(info.details(r)) + "</td>" +
            "<td>" + esc(formatDate(r.dateCreated)) + "</td>" +
            "<td>" + (r.type === "requisition" && typeof wfBadge === "function" ? wfBadge(r.status) : '<span class="status ' + statusClass(r.status) + '">' + esc(r.status) + "</span>") + "</td>";

        tbody.appendChild(row);

    });

}


// ========================================
// CHART (Chart.js is loaded from the internet in dashboard.html)
// ========================================

// Simple grouped bar chart (months x form types) used when Chart.js cannot be loaded
function drawFallbackChart(canvas, months, counts) {

    const types = Object.keys(FORM_INFO);
    const W = canvas.width = Math.max(320, canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 600);
    const H = canvas.height = 280;
    const ctx = canvas.getContext("2d");
    const padL = 34, padR = 10, padT = 34, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    let max = 1;

    types.forEach(function (t) { counts[t].forEach(function (v) { max = Math.max(max, v); }); });
    ctx.clearRect(0, 0, W, H);
    ctx.font = "11px Poppins, Arial, sans-serif";
    ctx.textBaseline = "middle";

    // horizontal grid and the numbers on the left
    for (let i = 0; i <= 4; i++) {
        const y = padT + plotH - (plotH * i / 4);
        ctx.strokeStyle = "#333";
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "right";
        ctx.fillText(String(Math.round(max * i / 4)), padL - 6, y);
    }

    // the bars
    const groupW = plotW / months.length;
    const barW = Math.max(3, (groupW * 0.75) / types.length);
    months.forEach(function (m, mi) {
        const x0 = padL + groupW * mi + (groupW - barW * types.length) / 2;
        types.forEach(function (t, ti) {
            const v = counts[t][mi] || 0;
            const h = plotH * v / max;
            ctx.fillStyle = FORM_INFO[t].color;
            ctx.fillRect(x0 + barW * ti, padT + plotH - h, barW - 1, h);
        });
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
        ctx.fillText(m.label, padL + groupW * mi + groupW / 2, H - padB / 2 + 2);
    });

    // legend
    let x = padL;
    ctx.textAlign = "left";
    types.forEach(function (t) {
        ctx.fillStyle = FORM_INFO[t].color; ctx.fillRect(x, 10, 12, 12);
        ctx.fillStyle = "#ffffff"; ctx.fillText(FORM_INFO[t].label, x + 17, 17);
        x += 17 + ctx.measureText(FORM_INFO[t].label).width + 18;
    });

}

let formsChart = null;      // NOT named dashboardChart: that is the id of the canvas, and window.dashboardChart is that element
let shownChartKey = "";
let lastChart = null;
let chartFetching = false;

// draws (or redraws) the chart; shows a message instead when there is nothing to show
function renderChart(months, counts) {

    const canvas = document.getElementById("dashboardChart");
    const note = document.getElementById("chartNote");
    const wrap = canvas.parentElement;
    const types = Object.keys(FORM_INFO);

    lastChart = { months: months, counts: counts };

    const total = types.reduce(function (sum, t) {
        return sum + (counts[t] || []).reduce(function (a, v) { return a + (v || 0); }, 0);
    }, 0);

    const key = JSON.stringify([months.map(function (m) { return m.label; }), types.map(function (t) { return counts[t]; })]);

    // the chart that is already shown has the same data: nothing to do
    if (key === shownChartKey && (typeof Chart === "undefined" || formsChart)) return;
    shownChartKey = key;

    // clean up a previous Chart.js chart (also one that was created before this call)
    const old = (typeof Chart !== "undefined" && Chart.getChart) ? Chart.getChart(canvas) : formsChart;
    if (old && typeof old.destroy === "function") old.destroy();
    formsChart = null;

    // empty state
    if (!total) {
        wrap.style.display = "none";
        note.textContent = "No forms were submitted in the last " + months.length + " months. The chart appears here as soon as forms are submitted.";
        note.style.display = "block";
        return;
    }

    wrap.style.display = "block";
    note.style.display = "none";

    // no internet (Chart.js is loaded from a CDN): draw the same grouped bars with the browser's canvas
    if (typeof Chart === "undefined") {
        wrap.classList.add("fallback");
        drawFallbackChart(canvas, months, counts);
        return;
    }

    wrap.classList.remove("fallback");
    canvas.removeAttribute("width");
    canvas.removeAttribute("height");

    formsChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: months.map(function (m) { return m.label; }),
            datasets: types.map(function (type) {
                return {
                    label: FORM_INFO[type].label,
                    data: counts[type],
                    backgroundColor: FORM_INFO[type].color,
                    borderRadius: 3
                };
            })
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "white", boxWidth: 14 } },
                tooltip: { mode: "index", intersect: false }
            },
            scales: {
                x: {
                    ticks: { color: "white", maxRotation: 0, autoSkip: true },
                    grid: { color: "#333" }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: "white", precision: 0 },
                    grid: { color: "#333" }
                }
            }
        }
    });

}

// the numbers come from the Laravel database (forms the person may see, counted on the server)
function loadChartFromServer() {

    if (typeof cmsApi !== "function" || chartFetching) return;

    chartFetching = true;

    cmsApi("GET", "api/dashboard/forms-per-month?months=" + MONTHS_SHOWN).then(function (res) {

        chartFetching = false;

        if (!res.ok || !res.data || !res.data.series || !Array.isArray(res.data.months)) return;

        const counts = {};

        Object.keys(FORM_INFO).forEach(function (t) {
            const serie = res.data.series[t];
            counts[t] = serie && Array.isArray(serie.data) ? serie.data : res.data.months.map(function () { return 0; });
        });

        renderChart(res.data.months, counts);

    }).catch(function () { chartFetching = false; });

}

function showChart(forms) {

    // draw at once from the data already in the page (it came from the database), then confirm with the server
    const months = lastMonths(MONTHS_SHOWN);

    renderChart(months, monthlyCounts(forms, months));
    loadChartFromServer();

}

// the fallback drawing is not responsive by itself
(function () {

    let timer = null;

    window.addEventListener("resize", function () {

        clearTimeout(timer);

        timer = setTimeout(function () {

            const wrap = document.getElementById("dashboardChart") && document.getElementById("dashboardChart").parentElement;

            if (lastChart && wrap && wrap.classList.contains("fallback") && wrap.style.display !== "none") {
                drawFallbackChart(document.getElementById("dashboardChart"), lastChart.months, lastChart.counts);
            }

        }, 150);

    });

})();


// ========================================
// SIDEBAR + LOGOUT
// ========================================

function setupSidebar() {

    document.querySelectorAll(".sidebar ul li").forEach(function (item) {

        item.addEventListener("click", function () {

            switch (item.textContent.trim()) {

                case "Dashboard":
                    window.location.href = "dashboard.html";
                    break;

                case "Request Management":
                    window.location.href = "../RequestManagement/requestmanagement.html";
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


// ========================================
// ACTION QUEUE (Admin = Director approvals; Staff = releases). Same layout for both roles.
// ========================================
document.addEventListener("DOMContentLoaded", function () {

    if (typeof wfPagedTable !== "function") return;

    const isAdmin = wfRole() === "Administrator";
    document.getElementById("queueTitle").textContent = isAdmin
        ? "Waiting for Director approval, and ready for release (Staff release)"
        : "Ready for release (Staff make the release; Staff cannot approve or reject)";

    const table = wfPagedTable({
        rows: function () {
            return wfRequisitions().filter(function (f) {
                return f.status === WF.READY || f.status === WF.PARTIAL || (isAdmin && f.status === WF.PEND_DIRECTOR);
            }).sort(function (a, b) { return a.dateCreated.localeCompare(b.dateCreated); });
        },
        tbody: "queueBody", pager: "queuePager", cols: 5, perPage: 5, empty: "Nothing is waiting for you.",
        rowHtml: function (f) {
            return "<tr><td><b>" + wfEsc(f.controlNo) + "</b></td><td>" + wfEsc(f.header.department) + "</td><td>" + wfEsc(f.requesterEmail) + "</td><td>" + wfBadge(f.status) +
                '</td><td><button type="button" class="wf-btn sm gold" data-view="' + f.id + '">' + (f.status === WF.READY || f.status === WF.PARTIAL ? (wfRole() === "Staff" ? "Release" : "View") : "Review") + "</button></td></tr>";
        },
        onView: function (id) {
            const f = wfFind(id);
            location.href = (f.status === WF.READY || f.status === WF.PARTIAL)
                ? "../ReleaseQueue/releasequeue.html?open=" + encodeURIComponent(f.controlNo)
                : "../RequestManagement/requestmanagement.html?open=" + encodeURIComponent("requisition|" + f.controlNo);
        }
    });

    if (typeof onDataChange === "function") onDataChange(["forms"], function () { table.redraw(); });

});
