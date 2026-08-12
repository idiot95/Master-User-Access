"use client";

import { useActionState, useMemo, useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Tag, Button, Input, Select, Textarea,
  Label, Drawer, EmptyState, Callout, SearchField, Icon, Tabs,
} from "@al-rayhaanat/system";
import { saveAccessRole } from "../actions.js";

const MEMBERSHIP = [
  { value: "Everyone", label: "Everyone who signs in",
    hint: "Anyone who passes ITS One Login holds this. Stores no rows — this is how 10,000 people get a baseline at no cost. Grant it only what any recognised person may see." },
  { value: "Org Role", label: "Whoever holds an org role",
    hint: "Membership follows the office console. When someone is given or loses that role there, this follows automatically — nobody is listed here by name." },
  { value: "Explicit", label: "People I name",
    hint: "You add people to it by ITS ID on the Members screen. The only kind that stores a person, and the one to use for roles the org chart does not have." },
];

const TIERS = ["recognised", "member", "steward", "admin"];

/**
 * Creating and editing access roles.
 *
 * The three membership kinds are the whole design, so the form leads with that
 * choice and explains each in place rather than in documentation nobody opens.
 */
export function RolesView({ roles, orgRoles, allRoles }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");

  const kinds = ["Everyone", "Org Role", "Explicit"].filter((k) => roles.some((r) => r.membership === k));
  const tabs = [
    { id: "all", label: `All (${roles.length})` },
    ...kinds.map((k) => ({ id: k, label: `${k} (${roles.filter((r) => r.membership === k).length})` })),
  ];

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return roles
      .filter((r) => kind === "all" || r.membership === kind)
      .filter((r) => !n || r.name.toLowerCase().includes(n) || (r.orgRole || "").toLowerCase().includes(n));
  }, [roles, kind, q]);

  return (
    <Stack gap="5">
      <PageHeader
        title="Roles"
        description="A role is a bundle of rights. How someone comes to hold it is the role's own business — by rule, by org role, or by name."
        meta={<><span>{roles.length} roles</span>
          <span>{roles.filter((r) => r.membership !== "Explicit").length} that store no rows</span></>}
        actions={<Button icon="plus" onClick={() => setEditing({})}>New role</Button>}
      />

      <Cluster justify="space-between" align="center" gap="4">
        <Tabs items={tabs} value={kind} onChange={setKind} />
        <div style={{ minInlineSize: "16rem" }}>
          <SearchField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a role…" />
        </div>
      </Cluster>

      {shown.length === 0 ? (
        <EmptyState title={q ? "No role matches" : "No roles yet"}
          action={<Button icon="plus" onClick={() => setEditing({})}>New role</Button>} />
      ) : (
        <Stack gap="3">
          {shown.map((r) => (
            <Card key={r.id}>
              <Cluster justify="space-between" align="flex-start" gap="4">
                <Stack gap="2">
                  <Cluster gap="2">
                    <strong>{r.name}</strong>
                    <Tag>{r.membership}</Tag>
                    <Badge tone={r.tier === "admin" ? "warning" : "neutral"}>{r.tier}</Badge>
                    {r.inheritsFrom && (
                      <Badge tone="info">
                        inherits {allRoles.find((x) => x.id === r.inheritsFrom)?.name ?? "another role"}
                      </Badge>
                    )}
                  </Cluster>

                  <Cluster gap="3">
                    <code style={muted}>{r.key}</code>
                    <span style={muted}>
                      {r.membership === "Everyone" ? "everyone who signs in"
                        : r.membership === "Org Role"
                        ? `follows “${r.orgRole}” · ${r.heldBy} hold it now`
                        : `${r.heldBy} named ${r.heldBy === 1 ? "person" : "people"}`}
                    </span>
                  </Cluster>

                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                    {r.opens.length
                      ? <>Opens {r.opens.map((o) => `${o.module} (${o.verbs.join(", ")})`).join(" · ")}</>
                      : <em>Opens nothing yet — nothing is ticked for it on Permissions.</em>}
                  </span>
                </Stack>

                <Cluster gap="2">
                  <Button variant="secondary" size="sm" icon="pencil"
                    onClick={() => setEditing(r)}>Edit</Button>
                  <Button variant="secondary" size="sm" icon="table"
                    onClick={() => location.assign("/permissions")}>Permissions</Button>
                </Cluster>
              </Cluster>
            </Card>
          ))}
        </Stack>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} width={560}
        title={editing?.id ? `Edit ${editing.name}` : "New role"}>
        {editing && (
          <RoleForm role={editing} orgRoles={orgRoles} allRoles={allRoles}
            onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </Stack>
  );
}

function RoleForm({ role, orgRoles, allRoles, onDone }) {
  const [state, action, pending] = useActionState(saveAccessRole, null);
  const [membership, setMembership] = useState(role.membership ?? "Explicit");
  const [name, setName] = useState(role.name ?? "");
  const [key, setKey] = useState(role.key ?? "");
  const [touchedKey, setTouchedKey] = useState(!!role.key);

  const chosen = MEMBERSHIP.find((m) => m.value === membership);
  const inheritable = allRoles.filter((r) => r.id !== role.id);

  // The key is derived from the name until someone edits it. It is what every
  // grant points at, so it is fixed once the role exists.
  const onName = (v) => {
    setName(v);
    if (!touchedKey && !role.id) {
      setKey(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48));
    }
  };

  return (
    <form action={action}>
      {role.id && <input type="hidden" name="id" value={role.id} />}
      <Stack gap="5">
        {state?.ok === false && <Callout tone="danger" title="Not saved">{state.message}</Callout>}
        {state?.ok && <Callout tone="success" title="Saved">{state.message}</Callout>}

        <Stack gap="3">
          <Step n={1} label="What it is called" />
          <Stack gap="2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" value={name} onChange={(e) => onName(e.target.value)}
              required placeholder="Stream Producer" />
          </Stack>
          <Stack gap="2">
            <Label htmlFor="key">Key</Label>
            <Input id="key" name="key" value={key} readOnly={!!role.id}
              onChange={(e) => { setTouchedKey(true); setKey(e.target.value); }} required />
            <Hint>{role.id
              ? "Fixed — every grant points at this."
              : "Used internally. Derived from the name; edit it now if you want something else, because it cannot change later."}</Hint>
          </Stack>
          <Stack gap="2">
            <Label htmlFor="nameArabic">Name (Arabic)</Label>
            <Input id="nameArabic" name="nameArabic" defaultValue={role.nameArabic ?? ""} dir="rtl" />
          </Stack>
        </Stack>

        <Stack gap="3">
          <Step n={2} label="Who holds it" />
          {MEMBERSHIP.map((m) => (
            <label key={m.value} style={{
              display: "block", padding: "var(--space-4)", borderRadius: "var(--radius-md)",
              cursor: "pointer",
              borderWidth: "var(--border-hairline)", borderStyle: "solid",
              borderColor: membership === m.value ? "var(--interactive-solid)" : "var(--border)",
              background: membership === m.value ? "var(--interactive-subtle)" : "transparent",
            }}>
              <Stack gap="2">
                <Cluster gap="3" align="center">
                  <input type="radio" name="membership" value={m.value}
                    checked={membership === m.value}
                    onChange={() => setMembership(m.value)} />
                  <strong style={{ fontSize: "var(--text-sm)" }}>{m.label}</strong>
                </Cluster>
                <span style={{ ...muted, paddingInlineStart: "var(--space-7)" }}>{m.hint}</span>
              </Stack>
            </label>
          ))}

          {membership === "Org Role" && (
            <Stack gap="2">
              <Label htmlFor="orgRole">Which org role</Label>
              <Select id="orgRole" name="orgRole" defaultValue={role.orgRole ?? ""}
                options={[
                  { value: "", label: "— choose one —" },
                  ...orgRoles.map((o) => ({
                    value: o.name,
                    label: `${o.name}${o.legacy ? " (retired)" : ""} — ${o.holders} hold it`,
                  })),
                ]} />
              <Hint>
                Read from the office console. Change who holds it there, and this role follows on
                their next sign-in.
              </Hint>
            </Stack>
          )}

          {membership === "Everyone" && (
            <Callout tone="warning" title="This reaches everyone who can sign in">
              Thousands of people, not just the office. Grant it only modules marked Public, or
              things you would put on a noticeboard.
            </Callout>
          )}
        </Stack>

        <Stack gap="3">
          <Step n={3} label="How it behaves" />
          <Cluster gap="4">
            <Stack gap="2" style={{ flex: 1 }}>
              <Label htmlFor="tier">Tier</Label>
              <Select id="tier" name="tier" defaultValue={role.tier ?? "member"}
                options={TIERS.map((t) => ({ value: t, label: t }))} />
              <Hint>A label for how far this reaches. It grants nothing on its own.</Hint>
            </Stack>
            <Stack gap="2" style={{ flex: 1 }}>
              <Label htmlFor="level">Level</Label>
              <Input id="level" name="level" type="number" defaultValue={role.level ?? 0} />
              <Hint>Sorting only. Never implies inheritance.</Hint>
            </Stack>
          </Cluster>

          <Stack gap="2">
            <Label htmlFor="inheritsFrom">Also gets everything from</Label>
            <Select id="inheritsFrom" name="inheritsFrom" defaultValue={role.inheritsFrom ?? ""}
              options={[{ value: "", label: "— nothing —" },
                ...inheritable.map((r) => ({ value: r.id, label: r.name }))]} />
            <Hint>
              Explicit and one-directional. A Section Head does not automatically get what a Section
              Team has unless you say so here — implied inheritance is how a permission system
              becomes impossible to explain.
            </Hint>
          </Stack>

          <Stack gap="2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={role.notes ?? ""}
              placeholder="Why this role exists — read by whoever inherits it from you." />
          </Stack>
        </Stack>

        <Card>
          <Stack gap="2">
            <strong style={{ fontSize: "var(--text-sm)" }}>In short</strong>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
              <strong>{name || "This role"}</strong> — {chosen?.hint}
            </span>
            {!role.id && (
              <span style={muted}>
                It opens nothing until you tick something for it on Permissions.
              </span>
            )}
          </Stack>
        </Card>

        <Cluster justify="flex-end" gap="3">
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={pending}>{role.id ? "Save" : "Create role"}</Button>
        </Cluster>
      </Stack>
    </form>
  );
}

const Step = ({ n, label }) => (
  <Cluster gap="3" align="center">
    <span style={{
      display: "grid", placeItems: "center", inlineSize: 22, blockSize: 22,
      borderRadius: "var(--radius-full)", background: "var(--interactive-subtle)",
      color: "var(--interactive)", fontSize: "var(--text-2xs)", fontWeight: 600,
    }}>{n}</span>
    <strong style={{ fontSize: "var(--text-sm)" }}>{label}</strong>
  </Cluster>
);

const Hint = ({ children }) => (
  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{children}</span>
);

const muted = { fontSize: "var(--text-xs)", color: "var(--text-muted)" };
