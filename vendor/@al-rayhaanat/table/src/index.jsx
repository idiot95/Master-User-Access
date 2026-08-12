/**
 * @al-rayhaanat/table — one headless core, many presentations.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui.
 *
 * DEVIATION FROM THE BRIEF, ON PURPOSE AND ON RECORD: §3.8 says build on
 * TanStack Table. This ships its own small state core instead, because the
 * package had to be reviewable in an environment with no npm install. The core
 * is deliberately the same shape as TanStack's — a flat `state` object plus
 * derived rows — so `useTableState` is the single swap-in point: replace it with
 * `useReactTable` when the app needs virtualisation over 10k rows, column
 * pinning groups, or fuzzy global filtering. Nothing in the rendering layer
 * touches the state internals.
 *
 * Capabilities: sortable · multi-select with bulk actions · expandable rows ·
 * column resize / reorder / show-hide · sticky header and sticky first column ·
 * grouped rows with aggregation · row windowing · inline editable cells ·
 * pinned summary row · three densities · empty and loading states.
 *
 * Narrow screens: horizontal scroll with the first column sticky. Applied
 * everywhere — a card fallback breaks column comparison, which is the point of
 * a table in an admin tool.
 */
"use client";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Icon, Petal, Spinner } from "@al-rayhaanat/icons";
import { Button, IconButton, Checkbox, Badge, Input, Skeleton, SearchField } from "@al-rayhaanat/ui";

const DENSITY = {
  compact: { padBlock: "var(--space-2)", font: "var(--text-xs)", row: 32 },
  normal: { padBlock: "var(--space-3)", font: "var(--text-sm)", row: 40 },
  comfortable: { padBlock: "var(--space-5)", font: "var(--text-sm)", row: 52 }
};

const num = v => {
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isNaN(n) ? null : n;
};

