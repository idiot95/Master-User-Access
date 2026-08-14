import { NextResponse } from "next/server";
import { getModules } from "../../../../lib/model.js";

export const dynamic = "force-dynamic";

/**
 * The scope lists this console offers when a picker opens.
 *
 * It is a module in its own registry, so it answers the same endpoint every
 * other module does — there is one contract, and the console is not exempt
 * from it just because it happens to be the thing doing the asking.
 *
 * **Identifiers and labels only. Never row content.** Called when a picker
 * opens, never on the request path, so if this is slow nobody's access breaks.
 */
const DIMENSIONS = {
  module: async () => (await getModules())
    .filter((m) => m.status !== "Retired")
    .map((m) => ({ id: m.key, label: m.name ?? m.key })),
};

export async function GET(request, { params }) {
  /**
   * Authenticated, even though module keys are hardly secret. The contract
   * this console publishes says these endpoints take a bearer token, and a
   * console that exempted itself from its own rule would be teaching every
   * module author that the rule is optional.
   */
  const expected = process.env.ACCESS_SCOPE_TOKEN;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !token || token !== expected) {
    return new NextResponse("", { status: 401 });
  }

  const { dimension } = await params;
  const load = DIMENSIONS[dimension];
  if (!load) return NextResponse.json({ error: "unknown_dimension" }, { status: 404 });

  return NextResponse.json({
    dimension,
    generated: new Date().toISOString(),
    items: await load(),
  }, { headers: { "Cache-Control": "private, max-age=300" } });
}
