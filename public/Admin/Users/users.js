// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// USERS JAVASCRIPT (ADMIN)
// The accounts saved here are the accounts that can log in
// (Admin login and Requester login). See Shared/users.js.
// ========================================

// ---------- Safety check ----------
if (typeof loadUsers === "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
        const banner = document.createElement("div");
        banner.style.cssText = "background:#dc3545;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:14px;";
        banner.textContent = "The Shared folder (users.js) was not found. Put the Shared folder in the project root, next to Admin and Requester.";
        const navbar = document.querySelector(".navbar");
        if (navbar) navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    });
}


// ========================================
// HELPERS
// ========================================

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function el(id) {
    return document.getElementById(id);
}

function currentAdminEmail() {
    return sessionStorage.getItem("userEmail") || "Admin";
}

function log(activity) {
    if (typeof tryAuditLog === "function") {
        tryAuditLog(currentAdminEmail(), (typeof currentRole === "function" && currentRole()) || "Administrator", activity);
    }
}

function generateUserID() {

    let highest = 0;

    loadUsers().forEach(function (u) {
        const m = /^USR(\d+)$/.exec(u.id);
        if (m) highest = Math.max(highest, parseInt(m[1], 10));
    });

    return "USR" + String(highest + 1).padStart(3, "0");

}

function activeAdmins(list) {
    return list.filter(function (u) { return u.role === "Administrator" && u.status === "Active"; });
}


// ========================================
// PAGE LOAD
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    if (typeof loadUsers === "undefined") {
        return;
    }

    setupSidebar();
    render();

    // update when another window changes the data (Realtime)
    if (typeof onDataChange === "function") {
        onDataChange(["users"], render);
    }

    el("searchUser").addEventListener("input", render);
    el("addUserBtn").addEventListener("click", openAddModal);
    el("closeModal").addEventListener("click", closeModal);
    el("cancelBtn").addEventListener("click", closeModal);

    el("userModal").addEventListener("click", function (e) {
        if (e.target === this) closeModal();
    });

    el("userForm").addEventListener("submit", function (e) {
        e.preventDefault();
        saveForm();
    });

});


// ========================================
// TABLE + CARDS
// ========================================

function render() {

    const users = loadUsers();

    // ----- cards -----
    el("totalUsers").textContent = users.length;
    el("totalRequesters").textContent = users.filter(function (u) { return u.role === "Requester"; }).length;
    el("totalAdmins").textContent = users.filter(function (u) { return u.role === "Administrator"; }).length;
    el("totalStaff").textContent = users.filter(function (u) { return u.role === "Staff"; }).length;

    // ----- search -----
    const search = el("searchUser").value.toLowerCase().trim();

    const shown = users.filter(function (u) {
        return !search || (u.id + " " + u.name + " " + u.email + " " + u.role + " " + u.status + " " + u.department)
            .toLowerCase().includes(search);
    });

    // ----- rows -----
    // the name at the top right may have changed (the Admin edited his or her own account)
    if (typeof refreshUserLabel === "function") refreshUserLabel();

    const tbody = el("userTableBody");
    tbody.innerHTML = "";

    el("noUsers").style.display = shown.length ? "none" : "block";

    shown.forEach(function (u) {

        const row = document.createElement("tr");

        row.innerHTML =
            "<td>" + escapeHTML(u.id) + "</td>" +
            "<td>" + escapeHTML(u.name) + "</td>" +
            "<td>" + escapeHTML(u.email) + "</td>" +
            "<td>" + escapeHTML(u.role) + "</td>" +
            '<td><span class="status ' + (u.status === "Active" ? "active" : "inactive") + '">' + escapeHTML(u.status) + "</span></td>" +
            "<td></td>";

        const actions = row.lastElementChild;

        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () { openEditModal(u.id); });
        actions.appendChild(editBtn);

        actions.appendChild(document.createTextNode(" "));

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", function () { deleteUser(u.id); });
        actions.appendChild(deleteBtn);

        tbody.appendChild(row);

    });

}


// ========================================
// ADD / EDIT WINDOW
// ========================================

function openAddModal() {

    const modal = el("userModal");

    el("userForm").reset();
    el("modalTitle").textContent = "Add User";
    el("userID").value = generateUserID();
    el("password").placeholder = "";
    el("confirmPassword").placeholder = "";

    modal.dataset.mode = "add";
    modal.dataset.userId = "";
    modal.classList.add("show");

}

