import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/auth.js";
import { clearEnvelopeCookie } from "../../../../lib/envelope.js";

export const dynamic = "force-dynamic";

/**
 * Both cookies, or signing out means nothing.
 *
 * The session is this app's; the envelope is every module's, and it stays valid
 * for fifteen minutes wherever it has already been sent. Clearing only the
 * first leaves someone signed out of the console and still holding rights
 * across the fleet — the opposite of what pressing the button means.
 */
export async function POST(request) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Expire rather than delete, so a stale cookie cannot outlive the sign-out.
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  // Same attributes it was set with — a cookie whose domain does not match is a
  // different cookie, and the browser keeps the one you meant to clear.
  res.cookies.set(clearEnvelopeCookie());
  return res;
}
