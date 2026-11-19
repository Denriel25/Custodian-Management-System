// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// LARAVEL BRIDGE
//
// Loaded FIRST on every page (Laravel inserts it right after <head>, together with window.CMS).
// The existing pages keep reading and writing their data through localStorage, exactly as before.
// This file makes that data real:
//
//   1. HYDRATE  The page arrives with the current database state (window.CMS.state, rendered by
//               Laravel for the logged-in role). It is written into localStorage before any other
//               script runs, so every page starts with real data (no demo or stale browser data).
//   2. SAVE     Every change to a data key is compared with the last known state and sent to
//               Laravel record by record (POST api/sync/push). Laravel checks the user's role.
//               Changes are kept in an outbox (localStorage) until Laravel confirms them, so a save
//               followed by a page change is never lost.
//   3. REFRESH  Every few seconds the browser asks Laravel what changed (GET api/sync/pull) and
//               updates localStorage, then raises the usual "storage" event, so the existing
//               "update when another window changes the data" code keeps working across users.
//   4. SESSION  cmsSignOut() ends the Laravel session (used by every Logout button).
//
// Passwords never live here: the users collection has no passwords; a password typed in
// Admin > Users is sent once to Laravel, hashed there, and removed from the browser copy.
// ========================================
(function () {

    "use strict";

    const CMS = window.CMS;
    if (!CMS || !CMS.server) return;

    const LS = window.localStorage;
    const SS = window.sessionStorage;
    const rawSet = Storage.prototype.setItem;
    const rawRemove = Storage.prototype.removeItem;

    // base path of the site (so it also works when the app is not at the domain root)
    const scriptSrc = (document.currentScript && document.currentScript.src) || "";
    const BASE = scriptSrc ? scriptSrc.replace(/Shared\/laravel-bridge\.js.*$/, "") : "/";

    const OBJECTS = ["systemSettings", "formCounters"];
    const COLS = CMS.collections || [];
    const TRACK = {};
    COLS.forEach(function (c) { TRACK[c] = true; });

    const POLL_MS = 8000;
    const DEMO_FLAGS = ["demoSeeded_v3", "demoSeeded_v2"];


    // ========================================
    // SMALL HELPERS
    // ========================================

    function csrf() {
        const m = document.querySelector('meta[name="csrf-token"]');
        return m ? m.getAttribute("content") : CMS.csrf;
    }

    function headers() {
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-CSRF-TOKEN": csrf(),
            "X-Requested-With": "XMLHttpRequest"
        };
    }

    // fetch + JSON. Resolves { ok, status, data } (rejects only when the network fails)
    function api(method, path, body) {
        return fetch(path.indexOf("http") === 0 ? path : BASE + path.replace(/^\//, ""), {
            method: method,
            credentials: "same-origin",
            headers: headers(),
            body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                return { ok: res.ok, status: res.status, data: data || {} };
            });
        });
    }

    window.cmsApi = api;
    window.cmsBase = BASE;

    function loginUrl() {
        return BASE + (/\/Requester\//.test(location.pathname) ? "Requester/RequesterLogin/login.html" : "Admin/Login/login.html");
    }

    // ----- small message at the bottom left (errors and saving state) -----
    function toast(message, bad) {

        function show() {
            let box = document.getElementById("cms-toasts");
            if (!box) {
                box = document.createElement("div");
                box.id = "cms-toasts";
                box.setAttribute("role", "status");
                box.setAttribute("aria-live", "polite");
                box.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:3600;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100vw - 100px));pointer-events:none;";
                document.body.appendChild(box);
            }
            const t = document.createElement("div");
            t.textContent = message;
            t.style.cssText = "pointer-events:auto;padding:10px 14px;border-radius:8px;font:500 13px/1.4 Poppins,Arial,sans-serif;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.35);background:" + (bad ? "#b3261e" : "#2b2b2b") + ";";
            box.appendChild(t);
            setTimeout(function () { t.remove(); }, bad ? 6500 : 2500);
        }

        if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
    }

    window.cmsToast = toast;

    // the small "Saving..." / "Offline" label
    let statusTimer = null;
    function setStatus(state) {

        function paint() {
            let el = document.getElementById("cms-sync");
            if (!el) {
                el = document.createElement("div");
                el.id = "cms-sync";
                el.setAttribute("role", "status");
                el.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:3500;padding:6px 12px;border-radius:14px;font:500 12px Poppins,Arial,sans-serif;color:#fff;background:#2b2b2b;box-shadow:0 4px 14px rgba(0,0,0,.3);display:none;";
                const style = document.createElement("style");
                style.textContent = "@media print{#cms-sync,#cms-toasts{display:none!important}}";
                document.head.appendChild(style);
                document.body.appendChild(el);
            }
            clearTimeout(statusTimer);
            if (state === "idle") { el.style.display = "none"; return; }
            const text = { saving: "Saving...", saved: "Saved", offline: "Offline - will retry" }[state] || "";
            el.textContent = text;
            el.style.background = state === "offline" ? "#b3261e" : "#2b2b2b";
            el.style.display = "block";
            if (state === "saved") statusTimer = setTimeout(function () { el.style.display = "none"; }, 1200);
        }

        if (document.body) paint(); else document.addEventListener("DOMContentLoaded", paint);
    }

    function sessionExpired() {
        if (stopped) return;
        stopped = true;
        toast("Your session has ended. Please log in again.", true);
        setTimeout(function () { location.href = loginUrl(); }, 1800);
    }

    let stopped = false;


    // ========================================
    // GUEST PAGES (login pages and the landing page): only the helpers above
    // ========================================

    window.cmsLogin = function (side, email, password) {
        return api("POST", "auth/login", { side: side, email: email, password: password });
    };

    if (CMS.guest || !CMS.user) return;


    // ========================================
    // 1. HYDRATE
    // ========================================

    const me = CMS.user;
    let writable = {};
    (CMS.writable || []).forEach(function (c) { writable[c] = true; });

    // the browser's idea of "who is logged in" comes from Laravel, not from anything the user typed
    SS.setItem("userEmail", me.email);
    SS.setItem("userRole", me.role === "Requester" ? "requester" : "admin");

    // each tab has its own outbox (it survives page changes inside the tab)
    const TAB = SS.getItem("cmsTab") || (function () {
        const id = Math.random().toString(36).slice(2, 10);
        SS.setItem("cmsTab", id);
        return id;
    })();
    const OUTBOX = "cmsOutbox:" + TAB;

    function emptyPending() { return { up: {}, del: {} }; }

    let pending = emptyPending();

    function readOutbox(key) {
        try {
            const v = JSON.parse(LS.getItem(key));
            return v && v.up && v.del ? v : null;
        } catch (e) { return null; }
    }

    function mergePending(into, from) {
        Object.keys(from.up).forEach(function (c) {
            Object.keys(from.up[c]).forEach(function (k) {
                into.up[c] = into.up[c] || {};
                into.up[c][k] = from.up[c][k];
                if (into.del[c]) delete into.del[c][k];
            });
        });
        Object.keys(from.del).forEach(function (c) {
            Object.keys(from.del[c]).forEach(function (k) {
                into.del[c] = into.del[c] || {};
                into.del[c][k] = 1;
                if (into.up[c]) delete into.up[c][k];
            });
        });
    }

    function persist() {
        try {
            if (hasPending()) rawSet.call(LS, OUTBOX, JSON.stringify(pending));
            else rawRemove.call(LS, OUTBOX);
        } catch (e) { /* storage full: the data is still in memory */ }
    }

    function hasPending() {
        return Object.keys(pending.up).some(function (c) { return Object.keys(pending.up[c]).length; }) ||
               Object.keys(pending.del).some(function (c) { return Object.keys(pending.del[c]).length; });
    }

    // snapshot of what Laravel is known to have: collection -> { key: json }
    const snap = {};

    function stripPassword(rec) {
        if (!rec || typeof rec !== "object" || !("password" in rec)) return rec;
        const copy = Object.assign({}, rec);
        delete copy.password;
        return copy;
    }

    function snapOf(c, value) {
        const s = {};
        if (OBJECTS.indexOf(c) !== -1) { s._ = JSON.stringify(value); return s; }
        (Array.isArray(value) ? value : []).forEach(function (rec) {
            if (rec && rec.id != null) s[String(rec.id)] = JSON.stringify(c === "users" ? stripPassword(rec) : rec);
        });
        return s;
    }

    function readLocal(c) {
        try {
            const v = JSON.parse(LS.getItem(c));
            return OBJECTS.indexOf(c) !== -1 ? (v && typeof v === "object" && !Array.isArray(v) ? v : {}) : (Array.isArray(v) ? v : []);
        } catch (e) { return OBJECTS.indexOf(c) !== -1 ? {} : []; }
    }

    function writeLocal(c, value) {
        try {
            rawSet.call(LS, c, JSON.stringify(value));
            return true;
        } catch (e) {
            toast("The browser storage is full. Some data may not be shown.", true);
            return false;
        }
    }

    (function hydrate() {

        const state = CMS.state || {};

        COLS.forEach(function (c) {
            if (Object.prototype.hasOwnProperty.call(state, c)) {
                writeLocal(c, state[c]);
                snap[c] = snapOf(c, state[c]);
            } else {
                rawRemove.call(LS, c);        // this role may not read it: make sure nothing old stays
                snap[c] = {};
            }
        });

        // the demo data of the prototype is never created automatically: the data comes from the database
        DEMO_FLAGS.forEach(function (flag) { rawSet.call(LS, flag, "server"); });

        // changes of THIS tab that Laravel has not confirmed yet (for example a save right before a page change)
        const own = readOutbox(OUTBOX);
        if (own) mergePending(pending, own);

        // outboxes of tabs that were closed before they could send: adopt them
        const now = Date.now();
        for (let i = 0; i < LS.length; i++) {
            const key = LS.key(i);
            if (!key || key.indexOf("cmsOutbox:") !== 0 || key === OUTBOX) continue;
            const tab = key.slice("cmsOutbox:".length);
            const alive = parseInt(LS.getItem("cmsAlive:" + tab), 10) || 0;
            if (now - alive > 20000) {
                const orphan = readOutbox(key);
                if (orphan) mergePending(pending, orphan);
                rawRemove.call(LS, key);
                rawRemove.call(LS, "cmsAlive:" + tab);
                i = -1;
            }
        }

        // show those changes on this page too, then send them
        Object.keys(pending.up).forEach(function (c) {
            if (!TRACK[c]) return;
            const keys = Object.keys(pending.up[c]);
            if (!keys.length) return;
            if (OBJECTS.indexOf(c) !== -1) { writeLocal(c, pending.up[c]._); snap[c] = snapOf(c, pending.up[c]._); return; }
            const list = readLocal(c);
            keys.forEach(function (k) {
                const rec = pending.up[c][k];
                const at = list.findIndex(function (r) { return String(r.id) === k; });
                const shown = c === "users" ? stripPassword(rec) : rec;
                if (at === -1) list.push(shown); else list[at] = shown;
                snap[c][k] = JSON.stringify(shown);
            });
            writeLocal(c, list);
        });
        Object.keys(pending.del).forEach(function (c) {
            const keys = Object.keys(pending.del[c]);
            if (!keys.length || !TRACK[c] || OBJECTS.indexOf(c) !== -1) return;
            writeLocal(c, readLocal(c).filter(function (r) { return keys.indexOf(String(r.id)) === -1; }));
            keys.forEach(function (k) { delete snap[c][k]; });
        });

        persist();

    })();


    // ========================================
    // 2. SAVE (localStorage write -> Laravel)
    // ========================================

    function queueUp(c, k, rec) {
        pending.up[c] = pending.up[c] || {};
        pending.up[c][k] = rec;
        if (pending.del[c]) delete pending.del[c][k];
        persist();
        schedule(30);
    }

    function queueDel(c, k) {
        pending.del[c] = pending.del[c] || {};
        pending.del[c][k] = 1;
        if (pending.up[c]) delete pending.up[c][k];
        persist();
        schedule(30);
    }

    // a page wrote localStorage[c] = raw: find what really changed
    function onWrite(c, raw) {

        if (stopped || !writable[c]) return;     // not allowed to change this data: stays in this browser only

        let value;
        try { value = JSON.parse(raw); } catch (e) { return; }

        const s = snap[c] = snap[c] || {};

        if (OBJECTS.indexOf(c) !== -1) {
            if (!value || typeof value !== "object" || Array.isArray(value)) return;
            const j = JSON.stringify(value);
            if (s._ !== j) { s._ = j; queueUp(c, "_", value); }
            return;
        }

        if (!Array.isArray(value)) return;

        const seen = {};
        let hadPassword = false;

        value.forEach(function (rec) {

            if (!rec || typeof rec !== "object" || rec.id == null) return;

            const k = String(rec.id);
            const clean = c === "users" ? stripPassword(rec) : rec;
            const j = JSON.stringify(clean);
            const withPassword = c === "users" && rec.password;

            seen[k] = 1;

            if (s[k] !== j || withPassword) {
                s[k] = j;
                queueUp(c, k, rec);
                if (withPassword) hadPassword = true;
            }

        });

        Object.keys(s).forEach(function (k) {
            if (!seen[k]) { delete s[k]; queueDel(c, k); }
        });

        // the browser copy of the users never keeps a password
        if (hadPassword) writeLocal(c, value.map(stripPassword));

    }

    Storage.prototype.setItem = function (key, value) {
        rawSet.apply(this, arguments);
        if (this === LS && TRACK[key]) {
            try { onWrite(key, String(value)); } catch (e) { console.error("cms bridge:", e); }
        }
    };

    Storage.prototype.removeItem = function (key) {
        rawRemove.apply(this, arguments);
        if (this === LS && TRACK[key]) {
            try { onWrite(key, OBJECTS.indexOf(key) !== -1 ? "{}" : "[]"); } catch (e) { console.error("cms bridge:", e); }
        }
    };

    // ----- sending -----
    let sending = false;
    let sendTimer = null;
    let failures = 0;

    function schedule(delay) {
        if (sendTimer || stopped) return;
        sendTimer = setTimeout(function () { sendTimer = null; send(); }, delay == null ? 30 : delay);
    }

    // takes up to `limit` changes out of the pending list (not removed until confirmed)
    function buildBatch(limit) {

        const byCol = {};
        const sent = [];
        let n = 0;

        Object.keys(pending.up).forEach(function (c) {
            Object.keys(pending.up[c]).forEach(function (k) {
                if (n >= limit) return;
                const rec = pending.up[c][k];
                (byCol[c] = byCol[c] || { c: c, upserts: [], deletes: [] }).upserts.push({ k: k, d: rec });
                sent.push({ t: "u", c: c, k: k, j: JSON.stringify(rec) });
                n++;
            });
        });

        Object.keys(pending.del).forEach(function (c) {
            Object.keys(pending.del[c]).forEach(function (k) {
                if (n >= limit) return;
                (byCol[c] = byCol[c] || { c: c, upserts: [], deletes: [] }).deletes.push(k);
                sent.push({ t: "d", c: c, k: k });
                n++;
            });
        });

        return n ? { changes: Object.keys(byCol).map(function (c) { return byCol[c]; }), sent: sent } : null;

    }

    // remove confirmed changes (a record that changed again meanwhile stays pending)
    function ack(batch) {
        batch.sent.forEach(function (x) {
            if (x.t === "u") {
                if (pending.up[x.c] && pending.up[x.c][x.k] !== undefined && JSON.stringify(pending.up[x.c][x.k]) === x.j) delete pending.up[x.c][x.k];
            } else if (pending.del[x.c]) {
                delete pending.del[x.c][x.k];
            }
        });
        persist();
    }

    let reloadTimer = null;

    // Laravel refused something (the person's role may not do it): tell them and show the real data again
    function onRejected(list) {

        const reasons = [];
        list.forEach(function (r) { if (r.reason && reasons.indexOf(r.reason) === -1) reasons.push(r.reason); });
        toast("Not saved: " + (reasons.join(" ") || "you are not allowed to do this."), true);

        const last = parseInt(SS.getItem("cmsReloadAt"), 10) || 0;
        if (Date.now() - last > 15000 && !reloadTimer) {
            reloadTimer = setTimeout(function () {
                SS.setItem("cmsReloadAt", String(Date.now()));
                location.reload();
            }, 2200);
        }

    }

    function send() {

        if (sending || stopped) return;

        const batch = buildBatch(300);

        if (!batch) { return; }

        sending = true;
        setStatus("saving");

        api("POST", "api/sync/push", { changes: batch.changes }).then(function (res) {

            sending = false;

            if (res.status === 401 || res.status === 419) { sessionExpired(); return; }

            // a request that can never succeed (for example too large): drop it, do not retry forever
            if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
                ack(batch);
                toast("Could not save: " + (res.data.message || ("error " + res.status)), true);
                setStatus("idle");
                if (hasPending()) schedule(0);
                return;
            }

            if (!res.ok) { fail(); return; }

            failures = 0;
            ack(batch);

            if (res.data.rejected && res.data.rejected.length) onRejected(res.data.rejected);

            if (hasPending()) { schedule(0); } else { setStatus("saved"); }

        }).catch(function () {
            sending = false;
            fail();
        });

    }

    function fail() {
        failures++;
        setStatus("offline");
        schedule([2000, 5000, 10000, 30000][Math.min(failures - 1, 3)]);
    }

    window.addEventListener("online", function () { failures = 0; schedule(0); });

    // keep the "this tab is alive" mark so other tabs do not adopt this outbox
    function heartbeat() { try { rawSet.call(LS, "cmsAlive:" + TAB, String(Date.now())); } catch (e) { /* ignore */ } }
    heartbeat();
    setInterval(heartbeat, 3000);

    // what is left from before the page changed
    if (hasPending()) schedule(0);


    // ========================================
    // 3. REFRESH (Laravel -> localStorage)
    // ========================================

    let rev = CMS.rev || 0;
    let polling = false;

    function notify(c) {
        try { window.dispatchEvent(new StorageEvent("storage", { key: c, storageArea: LS })); } catch (e) { /* old browser */ }
    }

    function isPending(c, k) {
        return !!((pending.up[c] && pending.up[c][k] !== undefined) || (pending.del[c] && pending.del[c][k]));
    }

    function applyPull(data) {

        const touched = {};

        (data.changes || []).forEach(function (ch) {

            const c = ch.c, k = ch.k;
            if (!TRACK[c]) return;
            const s = snap[c] = snap[c] || {};

            if (OBJECTS.indexOf(c) !== -1) {
                if (ch.d && !isPending(c, "_")) {
                    const j = JSON.stringify(ch.d);
                    if (s._ !== j) { s._ = j; writeLocal(c, ch.d); touched[c] = true; }
                }
                return;
            }

            if (isPending(c, k)) return;            // this browser's own newer change wins until Laravel confirms it

            const list = readLocal(c);
            const at = list.findIndex(function (r) { return String(r.id) === k; });

            if (ch.d === null) {
                if (at !== -1) { list.splice(at, 1); writeLocal(c, list); touched[c] = true; }
                delete s[k];
                return;
            }

            const j = JSON.stringify(ch.d);
            if (s[k] === j && at !== -1 && JSON.stringify(list[at]) === j) return;

            if (at === -1) list.push(ch.d); else list[at] = ch.d;
            s[k] = j;
            writeLocal(c, list);
            touched[c] = true;

        });

        // users are small: Laravel always sends the whole list
        if (Array.isArray(data.users) && !(pending.up.users && Object.keys(pending.up.users).length) && !(pending.del.users && Object.keys(pending.del.users).length)) {
            const j = JSON.stringify(data.users);
            if (JSON.stringify(readLocal("users")) !== j) {
                writeLocal("users", data.users);
                snap.users = snapOf("users", data.users);
                touched.users = true;
            }
        }

        if (Array.isArray(data.writable)) {
            writable = {};
            data.writable.forEach(function (c) { writable[c] = true; });
        }

        if (typeof data.rev === "number") rev = Math.max(rev, data.rev);

        Object.keys(touched).forEach(notify);

    }

    function poll() {

        if (polling || stopped || document.hidden) return;

        polling = true;

        api("GET", "api/sync/pull?since=" + rev).then(function (res) {

            polling = false;

            if (res.status === 401 || res.status === 419) { sessionExpired(); return; }
            if (!res.ok) return;

            applyPull(res.data);

            if (res.data.more) poll();

        }).catch(function () { polling = false; });

    }

    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });


    // ========================================
    // 4. SESSION
    // ========================================

    // Sends what is still waiting (used by Logout, where the page is about to go away).
    function flushSync() {

        for (let i = 0; i < 5 && hasPending(); i++) {

            const batch = buildBatch(400);
            if (!batch) break;

            const x = new XMLHttpRequest();
            x.open("POST", BASE + "api/sync/push", false);
            const h = headers();
            Object.keys(h).forEach(function (name) { x.setRequestHeader(name, h[name]); });

            try {
                x.send(JSON.stringify({ changes: batch.changes }));
            } catch (e) { return; }

            if (x.status >= 200 && x.status < 300) ack(batch); else return;

        }

    }

    // Ends the Laravel session and removes this person's data from the browser.
    window.cmsSignOut = function () {

        try { flushSync(); } catch (e) { /* ignore */ }

        try {
            const x = new XMLHttpRequest();
            x.open("POST", BASE + "auth/logout", false);
            const h = headers();
            Object.keys(h).forEach(function (name) { x.setRequestHeader(name, h[name]); });
            x.send("{}");
        } catch (e) { /* the session cookie will expire anyway */ }

        stopped = true;
        COLS.forEach(function (c) { rawRemove.call(LS, c); });
        rawRemove.call(LS, OUTBOX);
        rawRemove.call(LS, "cmsAlive:" + TAB);

    };

})();
