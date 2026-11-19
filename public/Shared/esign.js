// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED E-SIGNATURE WINDOW (E-Sign + E-Upload)
//
//   openESign({
//       title:      "Department Head Signature",
//       signerRole: "Department Head",
//       signerName: "Dr. Juan Dela Cruz",   // shown (and editable when nameEditable is true)
//       nameEditable: true,                 // Department Head: name is typed by hand
//       nameNote:   "Name taken from the Auditor account",
//       onSave: function (sig) { ... }      // sig = { name, image, method: "drawn" | "uploaded" }
//   });
//
// E-Sign:   draw with a mouse, a finger or a stylus (Pointer Events). Clear / Redraw / Preview.
// E-Upload: PNG, JPG or JPEG image of a handwritten signature. Validate / Preview / Replace / Remove.
// Nothing is saved until "Confirm and Save" and a confirmation question.
//
// FRONTEND SIMULATION: the image is kept in the browser (localStorage). A real backend will store the file.
// Put <script src="../../Shared/esign.js"></script> before the page script.
// ========================================

(function () {

    const MAX_BYTES = 2 * 1024 * 1024;
    const OK_TYPES = ["image/png", "image/jpeg", "image/jpg"];

    function injectStyle() {

        if (document.getElementById("esignStyle")) return;

        const css = document.createElement("style");
        css.id = "esignStyle";
        css.textContent =
            ".es-back{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;font-family:'Poppins',sans-serif}" +
            ".es-box{background:#1a1a1a;color:#eee;border:1px solid #333;border-radius:14px;width:100%;max-width:560px;max-height:94vh;overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.6)}" +
            ".es-box h3{color:#edae0f;font-size:18px;margin-bottom:4px}" +
            ".es-sub{font-size:12px;color:#aaa;margin-bottom:14px}" +
            ".es-label{display:block;font-size:12px;color:#bbb;margin:10px 0 4px}" +
            ".es-input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #444;background:#111;color:#fff;font-size:14px}" +
            ".es-input[readonly]{opacity:.75;cursor:not-allowed}" +
            ".es-tabs{display:flex;gap:6px;margin:14px 0 10px}" +
            ".es-tab{flex:1;padding:9px;border-radius:8px;border:1px solid #444;background:#111;color:#ccc;cursor:pointer;font-size:13px}" +
            ".es-tab.on{background:#edae0f;color:#000;border-color:#edae0f;font-weight:600}" +
            ".es-pad{width:100%;height:170px;background:#fff;border-radius:10px;touch-action:none;cursor:crosshair;display:block}" +
            ".es-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
            ".es-btn{padding:9px 16px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#eee;cursor:pointer;font-size:13px}" +
            ".es-btn:hover{border-color:#edae0f}" +
            ".es-gold{background:#edae0f;color:#000;border-color:#edae0f;font-weight:600}" +
            ".es-btn:disabled{opacity:.4;cursor:not-allowed}" +
            ".es-prev{margin-top:12px;background:#fff;border-radius:10px;min-height:90px;display:flex;align-items:center;justify-content:center;padding:6px}" +
            ".es-prev img{max-width:100%;max-height:120px}" +
            ".es-prev span{color:#777;font-size:12px}" +
            ".es-tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:20px;background:#333;color:#edae0f;margin-top:8px}" +
            ".es-err{color:#ff7a7a;font-size:12px;margin-top:8px;min-height:16px}" +
            ".es-pane{display:none}.es-pane.on{display:block}";
        document.head.appendChild(css);

    }

    function el(tag, cls, html) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function safe(text) {
        const d = document.createElement("div");
        d.textContent = text == null ? "" : String(text);
        return d.innerHTML;
    }

    // true when the canvas has at least one stroke
    function hasInk(canvas) {
        const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
        return false;
    }

    window.openESign = function (opts) {

        injectStyle();
        opts = opts || {};

        let mode = "draw";          // "draw" | "upload"
        let drawnImage = "";        // dataURL of the preview from the pad
        let uploadedImage = "";     // dataURL of the chosen file

        const back = el("div", "es-back");
        const box = el("div", "es-box");
        back.appendChild(box);

        box.innerHTML =
            "<h3>" + safe(opts.title || "Signature") + "</h3>" +
            '<div class="es-sub">' + safe(opts.signerRole || "") + (opts.nameNote ? " &middot; " + safe(opts.nameNote) : "") + "</div>" +
            '<label class="es-label">Signatory name</label>' +
            '<input class="es-input" id="esName" type="text" value="' + safe(opts.signerName || "") + '"' +
                (opts.nameEditable ? ' placeholder="Type the full name"' : " readonly") + ">" +
            '<div class="es-tabs"><button type="button" class="es-tab on" data-m="draw">E-Sign (draw)</button>' +
            '<button type="button" class="es-tab" data-m="upload">E-Upload (image)</button></div>' +

            '<div class="es-pane on" id="esDraw">' +
                '<canvas class="es-pad" id="esPad" width="1000" height="340"></canvas>' +
                '<div class="es-row">' +
                    '<button type="button" class="es-btn" id="esClear">Clear / Redraw</button>' +
                    '<button type="button" class="es-btn" id="esPreview">Preview</button>' +
                '</div>' +
            "</div>" +

            '<div class="es-pane" id="esUp">' +
                '<input type="file" id="esFile" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden>' +
                '<div class="es-row">' +
                    '<button type="button" class="es-btn" id="esChoose">Choose image</button>' +
                    '<button type="button" class="es-btn" id="esRemove" disabled>Remove</button>' +
                "</div>" +
                '<div class="es-sub" style="margin-top:8px">PNG, JPG or JPEG. Up to 2 MB. Use a clear photo of a handwritten signature on white paper.</div>' +
            "</div>" +

            '<div class="es-prev" id="esPrev"><span>Signature preview appears here</span></div>' +
            '<span class="es-tag" id="esTag" style="display:none"></span>' +
            '<div class="es-err" id="esErr"></div>' +
            '<div class="es-row" style="justify-content:flex-end">' +
                '<button type="button" class="es-btn" id="esCancel">Cancel</button>' +
                '<button type="button" class="es-btn es-gold" id="esSave" disabled>Confirm and Save</button>' +
            "</div>";

        document.body.appendChild(back);

        const $ = function (id) { return box.querySelector("#" + id); };
        const pad = $("esPad");
        const ctx = pad.getContext("2d");

        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#101a4a";

        // ----- drawing (mouse, touch and stylus all come as pointer events) -----
        let drawing = false;

        function pos(e) {
            const r = pad.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height) };
        }

        pad.addEventListener("pointerdown", function (e) {
            drawing = true;
            pad.setPointerCapture(e.pointerId);
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 0.1, p.y + 0.1);
            ctx.stroke();
            e.preventDefault();
        });

        pad.addEventListener("pointermove", function (e) {
            if (!drawing) return;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            e.preventDefault();
        });

        function stop() { drawing = false; }
        pad.addEventListener("pointerup", stop);
        pad.addEventListener("pointercancel", stop);
        pad.addEventListener("pointerleave", stop);

        // ----- preview + state -----
        function showPreview(src, label) {
            const prev = $("esPrev");
            prev.innerHTML = src ? '<img alt="Signature preview" src="' + src + '">' : "<span>Signature preview appears here</span>";
            const tag = $("esTag");
            tag.style.display = src ? "inline-block" : "none";
            tag.textContent = label || "";
            refresh();
        }

        function currentImage() { return mode === "draw" ? drawnImage : uploadedImage; }

        function refresh() {
            $("esSave").disabled = !currentImage();
            $("esRemove").disabled = !uploadedImage;
        }

        function err(msg) { $("esErr").textContent = msg || ""; }

        $("esClear").addEventListener("click", function () {
            ctx.clearRect(0, 0, pad.width, pad.height);
            drawnImage = "";
            err("");
            showPreview("", "");
        });

        $("esPreview").addEventListener("click", function () {
            err("");
            if (!hasInk(pad)) { err("Draw the signature first."); return; }
            drawnImage = pad.toDataURL("image/png");
            showPreview(drawnImage, "Signature method: Drawn (E-Sign)");
        });

        // ----- upload -----
        $("esChoose").addEventListener("click", function () { $("esFile").click(); });

        $("esFile").addEventListener("change", function () {

            err("");
            const file = this.files && this.files[0];
            this.value = "";
            if (!file) return;

            const okName = /\.(png|jpe?g)$/i.test(file.name);

            if (OK_TYPES.indexOf(file.type) === -1 || !okName) { err("Only PNG, JPG or JPEG images are allowed."); return; }
            if (file.size > MAX_BYTES) { err("The image is too big. Maximum is 2 MB."); return; }

            const reader = new FileReader();

            reader.onload = function () {
                // make sure it is really an image
                const test = new Image();
                test.onload = function () {
                    uploadedImage = String(reader.result);
                    $("esChoose").textContent = "Replace image";
                    showPreview(uploadedImage, "Signature method: Uploaded (E-Upload)");
                };
                test.onerror = function () { err("This file is not a valid image."); };
                test.src = String(reader.result);
            };

            reader.onerror = function () { err("The file could not be read."); };
            reader.readAsDataURL(file);

        });

        $("esRemove").addEventListener("click", function () {
            uploadedImage = "";
            $("esChoose").textContent = "Choose image";
            err("");
            showPreview("", "");
        });

        // ----- tabs -----
        box.querySelectorAll(".es-tab").forEach(function (t) {
            t.addEventListener("click", function () {
                mode = t.dataset.m;
                box.querySelectorAll(".es-tab").forEach(function (x) { x.classList.toggle("on", x === t); });
                $("esDraw").classList.toggle("on", mode === "draw");
                $("esUp").classList.toggle("on", mode === "upload");
                err("");
                const img = currentImage();
                showPreview(img, img ? (mode === "draw" ? "Signature method: Drawn (E-Sign)" : "Signature method: Uploaded (E-Upload)") : "");
            });
        });

        // ----- close / save -----
        function close() { back.remove(); }

        $("esCancel").addEventListener("click", close);
        back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });

        $("esSave").addEventListener("click", function () {

            err("");
            const name = $("esName").value.trim();

            if (!name) { err("The signatory name is required."); return; }

            // the drawn signature is read again from the pad, so a change after "Preview" is not lost
            if (mode === "draw") {
                if (!hasInk(pad)) { err("Draw the signature first."); return; }
                drawnImage = pad.toDataURL("image/png");
            }

            const image = currentImage();
            if (!image) { err("Add a signature first."); return; }

            const how = mode === "draw" ? "drawn" : "uploaded";

            if (!confirm("Save this " + how + " signature for " + name + "?\n\nAfter saving, the signature becomes part of the requisition record.")) return;

            close();

            if (typeof opts.onSave === "function") opts.onSave({ name: name, image: image, method: how });

        });

    };

    // small helper for pages: "Drawn (E-Sign)" / "Uploaded (E-Upload)"
    window.signMethodText = function (sig) {
        if (!sig) return "";
        return sig.method === "uploaded" ? "Uploaded (E-Upload)" : sig.method === "legacy" ? "Signed on the paper form" : "Drawn (E-Sign)";
    };

})();
