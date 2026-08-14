"use client";

import { useMemo, useState } from "react";
import {
  PageHeader, Stack, Cluster, Select, Label, Badge, DataTable, EmptyState, Callout,
} from "@al-rayhaanat/system";

/**
 * What the console did, and what it refused.
 *
 * Ordered newest first and filterable by module, because the question this
 * screen answers is almost always "what happened to *my* module" rather than
 * "what happened". Sorting comes free from DataTable on every column — the
 * other common question is "who has been changing things", which is a click on
 * the Who header.
 *
 * Refusals are shown, not hidden. A grant that succeeded leaves a row in the
 * matrix as evidence; an attempt that was turned away leaves nothing anywhere
 * else, which makes it the half worth surfacing.
 */
export function LogsView({ entries, modules, scoped }) {
  const [module, setModule] = useState("");
  const [result, setResult] = useState("");

  const rows = useMemo(() => entries.filter((e) =>
    (!module || e.moduleKey === module || (module === "—" && !e.moduleKey))
    && (!result || e.result === result)), [entries, module, result]);

  const columns = [
    {
      key: "at",
      label: "When",
      render: (v) => <time dateTime={v} title={v}>{short(v)}</time>,
    },
    {
      key: "actorName",
      label: "Who",
      render: (v, row) => (
        <span>
          {v || <span style={{ color: "var(--text-muted)" }}>unknown</span>}
          <span style={{ display: "block", fontSize: "var(--text-3xs)", color: "var(--text-muted)",
            fontFeatureSettings: "'tnum'" }}>{row.actor}</span>
        </span>
      ),
    },
    {
      key: "moduleKey",
      label: "Module",
      render: (v, row) => v
        ? <Badge tone="neutral">{row.moduleName ?? v}</Badge>
        // Roles and members are fleet-wide: they belong to no single module,
        // and saying so is more useful than leaving the cell blank.
        : <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>fleet-wide</span>,
    },
    { key: "resource", label: "Resource" },
    { key: "action", label: "Action" },
    { key: "target", label: "Target" },
    {
      key: "result",
      label: "Result",
      render: (v) => <Badge tone={v === "denied" ? "danger" : "success"}>{v}</Badge>,
    },
    {
      key: "detail",
      label: "Detail",
      sortable: false,
      render: (v) => <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{v}</span>,
    },
  ];

  const denied = entries.filter((e) => e.result === "denied").length;

  return (
    <Stack gap="6">
      <PageHeader
        title="Audit log"
        description="Every write this console made, and every one it refused. Append only — nothing here is edited or removed."
        meta={
          <>
            <span>{entries.length} entries</span>
            {denied > 0 && <span>{denied} refused</span>}
          </>
        }
      />

      {scoped && (
        <Callout tone="info" title="Narrowed to the modules you administer">
          Entries for modules you do not administer are not shown, and neither are
          the fleet-wide ones — roles and members are changed by whoever administers
          this console.
        </Callout>
      )}

      <Cluster gap="4" align="end">
        <Stack gap="1">
          <Label htmlFor="log-module">Module</Label>
          <Select
            id="log-module"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            options={[
              { value: "", label: `Every module (${entries.length})` },
              ...modules.map((m) => ({
                value: m.key,
                label: `${m.name} (${entries.filter((e) => e.moduleKey === m.key).length})`,
              })),
              ...(entries.some((e) => !e.moduleKey)
                ? [{ value: "—", label: `Fleet-wide (${entries.filter((e) => !e.moduleKey).length})` }]
                : []),
            ]}
          />
        </Stack>
        <Stack gap="1">
          <Label htmlFor="log-result">Result</Label>
          <Select
            id="log-result"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            options={[
              { value: "", label: "Everything" },
              { value: "ok", label: "Written" },
              { value: "denied", label: "Refused" },
            ]}
          />
        </Stack>
      </Cluster>

      {rows.length === 0 ? (
        <EmptyState
          icon="search"
          title={entries.length ? "Nothing matches that" : "Nothing has been written yet"}
          description={entries.length
            ? "Widen the filters above."
            : "The log fills as grants are made. It records refusals too, so an attempt that was turned away still leaves a trace."}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          density="compact"
          maxHeight="65vh"
          windowRows={60}
          caption={`${rows.length} of ${entries.length}`}
        />
      )}
    </Stack>
  );
}

/** Readable to a person scanning, with the full instant in the title attribute. */
function short(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
