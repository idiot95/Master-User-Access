# The .potx template — build spec

The one artifact in this system that nothing generates. It has to be built once,
by hand, in PowerPoint, and re-checked whenever `packages/tokens/brand.json` changes.
Everything below comes from the generated theme at
`packages/slides/dist/pptx.theme.js`; do not retype values from memory.

## Theme colours

| Office slot | Token | Hex |
| --- | --- | --- |
| Background 1 | `color.light.canvas` | `#FDFAF5` |
| Text 1 | `color.light.text-primary` | `#1E1A15` |
| Background 2 | `color.sand.200` | `#F5ECDF` |
| Text 2 | `color.sand.800` | `#55493A` |
| Accent 1 | `color.crimson.500` | `#E7234F` |
| Accent 2 | `color.rose.500` | `#DD8A8D` |
| Accent 3 | `color.blue.500` | `#2C5FA8` |
| Accent 4 | `color.green.500` | `#1F7A5C` |
| Accent 5 | `color.amber.500` | `#8A5A00` |
| Accent 6 | `color.sand.600` | `#9C8A6D` |
| Hyperlink | `color.crimson.700` | `#A50F36` |

Divider and close masters use `#1E1A15` as their fill — set it on the master, not
per slide, or an author will forget.

## Fonts — two slots, not one

Office treats Arabic as a **complex script** with its own font slot. Set both:

- **Latin heading:** Cormorant Garamond
- **Latin body:** Lora
- **Complex script:** Kanz al-Lulu

Install all three on every authoring machine. If Kanz is not installed,
PowerPoint substitutes silently and the deck ships in the wrong face — there is
no warning. Keep Noto Naskh Arabic installed as the documented fallback.

## Slide size

13.333in × 7.5in (16:9). Margins: 0.9in inline, 0.75in block.

## Masters and layouts

Eight layouts, matching the React components one to one so a deck can move
between the two without redesign:

| Layout | React | Notes |
| --- | --- | --- |
| Cover | `SlideCover` | Mark at 1.6in, kicker, 54pt title, meta line |
| Contents | — | Numbered list, tabular figures |
| Section divider | `SlideDivider` | Ink fill, mark ghosted top-inline-end at 24% |
| Content | `SlideContent` | Single column, 32pt heading, 0.9in accent rule under it |
| Two column | `SlideContent` + `aside` | 1.05 : 1 split, 0.5in gutter |
| Chart | `SlideChart` | Chart placeholder, 12pt caption below |
| Table | `SlideTable` | Header row hairline `#E2C9B8`, no fills |
| Close | `SlideClose` | Ink fill, mark only |

### RTL masters

A mirrored duplicate of every layout above, with placeholders flipped to the
right and paragraph direction set to RTL. This is a **separate set of masters**,
not a translation of the Latin ones — PowerPoint will not mirror placeholders for
you. Name them `ARH_<Layout>_RTL`.

## Type sizes

| Role | Size | Face |
| --- | --- | --- |
| Cover title | 54pt | Cormorant Garamond, regular |
| Divider title | 48pt | Cormorant Garamond, regular |
| Slide heading | 32pt | Cormorant Garamond, regular |
| Stat figure | 40pt | Cormorant Garamond, tabular |
| Body | 14pt | Lora |
| Table body | 12pt | Lora |
| Kicker / label | 10–11pt, 2pt tracking, uppercase | Cormorant Garamond |
| Caption | 12pt | Lora, 65% opacity |

Arabic runs take the same point sizes at ×1.06 and need line spacing at least
1.45× — PowerPoint's "Multiple: 1.45", not "Exactly".

## What authors must not do

- No gradient fills, no shadows on shapes, no 3D, no WordArt.
- No crimson panels. Crimson is a rule, a mark, a small fill behind a figure.
- One dark field per spread. Two ink slides side by side read as a mistake.
- Do not retype a hex. If a colour is not in the theme palette, it is not in the
  system.
- Do not resize the mark below 0.35in — below that use the core alone, which is
  supplied as a separate PNG at `packages/icons/dist/mark-core-*.png`.

## Verification checklist, per release

1. Open the .potx, insert one slide of every layout.
2. Type an Arabic string in each and confirm the complex-script slot resolves to
   Kanz al-Lulu, not a substitute.
3. Confirm the RTL masters mirror placeholders, not just paragraph direction.
4. Compare a Cover, a Divider and a Chart slide against the same three rendered
   from `@al-rayhaanat/slides` in the browser. Any drift is a bug in this file.
