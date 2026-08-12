"use client";

import { useActionState, useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Button, Input, Select, Checkbox, Textarea,
  Label, Drawer, EmptyState, Callout, ConfirmDialog,
} from "@al-rayhaanat/system";
import { saveOverride, expireOverride } from "../actions.js";

const VCED = ["view", "create", "edit", "delete"];

/**
 * Exceptions, with a reason and an expiry.
 *
 * Without this screen every exception becomes a fake role, and the role list
 * rots into a list of one-offs nobody dares delete.
 */
export function OverridesView({ overrides, modules }) {
  const [adding, setAdding] = useState(false);
  const live = overrides.filter((o) => !isExpired(o.expires));
  const past = overrides.filter((o) => isExpired(o.expires));

  return (
    <Stack gap="6">
      <PageHeader
        title="Overrides"
        description="Person-level exceptions. A deny always wins — no number of grants can outvote one — so this is the fastest way to remove access from someone immediately."
        meta={<><span>{live.length} live</span><span>{past.length} expired</span></>}
        actions={<Button icon="plus" onClick={() => setAdding(true)}>Add an override</Button>}
      />

      {live.length === 0 && past.length === 0 ? (
        <EmptyState title="No exceptions"
          description="Good. Access that comes entirely from roles is access you can explain."
          action={<Button icon="plus" onClick={() => setAdding(true)}>Add an override</Button>} />
      ) : (
        <Stack gap="5">
          {live.length > 0 && (
            <Stack gap="3">
              {live.map((o) => <OverrideCard key={o.id} o={o} />)}
            </Stack>
          )}
          {past.length > 0 && (
            <Stack gap="3">
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-lg)",
                fontWeight: "var(--weight-regular)", color: "var(--text-secondary)" }}>
                Expired
              </h2>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Kept, never deleted — the record of an exception that once applied is the audit trail.
              </span>
              {past.map((o) => <OverrideCard key={o.id} o={o} past />)}
            </Stack>
          )}
        </Stack>
      )}

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add an override">
        {adding && <OverrideForm modules={modules} onDone={() => setAdding(false)} />}
      </Drawer>
    </Stack>
  );
}

function OverrideCard({ o, past }) {
  const verbs = VCED.filter((v) => o[v]);
  const blanket = o.effect === "Deny" && !o.resource && verbs.length === 0 && !o.capabilities.length;

  return (
    <Card style={past ? { opacity: 0.6 } : undefined}>
      <Cluster justify="space-between" align="flex-start">
        <Stack gap="2">
          <Cluster gap="2">
            <Badge tone={o.effect === "Deny" ? "danger" : "success"}>{o.effect}</Badge>
            <strong style={past ? { textDecoration: "line-through" } : undefined}>
              {o.moduleKey}{o.resource ? ` · ${o.resource}` : " · whole module"}
            </strong>
            <code style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>ITS {o.itsId}</code>
          </Cluster>
          <span style={{ fontSize: "var(--text-sm)" }}>
            {blanket
              ? "Full lockout — every resource in this module."
              : [verbs.join(", "), o.capabilities.join(", ")].filter(Boolean).join(" · ") || "no verbs named"}
          </span>
          {o.reason && (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>“{o.reason}”</span>
          )}
          {o.expires && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {past ? "expired" : "expires"} {new Date(o.expires).toLocaleDateString()}
            </span>
          )}
        </Stack>
        {!past && <ExpireButton o={o} />}
      </Cluster>
    </Card>
  );
}

function ExpireButton({ o }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(expireOverride, null);
  return (
    <>
      <Button variant="secondary" size="sm" icon="clock" loading={pending}
        onClick={() => setConfirming(true)}>End now</Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="End this override?"
        description={o.effect === "Deny"
          ? "Ending a deny restores whatever the person's roles grant them. Make sure that is what you want."
          : "Ending a grant removes the extra rights it added."}
        confirmLabel="End it"
        onConfirm={() => {
          const fd = new FormData();
          fd.set("id", o.id);
          action(fd);
          setConfirming(false);
        }}
      />
    </>
  );
}

function OverrideForm({ modules, onDone }) {
  const [state, action, pending] = useActionState(saveOverride, null);
  const [effect, setEffect] = useState("Deny");
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "");
  const chosen = modules.find((m) => m.id === moduleId);

  return (
    <form action={action}>
      <input type="hidden" name="moduleKey" value={chosen?.key ?? ""} />
      <Stack gap="4">
        {state?.ok === false && <Callout tone="danger" title="Not saved">{state.message}</Callout>}
        {state?.ok && <Callout tone="success" title="Saved">{state.message}</Callout>}

        <Stack gap="2">
          <Label htmlFor="itsId">ITS ID</Label>
          <Input id="itsId" name="itsId" required inputMode="numeric" pattern="\d{6,10}" />
        </Stack>

        <Cluster gap="4">
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="effect">Effect</Label>
            <Select id="effect" name="effect" value={effect}
              onChange={(e) => setEffect(e.target.value)}
              options={[{ value: "Deny", label: "Deny — removes rights" },
                        { value: "Grant", label: "Grant — adds rights" }]} />
          </Stack>
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="moduleId">Module</Label>
            <Select id="moduleId" name="moduleId" value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              options={modules.map((m) => ({ value: m.id, label: m.name }))} />
          </Stack>
        </Cluster>

        <Stack gap="2">
          <Label htmlFor="resource">Resource</Label>
          <Input id="resource" name="resource" placeholder="blank = every resource in the module" />
        </Stack>

        {effect === "Deny" && (
          <Callout tone="warning" title="A deny with nothing ticked is a full lockout">
            Leave the resource blank and every box unticked to remove this person from the module
            entirely. It is the plainest way to say “not this person, not here”.
          </Callout>
        )}

        <Stack gap="2">
          <Label>Verbs</Label>
          <Cluster gap="4">
            {VCED.map((v) => <Checkbox key={v} name={v} label={v} />)}
          </Cluster>
        </Stack>

        <Stack gap="2">
          <Label htmlFor="capabilities">Capabilities</Label>
          <Textarea id="capabilities" name="capabilities" rows={2} placeholder="one key per line" />
        </Stack>

        <Stack gap="2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" name="reason" rows={2} required
            placeholder="Why this exception exists — read six months from now by someone deciding whether to remove it." />
        </Stack>

        <Stack gap="2">
          <Label htmlFor="expires">Expires</Label>
          <Input id="expires" name="expires" type="date" />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Blank is permanent. Most exceptions should not be.
          </span>
        </Stack>

        <Cluster justify="flex-end" gap="3">
          <Button variant="secondary" onClick={onDone}>Close</Button>
          <Button type="submit" loading={pending}>Save</Button>
        </Cluster>
      </Stack>
    </form>
  );
}

const isExpired = (d) => !!d && new Date(d).getTime() < Date.now();
