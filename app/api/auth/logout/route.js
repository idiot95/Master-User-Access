import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/auth.js";
import { clearEnvelopeCookie } from "../../../../lib/envelope.js";
import { coreConfigured, coreSignOut, selfOrigin } from "../../../../lib/upstream.js";

export const dynamic = "force-dynamic";

/**
 * Both cookies, or signing out means nothing.
 *
 * The session is this app's; the envelope is every module's, and it stays valid
 * for fifteen minutes wherever it has already been sent. Clearing only the
 * first leaves someone signed out of the console and still holding rights
 * across the fleet — the opposite of what pressing the button means.
 *
 * When core owns identity, the last hop is core's own sign-out. Clearing what
 * this app set and stopping there would look like signing out and leave the
 * person signed straight back in on the next page load, which is the worst
 * possible outcome for a button labelled the way this one is.
 */
export async function POST(request) {
  const origin = selfOrigin(request.url);
  const dest = coreConfigured()
    ? coreSignOut(origin || undefined)
    : new URL("/login", request.url);

  const res = NextResponse.redirect(dest, { status: 303 });
  // Expire rather than delete, so a stale cookie cannot outlive the sign-out.
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  // Same attributes it was set with — a cookie whose domain does not match is a
  // different cookie, and the browser keeps the one you meant to clear.
  res.cookies.set(clearEnvelopeCookie());
  return res;
}
