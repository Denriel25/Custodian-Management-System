// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED SIGNATURES OF A REQUISITION
//
// The paper requisition needs three signatures after the request is approved:
//
//    1. Department Dean
//    2. Auditing Office
//    3. Property Custodian
//
// The signatures stay on paper. The Property Office records each one in the system when the
// paper comes back, so everybody can see where the form is. A requisition CANNOT be released
// until the three signatures are recorded.
//
//   Pending  ->  Approved (stock verified)  ->  signatures 1/3, 2/3, 3/3  ->  Released
//
// A form keeps them in form.signatures = { dean: {at, by} or null, auditing: ..., custodian: ... }
//
// Put <script src="../../Shared/signatures.js"></script> before the page script.
// ========================================

const SIGNERS = [
    { key: "dean", label: "Department Dean" },
    { key: "auditing", label: "Auditing Office" },
    { key: "custodian", label: "Property Custodian" }
];

// only a requisition goes through the three signatures
function needsSignatures(form) {
    return form.type === "requisition";
}

function signatureCount(form) {

    const signed = form.signatures || {};

    return SIGNERS.filter(function (s) { return signed[s.key]; }).length;

}

function allSigned(form) {
    return !needsSignatures(form) || signatureCount(form) === SIGNERS.length;
}

// "Approved (1/3 signed)" for an approved requisition, the plain status for the others
function statusText(form) {

    if (needsSignatures(form) && form.status === "Approved") {
        return "Approved (" + signatureCount(form) + "/" + SIGNERS.length + " signed)";
    }

    return form.status;

}

// Records (or removes) one signature. The caller saves the form.
function setSignature(form, key, who, signed) {

    form.signatures = form.signatures || {};
    form.signatures[key] = signed ? { at: new Date().toISOString(), by: who } : null;

}

function signatureDate(iso) {

    const d = new Date(iso);

    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

}

// Lines for the details window of a requester: [label, text]
function signatureRows(form) {

    if (!needsSignatures(form)) return [];

    if (form.status === "Pending") {
        return [["Next step", "Waiting for the Property Office to verify the stock and approve."]];
    }

    if (form.status !== "Approved" && form.status !== "Released") return [];

    const signed = form.signatures || {};
    const rows = [];

    if (form.status === "Approved") {
        rows.push(["Next step", allSigned(form)
            ? "All three signatures are recorded. Wait for the release."
            : "Print the form and get the three signatures. The Property Office records each one here."]);
    }

    SIGNERS.forEach(function (s) {
        rows.push([s.label + " signature", signed[s.key] ? "Signed " + signatureDate(signed[s.key].at) : "Waiting"]);
    });

    return rows;

}
