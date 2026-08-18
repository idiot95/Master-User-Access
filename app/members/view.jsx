"use client";

import { useActionState, useMemo, useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Tag, Button, Input, Select, Checkbox,
  Label, Drawer, EmptyState, Callout, Avatar, SearchField, ConfirmDialog, Icon,
} from "@al-rayhaanat/system";
import { grantMember, setMemberStatus } from "../actions.js";

/**
 * The people the system actually holds.
 *
 * Everyone else — the great majority of those who can sign in — is served by
 * rule and stored nowhere, which is why this list stays short.
 */
export function MembersView({ members, grantable, ruleRoles, register }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) =>
      m.itsId.includes(needle) || (m.name || "").toLowerCase().includes(needle));
  }, [members, q]);

  const expired = (d) => !!d && new Date(d).getTime() < Date.now();

  return (
    <Stack gap="6">
      <PageHeader
        title="Members"
        meta={
          <>
            <span>{members.length} held</span>
            <span>{ruleRoles.length} roles serving people with no row</span>
          </>
        }
        actions={
          <Button icon="plus" disabled={grantable.length === 0}
            onClick={() => setEditing({})}>Add a person</Button>
        }
      />

      {grantable.length === 0 && (
        <Callout tone="warning" variant="card" title="There is nothing to grant yet">
          Create a role with <strong>Membership = Explicit</strong> first.
        </Callout>
      )}

      <SearchField value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search by ITS ID or name…" />

      {shown.length === 0 ? (
        <EmptyState title={q ? "Nobody matches that" : "Nobody is provisioned by name"} />
      ) : (
        <Stack gap="3">
          {shown.map((m) => (
            <Card key={m.id}>
              <Cluster justify="space-between" align="flex-start">
                <Cluster gap="4">
                  <Avatar name={m.name || m.itsId} />
                  <Stack gap="2">
                    <Cluster gap="2">
                      <strong>{m.name || m.registerName || "(name not recorded)"}</strong>
                      <Badge tone={m.status === "Active" ? "success" : "danger"}>{m.status}</Badge>
                      {expired(m.expires) && <Badge tone="warning">expired</Badge>}
                    </Cluster>
                    <Cluster gap="2">
                      <code style={muted}>ITS {m.itsId}</code>
                      <span style={muted}>
                        {m.inRegister ? "· in the office register" : "· not in the office register"}
                      </span>
                    </Cluster>
                    <Cluster gap="2">
                      {m.roleNames.length
                        ? m.roleNames.map((n) => <Tag key={n}>{n}</Tag>)
                        : <span style={muted}>no explicit roles</span>}
                    </Cluster>
                  </Stack>
                </Cluster>
                <Cluster gap="2">
                  <StatusButton member={m} />
                  <Button variant="secondary" size="sm" icon="pencil"
                    onClick={() => setEditing(m)}>Edit</Button>
                  <Button variant="secondary" size="sm" icon="search"
                    onClick={() => location.assign(`/explain?its=${m.itsId}`)}>Explain</Button>
                </Cluster>
              </Cluster>
            </Card>
          ))}
        </Stack>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} width={520}
        title={editing?.id ? `Edit ${editing.name || editing.itsId}` : "Add a person"}>
        {editing && (
          <MemberForm member={editing} grantable={grantable} register={register}
            onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </Stack>
  );
}

function StatusButton({ member }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(setMemberStatus, null);
  const suspending = member.status === "Active";
  const next = suspending ? "Suspended" : "Active";

  return (
    <>
      <Button variant="secondary" size="sm" loading={pending}
        icon={suspending ? "lock" : "check"}
        onClick={() => setConfirming(true)}>
        {suspending ? "Suspend" : "Reinstate"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={suspending ? `Suspend ${member.name || member.itsId}?` : `Reinstate ${member.name || member.itsId}?`}
        description={suspending
          ? "They lose the roles granted here on their next sign-in. Anything from an org role or from Everyone is unaffected."
          : "Their explicit roles take effect again on their next sign-in."}
        confirmLabel={suspending ? "Suspend" : "Reinstate"}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("id", member.id);
          fd.set("status", next);
          action(fd);
          setConfirming(false);
        }}
      />
    </>
  );
}

/**
 * Adding a person, with the two mistakes that matter designed out:
 *
 *   · the wrong ITS ID — the number is checked against the office register as
 *     it is typed, and the matching name shown back
 *   · not knowing what a role does — each one states plainly which modules it
 *     opens, so nobody has to hold the whole grid in their head
 */
function MemberForm({ member, grantable, register, onDone }) {
  const [state, action, pending] = useActionState(grantMember, null);
  const [its, setIts] = useState(member.itsId ?? "");
  const [picked, setPicked] = useState(new Set(member.roleIds ?? []));

  const valid = /^\d{6,10}$/.test(its.trim());
  const match = useMemo(
    () => register.find((p) => p.its === its.trim()) ?? null, [register, its]);

  const summary = useMemo(() => {
    const mods = new Map();
    for (const r of grantable.filter((r) => picked.has(r.id))) {
      for (const o of r.opens) {
        const cur = mods.get(o.module) ?? new Set();
        o.verbs.forEach((v) => cur.add(v));
        mods.set(o.module, cur);
      }
    }
    return [...mods].map(([m, v]) => ({ module: m, verbs: [...v] }));
  }, [grantable, picked]);

  const toggle = (id) => setPicked((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <form action={action}>
      <Stack gap="5">
        {state?.ok === false && <Callout tone="danger" title="Not saved">{state.message}</Callout>}
        {state?.ok && <Callout tone="success" title="Saved">{state.message}</Callout>}

        {/* 1 — who */}
        <Stack gap="3">
          <Step n={1} label="Who" />
          <Stack gap="2">
            <Label htmlFor="itsId">ITS ID</Label>
            <Input id="itsId" name="itsId" value={its} onChange={(e) => setIts(e.target.value)}
              required inputMode="numeric" pattern="\d{6,10}" readOnly={!!member.id}
              invalid={its.length > 0 && !valid} placeholder="8 digits" />
            <IdFeedback its={its} valid={valid} match={match} />
          </Stack>

          <Stack gap="2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name"
              defaultValue={member.name ?? ""}
              key={match?.name ?? "none"}
              placeholder={match?.name ?? ""} />
          </Stack>
        </Stack>

        {/* 2 — what */}
        <Stack gap="3">
          <Step n={2} label="What they get" />
          {grantable.map((r) => (
            <label key={r.id} style={{
              display: "block", padding: "var(--space-4)", borderRadius: "var(--radius-md)",
              cursor: "pointer",
              borderWidth: "var(--border-hairline)", borderStyle: "solid",
              borderColor: picked.has(r.id) ? "var(--interactive-solid)" : "var(--border)",
              background: picked.has(r.id) ? "var(--interactive-subtle)" : "transparent",
            }}>
              <Stack gap="2">
                <Checkbox name="roleIds" value={r.id} checked={picked.has(r.id)}
                  onChange={() => toggle(r.id)} label={`${r.name} · ${r.tier}`} />
                <span style={{ ...muted, paddingInlineStart: "var(--space-7)" }}>
                  {r.opens.length
                    ? r.opens.map((o) => `${o.module} (${o.verbs.join(", ")})`).join(" · ")
                    : "opens nothing yet"}
                </span>
              </Stack>
            </label>
          ))}
        </Stack>

        {/* 3 — check */}
        <Stack gap="3">
          <Step n={3} label="Check" />
          <Card>
            {picked.size === 0 ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                Nothing selected — saving records the person and grants nothing.
              </span>
            ) : summary.length === 0 ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--warning)" }}>
                The selected role{picked.size === 1 ? "" : "s"} open nothing yet — tick something on{" "}
                <a href="/permissions">Permissions</a>.
              </span>
            ) : (
              <Stack gap="2">
                <strong style={{ fontSize: "var(--text-sm)" }}>
                  {match?.name || "This person"} will be able to open:
                </strong>
                {summary.map((s) => (
                  <Cluster key={s.module} gap="2">
                    <Icon name="check" size={13} style={{ color: "var(--success)" }} />
                    <span style={{ fontSize: "var(--text-sm)" }}>
                      <strong>{s.module}</strong> — {s.verbs.join(", ")}
                    </span>
                  </Cluster>
                ))}
              </Stack>
            )}
          </Card>

          <Cluster gap="4">
            <Stack gap="2" style={{ flex: 1 }}>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={member.status ?? "Active"}
                options={[{ value: "Active", label: "Active" },
                          { value: "Suspended", label: "Suspended" }]} />
            </Stack>
            <Stack gap="2" style={{ flex: 1 }}>
              <Label htmlFor="expires">Expires</Label>
              <Input id="expires" name="expires" type="date"
                defaultValue={member.expires ? String(member.expires).slice(0, 10) : ""} />
            </Stack>
          </Cluster>
          <span style={muted}>Blank never expires.</span>
        </Stack>

        <Cluster justify="flex-end" gap="3">
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
          <Button type="submit" loading={pending} disabled={!valid}>
            {member.id ? "Save" : "Add this person"}
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

/** Live feedback on the ITS ID — the one field where a typo is silent and costly. */
function IdFeedback({ its, valid, match }) {
  if (!its.trim()) return null;
  if (!valid) {
    return (
      <Cluster gap="2">
        <Icon name="x" size={13} style={{ color: "var(--danger)" }} />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}>
          An ITS ID is 6–10 digits. This is {its.trim().length}.
        </span>
      </Cluster>
    );
  }
  if (match) {
    return (
      <Cluster gap="2">
        <Icon name="check" size={13} style={{ color: "var(--success)" }} />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--success)" }}>
          <strong>{match.name}</strong> — found in the office register.
        </span>
      </Cluster>
    );
  }
  return (
    <Cluster gap="2">
      <Icon name="bell" size={13} style={{ color: "var(--warning)" }} />
      <span style={{ fontSize: "var(--text-xs)", color: "var(--warning)" }}>
        Not in the office register.
      </span>
    </Cluster>
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

const muted = { fontSize: "var(--text-xs)", color: "var(--text-muted)" };