function openEditModal(id) {

    const u = loadUsers().find(function (x) { return x.id === id; });

    if (!u) return;

    const modal = el("userModal");

    el("userForm").reset();
    el("modalTitle").textContent = "Edit User";
    el("userID").value = u.id;
    el("fullName").value = u.name;
    el("email").value = u.email;
    el("contact").value = u.contact || "";
    el("department").value = u.department || "";
    el("role").value = u.role;
    el("status").value = u.status;

    // password is optional when editing: leave it empty to keep the current one
    el("password").placeholder = "Leave blank to keep the current password";
    el("confirmPassword").placeholder = "Leave blank to keep the current password";

    modal.dataset.mode = "edit";
    modal.dataset.userId = u.id;
    modal.classList.add("show");

}

function closeModal() {
    el("userModal").classList.remove("show");
}


// ========================================
// SAVE
// ========================================

function saveForm() {

    const modal = el("userModal");
    const mode = modal.dataset.mode;

    const name = el("fullName").value.trim();
    const email = el("email").value.trim();
    const contact = el("contact").value.trim();
    const department = el("department").value.trim();
    const role = el("role").value;
    const status = el("status").value;
    const password = el("password").value;
    const confirmPassword = el("confirmPassword").value;

    // ----- validation -----
    if (!name) { alert("Please enter the user's full name."); el("fullName").focus(); return; }
    if (!email) { alert("Please enter the user's email."); el("email").focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { alert("Please enter a valid email address."); el("email").focus(); return; }
    if (!role) { alert("Please select a user role."); el("role").focus(); return; }

    const users = loadUsers();
    const editingId = mode === "edit" ? modal.dataset.userId : null;

    // the email is the login name, so it must be unique
    const duplicate = users.some(function (u) {
        return u.id !== editingId && u.email.toLowerCase() === email.toLowerCase();
    });

    if (duplicate) { alert("This email is already used by another user."); el("email").focus(); return; }

    if (mode === "add") {
        if (!password) { alert("Please enter a password."); el("password").focus(); return; }
    }

    if (password || confirmPassword) {
        if (password.length < 12) {
        alert("The password must have at least 12 characters.");
        el("password").focus();
        return;
    }

    if (password !== confirmPassword) {
        alert("Passwords do not match.");
        el("confirmPassword").focus();
        return;
    }
    }

    // ----- add -----
    if (mode === "add") {

        const user = {
            id: generateUserID(),
            name: name,
            email: email,
            contact: contact,
            department: department,
            role: role,
            status: status,
            password: password
        };

        users.push(user);
        saveUsers(users);

        log("Added user " + user.id + " (" + user.email + ", " + role + ")");

        closeModal();
        render();
        alert("User added successfully.");
        return;

    }

    // ----- edit -----
    const user = users.find(function (u) { return u.id === editingId; });

    if (!user) { alert("Unable to update user."); return; }

    // never leave the system without an active administrator
    const after = users.map(function (u) {
        return u.id === editingId ? Object.assign({}, u, { role: role, status: status }) : u;
    });

    if (activeAdmins(after).length === 0) {
        alert("There must be at least one active Administrator.");
        return;
    }

    user.name = name;
    user.email = email;
    user.contact = contact;
    user.department = department;
    user.role = role;
    user.status = status;

    if (password) {
        user.password = password;
    }

    saveUsers(users);

    log("Updated user " + user.id + " (" + user.email + ")" + (password ? ", password changed" : ""));

    closeModal();
    render();
    alert("User updated successfully.");

}


// ========================================
// DELETE
// ========================================

function deleteUser(id) {

    const users = loadUsers();
    const user = users.find(function (u) { return u.id === id; });

    if (!user) return;

    if (user.email.toLowerCase() === currentAdminEmail().toLowerCase()) {
        alert("You cannot delete the account you are logged in with.");
        return;
    }

    const rest = users.filter(function (u) { return u.id !== id; });

    if (activeAdmins(rest).length === 0) {
        alert("There must be at least one active Administrator.");
        return;
    }

    if (!confirm("Delete user " + user.name + " (" + user.email + ")?")) {
        return;
    }

    saveUsers(rest);
    log("Deleted user " + user.id + " (" + user.email + ")");
    render();

}


// ========================================
// SIDEBAR + LOGOUT
// ========================================

function setupSidebar() {

    document.querySelectorAll(".sidebar ul li").forEach(function (item) {

        item.addEventListener("click", function () {

            switch (item.textContent.trim()) {

                case "Dashboard":
                    window.location.href = "../Dashboard/dashboard.html";
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
                    window.location.href = "users.html";
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