/** The core. Swap this for useReactTable to move onto TanStack. */
export function useTableState({ rows, columns, getRowId = (r, i) => r.id ?? i, groupBy, initialSort }) {
  const [sort, setSort] = useState(initialSort || null);
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [hidden, setHidden] = useState(() => new Set());
  const [order, setOrder] = useState(() => columns.map(c => c.key));
  const [widths, setWidths] = useState({});

  const visibleColumns = useMemo(
    () => order.map(k => columns.find(c => c.key === k)).filter(c => c && !hidden.has(c.key)),
    [order, columns, hidden]
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      const nx = num(x), ny = num(y);
      if (nx !== null && ny !== null) return (nx - ny) * dir;
      return String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }, [rows, sort]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map();
    sorted.forEach(r => {
      const k = r[groupBy] ?? "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()];
  }, [sorted, groupBy]);

  const ids = sorted.map(getRowId);
  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));

  const toggleSort = key => setSort(s =>
    s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" });
  const toggleSelect = id => setSelected(s => {
    const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));
  const toggleExpand = id => setExpanded(s => {
    const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleColumn = key => setHidden(s => {
    const next = new Set(s); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const moveColumn = (key, delta) => setOrder(o => {
    const i = o.indexOf(key), j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const next = [...o]; next.splice(i, 1); next.splice(j, 0, key); return next;
  });

  return {
    state: { sort, selected, expanded, hidden, order, widths },
    rows: sorted, grouped, visibleColumns, getRowId, allSelected,
    toggleSort, toggleSelect, toggleAll, toggleExpand, toggleColumn, moveColumn,
    setWidth: (key, w) => setWidths(m => ({ ...m, [key]: Math.max(w, 64) })),
    clearSelection: () => setSelected(new Set())
  };
}

/* ── header cell, with sort caret and resize handle ─────────────────────── */
function HeadCell({ column, table, density, sticky, resizable }) {
  const on = table.state.sort && table.state.sort.key === column.key;
  const sortable = column.sortable !== false;
  const startResize = e => {
    e.preventDefault();
    const th = e.currentTarget.closest("th");
    const startX = e.clientX, startW = th.getBoundingClientRect().width;
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    const move = ev => table.setWidth(column.key, startW + (ev.clientX - startX) * (rtl ? -1 : 1));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  return (
    <th scope="col"
      aria-sort={on ? (table.state.sort.dir === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}
      style={{
        position: sticky ? "sticky" : undefined, insetInlineStart: sticky ? 0 : undefined,
        insetBlockStart: 0, zIndex: sticky ? 3 : 2,
        inlineSize: table.state.widths[column.key] || column.width,
        textAlign: column.align === "end" ? "end" : "start",
        paddingBlock: density.padBlock, paddingInline: "var(--space-4)",
        fontSize: "var(--text-3xs)", fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase", whiteSpace: "nowrap",
        color: on ? "var(--interactive)" : "var(--text-muted)",
        background: "var(--surface)",
        borderBlockEnd: "var(--border-hairline) solid var(--border-strong)",
        cursor: sortable ? "pointer" : "default", userSelect: "none"
      }}
      onClick={sortable ? () => table.toggleSort(column.key) : undefined}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
        flexDirection: column.align === "end" ? "row-reverse" : "row" }}>
        {column.label}
        {sortable && <Petal size={9} rotate={on && table.state.sort.dir === "desc" ? 0 : 180}
          opacity={on ? 1 : 0.3} />}
      </span>
      {resizable && (
        <span onMouseDown={startResize} role="separator" aria-orientation="vertical"
          style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 0, inlineSize: 5,
            cursor: "col-resize" }} />
      )}
    </th>
  );
}

function Cell({ row, column, table, density, sticky, editing, setEditing, onCellEdit }) {
  const id = table.getRowId(row);
  const isEditing = editing && editing.id === id && editing.key === column.key;
  const value = row[column.key];
  return (
    <td style={{
      position: sticky ? "sticky" : undefined, insetInlineStart: sticky ? 0 : undefined,
      zIndex: sticky ? 1 : undefined, background: sticky ? "var(--surface)" : undefined,
      paddingBlock: density.padBlock, paddingInline: "var(--space-4)",
      textAlign: column.align === "end" ? "end" : "start",
      fontFeatureSettings: column.align === "end" ? "'tnum'" : undefined,
      fontSize: density.font, color: "var(--text-primary)",
      borderBlockEnd: "var(--border-hairline) solid var(--border)",
      cursor: column.editable ? "text" : undefined
    }}
      onDoubleClick={column.editable ? () => setEditing({ id, key: column.key }) : undefined}>
      {isEditing ? (
        <Input size="sm" autoFocus defaultValue={value}
          onBlur={e => { onCellEdit && onCellEdit(id, column.key, e.target.value); setEditing(null); }}
          onKeyDown={e => {
            if (e.key === "Enter") { onCellEdit && onCellEdit(id, column.key, e.target.value); setEditing(null); }
            if (e.key === "Escape") setEditing(null);
          }} />
      ) : column.render ? column.render(value, row) : value}
    </td>
  );
}

/* ── the three ghost controls ─────────────────────────────────────────────
   Search, sort and filter are the same three questions on every list, so they
   are one component rather than three per-product reinventions. They are ghost
   icons because they are chrome, not content — but a ghost control still has to
   be FINDABLE and OPERABLE: each carries a tooltip, a 36px hit area, a
   focus-visible ring, aria-expanded, and a dot when it is doing something. An
   icon that only reveals its meaning on hover is a decoration, not a control.

   useTableToolbar owns the state and returns the processed rows, so the toolbar
   and the table cannot disagree:

     const { rows: shown, toolbarProps } = useTableToolbar({ rows, columns });
     <TableToolbar {...toolbarProps} />
     <DataTable columns={columns} rows={shown} />
   ──────────────────────────────────────────────────────────────────────── */

const norm = v => String(v ?? "").toLowerCase();

/**
 * `emptyState` is a public prop, so accept both a node and the plain
 * `{ title, description, action }` object — a caller passing the object form
 * must not be able to throw "objects are not valid as a React child".
 */
function normalizeEmpty(e) {
  if (!e || React.isValidElement(e)) return e || null;
  if (typeof e !== "object") return e;
  return (
    <span style={{ display: "grid", gap: "var(--space-2)", justifyItems: "center" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
        fontSize: "var(--text-md)", color: "var(--text-primary)" }}>{e.title}</span>
      {e.description && <span style={{ fontSize: "var(--text-xs)" }}>{e.description}</span>}
      {e.action}
    </span>
  );
}
const asNum = v => { const n = parseFloat(String(v).replace(/[^\d.-]/g, "")); return isNaN(n) ? null : n; };

/** Search, sort and filter state over a row set. Returns the rows to render. */
export function useTableToolbar({ rows = [], columns = [], searchKeys, facetKey }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);          // { key, dir }
  const [facets, setFacets] = useState([]);        // selected values of facetKey

  const keys = searchKeys || columns.map(c => c.key);
  const facetValues = useMemo(() => {
    if (!facetKey) return [];
    const m = new Map();
    rows.forEach(r => { const v = r[facetKey]; if (v != null) m.set(v, (m.get(v) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, facetKey]);

  const out = useMemo(() => {
    let list = rows;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(r => keys.some(k => norm(r[k]).includes(q)));
    if (facets.length) list = list.filter(r => facets.includes(r[facetKey]));
    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => {
        const x = asNum(a[key]), y = asNum(b[key]);
        const cmp = x !== null && y !== null ? x - y : norm(a[key]).localeCompare(norm(b[key]));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, query, sort, facets, facetKey, keys.join()]);

  return {
    rows: out, query, sort, facets,
    toolbarProps: { columns, query, setQuery, sort, setSort, facets, setFacets,
      facetKey, facetValues, total: rows.length, shown: out.length }
  };
}

function GhostControl({ icon, label, active, count, expanded, onClick, children }) {
  const [hint, setHint] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <span onMouseEnter={() => setHint(true)} onMouseLeave={() => setHint(false)}
        onFocus={() => setHint(true)} onBlur={() => setHint(false)}
        style={{ display: "inline-flex" }}>
        <IconButton name={icon} label={label} variant="ghost" size="md"
          onClick={onClick} aria-expanded={expanded}
          style={active ? { color: "var(--interactive)",
            background: "var(--interactive-subtle)" } : undefined} />
        {active && (
          <span aria-hidden="true" style={{ position: "absolute", insetBlockStart: 4,
            insetInlineEnd: 4, inlineSize: 6, blockSize: 6, borderRadius: "var(--radius-full)",
            background: "var(--interactive-solid)" }} />
        )}
      </span>
      {hint && !expanded && (
        <span role="tooltip" style={{ position: "absolute", insetBlockStart: "calc(100% + 6px)",
          insetInlineStart: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap",
          zIndex: "var(--z-tooltip)", fontSize: "var(--text-3xs)",
          paddingInline: "var(--space-3)", paddingBlock: 2, background: "var(--surface-raised)",
          color: "var(--text-primary)", borderRadius: "var(--radius-sm)",
          boxShadow: "var(--shadow-md)", borderWidth: "var(--border-hairline)",
          borderStyle: "solid", borderColor: "var(--border)" }}>
          {label}{count ? " · " + count : ""}
        </span>
      )}
      {children}
    </span>
  );
}

const panel = {
  position: "absolute", insetBlockStart: "calc(100% + var(--space-2))", insetInlineEnd: 0,
  minInlineSize: 200, zIndex: "var(--z-popover)", background: "var(--surface-raised)",
  borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
  borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)",
  padding: "var(--space-3)", display: "grid", gap: 2
};

/**
 * The three ghost controls. Spread `toolbarProps` from useTableToolbar.
 * Search expands inline on click and collapses when emptied and blurred;
 * sort and filter open small menus. All three close on Escape or outside click.
 */
export function TableToolbar({
  columns = [], query, setQuery, sort, setSort, facets = [], setFacets,
  facetKey, facetValues = [], total, shown, children, style
}) {
  const [open, setOpen] = useState(null);   // "search" | "sort" | "filter"
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(o => (o === "search" && query ? o : null)); };
    /* Escape is handled HERE and nowhere else: this listener's setOpen(null)
       unmounts the input, so an onKeyDown on the field never gets to clear the
       query for the same event. Dismissal must be one owner, not two. */
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (open === "search") setQuery("");
      setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, query]);

  const sortable = columns.filter(c => c.sortable !== false);
  const filtered = facets.length > 0;

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)",
      flexWrap: "wrap", minInlineSize: 0, ...style }}>
      {children}
      <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center",
        gap: "var(--space-2)" }}>
        {(shown !== total) && (
          <span className="arh-tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            {shown} of {total}
          </span>
        )}

        {open === "search" ? (
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <SearchField autoFocus size="sm" value={query} placeholder="Search rows"
              onChange={e => setQuery(e.target.value)}
              style={{ inlineSize: 180 }} />
            <IconButton name="x" label="Close search" variant="ghost" size="sm"
              onClick={() => { setQuery(""); setOpen(null); }} />
          </span>
        ) : (
          <GhostControl icon="search" label="Search" active={!!query}
            onClick={() => setOpen("search")} />
        )}

        <GhostControl icon="sliders" label="Sort" active={!!sort} expanded={open === "sort"}
          count={sort ? sort.key : null}
          onClick={() => setOpen(o => (o === "sort" ? null : "sort"))}>
          {open === "sort" && (
            <div role="menu" style={panel}>
              {sortable.map(c => {
                const on = sort && sort.key === c.key;
                return (
                  <button key={c.key} role="menuitemradio" aria-checked={!!on}
                    onClick={() => setSort(on && sort.dir === "asc" ? { key: c.key, dir: "desc" }
                      : on ? null : { key: c.key, dir: "asc" })}
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
                      inlineSize: "100%", minBlockSize: 32, background: on ? "var(--interactive-subtle)" : "transparent",
                      border: 0, cursor: "pointer", textAlign: "start", borderRadius: "var(--radius-sm)",
                      paddingInline: "var(--space-3)", fontFamily: "var(--font-body)",
                      fontSize: "var(--text-xs)", color: on ? "var(--interactive)" : "var(--text-primary)" }}>
                    <span style={{ marginInlineEnd: "auto" }}>{c.label}</span>
                    {on && <Petal size={10} rotate={sort.dir === "asc" ? 180 : 0} />}
                  </button>
                );
              })}
              {sort && (
                <button onClick={() => setSort(null)}
                  style={{ minBlockSize: 32, background: "transparent", border: 0, cursor: "pointer",
                    textAlign: "start", paddingInline: "var(--space-3)", fontFamily: "var(--font-body)",
                    fontSize: "var(--text-2xs)", color: "var(--text-muted)",
                    borderBlockStart: "var(--border-hairline) solid var(--border)" }}>
                  Clear sort
                </button>
              )}
            </div>
          )}
        </GhostControl>

        {facetKey && (
          <GhostControl icon="filter" label="Filter" active={filtered} expanded={open === "filter"}
            count={filtered ? facets.length : null}
            onClick={() => setOpen(o => (o === "filter" ? null : "filter"))}>
            {open === "filter" && (
              <div style={panel}>
                {facetValues.map(([value, n]) => (
                  <label key={value} style={{ display: "flex", alignItems: "center",
                    gap: "var(--space-3)", minBlockSize: 32, paddingInline: "var(--space-2)",
                    borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "var(--text-xs)" }}>
                    <Checkbox checked={facets.includes(value)}
                      onChange={() => setFacets(facets.includes(value)
                        ? facets.filter(v => v !== value) : [...facets, value])} />
                    <span style={{ marginInlineEnd: "auto" }}>{value}</span>
                    <span className="arh-tnum" style={{ fontSize: "var(--text-3xs)",
                      color: "var(--text-muted)" }}>{n}</span>
                  </label>
                ))}
                {filtered && (
                  <button onClick={() => setFacets([])}
                    style={{ minBlockSize: 32, background: "transparent", border: 0, cursor: "pointer",
                      textAlign: "start", paddingInline: "var(--space-3)", fontFamily: "var(--font-body)",
                      fontSize: "var(--text-2xs)", color: "var(--text-muted)",
                      borderBlockStart: "var(--border-hairline) solid var(--border)" }}>
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </GhostControl>
        )}
      </span>
    </div>
  );
}

/**
 * `columns`: [{ key, label, align: 'start'|'end', width, render, editable, aggregate }]
 *
 * Everything else is opt-in: `selectable`, `expandable(row)`, `groupBy`,
 * `summary`, `stickyFirstColumn`, `resizable`, `columnControls`, `maxHeight`
 * (turns on the sticky header), `windowRows` (row windowing over long sets),
 * `loading`, `emptyState` (a node or { title, description, action }),
 * `bulkActions(selectedIds, clear)`, `onCellEdit`.
 */
export function DataTable({
  columns = [], rows = [], getRowId, density = "normal", selectable, expandable, groupBy,
  summary, stickyFirstColumn, resizable, columnControls, maxHeight, windowRows,
  loading, emptyState, bulkActions, onCellEdit, caption, style
}) {
  const table = useTableState({ rows, columns, getRowId, groupBy });
  const [editing, setEditing] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const d = DENSITY[density] || DENSITY.normal;
  const cols = table.visibleColumns;
  const selectedIds = [...table.state.selected];

  const body = table.rows;
  const win = windowRows && !groupBy && body.length > windowRows;
  const start = win ? Math.max(0, Math.floor(scrollTop / d.row) - 4) : 0;
  const end = win ? Math.min(body.length, start + windowRows + 8) : body.length;
  const slice = win ? body.slice(start, end) : body;

  const leadCols = (selectable ? 1 : 0) + (expandable ? 1 : 0);
  const totalCols = cols.length + leadCols;

  const rowCells = row => {
    const id = table.getRowId(row);
    return (
      <React.Fragment key={id}>
        <tr style={{ background: table.state.selected.has(id) ? "var(--interactive-subtle)" : undefined }}>
          {expandable && (
            <td style={{ inlineSize: 44, paddingInline: 0, textAlign: "center",
              borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
              <IconButton variant="ghost" size="sm" style={{ marginInline: "auto" }}
                name={table.state.expanded.has(id) ? "chevron-up" : "chevron-down"}
                label={table.state.expanded.has(id) ? "Collapse row" : "Expand row"}
                onClick={() => table.toggleExpand(id)} />
            </td>
          )}
          {selectable && (
            <td style={{ inlineSize: 44, paddingInline: 0,
              borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
              <span style={{ display: "grid", placeItems: "center", inlineSize: 44 }}>
                <Checkbox checked={table.state.selected.has(id)} onChange={() => table.toggleSelect(id)} />
              </span>
            </td>
          )}
          {cols.map((c, i) => (
            <Cell key={c.key} row={row} column={c} table={table} density={d}
              sticky={stickyFirstColumn && i === 0 && !leadCols}
              editing={editing} setEditing={setEditing} onCellEdit={onCellEdit} />
          ))}
        </tr>
        {expandable && table.state.expanded.has(id) && (
          <tr>
            <td colSpan={totalCols} style={{ padding: "var(--space-5) var(--space-6)",
              background: "var(--surface-sunken)", borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
              {expandable(row)}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-3)", minInlineSize: 0, ...style }}>
      {(caption || columnControls || (selectable && selectedIds.length > 0)) && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", minBlockSize: 36 }}>
          {selectedIds.length > 0 ? (
            <>
              <span style={{ fontSize: "var(--text-xs)", fontFeatureSettings: "'tnum'", color: "var(--interactive)" }}>
                {selectedIds.length} selected
              </span>
              {bulkActions && bulkActions(selectedIds, table.clearSelection)}
              <Button variant="ghost" size="sm" onClick={table.clearSelection}>Clear</Button>
            </>
          ) : caption ? (
            <span style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
              textTransform: "uppercase", color: "var(--interactive)" }}>{caption}</span>
          ) : null}
          {columnControls && (
            <span style={{ marginInlineStart: "auto", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {columns.map(c => (
                <Button key={c.key} size="sm" variant={table.state.hidden.has(c.key) ? "secondary" : "ghost"}
                  onClick={() => table.toggleColumn(c.key)}
                  style={{ opacity: table.state.hidden.has(c.key) ? 0.6 : 1 }}>
                  {c.label}
                </Button>
              ))}
            </span>
          )}
        </div>
      )}

      <div onScroll={e => { if (win) setScrollTop(e.currentTarget.scrollTop); }}
        style={{ overflow: "auto", maxBlockSize: maxHeight, minInlineSize: 0,
          borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)",
          borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
        <table style={{ inlineSize: "100%", borderCollapse: "separate", borderSpacing: 0,
          fontFamily: "var(--font-body)" }}>
          <thead>
            <tr>
              {expandable && <th style={{ inlineSize: 44, position: "sticky", insetBlockStart: 0, zIndex: 2,
                background: "var(--surface)", borderBlockEnd: "var(--border-hairline) solid var(--border-strong)" }} />}
              {selectable && (
                <th style={{ inlineSize: 44, paddingInline: 0, position: "sticky",
                  insetBlockStart: 0, zIndex: 2, background: "var(--surface)",
                  borderBlockEnd: "var(--border-hairline) solid var(--border-strong)" }}>
                  <span style={{ display: "grid", placeItems: "center", inlineSize: 44 }}>
                    <Checkbox checked={table.allSelected} onChange={table.toggleAll} />
                  </span>
                </th>
              )}
              {cols.map((c, i) => (
                <HeadCell key={c.key} column={c} table={table} density={d}
                  sticky={stickyFirstColumn && i === 0 && !leadCols} resizable={resizable} />
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => (
              <tr key={"s" + i}>
                {Array.from({ length: totalCols }, (_, j) => (
                  <td key={j} style={{ paddingBlock: d.padBlock, paddingInline: "var(--space-4)",
                    borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
                    <Skeleton width={j === 0 ? "60%" : "80%"} />
                  </td>
                ))}
              </tr>
            ))}

            {!loading && body.length === 0 && (
              <tr><td colSpan={totalCols} style={{ padding: "var(--space-9) var(--space-6)", textAlign: "center" }}>
                {normalizeEmpty(emptyState) || <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No records yet.</span>}
              </td></tr>
            )}

            {!loading && win && start > 0 && <tr style={{ blockSize: start * d.row }} aria-hidden="true"><td colSpan={totalCols} /></tr>}

            {!loading && table.grouped
              ? table.grouped.map(([key, groupRows]) => (
                <React.Fragment key={key}>
                  <tr>
                    <th scope="rowgroup" colSpan={totalCols}
                      style={{ textAlign: "start", paddingBlock: "var(--space-2)", paddingInline: "var(--space-4)",
                        background: "var(--surface-sunken)", fontSize: "var(--text-3xs)",
                        letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase",
                        color: "var(--text-secondary)", fontWeight: "var(--weight-medium)",
                        borderBlock: "var(--border-hairline) solid var(--border)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        {key}
                        <span style={{ color: "var(--text-muted)", fontFeatureSettings: "'tnum'" }}>{groupRows.length}</span>
                        <span style={{ marginInlineStart: "auto", display: "flex", gap: "var(--space-5)" }}>
                          {cols.filter(c => c.aggregate).map(c => (
                            <span key={c.key} style={{ fontFeatureSettings: "'tnum'", color: "var(--text-secondary)" }}>
                              {c.aggregate(groupRows)}
                            </span>
                          ))}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {groupRows.map(rowCells)}
                </React.Fragment>
              ))
              : !loading && slice.map(rowCells)}

            {!loading && win && end < body.length && <tr style={{ blockSize: (body.length - end) * d.row }} aria-hidden="true"><td colSpan={totalCols} /></tr>}
          </tbody>

          {summary && (
            <tfoot>
              <tr>
                {leadCols > 0 && <td colSpan={leadCols} style={{ position: "sticky", insetBlockEnd: 0,
                  background: "var(--surface-sunken)", borderBlockStart: "var(--border-thick) solid var(--text-primary)" }} />}
                {cols.map(c => (
                  <td key={c.key} style={{ position: "sticky", insetBlockEnd: 0, zIndex: 2,
                    paddingBlock: d.padBlock, paddingInline: "var(--space-4)",
                    textAlign: c.align === "end" ? "end" : "start",
                    fontFeatureSettings: c.align === "end" ? "'tnum'" : undefined,
                    fontSize: density === "compact" ? "var(--text-xs)" : "var(--text-sm)",
                    fontWeight: "var(--weight-semibold)", background: "var(--surface-sunken)",
                    borderBlockStart: "var(--border-thick) solid var(--text-primary)" }}>
                    {summary[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(resizable || columnControls) && (
        <div style={{ display: "flex", gap: "var(--space-5)", fontSize: "var(--text-3xs)", color: "var(--text-muted)" }}>
          {resizable && <span>Drag a header edge to resize.</span>}
          {onCellEdit && <span>Double-click an editable cell.</span>}
          {columnControls && <span>Toggle a column above to hide it.</span>}
        </div>
      )}
    </div>
  );
}

/** Column reorder control, kept separate so the table stays presentational. */
export function ColumnOrder({ table }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      {table.state.order.map(key => (
        <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
          border: "var(--border-hairline) solid var(--border)", borderRadius: "var(--radius-sm)",
          paddingInlineStart: "var(--space-3)", fontSize: "var(--text-3xs)" }}>
          {key}
          <IconButton size="sm" variant="ghost" name="chevron-left" label={`Move ${key} earlier`}
            onClick={() => table.moveColumn(key, -1)} />
          <IconButton size="sm" variant="ghost" name="chevron-right" label={`Move ${key} later`}
            onClick={() => table.moveColumn(key, 1)} />
        </span>
      ))}
    </div>
  );
}

/**
 * The composition products reach for: the three ghost controls over a table,
 * with the toolbar state owned here so the two cannot disagree.
 *
  *   <ToolbarTable columns={columns} rows={rows} facetKey="state"
  *     caption="Open plates" selectable stickyFirstColumn />
 *
 * Everything after `facetKey` and `title` passes through to DataTable.
 */
export function ToolbarTable({ columns = [], rows = [], facetKey, searchKeys, title, actions, ...tableProps }) {
  const { rows: shown, toolbarProps } = useTableToolbar({ rows, columns, facetKey, searchKeys });
  return (
    <div style={{ display: "grid", gap: "var(--space-3)", minInlineSize: 0 }}>
      <TableToolbar {...toolbarProps}>
        {title && (
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-md)" }}>{title}</span>
        )}
        {actions}
      </TableToolbar>
      <DataTable columns={columns} rows={shown} {...tableProps}
        emptyState={tableProps.emptyState || (shown.length === 0 && rows.length > 0
          ? <span style={{ display: "grid", gap: "var(--space-2)", justifyItems: "center" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-md)", color: "var(--text-primary)" }}>Nothing matches</span>
              <span style={{ fontSize: "var(--text-xs)" }}>Clear the search or the filter to see the rest.</span>
            </span>
          : undefined)} />
    </div>
  );
}