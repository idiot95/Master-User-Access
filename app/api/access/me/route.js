import { NextResponse } from "next/server";
import { loadAccessState, buildEnvelope, isEligible } from "../../../../lib/access.js";
import { loadVocabularies } from "../../../../lib/vocab.js";
import { currentClaims } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

/**
 * The envelope for whoever is asking.
 *
 * An unprovisioned person is not an error. They get a valid envelope with an
 * empty `mods` and tier "recognised" — the expected state for most of the
 * ~10,000 who can authenticate, and the reason nothing here writes a row.
 */
export async function GET(request) {
  const claims = await currentClaims(request);
  if (!isEligible(claims)) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "No ITS identity on this request." },
      { status: 401 });
  }

  const itsId = String(claims.its_id).trim();
  const state = await loadAccessState();
  const manifests = await loadVocabularies(state.modules);
  const envelope = buildEnvelope({ itsId, claims, state, manifests });

  return NextResponse.json(envelope, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
