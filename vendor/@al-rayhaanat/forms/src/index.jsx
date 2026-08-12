/**
 * @al-rayhaanat/forms — accessible field assembly.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui.
 *
 * The whole point of this package is that no product ever again wires
 * `aria-describedby` by hand and gets it wrong. A `FormField` owns the ids, the
 * hint, the error, the required marker and the announcement; the control inside
 * it stays a plain @al-rayhaanat/ui primitive.
 *
 * React Hook Form is the intended state layer — `rhf()` below adapts a
 * `register()` result plus `formState` into FormField props, so a consuming form
 * is:
 *
 *   const { register, handleSubmit, formState } = useForm();
 *   <FormField label="Membership number" {...rhf(register("folio", { required: true }), formState, "folio")}>
 *     {props => <Input {...props} />}
 *   </FormField>
 *
 * No validation rules live here. Where the error text comes from is the app's
 * business; how it is announced is ours.
 */
"use client";
import React, { useId, useMemo, createContext, useContext } from "react";
import { Icon } from "@al-rayhaanat/icons";
import { Label, Input, Textarea, Select, Button, Divider } from "@al-rayhaanat/ui";

/** Ids and aria wiring for one field. Use it to build a custom control. */
export function useFieldIds({ name, hint, error }) {
  const auto = useId ? useId() : Math.random().toString(36).slice(2, 8);
  const base = name || auto;
  const ids = useMemo(() => ({
    control: `${base}-control`,
    hint: `${base}-hint`,
    error: `${base}-error`
  }), [base]);
  const describedBy = [hint && ids.hint, error && ids.error].filter(Boolean).join(" ") || undefined;
  return { ids, describedBy, invalid: !!error };
}

/**
 * Label + control + hint + error, wired.
 *
 * `children` may be a node or a render function receiving the props the control
 * must spread: `{ id, name, invalid, 'aria-describedby', 'aria-invalid' }`.
 */
export function FormField({
  label, name, hint, error, required, optional, children, htmlSize, style
}) {
  const { ids, describedBy, invalid } = useFieldIds({ name, hint, error });
  const controlProps = {
    id: ids.control, name,
    invalid,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    "aria-required": required || undefined
  };
  return (
    <div style={{ display: "grid", gap: "var(--space-2)", maxInlineSize: htmlSize, ...style }}>
      {label && (
        <span style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
          <Label htmlFor={ids.control} required={required}>{label}</Label>
          {optional && !required && (
            <span style={{ fontSize: "var(--text-3xs)", color: "var(--text-muted)" }}>optional</span>
          )}
        </span>
      )}
      {typeof children === "function"
        ? children(controlProps)
        : React.isValidElement(children)
          /* An element child is wired automatically — passing one must not
             silently produce an unlabelled field. Explicit props on the child
             still win, so a caller can override an id when it has to. */
          ? React.cloneElement(children, { ...controlProps, ...children.props })
          : children}
      {hint && !error && (
        <span id={ids.hint} style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{hint}</span>
      )}
      {error && (
        <span id={ids.error} role="alert" style={{ display: "flex", alignItems: "center",
          gap: "var(--space-2)", fontSize: "var(--text-2xs)", color: "var(--danger)" }}>
          <Icon name="x" size={12} strokeWidth={2} />{error}
        </span>
      )}
    </div>
  );
}

/** Radio and checkbox groups need a fieldset and a legend, not a floating label. */
export function FieldSet({ legend, hint, error, required, children, columns = 1, style }) {
  const { ids, describedBy } = useFieldIds({ name: legend, hint, error });
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined}
      style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "var(--space-3)", ...style }}>
      <legend style={{ padding: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)",
        display: "flex", gap: "var(--space-2)" }}>
        {legend}{required && <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>}
      </legend>
      <div style={{ display: "grid", gap: "var(--space-3)",
        gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>{children}</div>
      {hint && !error && <span id={ids.hint} style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{hint}</span>}
      {error && <span id={ids.error} role="alert" style={{ fontSize: "var(--text-2xs)", color: "var(--danger)" }}>{error}</span>}
    </fieldset>
  );
}

