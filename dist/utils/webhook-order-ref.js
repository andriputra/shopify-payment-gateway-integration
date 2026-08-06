"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookOrderReference = webhookOrderReference;
exports.webhookSwipeRequestId = webhookSwipeRequestId;
function webhookOrderReference(provider, payload) {
    const str = (v) => (v === undefined || v === null ? "" : String(v)).trim();
    if (provider === "midtrans") {
        return str(payload.order_id) || undefined;
    }
    if (provider === "xendit") {
        return str(payload.external_id) || undefined;
    }
    if (provider === "swipe") {
        return (str(payload.merchant_reference) ||
            str(payload.order_id) ||
            str(payload.invoice_number) ||
            str(payload.reference) ||
            str(payload.merchant_order_id) ||
            undefined);
    }
    if (provider === "sandbox" || provider === "custom") {
        return str(payload.orderId) || str(payload.order_id) || undefined;
    }
    return str(payload.order_id) || str(payload.external_id) || str(payload.orderId) || undefined;
}
/** Swipe create `request_id` — primary correlation when QRIS callback replaces `invoice_number`. */
function webhookSwipeRequestId(payload) {
    const str = (v) => (v === undefined || v === null ? "" : String(v)).trim();
    return str(payload.request_id) || str(payload.requestId) || undefined;
}
