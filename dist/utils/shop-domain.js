"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeShopDomain = normalizeShopDomain;
exports.shopDomainAliases = shopDomainAliases;
exports.shopDomainsMatch = shopDomainsMatch;
exports.normalizeShopifyShopDomain = normalizeShopifyShopDomain;
function normalizeShopDomain(value) {
    return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/.*$/, "");
}
function shopDomainAliases(value) {
    const normalized = normalizeShopDomain(value);
    return Array.from(new Set([value.trim(), value.trim().toLowerCase(), normalized, `https://${normalized}`, `https://${normalized}/`].filter(Boolean)));
}
function shopDomainsMatch(left, right) {
    return normalizeShopDomain(left) === normalizeShopDomain(right);
}
/** Canonical `*.myshopify.com` hostname for API keys and storage. */
function normalizeShopifyShopDomain(value) {
    const base = normalizeShopDomain(value).replace(/^www\./, "");
    if (!base) {
        return "";
    }
    if (base.endsWith(".myshopify.com")) {
        return base;
    }
    return `${base}.myshopify.com`;
}
