import { NextResponse } from "next/server";
import { publicJwks } from "../../../lib/envelope.js";

export const dynamic = "force-dynamic";

/**
 * The public half of the signing key.
 *
 * Every module fetches this to verify envelopes, so it is deliberately open —
 * it carries no authority. Knowing the public key lets you check a signature;
 * it does not let you make one.
 *
 * Cached for five minutes at the edge and served stale for a day after that.
 * The staleness is the point: if this app is down, modules keep verifying
 * against the last copy they hold rather than locking everyone out over an
 * outage in a service that is not on their request path.
 */
export async function GET() {
  let jwks;
  try {
    jwks = await publicJwks();
  } catch (e) {
    // A missing key is a deployment that was never finished, not a bug worth a
    // stack trace. Say which variable, because that is the whole fix.
    return NextResponse.json(
      { error: "signing_key_not_configured", detail: String(e.message || e) },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
