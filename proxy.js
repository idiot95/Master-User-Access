import { NextResponse } from "next/server";
import { readIdentity } from "./lib/identity.js";
import { coreConfigured, coreSignIn, selfOrigin } from "./lib/upstream.js";

/**
 * Nothing is reachable without a session, and identity is decided here.
 *
 * `middleware.js` in Next 15 and earlier; renamed in 16, same file, same job.
 *
 * Two things happen on every request:
 *
 *   1. The inbound `x-its-*` headers are dropped. `lib/session.js` treats them
 *      as who you are, and until something terminates identity in front of this
 *      app there is nothing between the browser and that header — anyone with
 *      a console session could otherwise send `x-its-id: <someone else>` and
 *      read that person's rights. Stripping them here is what makes the comment
 *      in session.js true rather than aspirational.
 *
 *   2. The verified identity sets them again. One identity path: a cookie is
 *      the source, the header is how it travels inward.
 *
 * Where that cookie comes from is `lib/identity.js`' business. With
 * `DA_CORE_URL` set it is a token the core DA module signed, and this app has
 * no sign-in of its own; without it, the interim local session still applies.
 * Neither case changes anything below the proxy.
 *
 * The allow-list is short and explicit rather than a pattern, because the
 * failure mode of a too-generous rule here is the whole console being open.
 */
const PUBLIC = new Set([
  "/login",
  // Modules fetch this to verify envelopes, from servers that hold no session
  // of their own. It is a public key; it grants nothing.
  "/.well-known/jwks.json",
  // This console is a module in its own registry, so it declares itself the
  // same way every other module does — and a manifest is vocabulary, fetched
  // by a server with no session. Gating it would make registering this module
  // depend on having already registered it.
  "/.well-known/access-manifest.json",
]);

/**
 * Honour an inbound `x-its-id` instead of stripping it.
 *
 * Off unless explicitly set, and it must stay off unless a gateway terminates
 * identity in front of this app. Core signing a cookie is not that gateway —
 * that path is verified here, in code, and needs no trusted header.
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

  const session = await readIdentity((name) => request.cookies.get(name)?.value);

  if (PUBLIC.has(pathname)) {
    // Already signed in? Do not sit on the login form. The JWKS route is public
    // to everyone, signed in or not.
    return session && pathname === "/login"
      ? NextResponse.redirect(new URL("/", request.url))
      : forward();
  }

  if (!session) return NextResponse.redirect(signInFor(request, pathname));

  // Only the ITS ID travels inward. The display name is read from the cookie by
  // the layout, so there is no reason to put a person's name — which may not be
  // Latin-1, and headers are — into a header at all.
  if (!TRUST_FORWARDED_ITS) headers.set("x-its-id", session.itsId);
  return forward();
}

/**
 * Where an unauthenticated request is sent, and how it finds its way back.
 *
 * Core is off-origin, so the return address has to be absolute and has to be
 * this console's public origin rather than the request's — see `selfOrigin`.
 */
function signInFor(request, pathname) {
  const here = pathname + request.nextUrl.search;

  if (coreConfigured()) {
    const origin = selfOrigin(request.url);
    return coreSignIn(origin ? `${origin}${here}` : here);
  }

  const to = new URL("/login", request.url);
  // Come back to where they were aiming, so a shared link — and a module
  // bouncing someone through /authorize — survives the detour.
  if (pathname !== "/") to.searchParams.set("next", here);
  return to;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
