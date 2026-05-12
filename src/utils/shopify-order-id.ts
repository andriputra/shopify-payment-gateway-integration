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
