import { NextResponse } from "next/server";
import { loadAccessState, buildEnvelope, isEligible } from "../../lib/access.js";
import { loadVocabularies } from "../../lib/vocab.js";
import { currentClaims } from "../../lib/session.js";
import { signEnvelope, envelopeCookieOptions, fitsInCookie, sizeOf, COOKIE_LIMIT } from "../../lib/envelope.js";
import { safeRedirect, isAllowedRedirect } from "../../lib/redirect.js";

export const dynamic = "force-dynamic";

/**
 * The door every module sends people to.
 *
 *   module has no envelope  →  /authorize?redirect=<where they were going>
 *   no console session      →  proxy.js sends them to /login and back here
 *   session                 →  resolve, sign, set the cookie, bounce them home
 *
 * This is the only place an envelope is minted. Sign-in deliberately does not
 * mint one: identity and rights expire on different clocks, and folding the two
 * together is how a session ends up outliving the permissions it was issued
 * under. The extra redirect on the first module hop costs one round trip and
 * buys a single code path where the size check and the redirect allow-list both
 * live.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("redirect");

  // proxy.js has already refused anyone without a session, so a failure here
  // means the identity headers did not survive — worth its own message rather
  // than a redirect loop back to a login that will succeed and change nothing.
  const claims = await currentClaims(request);
  if (!isEligible(claims)) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "No ITS identity reached /authorize." },
      { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const itsId = String(claims.its_id).trim();
  const state = await loadAccessState();
  const manifests = await loadVocabularies(state.modules);
  const envelope = buildEnvelope({ itsId, claims, state, manifests });
  const token = await signEnvelope(envelope);

  // Too large to be a cookie. Refusing here is the kind thing to do: setting it
  // anyway means the browser drops it silently, the module sees no envelope and
  // sends them straight back, and the only symptom is an address bar that never
  // settles. Name the person and the size, because the fix is a data one —
  // usually a role granted across every module rather than the few it needs.
  if (!fitsInCookie(token)) {
    return NextResponse.json({
      error: "envelope_too_large",
      detail: `The envelope for ${itsId} is ${sizeOf(token)} bytes, over the ${COOKIE_LIMIT} a cookie can carry.`,
      modules: Object.keys(envelope.mods).length,
      resources: Object.values(envelope.mods).reduce((n, m) => n + Object.keys(m.res).length, 0),
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const opts = {
    origin: url.origin,
    cookieDomain: process.env.COOKIE_DOMAIN,
    moduleUrls: state.modules.map((m) => m.url).filter(Boolean),
  };
  const dest = safeRedirect(target, opts);

  const res = NextResponse.redirect(new URL(dest, url.origin), { status: 303 });
  res.cookies.set({ ...envelopeCookieOptions(), value: token });
  res.headers.set("Cache-Control", "no-store");

  // A refused target is not an error for the person — they still get their
  // envelope and land on the console — but it is worth a line in the log,
  // because it is either a misconfigured module row or somebody trying it on.
  if (target && !isAllowedRedirect(target, opts)) {
    console.warn(`[authorize] refused redirect to ${target} — not a registered module or fleet host`);
  }

  return res;
}
