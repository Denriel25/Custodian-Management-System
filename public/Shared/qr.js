// ========================================
// NEU CUSTODIAN MANAGEMENT SYSTEM
// SHARED QR CODE
// Makes QR codes in the browser (no internet and no library needed).
//
//   QR.svg("text")                    -> an <svg> string you can put in a page
//   qrAssetPayload("AST001")          -> text to put inside the QR of an asset
//   qrFormPayload("requisition", "26-001")  -> text for the QR of a form
//   parseQrPayload(text)              -> tells what a scanned text means
//
// The encoder supports byte mode, error correction level M, versions 1 to 10
// (up to 213 characters), which is more than enough for the codes used here.
// ========================================

const QR = (function () {

    // ----- tables (level M) -----
    const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    const NUM_BLOCKS    = [0,  1,  1,  1,  2,  2,  4,  4,  4,  5,  5];
    const MAX_VERSION = 10;

    // ----- math helpers -----
    function rawModules(ver) {

        let result = (16 * ver + 128) * ver + 64;

        if (ver >= 2) {
            const numAlign = Math.floor(ver / 7) + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (ver >= 7) result -= 36;
        }

        return result;

    }

    function dataCodewords(ver) {
        return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
    }

    // Reed-Solomon over GF(256)
    function gfMultiply(x, y) {

        let z = 0;

        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11D);
            z ^= ((y >>> i) & 1) * x;
        }

        return z;

    }

    function rsDivisor(degree) {

        const result = [];

        for (let i = 0; i < degree; i++) result.push(0);

        result[degree - 1] = 1;

        let root = 1;

        for (let i = 0; i < degree; i++) {

            for (let j = 0; j < degree; j++) {
                result[j] = gfMultiply(result[j], root);
                if (j + 1 < degree) result[j] ^= result[j + 1];
            }

            root = gfMultiply(root, 0x02);

        }

        return result;

    }

    function rsRemainder(data, divisor) {

        const result = divisor.map(function () { return 0; });

        data.forEach(function (b) {

            const factor = b ^ result.shift();

            result.push(0);

            divisor.forEach(function (coef, i) {
                result[i] ^= gfMultiply(coef, factor);
            });

        });

        return result;

    }

    function utf8Bytes(text) {

        const encoded = unescape(encodeURIComponent(text));
        const bytes = [];

        for (let i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));

        return bytes;

    }

    // ----- build the codewords (data + error correction, interleaved) -----
    function makeCodewords(bytes, ver) {

        const capacityBits = dataCodewords(ver) * 8;
        const countBits = ver <= 9 ? 8 : 16;

        const bits = [];

        function put(value, length) {
            for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
        }

        put(0x4, 4);                // byte mode
        put(bytes.length, countBits);
        bytes.forEach(function (b) { put(b, 8); });

        put(0, Math.min(4, capacityBits - bits.length));   // terminator
        put(0, (8 - bits.length % 8) % 8);                  // fill the last byte

        for (let pad = 0xEC; bits.length < capacityBits; pad ^= 0xEC ^ 0x11) put(pad, 8);

        const data = [];

        for (let i = 0; i < bits.length; i += 8) {
            let b = 0;
            for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
            data.push(b);
        }

        // split into blocks and add error correction
        const numBlocks = NUM_BLOCKS[ver];
        const eccLen = ECC_PER_BLOCK[ver];
        const raw = Math.floor(rawModules(ver) / 8);
        const numShort = numBlocks - raw % numBlocks;
        const shortLen = Math.floor(raw / numBlocks);

        const divisor = rsDivisor(eccLen);
        const blocks = [];

        for (let i = 0, k = 0; i < numBlocks; i++) {

            const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));

            k += dat.length;

            const ecc = rsRemainder(dat, divisor);

            if (i < numShort) dat.push(0);

            blocks.push(dat.concat(ecc));

        }

        // interleave
        const result = [];

        for (let i = 0; i < blocks[0].length; i++) {
            blocks.forEach(function (block, j) {
                if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]);
            });
        }

        return result;

    }

    // ----- draw the matrix -----
    function makeMatrix(codewords, ver) {

        const size = ver * 4 + 17;
        const modules = [];
        const isFunction = [];

        for (let y = 0; y < size; y++) {
            modules.push(new Array(size).fill(false));
            isFunction.push(new Array(size).fill(false));
        }

        function setFunction(x, y, dark) {
            modules[y][x] = dark;
            isFunction[y][x] = true;
        }

        function drawFinder(cx, cy) {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    const x = cx + dx, y = cy + dy;
                    if (x >= 0 && x < size && y >= 0 && y < size) {
                        setFunction(x, y, dist !== 2 && dist !== 4);
                    }
                }
            }
        }

        function drawAlignment(cx, cy) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                }
            }
        }

        function drawFormat(mask) {

            // error correction level M has the value 0
            const data = (0 << 3) | mask;

            let rem = data;

            for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);

            const bits = ((data << 10) | rem) ^ 0x5412;

            function bit(i) { return ((bits >>> i) & 1) !== 0; }

            for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i));
            setFunction(8, 7, bit(6));
            setFunction(8, 8, bit(7));
            setFunction(7, 8, bit(8));
            for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i));

            for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i));
            for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i));

            setFunction(8, size - 8, true);   // the always-dark module

        }

        function drawVersion() {

            if (ver < 7) return;

            let rem = ver;

            for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);

            const bits = (ver << 12) | rem;

            for (let i = 0; i < 18; i++) {
                const dark = ((bits >>> i) & 1) !== 0;
                const a = size - 11 + i % 3;
                const b = Math.floor(i / 3);
                setFunction(a, b, dark);
                setFunction(b, a, dark);
            }

        }

        // function patterns
        for (let i = 0; i < size; i++) {
            setFunction(6, i, i % 2 === 0);
            setFunction(i, 6, i % 2 === 0);
        }

        drawFinder(3, 3);
        drawFinder(size - 4, 3);
        drawFinder(3, size - 4);

        // alignment patterns
        const positions = [];

        if (ver > 1) {

            const numAlign = Math.floor(ver / 7) + 2;
            const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;

            positions.push(6);

            for (let pos = size - 7; positions.length < numAlign; pos -= step) positions.splice(1, 0, pos);

            positions.forEach(function (cx, i) {
                positions.forEach(function (cy, j) {
                    const corner = (i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0);
                    if (!corner) drawAlignment(cx, cy);
                });
            });

        }

        drawFormat(0);   // placeholder, the real one is drawn after choosing the mask
        drawVersion();

        // data bits in the zigzag order
        let bitIndex = 0;

        for (let right = size - 1; right >= 1; right -= 2) {

            if (right === 6) right = 5;

            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {

                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vert : vert;

                    if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
                        modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
                        bitIndex++;
                    }

                }
            }

        }

        // masks
        function applyMask(mask) {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {

                    let invert;

                    switch (mask) {
                        case 0: invert = (x + y) % 2 === 0; break;
                        case 1: invert = y % 2 === 0; break;
                        case 2: invert = x % 3 === 0; break;
                        case 3: invert = (x + y) % 3 === 0; break;
                        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                        case 5: invert = x * y % 2 + x * y % 3 === 0; break;
                        case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
                        default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
                    }

                    if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];

                }
            }
        }

        // the standard 4 penalty rules, used to pick the most readable mask
        function penalty() {

            let score = 0;
            let dark = 0;

            function lineScore(get) {

                let s = 0;
                let run = 1;

                for (let i = 1; i < size; i++) {
                    if (get(i) === get(i - 1)) {
                        run++;
                        if (run === 5) s += 3; else if (run > 5) s++;
                    } else {
                        run = 1;
                    }
                }

                // pattern like the finder (1:1:3:1:1) with a light zone next to it
                const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
                const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];

                for (let i = 0; i + 11 <= size; i++) {
                    let a = true, b = true;
                    for (let k = 0; k < 11; k++) {
                        if (get(i + k) !== pattern1[k]) a = false;
                        if (get(i + k) !== pattern2[k]) b = false;
                    }
                    if (a) s += 40;
                    if (b) s += 40;
                }

                return s;

            }

            for (let y = 0; y < size; y++) {
                score += lineScore(function (i) { return modules[y][i]; });
                for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
            }

            for (let x = 0; x < size; x++) {
                score += lineScore(function (i) { return modules[i][x]; });
            }

            for (let y = 0; y < size - 1; y++) {
                for (let x = 0; x < size - 1; x++) {
                    const c = modules[y][x];
                    if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
                }
            }

            const total = size * size;
            const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;

            return score + Math.max(k, 0) * 10;

        }

        let bestMask = 0;
        let bestScore = Infinity;

        for (let mask = 0; mask < 8; mask++) {

            applyMask(mask);
            drawFormat(mask);

            const p = penalty();

            if (p < bestScore) {
                bestScore = p;
                bestMask = mask;
            }

            applyMask(mask);   // undo

        }

        applyMask(bestMask);
        drawFormat(bestMask);

        return modules;

    }

    // ----- public -----
    function matrix(text) {

        const bytes = utf8Bytes(String(text));

        for (let ver = 1; ver <= MAX_VERSION; ver++) {

            const countBits = ver <= 9 ? 8 : 16;

            if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) {
                return makeMatrix(makeCodewords(bytes, ver), ver);
            }

        }

        throw new Error("The text is too long for the QR code (maximum 213 characters).");

    }

    // an <svg> string. "size" is the width and height in pixels (default 160)
    function svg(text, options) {

        options = options || {};

        const modules = matrix(text);
        const border = options.border === undefined ? 4 : options.border;
        const size = modules.length + border * 2;

        let path = "";

        for (let y = 0; y < modules.length; y++) {

            let x = 0;

            while (x < modules.length) {

                if (modules[y][x]) {

                    let end = x;

                    while (end < modules.length && modules[y][end]) end++;

                    path += "M" + (x + border) + "," + (y + border) + "h" + (end - x) + "v1h-" + (end - x) + "z";

                    x = end;

                } else {
                    x++;
                }

            }

        }

        const px = options.size || 160;

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" width="' + px + '" height="' + px +
               '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
               '<rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';

    }

    return { matrix: matrix, svg: svg };

})();


