import { NextResponse } from "next/server";
import { getModules, getAccessRoles, getAccessMembers } from "../../lib/model.js";

export const dynamic = "force-dynamic";

/**
 * One search across everything the console holds.
 *
 * Loaded on first ⌘K rather than on every page, since most visits never open it.
 * Deliberately narrow: keys, names and ITS IDs. Nothing here is a permission
 * decision, so it carries no rights and no personal detail beyond what the
 * Members screen already shows.
 */
export async function GET() {
  const [modules, roles, members] = await Promise.all([
    getModules(), getAccessRoles(), getAccessMembers(),
  ]);

  const items = [
    { group: "Go to", label: "Overview", href: "/" },
    { group: "Go to", label: "Roles", href: "/roles" },
    { group: "Go to", label: "Permissions", href: "/permissions" },
    { group: "Go to", label: "Modules", href: "/modules" },
    { group: "Go to", label: "Members", href: "/members" },
    { group: "Go to", label: "Overrides", href: "/overrides" },
    { group: "Go to", label: "Explain", href: "/explain" },

    ...modules.map((m) => ({
      group: "Module", label: m.name, hint: `${m.key} · ${m.status}`, href: "/modules",
    })),
    ...roles.map((r) => ({
      group: "Access role", label: r.name,
      hint: r.membership === "Org Role" ? `follows ${r.orgRole}` : r.membership,
      href: "/roles",
    })),
    ...members.map((m) => ({
      group: "Member", label: m.name || m.itsId, hint: `ITS ${m.itsId}`,
      href: `/explain?its=${m.itsId}`,
    })),
  ];

  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
