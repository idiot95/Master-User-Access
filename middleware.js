import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "./lib/auth.js";

/**
 * Nothing is reachable without a session.
 *
 * The allow-list is short and explicit rather than a pattern, because the
 * failure mode of a too-generous rule here is the whole console being open —
 * which is exactly the state this replaces.
 *
 * Verification is a local signature check, no network: middleware runs on every
 * request, and a round-trip here would tax every page.
 */
const PUBLIC = new Set(["/login"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Next's own assets, and the login form's own POST.
  if (
    pathname.startsWith("/_next")
    || pathname.startsWith("/api/auth")
    || pathname === "/favicon.ico"
  ) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value)
    // A missing or malformed AUTH_SECRET throws. Treat that as "not signed in"
    // rather than a 500: the login page then says what is wrong, instead of the
    // whole site failing with a digest number.
    .catch(() => null);

  if (PUBLIC.has(pathname)) {
    // Already signed in? Do not sit on the login form.
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!session) {
    const to = new URL("/login", request.url);
    // Come back to where they were aiming, so a shared link survives the detour.
    if (pathname !== "/") to.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
