"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
const midtrans_1 = require("./midtrans");
const sandbox_1 = require("./sandbox");
const xendit_1 = require("./xendit");
const providers = new Map([
    [xendit_1.xenditProvider.id, xendit_1.xenditProvider],
    [midtrans_1.midtransProvider.id, midtrans_1.midtransProvider],
    [sandbox_1.sandboxProvider.id, sandbox_1.sandboxProvider]
]);
function getProvider(providerId) {
    if (providerId === "custom") {
        return sandbox_1.sandboxProvider;
    }
    const provider = providers.get(providerId);
    if (!provider) {
        throw new Error(`Provider not supported: ${providerId}`);
    }
    return provider;
}
