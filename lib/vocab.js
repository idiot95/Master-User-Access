import "server-only";
import { fetchManifest } from "./manifest.js";

/**
 * Manifests for the live modules, in the shape the resolver wants.
 *
 * Fetched, never pushed, and never on the resolver's critical path in a way
 * that can block: a module that is down simply contributes no vocabulary, which
 * makes grants against it less specific rather than absent. Nobody's access
 * depends on another team's uptime.
 */
export async function loadVocabularies(modules) {
  const live = modules.filter((m) => m.status !== "Retired" && m.url);
  const results = await Promise.all(live.map(async (m) => {
    const r = await fetchManifest(m.key, m.url);
    if (!r.ok) return [m.key, null];
    return [m.key, {
      module: m.key,
      resources: r.manifest.resources,
      dimensions: new Map((r.manifest.scopeDimensions || []).map((d) => [d.key, d])),
      hash: r.hash,
    }];
  }));
  return new Map(results.filter(([, v]) => v));
}
