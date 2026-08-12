# @al-rayhaanat/config

Shared ESLint, TypeScript and Prettier configuration. **Install this early.** It
is the only thing that keeps a multi-team system from drifting back into
hard-coded values three sprints after launch.

```js
// eslint.config.mjs
import arh from "@al-rayhaanat/config/eslint";
export default [...arh];
```

```json
// tsconfig.json
{ "extends": "@al-rayhaanat/config/tsconfig.base.json" }
```

## What fails the build

Errors, not warnings — a warning is a hard-coded value someone shipped last
quarter.

| Rule | Why |
| --- | --- |
| Raw `#hex`, `rgb()`, `hsl()`, `oklch()` in app code | Semantic tokens only: `var(--interactive)`, `var(--surface)`. The ramps belong to the token layer. |
| Arbitrary Tailwind values — `p-[13px]`, `text-[#ff0000]` | Use scale steps from the preset. |
| Raw `px` inside template strings | `var(--space-*)` / `var(--text-*)`. |
| `marginLeft`, `paddingRight`, `left`, `borderLeft`… | RTL is in scope. Logical properties only: `marginInlineStart`, `insetInlineEnd`, `borderInlineEnd`. |
| `textAlign: "left" \| "right"` | Does not flip. Use `start` / `end`. |
| `flexDirection: "row-reverse"` | Hardcodes a direction. Let `dir` drive the flow. |
| Importing `lucide-react`, `react-icons`, `@heroicons/react` | One icon source: `@al-rayhaanat/icons`, which carries the mirror flags and token sizes. |
| Importing `framer-motion` directly | `@al-rayhaanat/motion` wires the motion tokens and `prefers-reduced-motion`. |
| Deep imports (`@al-rayhaanat/ui/src/*`, `tokens/dist/*`) | Import package roots so subpath exports stay meaningful. |
| `jsx-a11y` strict set, `no-autofocus`, `label-has-associated-control` | The accessibility floor, enforced from the first component rather than audited later. |

The exemption list is exactly one entry: `packages/tokens/**` and `tokens/**`,
where raw values are the whole point.

## TypeScript

`strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`. `noEmit` — bundlers emit; CI runs `tsc --noEmit`.

## Next.js App Router notes carried by lint

- `'use client'` belongs at the **narrowest** boundary. `Button` needs it;
  `Card`, `Stack`, `Badge`, `Divider` do not.
- **No barrel file that re-exports everything.** A single `index.ts` marked
  `'use client'` ships the whole library to every page. Use subpath exports
  (`@al-rayhaanat/ui/button`) and keep server-safe primitives free of the
  directive.
- `restrictDefaultExports.namedFrom` is on, so a component cannot be
  re-exported as a default from a barrel by accident.
