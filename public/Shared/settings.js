// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SYSTEM SETTINGS (frontend simulation)
//
// The settings are saved in this browser (localStorage key "systemSettings"). Only the Admin can change them.
// Settings never contain records: they cannot delete, reset or change any requisition, asset, unit or user.
//
//   settingsGet("general.systemName")        read one value
//   settingsSave("general", { ... })         validate + save one section (Admin only) -> { ok, errors }
//   settingsResetSection("general")          settings only (never data)
//   appSystemName() appInstitution() appOffice() appLogoSrc(fallback)   branding used by pages and printouts
//   notifyAllowed("workflow.signatures")     do the simulated notifications / emails of this kind run?
//   effectiveReorder(asset)                  the low-stock level of a consumable (its own level, or the fallback)
//
// SIMULATED: the logo is kept as a data URL in the browser, notifications and emails are simulated.
// FUTURE BACKEND (Laravel / MySQL): file storage for the logo, real email sending, real account security.
//
// Put <script src="../../Shared/settings.js"></script> right after users.js (before print.js, stock.js, realtime.js).
// ========================================

const SETTINGS_KEY = "systemSettings";

const SETTINGS_DEFAULTS = {
    general: {
        systemName: "Custodian Management System",
        institution: "New Era University",
        office: "Property Department",
        contactEmail: "",
        contactPhone: "",
        contactAddress: "",
        description: "",
        logo: ""                          // data URL of an uploaded logo ("" = the NEU logo that comes with the system)
    },
    inventory: {
        lowStockFallback: 0,              // low-stock level for a consumable whose own reorder level is 0 (0 = not used)
        defaultReorderLevel: 10,          // reorder level suggested for a NEW consumable
        defaultConsumableUnit: "pc",      // unit suggested for a NEW consumable
        defaultStatusFilter: "all",       // Inventory Management: first filter
        rowsPerPage: "auto",              // table rows per page ("auto" = each page decides)
        defaultUnitCondition: "same"      // condition of NEW equipment units ("same" = like the equipment record)
    },
    notifications: {
        enabled: true,                    // master switch of the simulated notifications (bell)
        emailCopies: true,                // simulated emails (nothing is really sent)
        workflow: { submitted: true, signatures: true, decisions: true, ready: true, release: true, acknowledged: true },
        lowStock: true,
        outOfStock: true
    },
    appearance: {
        density: "comfortable",           // table density: comfortable | compact
        toastSeconds: 4                   // how long the small messages stay
    }
};

const SETTINGS_ROWS = ["auto", 5, 8, 10, 15, 20, 25];
const SETTINGS_FILTERS = ["all", "In Stock", "Low Stock", "Out of Stock"];
const SETTINGS_TOASTS = [3, 4, 6, 8, 10];
const SETTINGS_LOGO_MAX_BYTES = 1024 * 1024;

function settingsClone(o) { return JSON.parse(JSON.stringify(o)); }

// stored values on top of the defaults (a missing or broken value falls back to the default)
function settingsAll() {

    let stored = {};

    try {
        const v = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (v && typeof v === "object") stored = v;
    } catch (e) { stored = {}; }

    function merge(def, val) {
        const out = {};
        Object.keys(def).forEach(function (k) {
            if (def[k] && typeof def[k] === "object" && !Array.isArray(def[k])) {
                out[k] = merge(def[k], val && typeof val[k] === "object" ? val[k] : {});
            } else {
                out[k] = val && val[k] !== undefined && typeof val[k] === typeof def[k] ? val[k] : def[k];
            }
        });
        return out;
    }

    return merge(SETTINGS_DEFAULTS, stored);

}

function settingsGet(path, fallback) {

    let cur = settingsAll();

    const parts = String(path).split(".");
    for (let i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== "object" || !(parts[i] in cur)) return fallback;
        cur = cur[parts[i]];
    }

    return cur;

}

function settingsCanEdit() {
    return typeof currentRole === "function" && currentRole() === "Administrator";
}

// ----- validation: one function per section. Returns { ok, errors: {field: text}, clean } -----
function settingsText(v) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }

function settingsInt(v, min, max) {
    const t = String(v == null ? "" : v).trim();
    if (!/^\d+$/.test(t)) return null;
    const n = parseInt(t, 10);
    return n >= min && n <= max ? n : null;
}

