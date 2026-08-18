import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginView } from "./view.jsx";
import { coreConfigured, coreSignIn, selfOrigin } from "../../lib/upstream.js";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — User Access" };

/**
 * Only a door when there is no better one.
 *
 * With `DA_CORE_URL` set this page never renders: sign-in belongs to the core
 * DA module, and a second form here would be a second place a password could be
 * typed. It stays as a redirect rather than a 404 so every old link, and the
 * proxy's own fallback, still land somewhere that works.
 */
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === "string" && params.next.startsWith("/") ? params.next : "/";

  if (coreConfigured()) {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    const proto = h.get("x-forwarded-proto") || "https";
    redirect(coreSignIn(`${selfOrigin(`${proto}://${host}`)}${next}`));
  }

  return (
    <LoginView
      next={next}
      // Named so the form can say what is wrong rather than failing on submit
      // with a message about credentials, which would be untrue and unfixable.
      secretMissing={!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32}
    />
  );
}