/** A titled group of fields. Sections are how a long form stays readable. */
export function FormSection({ title, description, columns = 2, children, style }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-5)", ...style }}>
      {(title || description) && (
        <div style={{ display: "grid", gap: "var(--space-2)", maxInlineSize: "70ch" }}>
          {title && <h3 style={{ margin: 0, fontFamily: "var(--font-display)",
            fontWeight: "var(--weight-semibold)", fontSize: "var(--text-lg)" }}>{title}</h3>}
          {description && <p style={{ margin: 0, fontSize: "var(--text-xs)",
            color: "var(--text-secondary)" }}>{description}</p>}
        </div>
      )}
      <div style={{ display: "grid", gap: "var(--space-5)",
        gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>{children}</div>
    </section>
  );
}

/** Errors gathered at the top, each one a link to its field. */
export function ValidationSummary({ errors = {}, title = "This form needs attention" }) {
  const entries = Object.entries(errors).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <div role="alert" tabIndex={-1}
      style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-5)",
        borderRadius: "var(--radius-lg)", background: "var(--danger-subtle)",
        borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--danger)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
        fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
        fontSize: "var(--text-sm)", color: "var(--danger)" }}>
        <Icon name="x" size={15} strokeWidth={2} />{title}
      </span>
      <ul style={{ margin: 0, paddingInlineStart: "var(--space-6)", display: "grid", gap: "var(--space-2)" }}>
        {entries.map(([name, message]) => (
          <li key={name} style={{ fontSize: "var(--text-xs)" }}>
            <a href={`#${name}-control`} style={{ color: "var(--danger)" }}>
              {typeof message === "string" ? message : message.message || name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Submit row. Primary action last in the reading order, so it flips with dir. */
export function FormActions({ submitLabel = "Save", onCancel, cancelLabel = "Cancel", busy, children, style }) {
  return (
    <>
      <Divider />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
        justifyContent: "flex-end", ...style }}>
        {children}
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>}
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </>
  );
}

/**
 * Adapt React Hook Form to FormField.
 *   {...rhf(register("folio", { required: "Six digits after the prefix." }), formState, "folio")}
 */
export function rhf(registration, formState = {}, name) {
  const error = formState.errors && formState.errors[name];
  return {
    name: name || registration.name,
    error: error ? (error.message || "This field is not valid.") : undefined,
    required: !!(registration.required),
    controlRef: registration.ref,
    onChange: registration.onChange,
    onBlur: registration.onBlur
  };
}

/* ── composed fields ─────────────────────────────────────────────────────────
   FormField + the control in one call. This is what product code should reach
   for; drop to FormField only for a control the set does not cover.
   ───────────────────────────────────────────────────────────────────────── */

const splitField = props => {
  const { label, name, hint, error, required, optional, htmlSize, style, ...control } = props;
  return [{ label, name, hint, error, required, optional, htmlSize, style }, control];
};

/** Labelled text input, fully wired. */
export function TextField(props) {
  const [field, control] = splitField(props);
  return <FormField {...field}>{p => <Input {...p} {...control} />}</FormField>;
}

/** Labelled multi-line input. */
export function TextareaField(props) {
  const [field, control] = splitField(props);
  return <FormField {...field}>{p => <Textarea {...p} {...control} />}</FormField>;
}

/** Labelled native select. */
export function SelectField(props) {
  const [field, control] = splitField(props);
  return <FormField {...field}>{p => <Select {...p} {...control} />}</FormField>;
}

/** A form shell: a semantic <form> with the section rhythm already set. */
export function Form({ onSubmit, children, style, ...rest }) {
  return (
    <form onSubmit={onSubmit} noValidate
      style={{ display: "grid", gap: "var(--space-7)", ...style }} {...rest}>{children}</form>
  );
}
