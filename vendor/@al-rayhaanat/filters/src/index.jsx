/**
 * @al-rayhaanat/filters — the package that decides whether products feel like
 * one system. Underinvest here and every team builds its own filter bar.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui, /table.
 *
 * Model
 *   filter        { id, field, operator, value, value2?, join? }
 *   group         { combinator: 'and' | 'or', filters: Filter[] }
 *
 *   `join` is the clause BEFORE a filter — 'and' | 'or' — so a group can mix
 *   them. It is ignored on the first filter, evaluated strictly left to right
 *   with no precedence (what the reader sees is what runs), and falls back to
 *   the group combinator when absent, so older links still resolve.
 *
 * URL serialisation
 *   ?f=field:op:value~field:op:value&fc=or
 *   Values are encodeURIComponent'd; `between` packs as `a|b`; multi-select
 *   packs as `a,b,c`. Round-trips exactly, so filter state is shareable and
 *   back-button safe. Nothing lives in component state that the URL cannot hold.
 */
"use client";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Icon } from "@al-rayhaanat/icons";
import { Button, IconButton, Input, Select, Checkbox, Tag, Card, Divider, useTabIndicator } from "@al-rayhaanat/ui";
import { DataTable } from "@al-rayhaanat/table";

/* ── operators, by field type ───────────────────────────────────────────── */
export const OPERATORS = {
  text: [
    { op: "contains", label: "contains" },
    { op: "is", label: "is" },
    { op: "starts", label: "starts with" },
    { op: "empty", label: "is empty", nullary: true }
  ],
  number: [
    { op: "eq", label: "=" },
    { op: "gt", label: ">" },
    { op: "lt", label: "<" },
    { op: "between", label: "between", binary: true }
  ],
  date: [
    { op: "on", label: "on" },
    { op: "before", label: "before" },
    { op: "after", label: "after" },
    { op: "between", label: "between", binary: true }
  ],
  select: [
    { op: "is", label: "is" },
    { op: "not", label: "is not" }
  ],
  multi: [
    { op: "any", label: "any of", multi: true },
    { op: "none", label: "none of", multi: true }
  ],
  boolean: [
    { op: "true", label: "is true", nullary: true },
    { op: "false", label: "is false", nullary: true }
  ]
};

const OP_LABEL = Object.values(OPERATORS).flat()
  .reduce((m, o) => ((m[o.op] = o.label), m), {});
const OP_META = Object.values(OPERATORS).flat()
  .reduce((m, o) => ((m[o.op] = o), m), {});

let seq = 0;
const nextId = () => `f${++seq}`;

/* ── evaluation (client side; a server hands the same model to the API) ─── */
const asNum = v => {
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isNaN(n) ? null : n;
};
function matches(row, f) {
  const v = row[f.field];
  const s = String(v ?? "").toLowerCase();
  const q = String(f.value ?? "").toLowerCase();
  switch (f.operator) {
    case "contains": return s.includes(q);
    case "is": return s === q;
    case "not": return s !== q;
    case "starts": return s.startsWith(q);
    case "empty": return v === undefined || v === null || String(v) === "";
    case "eq": return asNum(v) === asNum(f.value);
    case "gt": return asNum(v) > asNum(f.value);
    case "lt": return asNum(v) < asNum(f.value);
    case "between": return asNum(v) >= asNum(f.value) && asNum(v) <= asNum(f.value2);
    case "on": return String(v) === String(f.value);
    case "before": return String(v) < String(f.value);
    case "after": return String(v) > String(f.value);
    case "any": return (f.value || []).some(x => String(x).toLowerCase() === s);
    case "none": return !(f.value || []).some(x => String(x).toLowerCase() === s);
    case "true": return v === true;
    case "false": return v === false;
    default: return true;
  }
}
export function applyFilters(rows, group) {
  const active = (group.filters || []).filter(f => f.field && f.operator);
  if (active.length === 0) return rows;
  return rows.filter(row => active.reduce((acc, f, i) => {
    const m = matches(row, f);
    if (i === 0) return m;
    const join = f.join || group.combinator || "and";
    return join === "or" ? acc || m : acc && m;
  }, true));
}

