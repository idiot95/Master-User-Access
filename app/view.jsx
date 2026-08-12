"use client";

import { useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Button, EmptyState, Icon, Tabs, Divider,
} from "@al-rayhaanat/system";
import { SEVERITY } from "../lib/findings.js";

/**
 * What needs attention, not how much there is.
 *
 * An earlier version of this page counted things — six tiles of modules, roles,
 * grants. Nobody can act on a number. Every entry here is a sentence about
 * something that is wrong, about to change, or untidy, and each carries the
 * screen where it gets fixed.
 *
 * "Nothing to report" is the goal state, and is said plainly rather than padded.
 */
export function OverviewView({ findings, counts, empty }) {
  const [filter, setFilter] = useState("all");

  if (empty) {
    return (
      <Stack gap="6">
        <PageHeader title="User Access"
          description="Who may open which module, and what they may do there." />
        <EmptyState
          title="Nothing is registered yet"
          description="Register a module, create the roles that may open it, then tick what each role can do. Nothing is granted until you tick it."
          action={<Button icon="plus" onClick={() => location.assign("/modules")}>Register a module</Button>}
        />
      </Stack>
    );
  }

  const bySeverity = (s) => findings.filter((f) => f.severity === s);
  const present = ["risk", "broken", "expiring", "chore"].filter((s) => bySeverity(s).length);
  const tabs = [
    { id: "all", label: `All (${findings.length})` },
    ...present.map((s) => ({ id: s, label: `${SEVERITY[s].label} (${bySeverity(s).length})` })),
  ];
  const shown = filter === "all" ? findings : bySeverity(filter);
  const worst = findings[0]?.severity;

  return (
    <Stack gap="5">
      <PageHeader
        title="User Access"
        description={
          findings.length === 0
            ? "Nothing needs attention. Access is configured the way it was left."
            : worst === "risk"
            ? "Something here probably exposes more than it should."
            : "A few things are not doing what they appear to."
        }
        meta={
          <>
            <span>{counts.declared} of {counts.modules} live modules declared</span>
            <span>{counts.roles} roles</span>
            <span>{counts.grants} grants</span>
            <span>{counts.members} people held</span>
          </>
        }
      />

      {findings.length === 0 ? (
        <Card>
          <Cluster gap="4" align="center">
            <Icon name="check" size={20} style={{ color: "var(--success)" }} />
            <Stack gap="1">
              <strong>Nothing to report</strong>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                No role reaches further than it should, every module has declared itself, and
                nothing is about to expire. This page fills up when that stops being true.
              </span>
            </Stack>
          </Cluster>
        </Card>
      ) : (
        <>
          {tabs.length > 2 && <Tabs items={tabs} value={filter} onChange={setFilter} />}
          <Stack gap="3">
            {shown.map((f, i) => <Finding key={i} f={f} />)}
          </Stack>
        </>
      )}

      <Divider />

      <Cluster gap="3">
        <Button variant="secondary" icon="bookmark" onClick={() => location.assign("/roles")}>
          Roles
        </Button>
        <Button variant="secondary" icon="table" onClick={() => location.assign("/permissions")}>
          Permissions
        </Button>
        <Button variant="secondary" icon="search" onClick={() => location.assign("/explain")}>
          Explain someone’s access
        </Button>
      </Cluster>
    </Stack>
  );
}

function Finding({ f }) {
  const s = SEVERITY[f.severity];
  const ink = { danger: "var(--danger)", warning: "var(--warning)", info: "var(--info)" };
  return (
    <Card>
      <Cluster justify="space-between" align="flex-start" gap="4">
        <Cluster gap="4" align="flex-start">
          <span style={{ paddingBlockStart: 2 }}>
            <Icon name={s.icon} size={16} style={{ color: ink[s.tone] ?? "var(--text-muted)" }} />
          </span>
          <Stack gap="2">
            <Cluster gap="2">
              <strong>{f.title}</strong>
              <Badge tone={s.tone}>{s.label}</Badge>
            </Cluster>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)",
              maxInlineSize: "80ch" }}>{f.detail}</span>
          </Stack>
        </Cluster>
        <Button variant="secondary" size="sm" onClick={() => location.assign(f.href)}>
          {f.action}
        </Button>
      </Cluster>
    </Card>
  );
}
