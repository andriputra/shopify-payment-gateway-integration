"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureApiKey = ensureApiKey;
function ensureApiKey(credentials) {
    if (!credentials.apiKey) {
        throw new Error("Missing provider apiKey");
    }
    return credentials.apiKey;
}
