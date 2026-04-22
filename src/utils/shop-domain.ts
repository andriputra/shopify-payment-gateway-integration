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
