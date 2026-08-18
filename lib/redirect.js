/**
 * Where `/authorize` is willing to send someone afterwards.
 *
 * This is the one place in the app where an attacker chooses a URL and we obey
 * it. Get it wrong and the console becomes a credential laundry: a link to
 * `useraccess.daeratulaqeeq.org/authorize?redirect=https://evil.example` arrives by
 * WhatsApp, the person is already signed in, and they land on a page that looks
 * like ours and asks for their ITS password. Nothing about that flow looks
 * suspicious from the address bar until it is too late.
 *
 * Pure and separate from the route so every rule below can be tested against
 * the strings that actually get tried.
 */

/** Hosts we will hand an envelope to, in the order they are cheapest to check. */
export function isAllowedRedirect(target, { origin, cookieDomain, moduleUrls = [] } = {}) {
  // An empty target resolves to the origin, which would pass the same-origin
  // test below and report "yes, go there" about a destination nobody named.
  // Absent is not allowed; it is a different answer, and the caller decides it.
  if (typeof target !== "string" || !target.trim()) return false;

  let url;
  try {
    url = new URL(target, origin);
  } catch {
    return false;
  }

  // Anything that is not plain web traffic. `javascript:` and `data:` are the
  // reason this is a positive test rather than a blacklist.
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  // Back to the console itself — the ordinary case after a sign-in.
  if (origin && url.origin === new URL(origin).origin) return true;

  // Any host under the domain the cookie is already set on. Those hosts can
  // read the envelope whatever we do here, so refusing to redirect to one
  // would protect nothing and break the fleet.
  const parent = String(cookieDomain || "").replace(/^\./, "").toLowerCase();
  if (parent && (url.hostname.toLowerCase() === parent || url.hostname.toLowerCase().endsWith(`.${parent}`))) {
    return true;
  }

  // A module we have a registry row for. This is what makes local development
  // work — the explorer module served on 127.0.0.1:3400 is allowed because an
  // administrator put that URL on its row, not because localhost is special.
  for (const raw of moduleUrls) {
    try {
      if (new URL(raw).origin === url.origin) return true;
    } catch {
      // A malformed URL on a registry row is the administrator's problem to
      // see on the Modules screen, not a reason to fail this request.
    }
  }

  return false;
}

/**
 * The target, or the console's own root.
 *
 * Falling back rather than erroring: a person who followed a mangled link
 * should end up somewhere useful and signed in, not staring at a 400 they can
 * do nothing about.
 */
export function safeRedirect(target, opts) {
  return target && isAllowedRedirect(target, opts) ? new URL(target, opts.origin).toString() : "/";
}
