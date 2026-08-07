"use strict";
/**
 * Swipe Pay EDC / gateway response code reference (vendor mapping).
 * Used for callback logging, MySQL seeding, and payment status API responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWIPE_RESPONSE_CODES = exports.SWIPE_APPROVED_RESPONSE_CODES = void 0;
exports.normalizeSwipeResponseCode = normalizeSwipeResponseCode;
exports.isSwipeApprovedResponseCode = isSwipeApprovedResponseCode;
exports.lookupSwipeResponseMessage = lookupSwipeResponseMessage;
exports.swipeResponseCodeCount = swipeResponseCodeCount;
/**
 * Codes that mean sale approved / paid on EDC callback (including temporary vendor quirks).
 * Keep in sync with `parseWebhook` and `webhooks.ts` payment_redirect updates.
 */
exports.SWIPE_APPROVED_RESPONSE_CODES = new Set([
    "00",
    "000",
    "0020",
    /** QRIS callback: additional_param.response_code with message "PAYMENT ALREADY PAID." / status Processed. */
    "0011",
    /** TEMPORARY: Swipe may send status Pending + message "Error Process" while EDC is already paid. Confirm with Swipe and remove when documented. */
    "-10023"
]);
function normalizeSwipeResponseCode(code) {
    if (code === undefined || code === null) {
        return "";
    }
    return String(code).trim();
}
function isSwipeApprovedResponseCode(code) {
    const key = normalizeSwipeResponseCode(code);
    if (!key) {
        return false;
    }
    if (exports.SWIPE_APPROVED_RESPONSE_CODES.has(key)) {
        return true;
    }
    const upper = key.toUpperCase();
    return /^0{2,3}$/.test(upper);
}
exports.SWIPE_RESPONSE_CODES = {
    "0": "Tidak ada alamat yang terkait dengan nama host",
    "1": "Kesalahan Koneksi",
    "2": "Validasi SSL gagal",
    "3": "Koneksi waktu habis",
    "4": "Gagal terhubung",
    "5": "Terjadi Kesalahan, Silakan Coba Lagi",
    "0011": "Paid (QRIS / PAYMENT ALREADY PAID)",
    "-1001": "Aid not found",
    "-1002": "Capk not found",
    "-1003": "Online Denied",
    "-1004": "Offline declined as to unable Online",
    "-1005": "Waktu habis. Silakan mulai ulang transaksi.",
    "-1006": "Kartu telah dikeluarkan selama transaksi",
    "-1007": "See Phone",
    "-1008": "Transaksi Dibatalkan",
    "-1009": "Error Swipe silahkan Dip atau coba kartu lain",
    "-1010": "Error Dip silahkan Swipe atau coba kartu lain",
    "-1011": "Error Tap silahkan Dip atau coba kartu lain",
    "-1012": "PIN offline tidak didukung. Silakan hubungi support.",
    "-1013": "Data kartu tidak terbaca. Silakan coba dengan kartu lain.",
    "-1014": "Dip, Tap, atau coba kartu lain",
    "-1015": "Fallback, \n Perbaiki posisi kartu ketika proses dip, lalu coba kembali",
    "-1016": "Kartu telah dicabut/dilepas. Pastikan kartu di Dip atau Tap dengan benar.",
    "-1017": "Terjadi kesalahan pada Pinpad. Silakan coba lagi atau hubungi support.",
    "-1018": "Input PIN dibatalkan. Silakan mulai ulang transaksi.",
    "-1019": "Waktu input PIN habis. Silakan mulai ulang transaksi.",
    "-1020": "Terdeteksi lebih dari satu kartu. Silakan gunakan satu kartu saja.",
    "-1021": "Data kartu tidak lengkap. Silakan coba dengan kartu lain.",
    "-1022": "Data kartu tidak valid. Silakan coba dengan kartu lain.",
    "-1023": "Terjadi kesalahan saat memproses transaksi. Silakan coba lagi.",
    /** TEMP: Swipe sends "Error Process" but EDC is paid — treat as approved until vendor documents -10023. */
    "-10023": "Paid (EDC approved; Swipe code -10023)",
    "-1024": "",
    "-1025": "PIN Required",
    "-1026": "Input Signature dibatalkan. Silakan mulai ulang transaksi.",
    "-1027": "",
    "-1028": "",
    "-1029": "",
    "-1030": "",
    "-1031": "",
    "-1032": "",
    "-1033": "",
    "-1034": "",
    "-1035": "",
    "-1036": "",
    "-1037": "",
    "-1038": "Low battery."
};
function lookupSwipeResponseMessage(code) {
    if (code === undefined || code === null) {
        return undefined;
    }
    const key = String(code).trim();
    if (!key) {
        return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(exports.SWIPE_RESPONSE_CODES, key)) {
        return undefined;
    }
    const msg = exports.SWIPE_RESPONSE_CODES[key];
    return msg === "" ? undefined : msg;
}
function swipeResponseCodeCount() {
    return Object.keys(exports.SWIPE_RESPONSE_CODES).length;
}
