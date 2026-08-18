"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  AppShell, SideNav, TopBar, Badge, Callout, Button, CommandPalette, Stack,
} from "@al-rayhaanat/system";

const ITEMS = [
  { label: "Overview", href: "/", icon: "grid" },
  { label: "Roles", href: "/roles", icon: "bookmark", resource: "access_role" },
  { label: "Permissions", href: "/permissions", icon: "table", resource: "permission" },
  { label: "Modules", href: "/modules", icon: "layers", resource: "module" },
  { label: "Members", href: "/members", icon: "users", resource: "member" },
  { label: "Overrides", href: "/overrides", icon: "sliders", resource: "override" },
  { label: "Explain", href: "/explain", icon: "search", resource: "explain" },
  { label: "Log", href: "/logs", icon: "list", resource: "log" },
];

/**
 * Which Teable this console is pointed at rides in the top bar permanently, for
 * the same reason office-console does it: granting rights against cloud while
 * believing you are on local is worth fixed chrome to prevent.
 */
export function Chrome({ target, session, viewable, children }) {
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Only the screens this person actually holds.
   *
   * The gate is on each page and every action; this is courtesy, so nobody
   * clicks six links to be refused by five. Overview carries no resource and is
   * always listed — it is where a person with nothing at all lands, and a
   * navigation with no items reads as a broken app rather than as a narrow one.
   */
  const navItems = ITEMS.filter((i) => !i.resource || viewable?.[i.resource]);

  // The login page brings its own frame. Wrapping it in the console shell would
  // show the navigation to someone who has not signed in yet — every link a
  // redirect back to where they already are.
  if (pathname === "/login") return children;

  const current = (navItems.find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)) || navItems[0]).label;

  // One search across modules, roles and members. Loaded on first open rather
  // than on every page, since most visits never need it.
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    if (items.length) return;
    const r = await fetch("/search-data").then((x) => x.json()).catch(() => ({ items: [] }));
    setItems(r.items || []);
  }, [items.length]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); load(); setOpen(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [load]);

  const commands = items.map((it) => ({
    label: it.hint ? `${it.label} — ${it.hint}` : it.label,
    group: it.group,
    run: () => router.push(it.href),
  }));

  return (
    <AppShell
      sideNav={
        <SideNav
          brand="Access"
          current={current}
          groups={[{ items: navItems }]}
          onNavigate={(item) => router.push(item.href)}
        />
      }
      topBar={
        <TopBar
          brand="User Access"
          sticky
          actions={
            <>
              <Button variant="secondary" size="sm" icon="search"
                onClick={() => { load(); setOpen(true); }}>
                Search <kbd style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-3xs)",
                  color: "var(--text-muted)", marginInlineStart: "var(--space-2)" }}>⌘K</kbd>
              </Button>
              <Badge tone={target.split ? "warning" : target.isLocal ? "neutral" : "info"}
                     icon={target.isLocal ? "lock" : "external-link"}>
                {target.label} · {target.detail}
              </Badge>
              {session && (
                <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                  <Button type="submit" variant="ghost" size="sm" icon="log-out"
                    title={`Signed in as ITS ${session.itsId}`}>
                    {session.name || session.itsId}
                  </Button>
                </form>
              )}
            </>
          }
        />
      }
    >
      {target.configured ? children : (
        <Callout tone="danger" variant="card"
          title={`${target.missing.length} environment ${target.missing.length === 1 ? "variable is" : "variables are"} not set`}>
          <Stack gap="3">
            <span>
              Nothing can load until {target.missing.length === 1 ? "it is" : "they are"} set.
              {" "}Set {target.missing.length === 1 ? "it" : "them"} on Vercel and redeploy.
            </span>
            <code style={{ display: "block", whiteSpace: "pre", fontSize: "var(--text-xs)",
              padding: "var(--space-4)", borderRadius: "var(--radius-md)",
              background: "var(--surface-sunken)", overflowX: "auto" }}>
              {target.missing.map((k) => `${k}=`).join("\n")}
            </code>
          </Stack>
        </Callout>
      )}
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands}
        placeholder="Search modules, roles, members…" />
    </AppShell>
  );
}
