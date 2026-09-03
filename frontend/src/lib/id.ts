/**
 * A locally-unique id for client-only state — React list keys on draft rows
 * that don't have a server id yet (a new plating photo, a new POS modifier
 * option, a new menu-period line). Never sent to the backend as real data.
 *
 * crypto.randomUUID() is spec'd to require a secure context (HTTPS or
 * `localhost`) — it's silently undefined on a plain-HTTP LAN origin, which
 * is exactly what a phone hits when testing against the dev server's
 * network URL (e.g. http://192.168.0.160:5180). Don't reach for it here.
 */
export function localId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
