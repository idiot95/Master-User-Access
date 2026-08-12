import { NextResponse } from "next/server";
import { loadAccessState, buildEnvelope, isEligible } from "../../../../lib/access.js";
import { loadVocabularies } from "../../../../lib/vocab.js";
import { currentClaims } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

/**
 * The launcher list — only what this person can actually open.
 *
 * Hidden and Retired modules never appear, whatever the matrix says: status is
 * the module owner's switch, and access cannot override it.
 */
export async function GET(request) {
  const claims = await currentClaims(request);
  if (!isEligible(claims)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const itsId = String(claims.its_id).trim();
  const state = await loadAccessState();
  const manifests = await loadVocabularies(state.modules);
  const { mods, tier, name } = buildEnvelope({ itsId, claims, state, manifests });

  const open = state.modules
    .filter((m) => ["Live", "Beta"].includes(m.status))
    .filter((m) => Object.values(mods[m.key]?.res ?? {}).some((r) => r.v))
    .map((m) => ({
      key: m.key, name: m.name, nameArabic: m.nameArabic,
      url: m.url, icon: m.icon, status: m.status,
    }));

  return NextResponse.json({ its: itsId, name, tier, modules: open },
    { headers: { "Cache-Control": "private, no-store" } });
}
