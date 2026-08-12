import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Expire rather than delete, so a stale cookie cannot outlive the sign-out.
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
