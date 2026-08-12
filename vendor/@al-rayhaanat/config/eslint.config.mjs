/**
 * @al-rayhaanat/config — the enforcement mechanism.
 *
 * Consuming app:
 *   // eslint.config.mjs
 *   import arh from "@al-rayhaanat/config/eslint";
 *   export default [...arh];
 *
 * These rules FAIL THE BUILD. They are not warnings, because a warning in a
 * multi-team system is a value someone hard-coded last quarter.
 */
import js from "@eslint/js";
import ts from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";

/** Raw colour literals anywhere in application code. */
const NO_RAW_COLOR = String.raw`#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|oklch|lab)\(`;
/** Arbitrary Tailwind values: p-[13px], text-[#ff0000], gap-[7px]. */
const NO_ARBITRARY_TW = String.raw`\b(?:[a-z]+(?:-[a-z]+)*)-\[[^\]]+\]`;
/** Physical box properties — RTL is in scope, so logical properties only. */
const PHYSICAL_PROPS = [
  "marginLeft", "marginRight", "paddingLeft", "paddingRight",
  "borderLeft", "borderRight", "borderLeftWidth", "borderRightWidth",
  "borderLeftColor", "borderRightColor", "left", "right", "textAlign: 'left'", "textAlign: 'right'"
];

export default [
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  {
    plugins: { react, "react-hooks": hooks, "jsx-a11y": a11y },
    languageOptions: { parserOptions: { projectService: true } },
    settings: { react: { version: "detect" } },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.strict.rules,

      /* ── tokens or nothing ─────────────────────────────────────────────── */
      "no-restricted-syntax": ["error",
        {
          selector: `Literal[value=/${NO_RAW_COLOR}/]`,
          message: "Raw colour literal. Use a semantic token: var(--interactive), var(--text-muted), var(--surface). Ramps are for the token layer only."
        },
        {
          selector: `Literal[value=/${NO_ARBITRARY_TW}/]`,
          message: "Arbitrary Tailwind value. Use a scale step from the preset — p-5, text-sm, gap-3."
        },
        {
          selector: "TemplateElement[value.raw=/px\\)/]",
          message: "Raw pixel value in a template string. Use var(--space-*) or var(--text-*)."
        },
        {
          selector: `Property[key.name=/^(${PHYSICAL_PROPS.filter(p => !p.includes(":")).join("|")})$/]`,
          message: "Physical box property. RTL is in scope — use marginInlineStart, paddingInlineEnd, insetInlineStart, borderInlineEnd."
        },
        {
          selector: "Property[key.name='textAlign'][value.value=/^(left|right)$/]",
          message: "textAlign: left/right does not flip. Use 'start' or 'end'."
        },
        {
          selector: "Property[key.name='flexDirection'][value.value='row-reverse']",
          message: "row-reverse hardcodes a direction. Let dir drive the flow."
        }
      ],

      /* ── one icon source ──────────────────────────────────────────────── */
      "no-restricted-imports": ["error", {
        paths: [
          { name: "lucide-react", message: "Import from @al-rayhaanat/icons — it carries the mirror flags and the token sizes." },
          { name: "react-icons", message: "Import from @al-rayhaanat/icons." },
          { name: "@heroicons/react", message: "Import from @al-rayhaanat/icons." },
          { name: "framer-motion", message: "Import from @al-rayhaanat/motion — it wires the motion tokens and prefers-reduced-motion." }
        ],
        patterns: [
          { group: ["@al-rayhaanat/tokens/dist/*"], message: "Import the package root, not its dist paths." },
          { group: ["**/ui/src/*"], message: "Import from the package, not its internals." }
        ]
      }],

      /* ── Next.js App Router hygiene ───────────────────────────────────── */
      "no-restricted-exports": ["error", { restrictDefaultExports: { namedFrom: true } }],

      /* ── accessibility floor, not negotiable ──────────────────────────── */
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-noninteractive-tabindex": "error",

      /* ── React ────────────────────────────────────────────────────────── */
      "react/jsx-no-target-blank": ["error", { allowReferrer: false }],
      "react/no-unknown-property": "error"
    }
  },
  {
    /* The token layer is the one place raw values are legal. */
    files: ["packages/tokens/**", "tokens/**"],
    rules: { "no-restricted-syntax": "off" }
  }
];
