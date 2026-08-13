import { NextResponse } from "next/server";
import { verifyEnvelope, rightsFor, resourcesOf, consoleUrl, ENVELOPE_COOKIE } from "./verify.js";

/**
 * The gate, as one line in a module's `proxy.js`.
 *
 *   import { accessProxy } from "@al-rayhaanat/access/proxy";
 *   export default accessProxy({ module: "hoto" });
 *   export const config = { matcher: accessMatcher };
 *
 * What it does, and just as importantly what it does not:
 *
 *   · verifies the envelope locally — a signature check, no call to the access
 *     console on the request path, so the console being down does not take the
 *     module down with it
 *   · sends anyone without one to the console to get one, and back again
 *   · refuses anyone the envelope does not mention, without another round trip:
 *     a fresh envelope would say the same thing, and bouncing them for one is
 *     how a permission problem becomes a redirect loop
 *   · **does not enforce anything below the module.** Which resource, which
 *     verb, which jamiat — that is `requireAccess` on the write path. This runs
 *     before the route is even chosen; it cannot know what the request is about.
 *
 * File named `proxy.js` for Next 16, where `middleware.js` is deprecated under
 * the same behaviour. `accessMiddleware` is the same function under the older
 * name, so a module that has not migrated works unchanged.
 */

/** Everything except Next's own plumbing. Modules can pass their own. */
export const accessMatcher = ["/((?!_next/static|_next/image|favicon.ico).*)"];

/**
 * Never gated, whatever the module configures.
 *
 * `/.well-known/` is how the console reads this module — the manifest, and the
 * scope endpoints. Gating those behind an envelope makes registering the module
 * depend on already having registered it. The scope endpoints carry their own
 * bearer token; the manifest is vocabulary and needs none.
 */
const ALWAYS_OPEN = ["/.well-known/"];

/** One redirect to the console is a fix; two in a row is a loop. */
const RETRY_COOKIE = "da_authing";

export function accessProxy(options = {}) {
  const {
    module,
    console: consoleOverride,
    publicPaths = [],
    onDenied,
  } = options;

  if (!module) throw new Error("accessProxy needs a module key — the same one on its registry row.");

  return async function proxy(request) {
    const { pathname } = request.nextUrl;
    const origin = (consoleOverride || consoleUrl()).replace(/\/+$/, "");

    if (isOpen(pathname, publicPaths)) return NextResponse.next();

    // Identity arrives in a cookie and travels inward as headers. Anything
    // inbound claiming to be those headers is a browser trying it on.
    const headers = new Headers(request.headers);
    headers.delete("x-da-its");
    headers.delete("x-da-tier");

    const envelope = await verifyEnvelope(request.cookies.get(ENVELOPE_COOKIE)?.value);

    if (!envelope) {
      // A browser can be sent to fetch one. An API client or a form POST cannot
      // — a 303 would turn their POST into a GET of a login page and report it
      // as success.
      if (!wantsHtml(request)) return unauthorized(origin);

      if (request.cookies.get(RETRY_COOKIE)) {
        // We already sent them once and they came back with nothing. Almost
        // always COOKIE_DOMAIN on the console not matching this host, which no
        // number of further redirects will fix.
        return stop(
          `Signed in at ${origin}, but no envelope cookie arrived at ${request.nextUrl.host}. `
          + "Check COOKIE_DOMAIN on the access console covers this host.");
      }

      const to = new URL("/authorize", origin);
      to.searchParams.set("redirect", request.nextUrl.href);
      const res = NextResponse.redirect(to);
      res.cookies.set({ name: RETRY_COOKIE, value: "1", path: "/", maxAge: 60, httpOnly: true, sameSite: "lax" });
      return res;
    }

    // Nothing in this module. Not a sign-in problem — a grant problem.
    if (!resourcesOf(envelope, module).length) {
      return onDenied
        ? onDenied({ request, envelope, module })
        : forbidden(`${envelope.its} has no access to ${module}.`);
    }

    headers.set("x-da-its", envelope.its);
    headers.set("x-da-tier", envelope.tier);

    const res = NextResponse.next({ request: { headers } });
    // Got here with a valid envelope, so the retry marker has done its job.
    if (request.cookies.get(RETRY_COOKIE)) {
      res.cookies.set({ name: RETRY_COOKIE, value: "", path: "/", maxAge: 0 });
    }
    return res;
  };
}

/** The same thing under the name Next used before 16. */
export const accessMiddleware = accessProxy;

/* ------------------------------------------------------------------ *
 * Small parts, kept separate so they can be read
 * ------------------------------------------------------------------ */

function isOpen(pathname, extra) {
  if (ALWAYS_OPEN.some((p) => pathname.startsWith(p))) return true;
  return extra.some((p) =>
    p instanceof RegExp ? p.test(pathname) : pathname === p || pathname.startsWith(`${p}/`));
}

/** A navigation, as opposed to a fetch, a form post or a robot. */
function wantsHtml(request) {
  return request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");
}

const unauthorized = (origin) =>
  NextResponse.json(
    { error: "no_envelope", detail: `No valid access envelope. Sign in at ${origin}.` },
    { status: 401, headers: { "Cache-Control": "no-store" } });

const forbidden = (detail) =>
  NextResponse.json({ error: "forbidden", detail }, { status: 403, headers: { "Cache-Control": "no-store" } });

const stop = (detail) =>
  NextResponse.json({ error: "envelope_not_arriving", detail }, { status: 500, headers: { "Cache-Control": "no-store" } });

export { rightsFor };
