"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell, SideNav, TopBar, Badge, Callout, Button, CommandPalette } from "@al-rayhaanat/system";

const ITEMS = [
  { label: "Overview", href: "/", icon: "grid" },
  { label: "Roles", href: "/roles", icon: "bookmark" },
  { label: "Permissions", href: "/permissions", icon: "table" },
  { label: "Modules", href: "/modules", icon: "layers" },
  { label: "Members", href: "/members", icon: "users" },
  { label: "Overrides", href: "/overrides", icon: "sliders" },
  { label: "Explain", href: "/explain", icon: "search" },
];

/**
 * Which Teable this console is pointed at rides in the top bar permanently, for
 * the same reason office-console does it: granting rights against cloud while
 * believing you are on local is worth fixed chrome to prevent.
 */
export function Chrome({ target, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = (ITEMS.find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)) || ITEMS[0]).label;

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
          groups={[{ items: ITEMS }]}
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
            </>
          }
        />
      }
    >
      {!target.configured && (
        <Callout tone="danger" variant="card" title="No Teable token">
          Copy <code>.env.example</code> to <code>.env.local</code> and set
          {" "}<code>TEABLE_TOKEN</code>. Nothing can load until it is set.
        </Callout>
      )}
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands}
        placeholder="Search modules, roles, members…" />
    </AppShell>
  );
}
