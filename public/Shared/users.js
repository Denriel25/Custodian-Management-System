// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED USER ACCOUNTS
// The accounts live in the Laravel `users` table (managed in Admin > Users). Laravel puts the list
// (without passwords) into this browser on every page load (see Shared/laravel-bridge.js).
// Login, password hashing and sessions are done by Laravel (AuthController).
// Put <script src="../../Shared/users.js"></script> before the page script.
// ========================================

const USERS_KEY = "users";

// Exactly four roles exist in the system.
const ROLES = ["Administrator", "Staff", "Auditor", "Requester"];

// The Admin account represents the Director. Returns the registered name of the first active Administrator.
function directorName() {
    const a = loadUsers().find(function (u) { return u.role === "Administrator" && u.status === "Active"; });
    return a ? a.name : "Director";
}

// The registered name of an Auditor account (by email) or of the first active Auditor.
function auditorAccount(email) {
    const list = loadUsers().filter(function (u) { return u.role === "Auditor" && u.status === "Active"; });
    return list.find(function (u) { return email && u.email.toLowerCase() === email.toLowerCase(); }) || list[0] || null;
}

function userByEmail(email) {
    return loadUsers().find(function (u) { return String(u.email).toLowerCase() === String(email || "").toLowerCase(); }) || null;
}

// The accounts that Laravel gave to this browser (never contains a password)
function loadUsers() {
    try {
        const saved = JSON.parse(localStorage.getItem(USERS_KEY));
        return Array.isArray(saved) ? saved : [];
    } catch (e) {
        return [];
    }
}

// Admin > Users saves the list here. Laravel receives it, hashes any new password and keeps it out of the browser.
function saveUsers(list) {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
}