// ========================================
// WHAT IS INSIDE THE QR CODES OF THIS SYSTEM
//   assets: NEU-CMS|ASSET|AST001
//   forms : NEU-CMS|FORM|requisition|26-001   (type = requisition, receipt or pullout)
// ========================================

const QR_PREFIX = "NEU-CMS";

function qrAssetPayload(assetId) {
    return QR_PREFIX + "|ASSET|" + assetId;
}

function qrFormPayload(type, controlNo) {
    return QR_PREFIX + "|FORM|" + type + "|" + controlNo;
}

// Tells what a scanned (or typed) text means:
//   { kind: "asset", id }          { kind: "form", type, controlNo }
//   { kind: "form-number", controlNo }  (only the number was typed)
//   { kind: "unknown", text }
function parseQrPayload(text) {

    const raw = String(text || "").trim();
    const parts = raw.split("|");

    if (parts[0] === QR_PREFIX && parts[1] === "ASSET" && parts[2]) {
        return { kind: "asset", id: parts[2] };
    }

    if (parts[0] === QR_PREFIX && parts[1] === "FORM" && parts[2] && parts[3]) {
        return { kind: "form", type: parts[2], controlNo: parts[3] };
    }

    // typed by hand or read by a keyboard-style scanner
    if (/^(DEMO-)?AST\d+(-U\d+)?$/i.test(raw)) {
        return { kind: "asset", id: raw.toUpperCase() };
    }

    if (/^\d{2}-\d+$/.test(raw)) {
        return { kind: "form-number", controlNo: raw };
    }

    return { kind: "unknown", text: raw };

}
