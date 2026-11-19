// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// REQUESTER LOGIN JAVASCRIPT
// ========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "Requester Login loaded successfully."
        );


        // ========================================
        // GET LOGIN FORM
        // ========================================

        const loginForm =
            document.getElementById(
                "loginForm"
            );


        const loginButton =
            document.getElementById(
                "loginButton"
            );


        // ========================================
        // LOGIN FORM
        // ========================================

        loginForm.addEventListener(
            "submit",
            function (event) {

                event.preventDefault();


                // ========================================
                // GET INPUT VALUES
                // ========================================

                const email =
                    document
                        .getElementById("email")
                        .value
                        .trim();


                const password =
                    document
                        .getElementById("password")
                        .value
                        .trim();


                // ========================================
                // VALIDATION
                // ========================================

                if (
                    email === "" ||
                    password === ""
                ) {

                    alert(
                        "Please enter your email and password."
                    );

                    return;

                }


                // ========================================
            // LOGIN (checked by Laravel: hashed password, session, role)
            // ========================================

            const original = loginButton ? loginButton.textContent : "";

            if (loginButton) { loginButton.disabled = true; loginButton.textContent = "Signing in..."; }

            function done() {
                if (loginButton) { loginButton.disabled = false; loginButton.textContent = original; }
            }

            if (typeof cmsLogin !== "function") {
                done();
                alert("The page could not reach the server. Please reload the page.");
                return;
            }

            cmsLogin("requester", email, password).then(function (res) {

                const data = res.data || {};

                if (res.ok && data.ok) {

                    alert("Login successful!");

                    // the browser hints (userEmail / userRole) are set by Laravel on the next page
                    window.location.href = data.redirect;
                    return;

                }

                done();

                if (res.status === 429) {
                    alert("Too many login attempts. Please wait a minute and try again.");
                } else if (res.status === 419) {
                    alert("This page expired. It will reload now.");
                    window.location.reload();
                } else {
                    alert(data.message || "Login failed. Please try again.");
                }

            }).catch(function () {
                done();
                alert("Could not reach the server. Check your connection and try again.");
            });

            }
        );

    }
);
