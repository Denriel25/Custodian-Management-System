// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED AUDIT LOG
// Every important action is written here and shown in Admin > Audit Trail.
// Put <script src="../../Shared/audit.js"></script> before the page script.
// ========================================

const AUDIT_KEY = "auditLog";

// Save one activity.   addAuditLog("juan@neu.edu.ph", "Requester", "Submitted Requisition 26-001")
function addAuditLog(user, role, activity) {

    let log = [];

    try {
        log = JSON.parse(localStorage.getItem(AUDIT_KEY)) || [];
    } catch (e) {
        log = [];
    }

    log.push({
        id: Date.now() + "-" + Math.floor(Math.random() * 10000),
        date: new Date().toISOString(),
        user: user || "Unknown",
        role: role || "-",
        activity: activity
    });

    localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
}

// Safe version for pages where Shared/audit.js might be missing
function tryAuditLog(user, role, activity) {
    try {
        addAuditLog(user, role, activity);
    } catch (e) {
        console.warn("Audit log not saved:", e);
    }
}
