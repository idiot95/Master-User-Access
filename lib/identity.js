import { readSession, SESSION_COOKIE } from "./auth.js";
import { coreConfigured, coreCookie, readCoreIdentity } from "./upstream.js";

/**
 * Who is signed in — from core when core exists, from this app when it does not.
 *
 * One function so `proxy.js` and the layout cannot disagree about it. Both hand
 * in a reader rather than a cookie jar, because Next gives them different
 * objects with the same shape and neither is worth importing into the other.
 *
 * The two paths return the same `{ itsId, name }`, which is what lets the rest
 * of the app stay unaware of which one ran.
 */
export async function readIdentity(getCookie) {
  if (coreConfigured()) {
    return await readCoreIdentity(getCookie(coreCookie())).catch(() => null);
  }
  // A missing or short AUTH_SECRET throws in here. Treat it as "not signed in"
  // rather than a 500 — the login page then says what is wrong.
  return await readSession(getCookie(SESSION_COOKIE)).catch(() => null);
}
