"use client";

import { useMemo, useState, useActionState, useTransition } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Tag, Button, Checkbox, Select,
  Drawer, EmptyState, Callout, Textarea, Label, Tabs, SearchField, Icon,
  ConfirmDialog, Popover,
} from "@al-rayhaanat/system";
import { setPermission, setVerbAcross } from "../actions.js";

const VCED = ["view", "create", "edit", "delete"];
const LETTER = { view: "V", create: "C", edit: "E", delete: "D" };
const FIELD = { view: "View", create: "Create", edit: "Edit", delete: "Delete" };

/**
 * Roles down, modules across.
 *
 * Two things have to be true at once: every resource and capability must be
 * settable on its own, and setting a hundred of them must not take a hundred
 * visits. So the grid grants at three scales — a whole column, a whole row, and
 * one cell's worth of resources — while the drawer stays the place where a
 * single resource is tuned.
 *
 * The three cell states are distinguished by shape as well as colour: granted,
 * denied, and *cannot* be granted because the module has not declared itself.
 */
export function PermissionsView({ modules, roles, permissions }) {
  const [cell, setCell] = useState(null);
  const [tier, setTier] = useState("all");
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState(null);   // pending confirmation

  // Owned here rather than in the dialog, so dismissing the dialog cannot
  // abandon a write that is already in flight.
  const [bulkState, bulkAction] = useActionState(setVerbAcross, null);
  const [bulkPending, startBulk] = useTransition();

  const runBulk = (verb, value, targets) => {
    const fd = new FormData();
    fd.set("verb", FIELD[verb]);
    fd.set("value", String(value));
    fd.set("targets", JSON.stringify(targets));
    startBulk(() => { bulkAction(fd); });
    setBulk(null);
  };

  const rowsFor = (roleId, moduleKey) =>
    permissions.filter((p) => p.roleId === roleId && p.moduleKey === moduleKey);

  const byCell = useMemo(() => {
    const m = new Map();
    for (const p of permissions) m.set(`${p.roleId}|${p.moduleKey}|${p.resource}`, p);
    return m;
  }, [permissions]);

  const tiers = [...new Set(roles.map((r) => r.tier).filter(Boolean))];
  const tabs = [
    { id: "all", label: `All (${roles.length})` },
    ...tiers.map((t) => ({ id: t, label: `${t} (${roles.filter((r) => r.tier === t).length})` })),
  ];

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roles
      .filter((r) => tier === "all" || r.tier === tier)
      .filter((r) => !needle || r.name.toLowerCase().includes(needle));
  }, [roles, tier, q]);

  const declared = modules.filter((m) => m.resources.length > 0);
  const undeclared = modules.filter((m) => m.resources.length === 0);
  const grantsIn = (key) => permissions.filter((p) => p.moduleKey === key && !p.orphaned).length;

  /** Every (role, module, resource) triple in a selection that supports `verb`. */
  const targetsFor = ({ roleList, moduleList, verb }) => {
    const out = [];
    for (const role of roleList) {
      for (const m of moduleList) {
        for (const res of m.resources) {
          if (!res.vced.includes(verb)) continue;   // never invent an unsupported verb
          out.push({
            roleId: role.id, roleName: role.name,
            moduleId: m.id, moduleKey: m.key, resource: res.key,
            scopeRule: "none",
          });
        }
      }
    }
    return out;
  };

  /** How many of those targets would actually change, for the confirm text. */
  const countChanges = (targets, verb, value) =>
    targets.filter((t) => {
      const row = byCell.get(`${t.roleId}|${t.moduleKey}|${t.resource}`);
      return row ? !!row[verb] !== value : value;
    }).length;

  const askBulk = ({ scope, label, roleList, moduleList, verb, value }) => {
    const targets = targetsFor({ roleList, moduleList, verb });
    setBulk({ scope, label, verb, value, targets, changes: countChanges(targets, verb, value) });
  };

  return (
    <Stack gap="5">
      <PageHeader
        title="Permissions"
        meta={
          <>
            <span>{permissions.filter((p) => !p.orphaned).length} grants</span>
            <span>{declared.length} of {modules.length} modules declared</span>
          </>
        }
      />

      <Cluster justify="space-between" align="center" gap="4">
        <Tabs items={tabs} value={tier} onChange={setTier} />
        <div style={{ minInlineSize: "16rem" }}>
          <SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a role…" />
        </div>
      </Cluster>

      <Legend />

      {undeclared.length > 0 && (
        <Callout tone="warning" variant="card" title={`${undeclared.length} modules have not declared themselves`}>
          {undeclared.map((m) => m.name).join(", ")} — fetch the manifest on{" "}
          <a href="/modules">Modules</a>.
        </Callout>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, inlineSize: "100%",
            fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                <th style={{ ...th, ...stickyCol, insetBlockStart: 0, zIndex: 3 }}>Access role</th>
                {modules.map((m) => (
                  <th key={m.key} style={{ ...th, textAlign: "center",
                    background: m.resources.length ? "var(--surface)" : "var(--surface-sunken)" }}>
                    <Stack gap="2" align="center">
                      <span style={{ opacity: m.resources.length ? 1 : 0.6 }}>{m.name}</span>
                      <span style={colMeta}>
                        {m.resources.length
                          ? `${m.resources.length} resource${m.resources.length === 1 ? "" : "s"} · ${grantsIn(m.key)} granted`
                          : "not declared"}
                      </span>
                      {m.resources.length > 0 && (
                        <BulkVerbs
                          title={`Every role · ${m.name}`}
                          onPick={(verb, value) => askBulk({
                            scope: "column", label: `every role in ${m.name}`,
                            roleList: shown, moduleList: [m], verb, value,
                          })}
                          supported={supportedIn([m])}
                        />
                      )}
                    </Stack>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((role, i) => (
                <tr key={role.id} style={{ background: i % 2 ? "var(--surface-sunken)" : "transparent" }}>
                  <td style={{ ...td, ...stickyCol,
                    background: i % 2 ? "var(--surface-sunken)" : "var(--surface)" }}>
                    <Stack gap="2">
                      <strong>{role.name}</strong>
                      <span style={colMeta}>
                        {role.membership === "Everyone" ? "everyone signed in"
                          : role.membership === "Org Role" ? `follows ${role.orgRole}`
                          : "named people"} · {role.tier}
                      </span>
                      {declared.length > 0 && (
                        <BulkVerbs
                          title={`${role.name} · every module`}
                          onPick={(verb, value) => askBulk({
                            scope: "row", label: `${role.name} across every declared module`,
                            roleList: [role], moduleList: declared, verb, value,
                          })}
                          supported={supportedIn(declared)}
                        />
                      )}
                    </Stack>
                  </td>
                  {modules.map((m) => (
                    <Cell key={m.key} role={role} module={m} rows={rowsFor(role.id, m.key)}
                      onOpen={() => setCell({ role, module: m })}
                      onVerb={(verb, value) => askBulk({
                        scope: "cell", label: `${role.name} in ${m.name}`,
                        roleList: [role], moduleList: [m], verb, value,
                      })} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {shown.length === 0 && (
        <EmptyState title="No roles match" description={q ? `Nothing called “${q}”.` : undefined} />
      )}

      {(bulkPending || bulkState) && (
        <Callout tone={bulkState?.ok === false ? "danger" : "info"} variant="card"
          title={bulkPending ? "Applying…" : "Done"}>
          {bulkPending ? "Leave this page open until it finishes." : bulkState?.message}
        </Callout>
      )}

      <BulkConfirm bulk={bulk} onClose={() => setBulk(null)} run={runBulk} />

      <Drawer open={!!cell} onClose={() => setCell(null)} width={520}
        title={cell ? `${cell.role.name} · ${cell.module.name}` : ""}>
        {cell && <CellEditor role={cell.role} module={cell.module} byCell={byCell}
          onDone={() => setCell(null)} />}
      </Drawer>
    </Stack>
  );
}

/** Which verbs any resource in this set supports — the rest are never offered. */
function supportedIn(moduleList) {
  const s = new Set();
  for (const m of moduleList) for (const r of m.resources) for (const v of r.vced) s.add(v);
  return s;
}

/**
 * Grant or clear one verb across a whole row, column or cell.
 *
 * Popover owns its own open state and wraps the trigger in its own click
 * handler, so the trigger here is a plain span — adding an onClick would toggle
 * it twice and leave it shut.
 */
function BulkVerbs({ title, onPick, supported }) {
  return (
    <Popover
      align="end"
      width={250}
      trigger={
        <span role="button" tabIndex={0} style={bulkTrigger}
          aria-label={`Grant or clear across ${title}`}>
          all <Icon name="chevron-down" size={11} />
        </span>
      }
    >
      <Stack gap="3">
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "var(--tracking-kicker)" }}>{title}</span>
        {VCED.map((verb) => (
          <Cluster key={verb} justify="space-between" align="center">
            <span style={{ fontSize: "var(--text-sm)", opacity: supported.has(verb) ? 1 : 0.4 }}>
              {verb}
            </span>
            <Cluster gap="2">
              <Button size="sm" variant="secondary" disabled={!supported.has(verb)}
                onClick={() => onPick(verb, true)}>Grant</Button>
              <Button size="sm" variant="ghost" disabled={!supported.has(verb)}
                onClick={() => onPick(verb, false)}>Clear</Button>
            </Cluster>
          </Cluster>
        ))}
      </Stack>
    </Popover>
  );
}

/** One (role, module) cell. Letters toggle directly; the body opens the drawer. */
function Cell({ role, module: m, rows, onOpen, onVerb }) {
  const declared = m.resources.length > 0;
  const live = rows.filter((r) => !r.orphaned);
  const orphaned = rows.filter((r) => r.orphaned).length;
  const union = VCED.filter((v) => live.some((r) => r[v]));
  const caps = new Set(live.flatMap((r) => r.capabilities));
  const granted = union.length > 0 || caps.size > 0;
  const supported = supportedIn([m]);

  if (!declared) {
    // The column header and the legend each say "not declared" once. Repeating
    // it in every cell turns a quiet fact into the loudest thing on screen, so
    // the cell carries only a mark — the words live in the title and for
    // assistive tech.
    return (
      <td style={{ ...td, textAlign: "center", background: "var(--surface-sunken)" }}
          title={`${m.name} has not declared what it offers — fetch its manifest first`}>
        <Icon name="lock" size={13} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
        <span style={srOnly}>{m.name} has not declared what it offers</span>
      </td>
    );
  }

  return (
    <td style={{ ...td, textAlign: "center", padding: "var(--space-2)" }}>
      <div style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        gap: "var(--space-1)", padding: "var(--space-2)", minInlineSize: "7rem",
        borderRadius: "var(--radius-md)",
        borderWidth: "var(--border-hairline)", borderStyle: granted ? "solid" : "dashed",
        borderColor: granted ? "var(--interactive-solid)" : "var(--border)",
        background: granted ? "var(--interactive-subtle)" : "transparent",
      }}>
        <Cluster gap="1" justify="center">
          {VCED.map((v) => {
            const on = union.includes(v);
            const can = supported.has(v);
            return (
              <button key={v} type="button" disabled={!can}
                onClick={() => onVerb(v, !on)}
                title={can
                  ? `${on ? "Remove" : "Grant"} ${v} on every resource in ${m.name}`
                  : `${m.name} has no ${v} path`}
                aria-label={`${v}: ${on ? "granted" : "not granted"}${can ? ", click to change" : ", unsupported"}`}
                style={{
                  font: "inherit", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
                  fontWeight: 600, inlineSize: "1.5em", padding: 0,
                  border: 0, borderRadius: "var(--radius-sm)", background: "transparent",
                  cursor: can ? "pointer" : "not-allowed",
                  color: on ? "var(--interactive)" : "var(--text-muted)",
                  opacity: can ? (on ? 1 : 0.35) : 0.15,
                }}>{on ? LETTER[v] : "·"}</button>
            );
          })}
        </Cluster>

        <Cluster gap="1" justify="center">
          {caps.size > 0 && <Badge tone="neutral">+{caps.size} cap</Badge>}
          {orphaned > 0 && <Badge tone="warning">{orphaned} orphaned</Badge>}
          <button type="button" onClick={onOpen} style={detailBtn}
            title={`Set each resource in ${m.name} on its own`}>
            {m.resources.length > 1 ? `${m.resources.length} resources` : "detail"}
          </button>
        </Cluster>
      </div>
    </td>
  );
}

/**
 * Bulk writes get a sentence about what they will do before they do it.
 *
 * The action state lives in the parent, not here. An earlier version owned it
 * and the dialog closed on confirm — unmounting the component mid-write and
 * cutting the batch off partway, which left a bulk half-applied. A permission
 * system may not do that: half a revocation is worse than none, because it
 * looks finished.
 */
function BulkConfirm({ bulk, onClose, run }) {
  if (!bulk) return null;

  const { verb, value, label, targets, changes } = bulk;
  const nothing = changes === 0;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={nothing
        ? "Nothing would change"
        : `${value ? "Grant" : "Remove"} ${verb} on ${changes} ${changes === 1 ? "resource" : "resources"}?`}
      description={nothing
        ? `Every resource in ${label} is already in that state.`
        : `${value ? "Grants" : "Removes"} ${verb} for ${label}.`}
      /* ConfirmDialog defaults to danger, which puts a trash icon on the button.
         Right for removing access, plainly wrong for granting it. */
      tone={value ? "primary" : "danger"}
      confirmLabel={nothing ? "Close" : value ? "Grant" : "Remove"}
      onConfirm={() => {
        if (nothing) { onClose(); return; }
        run(verb, value, targets);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

function CellEditor({ role, module: mod, byCell, onDone }) {
  return (
    <Stack gap="5">
      <Cluster gap="2">
        <Tag>{role.membership}</Tag>
        <Badge tone="neutral">{role.tier}</Badge>
        {mod.visibility === "Public" && <Badge tone="info">Public module</Badge>}
      </Cluster>

      {mod.resources.map((res) => (
        <ResourceForm key={res.key} role={role} module={mod} resource={res}
          existing={byCell.get(`${role.id}|${mod.key}|${res.key}`)} />
      ))}

      <Cluster justify="flex-end"><Button variant="secondary" onClick={onDone}>Close</Button></Cluster>
    </Stack>
  );
}

function ResourceForm({ role, module: mod, resource, existing }) {
  const [state, action, pending] = useActionState(setPermission, null);
  const [rule, setRule] = useState(existing?.scopeRule ?? "none");
  const scopeless = (resource.scopeDimensions ?? []).length === 0;

  return (
    <Card>
      <form action={action}>
        <input type="hidden" name="roleId" value={role.id} />
        <input type="hidden" name="roleName" value={role.name} />
        <input type="hidden" name="moduleId" value={mod.id} />
        <input type="hidden" name="moduleKey" value={mod.key} />
        <input type="hidden" name="resource" value={resource.key} />

        <Stack gap="4">
          <Cluster justify="space-between" align="baseline">
            <strong>{resource.label}</strong>
            <code style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{resource.key}</code>
          </Cluster>

          {existing?.orphaned && (
            <Callout tone="warning" title="Orphaned">
              {existing.orphanedReason || "References vocabulary the module no longer declares."}
              {" "}Excluded when access is resolved, so nobody holds a right through it.
            </Callout>
          )}

          <Stack gap="2">
            <Label>Actions</Label>
            <Cluster gap="4">
              {VCED.map((verb) => {
                const supported = resource.vced.includes(verb);
                return (
                  <Checkbox key={verb} name={verb} defaultChecked={!!existing?.[verb]}
                    disabled={!supported} label={verb} />
                );
              })}
            </Cluster>
          </Stack>

          {resource.capabilities.length > 0 && (
            <Stack gap="2">
              <Label htmlFor={`caps-${resource.key}`}>Capabilities</Label>
              <Textarea id={`caps-${resource.key}`} name="capabilities"
                rows={Math.min(resource.capabilities.length + 1, 5)}
                defaultValue={(existing?.capabilities ?? []).join("\n")}
                placeholder={resource.capabilities.map((c) => c.key).join("\n")} />
              <Hint>Offered: {resource.capabilities.map((c) => c.key).join(", ")}</Hint>
            </Stack>
          )}

          <Stack gap="2">
            <Label htmlFor={`rule-${resource.key}`}>Scope</Label>
            <Select id={`rule-${resource.key}`} name="scopeRule" value={rule}
              onChange={(e) => setRule(e.target.value)}
              options={[
                { value: "none", label: "none" },
                { value: "own", label: "own" },
                { value: "all", label: "all" },
              ]} />
            {rule === "own" && scopeless && (
              <Callout tone="warning" title={`${resource.key} has no scope dimensions — “own” behaves as “all”`} />
            )}
          </Stack>

          <Cluster justify="space-between" align="center">
            <span style={{ fontSize: "var(--text-xs)",
              color: state?.ok === false ? "var(--danger)" : "var(--text-muted)" }}>
              {state?.message ?? (existing ? "Saved previously." : "Not granted.")}
            </span>
            <Button type="submit" loading={pending}>Save</Button>
          </Cluster>
        </Stack>
      </form>
    </Card>
  );
}

function Legend() {
  return (
    <Cluster gap="5" style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
      <Cluster gap="2">
        <span style={{ ...swatch, borderStyle: "solid", borderColor: "var(--interactive-solid)",
          background: "var(--interactive-subtle)" }} />
        <span><strong style={{ fontFamily: "var(--font-mono)" }}>V C E D</strong> — click to grant or clear</span>
      </Cluster>
      <Cluster gap="2">
        <span style={{ ...swatch, borderStyle: "dashed", borderColor: "var(--border)" }} />
        <span>no access</span>
      </Cluster>
      <Cluster gap="2">
        <Icon name="lock" size={12} />
        <span>not declared</span>
      </Cluster>
    </Cluster>
  );
}

const Hint = ({ children }) => (
  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{children}</span>
);

const th = {
  textAlign: "start", padding: "var(--space-3) var(--space-4)",
  fontWeight: "var(--weight-semibold)", verticalAlign: "bottom",
  borderBlockEnd: "var(--border-hairline) solid var(--border-strong)",
  position: "sticky", insetBlockStart: 0, background: "var(--surface)", zIndex: 2,
};
const td = {
  padding: "var(--space-3) var(--space-4)", verticalAlign: "middle",
  borderBlockEnd: "var(--border-hairline) solid var(--border)",
};
const stickyCol = {
  position: "sticky", insetInlineStart: 0, zIndex: 1,
  borderInlineEnd: "var(--border-hairline) solid var(--border-strong)", minInlineSize: "14rem",
};
const colMeta = {
  fontWeight: "var(--weight-regular)", fontSize: "var(--text-3xs)", color: "var(--text-muted)",
};
const swatch = {
  display: "inline-block", inlineSize: 22, blockSize: 14, borderRadius: "var(--radius-sm)",
  borderWidth: "var(--border-hairline)",
};
const bulkTrigger = {
  display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
  padding: "var(--space-1) var(--space-2)", font: "inherit", fontSize: "var(--text-3xs)",
  color: "var(--interactive)", background: "transparent", cursor: "pointer",
  borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)",
  borderRadius: "var(--radius-full)",
};
const detailBtn = {
  font: "inherit", fontSize: "var(--text-3xs)", color: "var(--text-muted)",
  background: "transparent", border: 0, padding: 0, cursor: "pointer",
  textDecoration: "underline", textUnderlineOffset: 2,
};
/** Visible to a screen reader, absent from the visual grid. */
const srOnly = {
  position: "absolute", inlineSize: 1, blockSize: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};