function settingsValidate(section, v) {

    const errors = {};
    const clean = {};
    v = v || {};

    if (section === "general") {

        clean.systemName = settingsText(v.systemName);
        if (!clean.systemName) errors.systemName = "The system name is required.";
        else if (clean.systemName.length > 60) errors.systemName = "The system name can have at most 60 characters.";

        clean.institution = settingsText(v.institution);
        if (!clean.institution) errors.institution = "The institution name is required.";
        else if (clean.institution.length > 80) errors.institution = "The institution name can have at most 80 characters.";

        clean.office = settingsText(v.office);
        if (!clean.office) errors.office = "The office name is required.";
        else if (clean.office.length > 60) errors.office = "The office name can have at most 60 characters.";

        clean.contactEmail = settingsText(v.contactEmail);
        if (clean.contactEmail && (clean.contactEmail.length > 100 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(clean.contactEmail))) errors.contactEmail = "Enter a valid email address (or leave it empty).";

        clean.contactPhone = settingsText(v.contactPhone);
        if (clean.contactPhone && !/^[0-9+()\-. ]{5,25}$/.test(clean.contactPhone)) errors.contactPhone = "Use 5 to 25 characters: digits, spaces and + ( ) - .";

        clean.contactAddress = settingsText(v.contactAddress);
        if (clean.contactAddress.length > 150) errors.contactAddress = "The address can have at most 150 characters.";

        clean.description = settingsText(v.description);
        if (clean.description.length > 300) errors.description = "The description can have at most 300 characters.";

        clean.logo = v.logo == null ? "" : String(v.logo);
        if (clean.logo) {
            if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(clean.logo)) errors.logo = "The logo must be a PNG or JPG image.";
            else if (clean.logo.length > Math.ceil(SETTINGS_LOGO_MAX_BYTES * 4 / 3) + 100) errors.logo = "The logo is too big (maximum 1 MB).";
        }

    } else if (section === "inventory") {

        const low = settingsInt(v.lowStockFallback, 0, 9999);
        if (low === null) errors.lowStockFallback = "Enter a whole number from 0 to 9999."; else clean.lowStockFallback = low;

        const rl = settingsInt(v.defaultReorderLevel, 0, 9999);
        if (rl === null) errors.defaultReorderLevel = "Enter a whole number from 0 to 9999."; else clean.defaultReorderLevel = rl;

        clean.defaultConsumableUnit = settingsText(v.defaultConsumableUnit);
        if (!clean.defaultConsumableUnit) errors.defaultConsumableUnit = "The default unit is required (for example pc, box, ream).";
        else if (clean.defaultConsumableUnit.length > 20) errors.defaultConsumableUnit = "The unit can have at most 20 characters.";

        if (SETTINGS_FILTERS.indexOf(v.defaultStatusFilter) === -1) errors.defaultStatusFilter = "Choose one of the listed filters."; else clean.defaultStatusFilter = v.defaultStatusFilter;

        const rows = v.rowsPerPage === "auto" ? "auto" : settingsInt(v.rowsPerPage, 5, 25);
        if (rows === null || SETTINGS_ROWS.indexOf(rows) === -1) errors.rowsPerPage = "Choose one of the listed values."; else clean.rowsPerPage = String(rows);   // always text: "auto" or "10"

        if (["same", "New", "Good", "Fair"].indexOf(v.defaultUnitCondition) === -1) errors.defaultUnitCondition = "Choose one of the listed conditions."; else clean.defaultUnitCondition = v.defaultUnitCondition;

    } else if (section === "notifications") {

        function bool(x) { return x === true || x === "true" || x === "on"; }

        clean.enabled = bool(v.enabled);
        clean.emailCopies = bool(v.emailCopies);
        clean.lowStock = bool(v.lowStock);
        clean.outOfStock = bool(v.outOfStock);
        clean.workflow = {};
        Object.keys(SETTINGS_DEFAULTS.notifications.workflow).forEach(function (k) { clean.workflow[k] = bool((v.workflow || {})[k]); });

    } else if (section === "appearance") {

        if (["comfortable", "compact"].indexOf(v.density) === -1) errors.density = "Choose comfortable or compact."; else clean.density = v.density;

        const t = settingsInt(v.toastSeconds, 1, 60);
        if (t === null || SETTINGS_TOASTS.indexOf(t) === -1) errors.toastSeconds = "Choose one of the listed times."; else clean.toastSeconds = t;

    } else {
        errors._ = "Unknown settings section.";
    }

    return { ok: Object.keys(errors).length === 0, errors: errors, clean: clean };

}

function settingsAudit(text) {
    if (typeof tryAuditLog === "function") tryAuditLog(sessionStorage.getItem("userEmail") || "-", typeof currentRole === "function" ? currentRole() : "-", text);
}

