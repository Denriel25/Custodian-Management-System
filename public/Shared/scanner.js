// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED QR SCANNER
// A window to scan a QR code with the camera, or to type / scan the code
// with a keyboard-style barcode scanner.
//
//   openScanner({
//       title: "Scan Asset QR",
//       hint:  "Scan the QR label of an asset",
//       onCode: function (parsed, raw) {
//           // parsed comes from parseQrPayload() (Shared/qr.js)
//           // return true       -> close the window
//           // return "message"  -> show the message and keep scanning
//       }
//   });
//
// Camera reading uses the browser's BarcodeDetector when it exists. Otherwise it
// tries to load the jsQR library from the internet. If neither works, typing the
// code (or using a USB scanner) always works.
// ========================================

(function () {

    const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

    function addStyles() {

        if (document.getElementById("qsStyles")) return;

        const style = document.createElement("style");

        style.id = "qsStyles";
        style.textContent =
            ".qs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;justify-content:center;align-items:center;z-index:3000;padding:15px;}" +
            ".qs-box{background:#222;color:#fff;width:440px;max-width:100%;border-radius:12px;padding:22px;font-family:inherit;box-shadow:0 10px 40px rgba(0,0,0,.5);}" +
            ".qs-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}" +
            ".qs-head h3{font-size:18px;margin:0;}" +
            ".qs-x{background:none;border:none;color:#fff;font-size:26px;cursor:pointer;line-height:1;}" +
            ".qs-hint{font-size:13px;color:#aaa;margin-bottom:14px;}" +
            ".qs-video{display:none;width:100%;border-radius:8px;background:#000;margin-bottom:10px;max-height:300px;object-fit:cover;}" +
            ".qs-row{display:flex;gap:8px;margin-bottom:10px;}" +
            ".qs-row input{flex:1;padding:11px;border-radius:6px;border:1px solid #555;background:#333;color:#fff;font-size:14px;outline:none;}" +
            ".qs-row input:focus{border-color:#edae0f;}" +
            ".qs-btn{border:none;border-radius:6px;padding:11px 16px;font-weight:600;cursor:pointer;background:#edae0f;color:#000;font-size:14px;}" +
            ".qs-btn.light{background:#444;color:#fff;}" +
            ".qs-btn:hover{opacity:.88;}" +
            ".qs-msg{min-height:20px;font-size:13px;color:#ffc107;margin-top:4px;}";

        document.head.appendChild(style);

    }

    function make(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    }

    window.openScanner = function (options) {

        options = options || {};
        addStyles();

        let stream = null;
        let detector = null;
        let timer = null;
        let lastRaw = "";
        let lastTime = 0;
        let closed = false;

        // ----- window -----
        const overlay = make("div", "qs-overlay");
        const box = make("div", "qs-box");
        const head = make("div", "qs-head");
        const closeBtn = make("button", "qs-x", "\u00D7");
        const video = make("video", "qs-video");
        const cameraRow = make("div", "qs-row");
        const startBtn = make("button", "qs-btn light", "Start Camera");
        const stopBtn = make("button", "qs-btn light", "Stop Camera");
        const manualRow = make("div", "qs-row");
        const input = make("input");
        const goBtn = make("button", "qs-btn", "Open");
        const msg = make("div", "qs-msg");

        closeBtn.type = "button";
        startBtn.type = "button";
        stopBtn.type = "button";
        goBtn.type = "button";
        stopBtn.style.display = "none";
        video.setAttribute("playsinline", "");
        video.muted = true;
        input.type = "text";
        input.placeholder = "Type or scan the code (e.g. AST001 or 26-001)";
        input.autocomplete = "off";
        msg.setAttribute("aria-live", "polite");

        head.appendChild(make("h3", "", options.title || "Scan QR Code"));
        head.appendChild(closeBtn);

        cameraRow.appendChild(startBtn);
        cameraRow.appendChild(stopBtn);
        manualRow.appendChild(input);
        manualRow.appendChild(goBtn);

        box.appendChild(head);
        box.appendChild(make("div", "qs-hint", options.hint || "Point the camera at a QR code, or type the code below."));
        box.appendChild(video);
        box.appendChild(cameraRow);
        box.appendChild(manualRow);
        box.appendChild(msg);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        input.focus();

        // ----- closing -----
        function close() {

            if (closed) return;

            closed = true;
            stopCamera();
            document.removeEventListener("keydown", onKey);
            overlay.remove();

        }

        function onKey(e) {
            if (e.key === "Escape") close();
        }

        document.addEventListener("keydown", onKey);
        closeBtn.addEventListener("click", close);

        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) close();
        });

        // ----- a code was read -----
        function handle(raw) {

            raw = String(raw || "").trim();

            if (!raw) {
                msg.textContent = "Please type or scan a code.";
                return;
            }

            // the camera sees the same QR many times a second: ignore repeats for 2 seconds
            const now = Date.now();

            if (raw === lastRaw && now - lastTime < 2000) return;

            lastRaw = raw;
            lastTime = now;

            const result = options.onCode ? options.onCode(parseQrPayload(raw), raw) : true;

            if (result === true) {
                close();
            } else {
                msg.textContent = typeof result === "string" ? result : "";
            }

        }

        goBtn.addEventListener("click", function () { handle(input.value); });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                handle(input.value);
            }
        });

        // ----- camera -----
        function stopCamera() {

            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            if (stream) {
                stream.getTracks().forEach(function (t) { t.stop(); });
                stream = null;
            }

            video.srcObject = null;
            video.style.display = "none";
            startBtn.style.display = "";
            stopBtn.style.display = "none";

        }

        function loadJsQR() {

            return new Promise(function (resolve, reject) {

                if (typeof window.jsQR === "function") {
                    resolve();
                    return;
                }

                const script = document.createElement("script");

                script.src = JSQR_URL;
                script.onload = function () { resolve(); };
                script.onerror = function () { reject(new Error("jsQR could not be loaded")); };
                document.head.appendChild(script);

            });

        }

        // Gives back a function that reads one frame: () => Promise<string | "">
        function prepareReader() {

            if ("BarcodeDetector" in window) {

                try {
                    detector = new BarcodeDetector({ formats: ["qr_code"] });
                } catch (e) {
                    detector = null;
                }

            }

            if (detector) {
                return Promise.resolve(function () {
                    return detector.detect(video).then(function (codes) {
                        return codes && codes.length ? codes[0].rawValue : "";
                    });
                });
            }

            return loadJsQR().then(function () {

                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d", { willReadFrequently: true });

                return function () {

                    if (!video.videoWidth) return Promise.resolve("");

                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = window.jsQR(image.data, image.width, image.height);

                    return Promise.resolve(code ? code.data : "");

                };

            });

        }

        function cameraProblem(err) {

            const name = err && err.name;

            if (name === "NotAllowedError" || name === "SecurityError") {
                return "The camera is blocked. Allow the camera for this page, or type the code below.";
            }

            if (name === "NotFoundError" || name === "OverconstrainedError") {
                return "No camera was found. Type the code below instead.";
            }

            if (err && /jsQR/.test(err.message || "")) {
                return "This browser cannot read QR codes from the camera while offline. Type the code below instead.";
            }

            return "The camera could not be started. Type the code below instead.";

        }

        startBtn.addEventListener("click", function () {

            msg.textContent = "";

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                msg.textContent = "The camera cannot be used on this page. Open the system with localhost or https, or type the code below.";
                return;
            }

            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })

                .then(function (s) {

                    stream = s;
                    video.srcObject = s;
                    video.style.display = "block";
                    startBtn.style.display = "none";
                    stopBtn.style.display = "";

                    return video.play();

                })

                .then(prepareReader)

                .then(function (readFrame) {

                    msg.textContent = "Point the camera at the QR code...";
                    let busy = false;

                    timer = setInterval(function () {

                        if (busy || closed) return;

                        busy = true;

                        readFrame().then(function (raw) {
                            busy = false;
                            if (raw) handle(raw);
                        }).catch(function () {
                            busy = false;
                        });

                    }, 300);

                })

                .catch(function (err) {
                    stopCamera();
                    msg.textContent = cameraProblem(err);
                });

        });

        stopBtn.addEventListener("click", function () {
            stopCamera();
            msg.textContent = "";
        });

    };

})();