/* ── URL serialisation ──────────────────────────────────────────────────── */
export function serializeFilters(group) {
  const parts = (group.filters || []).filter(f => f.field && f.operator).map(f => {
    const v = Array.isArray(f.value) ? f.value.join(",")
      : f.operator === "between" ? `${f.value ?? ""}|${f.value2 ?? ""}`
      : f.value ?? "";
    /* Values are encodeURIComponent'd, so ':' never survives into one — the
       fourth segment is unambiguous, and absent on the first filter. */
    const seg = [f.field, f.operator, encodeURIComponent(v)];
    if (f.join) seg.push(f.join);
    return seg.join(":");
  });
  const p = new URLSearchParams();
  if (parts.length) p.set("f", parts.join("~"));
  if (group.combinator === "or") p.set("fc", "or");
  return p.toString();
}
export function parseFilters(search) {
  const p = new URLSearchParams(search);
  const raw = p.get("f");
  const combinator = p.get("fc") === "or" ? "or" : "and";
  if (!raw) return { combinator, filters: [] };
  const filters = raw.split("~").map(part => {
    const [field, operator, encoded = "", join] = part.split(":");
    const value = decodeURIComponent(encoded);
    const meta = OP_META[operator] || {};
    const base = { id: nextId(), field, operator, ...(join ? { join } : null) };
    if (meta.multi) return { ...base, value: value ? value.split(",") : [] };
    if (meta.binary) { const [a, b] = value.split("|"); return { ...base, value: a, value2: b }; }
    return { ...base, value };
  });
  return { combinator, filters };
}

/**
 * Filter state, with the URL as the source of truth.
 * `fields`: [{ key, label, type, options?, loadOptions? }]
 */
