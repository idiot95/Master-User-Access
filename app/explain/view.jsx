"use client";

import { useState } from "react";
import {
  PageHeader, Stack, Cluster, Card, Badge, Tag, Button, Input, Select, Label,
  EmptyState, Divider, AccessDenied,
} from "@al-rayhaanat/system";

const VERB = { v: "view", c: "create", e: "edit", d: "delete" };

/**
 * Why can this person see this?
 *
 * The derivation, in order, ending in the net result. This is what separates a
 * permission system people maintain from one they are afraid to touch — and it
 * is the fastest way to debug the matrix while it is being filled in.
 */
export function ExplainView({ modules, result, itsId, moduleKey }) {
  const [its, setIts] = useState(itsId);
  const [mod, setMod] = useState(moduleKey ?? "");

  const go = () => {
    const q = new URLSearchParams();
    if (its.trim()) q.set("its", its.trim());
    if (mod) q.set("module", mod);
    location.assign(`/explain?${q}`);
  };

  return (
    <Stack gap="6">
      <PageHeader title="Explain" />

      <Card>
        <Cluster gap="4" align="flex-end">
          <Stack gap="2" style={{ flex: 1, minInlineSize: "12rem" }}>
            <Label htmlFor="its">ITS ID</Label>
            <Input id="its" value={its} onChange={(e) => setIts(e.target.value)}
              placeholder="30456117" inputMode="numeric"
              onKeyDown={(e) => e.key === "Enter" && go()} />
          </Stack>
          <Stack gap="2" style={{ flex: 1, minInlineSize: "12rem" }}>
            <Label htmlFor="module">Module</Label>
            <Select id="module" value={mod} onChange={(e) => setMod(e.target.value)}
              options={[{ value: "", label: "Every module" },
                        ...modules.map((m) => ({ value: m.key, label: m.name }))]} />
          </Stack>
          <Button icon="search" onClick={go}>Explain</Button>
        </Cluster>
      </Card>

      {!result ? (
        <EmptyState title="Name someone" />
      ) : (
        <Result result={result} />
      )}
    </Stack>
  );
}

function Result({ result }) {
  const nothing = !result.contributions.length;
  const netEntries = Object.entries(result.net ?? {}).filter(([, v]) => v);

  return (
    <Stack gap="5">
      <Card>
        <Cluster justify="space-between">
          <Stack gap="1">
            <strong>{result.name || "(not in the register)"}</strong>
            <code style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>ITS {result.its}</code>
          </Stack>
          <Cluster gap="2">
            <Badge tone={result.eligible ? "success" : "danger"}>
              {result.eligible ? "eligible" : "not eligible"}
            </Badge>
            <Badge tone={result.tier === "admin" ? "warning" : "neutral"}>{result.tier}</Badge>
          </Cluster>
        </Cluster>
      </Card>

      {nothing ? (
        <Card>
          <AccessDenied resource="any module here" />
        </Card>
      ) : (
        <Stack gap="3">
          <h2 style={sub}>How it was derived</h2>
          {result.contributions.map((c, i) => <Contribution key={i} c={c} />)}
        </Stack>
      )}

      <Divider />

      <Stack gap="3">
        <h2 style={sub}>What survives</h2>
        {netEntries.length === 0 ? (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Nothing.</span>
        ) : (
          netEntries.map(([moduleKey, entry]) => (
            <Card key={moduleKey}>
              <Stack gap="3">
                <strong>{moduleKey}</strong>
                {Object.entries(entry.res ?? {}).map(([res, r]) => (
                  <Cluster key={res} gap="3" justify="space-between">
                    <code style={{ fontSize: "var(--text-xs)" }}>{res}</code>
                    <Cluster gap="2">
                      {Object.entries(VERB).filter(([k]) => r[k]).map(([, name]) => (
                        <Badge key={name} tone="success">{name}</Badge>
                      ))}
                      {(r.caps ?? []).map((c) => <Tag key={c}>{c}</Tag>)}
                      <Badge tone="neutral">scope: {r.rule}</Badge>
                    </Cluster>
                  </Cluster>
                ))}
                {Object.values(entry.res ?? {}).some((r) => r.scopes?.length) && (
                  <Cluster gap="2">
                    {[...new Map(Object.values(entry.res)
                      .flatMap((r) => r.scopes ?? [])
                      .map((s) => [`${s.t}:${s.id}`, s])).values()]
                      .map((s) => <Tag key={`${s.t}${s.id}`}>{s.t}: {s.l}</Tag>)}
                  </Cluster>
                )}
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Stack>
  );
}

function Contribution({ c }) {
  const tone = c.via === "override"
    ? (c.effect === "deny" ? "danger" : "success")
    : c.via === "public" ? "info" : "neutral";
  const verbs = Object.entries(VERB).filter(([k]) => c.grants?.[k]).map(([, n]) => n);

  return (
    <Card style={c.expired || c.orphaned ? { opacity: 0.55 } : undefined}>
      <Stack gap="2">
        <Cluster gap="2">
          <Badge tone={tone}>{c.via === "override" ? `override · ${c.effect}` : c.via}</Badge>
          {c.role && <strong>{c.role}</strong>}
          {/* An access role mirroring an org role carries the same name in both
              fields; printing it twice reads as a rendering fault. */}
          {c.detail && c.detail !== c.role && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{c.detail}</span>
          )}
          {c.orphaned && <Badge tone="warning">orphaned — excluded</Badge>}
          {c.expired && <Badge tone="neutral">expired — ignored</Badge>}
        </Cluster>

        <Cluster gap="2">
          <code style={{ fontSize: "var(--text-xs)" }}>
            {c.module}{c.resource ? ` · ${c.resource}` : ""}
          </code>
          {verbs.map((v) => <Badge key={v} tone={c.effect === "deny" ? "danger" : "success"}>{v}</Badge>)}
          {(c.capabilities ?? []).map((k) => <Tag key={k}>{k}</Tag>)}
        </Cluster>

        {c.scope?.length > 0 && (
          <Cluster gap="2">
            {c.scope.map((s) => <Tag key={`${s.t}${s.id}`}>{s.t}: {s.l}</Tag>)}
          </Cluster>
        )}

        {c.reason && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>“{c.reason}”</span>
        )}
        {c.note && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{c.note}</span>
        )}
      </Stack>
    </Card>
  );
}

const sub = {
  margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-xl)",
  fontWeight: "var(--weight-regular)",
};
