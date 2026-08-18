"use client";

import { useActionState, useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Tag, Button, Input, Select, Textarea,
  Label, Drawer, EmptyState, Callout,
} from "@al-rayhaanat/system";
import { saveModule, refreshManifest, setModuleOwners } from "../actions.js";

const STATUS = ["Live", "Beta", "Hidden", "Retired"];
const VISIBILITY = ["Granted", "Public"];

export function ModulesView({ modules, mayRegister = true }) {
  const [editing, setEditing] = useState(null);

  return (
    <Stack gap="6">
      <PageHeader
        title="Modules"
        actions={mayRegister
          ? <Button icon="plus" onClick={() => setEditing({})}>Register a module</Button>
          : null}
      />

      {modules.length === 0 ? (
        <EmptyState title="No modules yet"
          action={<Button icon="plus" onClick={() => setEditing({})}>Register a module</Button>} />
      ) : (
        <Stack gap="4">
          {modules.map((m) => (
            <Card key={m.id}>
              <Cluster justify="space-between" align="flex-start">
                <Stack gap="2">
                  <Cluster gap="2">
                    <strong>{m.name}</strong>
                    <Badge tone={m.status === "Live" ? "success" : m.status === "Retired" ? "danger" : "neutral"}>
                      {m.status}
                    </Badge>
                    {m.visibility === "Public" && <Tag>Public</Tag>}
                    {m.orphaned > 0 && <Badge tone="warning">{m.orphaned} orphaned</Badge>}
                  </Cluster>
                  <code style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{m.key}</code>
                  {m.url && (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{m.url}</span>
                  )}
                  <Cluster gap="3">
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      {m.grants} grant{m.grants === 1 ? "" : "s"}
                    </span>
                    <ManifestBadge module={m} />
                  </Cluster>
                  <Owners module={m} />
                </Stack>
                <Cluster gap="2">
                  <RefreshButton module={m} />
                  {mayRegister && (
                    <Button variant="secondary" size="sm" icon="pencil"
                      onClick={() => setEditing(m)}>Edit</Button>
                  )}
                </Cluster>
              </Cluster>
            </Card>
          ))}
        </Stack>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : "Register a module"}>
        {editing && <ModuleForm module={editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </Stack>
  );
}

/**
 * Who administers this module — the per-module half of Platform Admin.
 *
 * Deliberately here rather than on Members. A member row grants an access role,
 * and a role reaches every module it is granted on; there is no way to say
 * "admin, but only mawaqeet" in that shape. Ownership is a property of the
 * module, so it is edited on the module.
 */
function Owners({ module: m }) {
  const [state, action, pending] = useActionState(setModuleOwners, null);
  const [open, setOpen] = useState(false);
  const current = String(m.platformAdmin ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          administered by
        </span>
        {current.length
          ? current.map((its) => <Tag key={its}>{its}</Tag>)
          : <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>nobody yet</span>}
        <Button variant="ghost" size="sm" icon={open ? "x" : "users"}
          onClick={() => setOpen(!open)}>{open ? "Cancel" : "Change"}</Button>
      </Cluster>

      {open && (
        <form action={action}>
          <input type="hidden" name="moduleId" value={m.id} />
          <input type="hidden" name="moduleKey" value={m.key} />
          <Stack gap="2">
            <Label htmlFor={`owners-${m.id}`}>ITS IDs, one per line</Label>
            <Textarea id={`owners-${m.id}`} name="owners" rows={3}
              defaultValue={current.join("\n")} placeholder="40452114" />
            {state?.ok === false && <Callout tone="danger" title="Not saved">{state.message}</Callout>}
            {state?.ok && <Callout tone="success" title="Saved">{state.message}</Callout>}
            <Cluster gap="2">
              <Button type="submit" size="sm" loading={pending}>Save administrators</Button>
            </Cluster>
          </Stack>
        </form>
      )}
    </Stack>
  );
}

function ManifestBadge({ module: m }) {
  const tone = { OK: "success", Unreachable: "warning", Invalid: "danger" }[m.manifestStatus] ?? "neutral";
  return (
    <Badge tone={tone}>
      manifest: {m.manifestStatus}
      {m.manifestChecked ? ` · ${new Date(m.manifestChecked).toLocaleDateString()}` : ""}
    </Badge>
  );
}

function RefreshButton({ module: m }) {
  const [state, action, pending] = useActionState(refreshManifest, null);
  return (
    <form action={action}>
      <input type="hidden" name="moduleId" value={m.id} />
      <input type="hidden" name="moduleKey" value={m.key} />
      <input type="hidden" name="url" value={m.url ?? ""} />
      <Cluster gap="2">
        {state && (
          <span style={{ fontSize: "var(--text-xs)",
            color: state.ok ? "var(--success)" : "var(--danger)", maxInlineSize: "32ch" }}>
            {state.message}
          </span>
        )}
        <Button type="submit" variant="secondary" size="sm" icon="download"
          loading={pending} disabled={!m.url}>Fetch manifest</Button>
      </Cluster>
    </form>
  );
}

function ModuleForm({ module: m, onDone }) {
  const [state, action, pending] = useActionState(saveModule, null);

  return (
    <form action={action}>
      {m.id && <input type="hidden" name="id" value={m.id} />}
      <Stack gap="4">
        {state?.ok === false && <Callout tone="danger" title="Not saved">{state.message}</Callout>}
        {state?.ok && <Callout tone="success" title="Saved">{state.message}</Callout>}

        <Stack gap="2">
          <Label htmlFor="key">Key</Label>
          <Input id="key" name="key" defaultValue={m.key ?? ""} required
            placeholder="hoto" readOnly={!!m.id} />
          <Hint>Cannot change once set.</Hint>
        </Stack>

        <Stack gap="2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={m.name ?? ""} required />
        </Stack>

        <Stack gap="2">
          <Label htmlFor="nameArabic">Name (Arabic)</Label>
          <Input id="nameArabic" name="nameArabic" defaultValue={m.nameArabic ?? ""} dir="rtl" />
        </Stack>

        <Stack gap="2">
          <Label htmlFor="url">URL</Label>
          <Input id="url" name="url" type="url" defaultValue={m.url ?? ""}
            placeholder="https://mawaqeet.daeratulaqeeq.org" />
          <Hint>/.well-known/access-manifest.json is read from this origin.</Hint>
        </Stack>

        <Cluster gap="4">
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={m.status ?? "Beta"}
              options={STATUS.map((s) => ({ value: s, label: s }))} />
          </Stack>
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="visibility">Visibility</Label>
            <Select id="visibility" name="visibility" defaultValue={m.visibility ?? "Granted"}
              options={VISIBILITY.map((v) => ({ value: v, label: v }))} />
          </Stack>
        </Cluster>

        <Cluster gap="4">
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="icon">Icon</Label>
            <Input id="icon" name="icon" defaultValue={m.icon ?? ""} placeholder="calendar" />
          </Stack>
          <Stack gap="2" style={{ flex: 1 }}>
            <Label htmlFor="sort">Sort</Label>
            <Input id="sort" name="sort" type="number" defaultValue={m.sort ?? 0} />
          </Stack>
        </Cluster>

        <Stack gap="2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={m.notes ?? ""} />
        </Stack>

        <Cluster justify="flex-end" gap="3">
          <Button variant="secondary" onClick={onDone}>Close</Button>
          <Button type="submit" loading={pending}>Save</Button>
        </Cluster>
      </Stack>
    </form>
  );
}

const Hint = ({ children }) => (
  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{children}</span>
);
