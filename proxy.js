import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "./lib/auth.js";

/**
 * Nothing is reachable without a session, and identity is decided here.
 *
 * `middleware.js` in Next 15 and earlier; renamed in 16, same file, same job.
 *
 * Two things happen on every request:
 *
 *   1. The inbound `x-its-*` headers are dropped. `lib/session.js` treats them
 *      as who you are, and until ITS One Login puts a gateway in front of this
 *      app there is nothing between the browser and that header — anyone with
 *      a console session could otherwise send `x-its-id: <someone else>` and
 *      read that person's rights. Stripping them here is what makes the comment
 *      in session.js true rather than aspirational.
 *
 *   2. The verified session sets them again. One identity path: the cookie is
 *      the source, the header is how it travels inward.
 *
 * The allow-list is short and explicit rather than a pattern, because the
 * failure mode of a too-generous rule here is the whole console being open —
 * which is exactly the state this replaces.
 *
 * Verification is a local signature check, no network: proxy runs on every
 * request, and a round-trip here would tax every page.
 */
const PUBLIC = new Set([
  "/login",
  // Modules fetch this to verify envelopes, from servers that hold no session
  // of their own. It is a public key; it grants nothing.
  "/.well-known/jwks.json",
]);

/**
 * Honour an inbound `x-its-id` instead of stripping it.
 *
 * Off unless explicitly set, and it must stay off until something actually
 * terminates identity in front of this app. The day ITS One Login lands, the
 * gateway sets the header, this is set to 1, and the cookie path below stops
 * being the only way in.
 */
const TRUST_FORWARDED_ITS = process.env.TRUST_FORWARDED_ITS === "1";

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  const headers = new Headers(request.headers);
  if (!TRUST_FORWARDED_ITS) {
    headers.delete("x-its-id");
    headers.delete("x-its-name");
  }
  const forward = () => NextResponse.next({ request: { headers } });

  // Next's own assets, and the login form's own POST.
  if (
    pathname.startsWith("/_next")
    || pathname.startsWith("/api/auth")
    || pathname === "/favicon.ico"
  ) return forward();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value)
    // A missing or malformed AUTH_SECRET throws. Treat that as "not signed in"
    // rather than a 500: the login page then says what is wrong, instead of the
    // whole site failing with a digest number.
    .catch(() => null);

  if (PUBLIC.has(pathname)) {
    // Already signed in? Do not sit on the login form. The JWKS route is public
    // to everyone, signed in or not.
    return session && pathname === "/login"
      ? NextResponse.redirect(new URL("/", request.url))
      : forward();
  }

  if (!session) {
    const to = new URL("/login", request.url);
    // Come back to where they were aiming, so a shared link — and a module
    // bouncing someone through /authorize — survives the detour.
    if (pathname !== "/") to.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }

  // Only the ITS ID travels inward. The display name is read from the cookie by
  // the layout, so there is no reason to put a person's name — which may not be
  // Latin-1, and headers are — into a header at all.
  if (!TRUST_FORWARDED_ITS) headers.set("x-its-id", session.itsId);
  return forward();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