export function useFilters({ fields, initial, syncUrl = true, storageKey }) {
  const [group, setGroup] = useState(() => {
    if (syncUrl && typeof window !== "undefined" && window.location.search.includes("f=")) {
      return parseFilters(window.location.search);
    }
    return initial || { combinator: "and", filters: [] };
  });
  const [views, setViews] = useState(() => {
    if (!storageKey || typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const qs = serializeFilters(group);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [group, syncUrl]);

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const onPop = () => setGroup(parseFilters(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncUrl]);

  const add = useCallback(fieldKey => {
    const field = fields.find(f => f.key === fieldKey) || fields[0];
    const op = (OPERATORS[field.type] || OPERATORS.text)[0].op;
    setGroup(g => ({ ...g, filters: [...g.filters,
      { id: nextId(), field: field.key, operator: op, value: "",
        ...(g.filters.length ? { join: g.combinator || "and" } : null) }] }));
  }, [fields]);
  const update = useCallback((id, patch) =>
    setGroup(g => ({ ...g, filters: g.filters.map(f => (f.id === id ? { ...f, ...patch } : f)) })), []);
  const remove = useCallback(id =>
    setGroup(g => ({ ...g, filters: g.filters.filter(f => f.id !== id) })), []);
  const clear = useCallback(() => setGroup(g => ({ ...g, filters: [] })), []);
  /** Sets the default AND rewrites every existing clause, so "match all" means it. */
  const setCombinator = useCallback(c => setGroup(g => ({
    ...g, combinator: c,
    filters: g.filters.map((f, i) => (i === 0 ? f : { ...f, join: c }))
  })), []);
  /** Replace the whole group — how a preset, scope or saved view is applied. */
  const replace = useCallback(next => setGroup({
    combinator: next.combinator || "and",
    filters: (next.filters || []).map(f => ({ id: nextId(), ...f }))
  }), []);

  const saveView = useCallback(name => {
    const next = [...views.filter(v => v.name !== name), { name, query: serializeFilters(group) }];
    setViews(next);
    if (storageKey && typeof window !== "undefined") window.localStorage.setItem(storageKey, JSON.stringify(next));
  }, [views, group, storageKey]);
  const applyView = useCallback(v => setGroup(parseFilters(v.query)), []);
  const removeView = useCallback(name => {
    const next = views.filter(v => v.name !== name);
    setViews(next);
    if (storageKey && typeof window !== "undefined") window.localStorage.setItem(storageKey, JSON.stringify(next));
  }, [views, storageKey]);

  return { group, fields, add, update, remove, clear, setCombinator, replace, query: serializeFilters(group),
    views, saveView, applyView, removeView };
}

/* ── one filter row ─────────────────────────────────────────────────────── */
function FilterRow({ filter, fields, onChange, onRemove, index = 0 }) {
  const field = fields.find(f => f.key === filter.field) || fields[0];
  const ops = OPERATORS[field.type] || OPERATORS.text;
  const meta = OP_META[filter.operator] || {};
  const join = filter.join || "and";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
      {/* The clause belongs to the line it precedes, so every row after the
          first carries its own — a group can read "state is open OR folios > 10".
          The first row is a fixed label, because there is nothing to join to. */}
      <span style={{ inlineSize: 78, flex: "none" }}>
        {index === 0 ? (
          <span style={{ display: "inline-flex", alignItems: "center", blockSize: 28,
            paddingInline: "var(--space-3)", fontSize: "var(--text-2xs)",
            letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase",
            color: "var(--text-muted)" }}>Where</span>
        ) : (
          <Select size="sm" value={join} aria-label="Clause"
            options={[{ value: "and", label: "and" }, { value: "or", label: "or" }]}
            onChange={e => onChange({ join: e.target.value })} />
        )}
      </span>
      <span style={{ inlineSize: 150 }}>
        <Select size="sm" value={filter.field}
          options={fields.map(f => ({ value: f.key, label: f.label }))}
          onChange={e => {
            const next = fields.find(f => f.key === e.target.value);
            const firstOp = (OPERATORS[next.type] || OPERATORS.text)[0].op;
            onChange({ field: e.target.value, operator: firstOp, value: "", value2: undefined });
          }} />
      </span>
      <span style={{ inlineSize: 130 }}>
        <Select size="sm" value={filter.operator}
          options={ops.map(o => ({ value: o.op, label: o.label }))}
          onChange={e => onChange({ operator: e.target.value, value: "", value2: undefined })} />
      </span>
      {!meta.nullary && (
        meta.multi ? (
          <span style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {(field.options || []).map(o => {
              const on = (filter.value || []).includes(o);
              return (
                <Checkbox key={o} label={o} checked={on}
                  onChange={() => onChange({ value: on
                    ? (filter.value || []).filter(x => x !== o)
                    : [...(filter.value || []), o] })} />
              );
            })}
          </span>
        ) : field.type === "select" ? (
          <span style={{ inlineSize: 160 }}>
            <Select size="sm" value={filter.value}
              options={[{ value: "", label: "—" }, ...(field.options || []).map(o => ({ value: o, label: o }))]}
              onChange={e => onChange({ value: e.target.value })} />
          </span>
        ) : (
          <>
            <Input size="sm" style={{ inlineSize: 140 }} value={filter.value ?? ""}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              placeholder={field.label} onChange={e => onChange({ value: e.target.value })} />
            {meta.binary && (
              <>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>and</span>
                <Input size="sm" style={{ inlineSize: 140 }} value={filter.value2 ?? ""}
                  type={field.type === "number" ? "number" : "date"}
                  onChange={e => onChange({ value2: e.target.value })} />
              </>
            )}
          </>
        )
      )}
      <IconButton size="sm" variant="ghost" name="x" label="Remove filter" onClick={onRemove} />
    </div>
  );
}

/** Active-filter chips. Individual clear on each, bulk clear at the end. */
export function FilterChips({ state }) {
  const { group, fields, remove, clear } = state;
  if (group.filters.length === 0) return null;
  const label = f => {
    const field = fields.find(x => x.key === f.field);
    const meta = OP_META[f.operator] || {};
    const v = meta.nullary ? "" : Array.isArray(f.value) ? f.value.join(", ")
      : meta.binary ? `${f.value ?? "…"} – ${f.value2 ?? "…"}` : f.value || "…";
    return `${field ? field.label : f.field} ${OP_LABEL[f.operator] || f.operator} ${v}`.trim();
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
      {group.filters.map(f => (
        <Tag key={f.id} onRemove={() => remove(f.id)}>{label(f)}</Tag>
      ))}
      {group.filters.length > 1 && (
        <span style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
          textTransform: "uppercase", color: "var(--text-muted)" }}>
          {group.combinator}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={clear}>Clear all</Button>
    </div>
  );
}

/** Saved, named views — the query string is the whole payload. */
export function SavedViews({ state }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
      {state.views.map(v => (
        <Tag key={v.name} tone="neutral" onRemove={() => state.removeView(v.name)}>
          <button onClick={() => state.applyView(v)}
            style={{ border: 0, background: "transparent", padding: 0, font: "inherit",
              color: "inherit", cursor: "pointer" }}>{v.name}</button>
        </Tag>
      ))}
      <Input size="sm" style={{ inlineSize: 140 }} placeholder="Name this view" value={name}
        onChange={e => setName(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={!name || state.group.filters.length === 0}
        onClick={() => { state.saveView(name); setName(""); }}>Save view</Button>
    </div>
  );
}

/** The bar: add-filter, rows, combinator, chips, saved views, live query string. */
export function FilterBar({ state, showQuery = true }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Button size="sm" icon="filter" variant="secondary" onClick={() => setOpen(o => !o)}
          aria-expanded={open}>
          {open ? "Hide filters" : "Filters"}
        </Button>
        <FilterChips state={state} />
      </div>

      {open && (
        <>
          <Divider />
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {state.group.filters.map((f, i) => (
              <FilterRow key={f.id} filter={f} fields={state.fields} index={i}
                onChange={patch => state.update(f.id, patch)} onRemove={() => state.remove(f.id)} />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <span style={{ inlineSize: 150 }}>
                <Select size="sm" value="" options={[{ value: "", label: "Add a filter…" },
                  ...state.fields.map(f => ({ value: f.key, label: f.label }))]}
                  onChange={e => e.target.value && state.add(e.target.value)} />
              </span>
              {state.group.filters.length > 1 && (
                <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Set all to</span>
                  <Button size="sm" variant={state.group.combinator === "and" ? "primary" : "ghost"}
                    onClick={() => state.setCombinator("and")}>all</Button>
                  <Button size="sm" variant={state.group.combinator === "or" ? "primary" : "ghost"}
                    onClick={() => state.setCombinator("or")}>any</Button>
                </span>
              )}
            </div>
          </div>
          <Divider />
          <SavedViews state={state} />
        </>
      )}

      {showQuery && (
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
          <span style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
            textTransform: "uppercase", color: "var(--text-muted)" }}>URL</span>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-3xs)",
            color: state.query ? "var(--interactive)" : "var(--text-muted)", wordBreak: "break-all" }}>
            {state.query ? "?" + state.query : "(no filters — clean URL)"}
          </code>
        </div>
      )}
    </Card>
  );
}

