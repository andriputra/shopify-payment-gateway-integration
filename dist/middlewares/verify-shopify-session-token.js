"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyShopifySessionToken = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
function decodeBase64Url(input) {
    const padLength = (4 - (input.length % 4)) % 4;
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
    return Buffer.from(normalized, "base64");
}
function isAllowedAudience(aud) {
    if (typeof aud === "string") {
        return aud === env_1.env.shopifyApiKey;
    }
    if (Array.isArray(aud)) {
        return aud.includes(env_1.env.shopifyApiKey);
    }
    return false;
}
function verifyJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid token format");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const headerJson = decodeBase64Url(encodedHeader).toString("utf8");
    const payloadJson = decodeBase64Url(encodedPayload).toString("utf8");
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);
    if (header.alg !== "HS256") {
        throw new Error("Unsupported token algorithm");
    }
    const signedData = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = node_crypto_1.default
        .createHmac("sha256", env_1.env.shopifyApiSecret)
        .update(signedData, "utf8")
        .digest("base64url");
    const a = Buffer.from(expectedSignature, "utf8");
    const b = Buffer.from(encodedSignature, "utf8");
    if (a.length !== b.length || !node_crypto_1.default.timingSafeEqual(a, b)) {
        throw new Error("Token signature mismatch");
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp <= nowSec) {
        throw new Error("Session token expired");
    }
    if (typeof payload.nbf === "number" && payload.nbf > nowSec) {
        throw new Error("Session token not active yet");
    }
    if (!isAllowedAudience(payload.aud)) {
        throw new Error("Invalid token audience");
    }
    if (typeof payload.dest !== "string" || !payload.dest.includes(".myshopify.com")) {
        throw new Error("Invalid destination shop");
    }
    return payload;
}
const verifyShopifySessionToken = (req, res, next) => {
    try {
        const auth = req.header("Authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
            return res.status(401).json({ ok: false, message: "Missing bearer token" });
        }
        const token = auth.slice("Bearer ".length).trim();
        if (!token) {
            return res.status(401).json({ ok: false, message: "Missing session token" });
        }
        const payload = verifyJwt(token);
        res.locals.shopifySession = payload;
        return next();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Invalid session token";
        return res.status(401).json({ ok: false, message });
    }
};
exports.verifyShopifySessionToken = verifyShopifySessionToken;