function settingsWrite(all) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
}

// Saves one section. Only the Admin can do it. Returns { ok, errors, message }
function settingsSave(section, values) {

    if (!settingsCanEdit()) return { ok: false, errors: {}, message: "Only the Admin can change the System Settings." };

    const res = settingsValidate(section, values);
    if (!res.ok) return { ok: false, errors: res.errors, message: "Please correct the marked fields." };

    const all = settingsAll();
    const before = all[section];
    const changed = [];

    Object.keys(res.clean).forEach(function (k) {
        if (JSON.stringify(before[k]) !== JSON.stringify(res.clean[k])) changed.push(k);
    });

    all[section] = res.clean;

    if (!settingsWrite(all)) return { ok: false, errors: {}, message: "The browser storage is full. Try a smaller logo." };

    if (changed.length) settingsAudit("Changed System Settings (" + section + "): " + changed.join(", "));

    applyBranding();

    return { ok: true, errors: {}, changed: changed };

}

// Back to the default values of ONE section. This changes settings only, never records.
function settingsResetSection(section) {

    if (!settingsCanEdit()) return { ok: false, message: "Only the Admin can change the System Settings." };
    if (!SETTINGS_DEFAULTS[section]) return { ok: false, message: "Unknown settings section." };

    const all = settingsAll();
    all[section] = settingsClone(SETTINGS_DEFAULTS[section]);
    settingsWrite(all);
    settingsAudit("Restored the default System Settings (" + section + ")");
    applyBranding();

    return { ok: true };

}

// ----- getters used by the other modules (they never fail: a broken value gives the default) -----
function appSystemName() { return settingsGet("general.systemName", SETTINGS_DEFAULTS.general.systemName) || SETTINGS_DEFAULTS.general.systemName; }
function appInstitution() { return settingsGet("general.institution", SETTINGS_DEFAULTS.general.institution) || SETTINGS_DEFAULTS.general.institution; }
function appOffice() { return settingsGet("general.office", SETTINGS_DEFAULTS.general.office) || SETTINGS_DEFAULTS.general.office; }
function appLogoSrc(fallback) { const l = settingsGet("general.logo", ""); return l ? l : fallback; }

// kind: "enabled" | "email" | "lowStock" | "outOfStock" | "workflow.<name>"
function notifyAllowed(kind) {

    const n = settingsAll().notifications;

    if (!n.enabled) return false;
    if (kind === "enabled") return true;
    if (kind === "email") return !!n.emailCopies;
    if (kind === "lowStock") return !!n.lowStock;
    if (kind === "outOfStock") return !!n.outOfStock;
    if (String(kind).indexOf("workflow.") === 0) return n.workflow[String(kind).slice(9)] !== false;

    return true;

}

// the low-stock level of a consumable: its own reorder level, or the fallback of the settings when its own level is 0
function effectiveReorder(asset) {
    const own = Number(asset && asset.reorderLevel) || 0;
    return own > 0 ? own : (Number(settingsGet("inventory.lowStockFallback", 0)) || 0);
}

function settingsRows(pageDefault) {
    const r = settingsGet("inventory.rowsPerPage", "auto");
    const n = Number(r);
    return r === "auto" || !isFinite(n) || n < 5 || n > 25 ? pageDefault : n;
}

function settingsToastMs() { return (Number(settingsGet("appearance.toastSeconds", 4)) || 4) * 1000; }

// ----- appearance and branding of every page (the dark theme, Poppins and the gold #edae0f stay as they are) -----
function applyBranding() {

    if (!document || !document.documentElement) return;

    const name = appSystemName();
    document.querySelectorAll(".sidebar-title h2, .sidebar-brand-text h2").forEach(function (h) { h.textContent = name + " "; });

    document.querySelectorAll("img.sidebar-logo").forEach(function (img) {
        if (!img.dataset.defaultSrc) img.dataset.defaultSrc = img.getAttribute("src");
        img.setAttribute("src", appLogoSrc(img.dataset.defaultSrc));
    });

    document.documentElement.classList.toggle("density-compact", settingsGet("appearance.density", "comfortable") === "compact");

    if (!document.getElementById("settingsStyle")) {
        const css = document.createElement("style");
        css.id = "settingsStyle";
        css.textContent = "html.density-compact table th, html.density-compact table td { padding-top: 5px !important; padding-bottom: 5px !important; font-size: 12px; }";
        document.head.appendChild(css);
    }

}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", applyBranding);
    window.addEventListener("storage", function (e) { if (e.key === SETTINGS_KEY) applyBranding(); });
}
