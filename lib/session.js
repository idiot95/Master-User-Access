import "server-only";
import { headers } from "next/headers";

/**
 * Who is asking.
 *
 * ITS One Login is not wired yet, so this reads the claims the directory will
 * forward once it is. Until then a development escape hatch lets a request name
 * an ITS ID directly — which is why it is fenced hard:
 *
 *   · only outside production
 *   · only when ALLOW_ITS_OVERRIDE is explicitly set to 1
 *
 * Both conditions, deliberately. A single accidental env var on a deployed box
 * would otherwise turn identity into a query parameter, and this file is the
 * one place in the app where that mistake would be invisible and total.
 */

const DEV_OVERRIDE_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_ITS_OVERRIDE === "1";

export async function currentClaims(request) {
  const h = await headers();

  // What the directory forwards after ITS One Login. Trusted because it is set
  // by the gateway on the same parent domain, never by the browser.
  const forwarded = h.get("x-its-id");
  if (forwarded) {
    return {
      its_id: forwarded.trim(),
      name: h.get("x-its-name") || null,
      source: "directory",
    };
  }

  if (DEV_OVERRIDE_ENABLED && request) {
    const its = new URL(request.url).searchParams.get("its");
    if (its) return { its_id: its.trim(), name: null, source: "dev-override" };
  }
  return null;
}

/** True when the caller holds the platform-admin access role. */
export function isAdmin(envelope) {
  return envelope?.tier === "admin";
}

export const devOverrideEnabled = () => DEV_OVERRIDE_ENABLED;