/* ══ predefined filters ══════════════════════════════════════════════════════
 * The dynamic builder above is for questions nobody anticipated. Most filtering
 * in a product is a small set of questions asked every day — and those must be
 * DECLARED, not rebuilt by each user each morning.
 *
 * A preset is the same model, named:
 *   { id, label, icon?, combinator?, filters: [{ field, operator, value }] }
 *
 * Which to use:
 *   ScopeTabs    one mutually exclusive question that frames the whole page
 *                (All / In press / Mine / Overdue). Always visible. Max ~6.
 *   QuickFilters additive one-click narrowings, order-independent. Max ~8.
 *   FacetList    one field's values with live counts — when the user needs to
 *                see the distribution before choosing.
 *   FilterBar    everything else, on demand, collapsed by default.
 *
 * All four write the same group, so a preset can be opened in the builder and
 * refined, and every one of them serialises to the same URL.
 * ═══════════════════════════════════════════════════════════════════════════ */

const normalise = q => (q || "").split("&")[0].replace(/^f=/, "").split("~").sort().join("~");

/** Is this preset exactly what is currently applied? */
export function isPresetActive(state, preset) {
  return normalise(serializeFilters({ combinator: preset.combinator || "and", filters: preset.filters }))
    === normalise(state.query);
}

/** Mutually exclusive scopes, rendered as tabs. `counts` is optional. */
export function ScopeTabs({ state, scopes = [], counts, variant = "pill" }) {
  const activeId = (scopes.find(s => isPresetActive(state, s)) || {}).id;
  const [list, indicator] = useTabIndicator(activeId, variant);
  return (
    <div role="tablist" ref={list} style={{ position: "relative", display: "flex", flexWrap: "wrap",
      gap: variant === "pill" ? "var(--space-2)" : "var(--space-5)",
      padding: variant === "pill" ? "var(--space-1)" : 0,
      inlineSize: variant === "pill" ? "fit-content" : undefined, maxInlineSize: "100%",
      borderRadius: variant === "pill" ? "var(--radius-full)" : 0,
      background: variant === "pill" ? "var(--surface-sunken)" : "transparent",
      borderBlockEnd: variant === "pill" ? "none" : "var(--border-hairline) solid var(--border)" }}>
      {indicator}
      {scopes.map(s => {
        const on = s.id === activeId;
        return (
          <button key={s.id} role="tab" aria-selected={on} onClick={() => state.replace(s)}
            style={variant === "pill" ? {
              position: "relative", zIndex: 1,
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              border: 0, cursor: "pointer", minBlockSize: 32, background: "transparent",
              paddingInline: "var(--space-4)", paddingBlock: "var(--space-2)",
              borderRadius: "var(--radius-full)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-sm)",
              fontWeight: on ? "var(--weight-medium)" : "var(--weight-regular)",
              color: on ? "var(--text-on-interactive)" : "var(--text-secondary)",
              transitionProperty: "color", transitionDuration: "var(--duration-fast)"
            } : {
              position: "relative", zIndex: 1,
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              background: "transparent", border: 0, cursor: "pointer",
              paddingBlock: "0 var(--space-3)", paddingInline: 0,
              transitionProperty: "color", transitionDuration: "var(--duration-fast)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-sm)",
              fontWeight: on ? "var(--weight-medium)" : "var(--weight-regular)",
              color: on ? "var(--interactive)" : "var(--text-secondary)"
            }}>
            {s.icon && <Icon name={s.icon} size={15} />}
            {s.label}
            {counts && counts[s.id] !== undefined && (
              /* On the pill the count sits ON the solid interactive fill, so it
                 has to take the on-interactive ink. Reading --interactive there
                 put dark crimson on crimson. */
              <span style={{ fontSize: "var(--text-2xs)", fontFeatureSettings: "'tnum'",
                color: !on ? "var(--text-muted)"
                  : variant === "pill" ? "var(--text-on-interactive)" : "var(--interactive)"
              }}>{counts[s.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Additive one-click narrowings. Each toggles its own filters in and out. */
export function QuickFilters({ state, presets = [], counts }) {
  const has = preset => preset.filters.every(pf => state.group.filters.some(
    f => f.field === pf.field && f.operator === pf.operator && String(f.value) === String(pf.value)));
  const toggle = preset => {
    if (has(preset)) {
      const keep = state.group.filters.filter(f => !preset.filters.some(
        pf => pf.field === f.field && pf.operator === f.operator && String(pf.value) === String(f.value)));
      state.replace({ combinator: state.group.combinator, filters: keep.map(({ id, ...f }) => f) });
    } else {
      state.replace({ combinator: state.group.combinator,
        filters: [...state.group.filters.map(({ id, ...f }) => f), ...preset.filters] });
    }
  };
  return (
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
      {presets.map(p => {
        const on = has(p);
        return (
          <button key={p.id} onClick={() => toggle(p)} aria-pressed={on}
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              paddingInline: "var(--space-4)", paddingBlock: "var(--space-2)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", cursor: "pointer",
              borderRadius: "var(--radius-full)", borderWidth: "var(--border-hairline)",
              borderStyle: "solid",
              borderColor: on ? "var(--interactive-solid)" : "var(--border-control)",
              background: on ? "var(--interactive-subtle)" : "transparent",
              color: on ? "var(--interactive)" : "var(--text-secondary)" }}>
            {p.icon && <Icon name={p.icon} size={13} />}
            {p.label}
            {counts && counts[p.id] !== undefined && (
              <span style={{ fontFeatureSettings: "'tnum'", opacity: 0.75 }}>{counts[p.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One field's values with live counts, written as an `any of` filter. */
export function FacetList({ state, field, rows, title }) {
  const f = state.fields.find(x => x.key === field) || { key: field, label: field };
  const counts = useMemo(() => {
    const m = new Map();
    rows.forEach(r => { const v = r[field] ?? "—"; m.set(v, (m.get(v) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, field]);
  const current = state.group.filters.find(x => x.field === field && x.operator === "any");
  const selected = (current && current.value) || [];
  const set = values => {
    const rest = state.group.filters.filter(x => x !== current).map(({ id, ...r }) => r);
    state.replace({ combinator: state.group.combinator,
      filters: values.length ? [...rest, { field, operator: "any", value: values }] : rest });
  };
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
        textTransform: "uppercase", color: "var(--text-muted)" }}>{title || f.label}</div>
      {counts.map(([value, n]) => (
        <div key={value} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Checkbox label={value} checked={selected.includes(value)}
            onChange={() => set(selected.includes(value)
              ? selected.filter(v => v !== value) : [...selected, value])} />
          <span style={{ marginInlineStart: "auto", fontSize: "var(--text-2xs)",
            fontFeatureSettings: "'tnum'", color: "var(--text-muted)" }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The composition products actually reach for: a filter bar over a table, with
 * the filter state in the URL and the row count reported. `fields` describes
 * what is filterable; `scopes`, `presets` and `facets` declare the predefined
 * filters; `columns` and the rest pass through to DataTable.
 */
export function FilteredTable({
  fields, columns, rows, storageKey, syncUrl = true,
  scopes, presets, facets, ...tableProps
}) {
  const state = useFilters({ fields, syncUrl, storageKey });
  const filtered = useMemo(() => applyFilters(rows, state.group), [rows, state.group]);
  const scopeCounts = useMemo(() => {
    if (!scopes) return undefined;
    return scopes.reduce((m, s) => ((m[s.id] = applyFilters(rows,
      { combinator: s.combinator || "and", filters: s.filters }).length), m), {});
  }, [rows, scopes]);
  const presetCounts = useMemo(() => {
    if (!presets) return undefined;
    return presets.reduce((m, p) => ((m[p.id] = applyFilters(rows,
      { combinator: "and", filters: p.filters }).length), m), {});
  }, [rows, presets]);
  return (
    <div style={{ display: "grid", gap: "var(--space-4)", minInlineSize: 0 }}>
      {scopes && <ScopeTabs state={state} scopes={scopes} counts={scopeCounts} />}
      {presets && <QuickFilters state={state} presets={presets} counts={presetCounts} />}
      <FilterBar state={state} />
      {/* The count sits above BOTH columns. Inside the table column it pushed the
          table down by its own height, so the facet rail — which starts at the top
          of the row — no longer lined up with the table beside it. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFeatureSettings: "'tnum'" }}>
          {filtered.length} of {rows.length} records
        </span>
        {filtered.length === 0 && rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={state.clear}>Clear filters</Button>
        )}
      </div>
      <div style={{ display: "grid",
        gridTemplateColumns: facets ? "minmax(0,1fr) 200px" : "minmax(0,1fr)",
        gap: "var(--space-6)", alignItems: "start" }}>
        <div style={{ minInlineSize: 0 }}>
          <DataTable columns={columns} rows={filtered} {...tableProps} />
        </div>
        {facets && (
          <Card style={{ gap: "var(--space-5)" }}>
            {facets.map(field => (
              <FacetList key={field} state={state} field={field} rows={rows} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
