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
