export function normalizeShopDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/.*$/, "");
}

export function shopDomainAliases(value: string): string[] {
  const normalized = normalizeShopDomain(value);
  return Array.from(
    new Set(
      [value.trim(), value.trim().toLowerCase(), normalized, `https://${normalized}`, `https://${normalized}/`].filter(
        Boolean
      )
    )
  );
}

export function shopDomainsMatch(left: string, right: string): boolean {
  return normalizeShopDomain(left) === normalizeShopDomain(right);
}

/** Canonical `*.myshopify.com` hostname for API keys and storage. */
export function normalizeShopifyShopDomain(value: string): string {
  const base = normalizeShopDomain(value).replace(/^www\./, "");
  if (!base) {
    return "";
  }
  if (base.endsWith(".myshopify.com")) {
    return base;
  }
  return `${base}.myshopify.com`;
}

/**
 * Shop identifier for payment bridge storage, store config, and public status APIs.
 * - Bare label (`mystore`) → `mystore.myshopify.com`
 * - Already `*.myshopify.com` → unchanged (after cleanup)
 * - Custom host (`https://www.brand.com`, `pay.store.co.id`) → lowercase hostname only; must match saved config and checkout calls
 */
export function normalizeMerchantShopKey(value: string): string {
  const base = normalizeShopDomain(value).replace(/^www\./, "");
  if (!base) {
    return "";
  }
  if (base.endsWith(".myshopify.com")) {
    return base;
  }
  if (base.includes(".")) {
    return base;
  }
  return `${base}.myshopify.com`;
}

/** Normalize numeric order id or Admin GID to canonical `gid://shopify/Order/{id}`. */
export function normalizeShopifyOrderGid(input: string): string {
  const t = input.trim();
  if (/^\d+$/.test(t)) {
    return `gid://shopify/Order/${t}`;
  }
  const m = /^gid:\/\/shopify\/Order\/(\d+)$/i.exec(t);
  if (m) {
    return `gid://shopify/Order/${m[1]}`;
  }
  return t;
}
