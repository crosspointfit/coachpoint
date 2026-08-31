# PT HEP reference for the CoachPoint home page

Extracted on 2026-08-31 from `/Users/tywang/Documents/AI/pt`, branch `hep`,
commit `641c3b05a5a41fa0424aecc89f5e52d9e1959302`.
This reference grounds the CoachPoint homepage refresh; the PT repository is
not modified. Machine-readable values are in `design-tokens.json`.

Source of truth: PT `DESIGN_SYSTEM.md` and `src/app/globals.css`.

## Colors

The source pairs warm off-white surfaces with navy headings and restrained
blue details. Coral is reserved for the primary action.

<span style="display:inline-block;width:18px;height:18px;background:#14355f"></span>
`#14355F` — `ink-900`, main headings and the closing section.

<span style="display:inline-block;width:18px;height:18px;background:#0369a1"></span>
`#0369A1` — `primary-700`, links, selected states and supporting labels.

<span style="display:inline-block;width:18px;height:18px;background:#ef5b3e"></span>
`#EF5B3E` — `coral-500`, the main workspace CTA; hover `#D94A2E`.

<span style="display:inline-block;width:18px;height:18px;background:#fafaf7;border:1px solid #e7e5de"></span>
`#FAFAF7` — warm page background; white cards and `#E7E5DE` borders.

The extractor found 15 named colors. CoachPoint already has equivalent
`--cp-*` values mapped into its Tailwind theme, so no workspace palette change
was necessary. The source's 48px navy grid is limited to the hero.

## Typography

The PT reference loads **IBM Plex Sans** for English/numerals and **Noto Sans
TC** for Chinese through Next.js. LINE Seed TC is declared but not bundled.
CoachPoint retains its existing English-first IBM Plex Sans/system fallback
stack; no new font files are copied in this change.

The source hero is 54px with a 1.2 line-height at the captured desktop width.
CoachPoint adapts that hierarchy to two short English lines (58px/1.12 at the
large breakpoint, 40px/1.12 on mobile). Source-backed section headings are
28–36px, body text 14–18px, and supporting labels 12px.

## Spacing, shape and elevation

- The extractor found no explicit CSS spacing or breakpoint tokens. PT's
  design document specifies a 4px rhythm; its components use Tailwind's
  mobile-first utility scale.
- PT uses a `max-w-6xl` marketing frame and 64–96px section spacing. The
  CoachPoint adaptation uses a 1200px frame, 20–24px inner gutters and
  responsive 48–80px section spacing.
- Base radii: 12px and 16px. Marketing illustration cards use 18px corners;
  pill-shaped CTAs follow the actual PT homepage.
- Base card shadow: `0 1px 3px rgba(20,53,95,.06), 0 1px 2px rgba(20,53,95,.04)`.
  Stronger, navy-tinted elevation is confined to the source-style hero collage.

## Reused patterns and assets

- PT `src/app/page.tsx`: split hero, three tilted movement cards, gallery strip,
  numbered workflow and navy closing CTA.
- PT `src/app/hep/page.tsx`: native details/summary FAQ and product-flow rhythm.
- CoachPoint `src/components/SiteHeader.tsx`: retained CP/CoachPoint identity,
  with internal homepage anchors and workspace entry.
- CoachPoint `src/components/home/HomeExerciseGallery.tsx`: live carousel and
  native-dialog movement preview using the existing catalog.
- CoachPoint `public/exercise-thumbnails/`: the existing text-free 4:3 WebP
  illustrations are reused. PT's older text-bearing portrait sheets are not
  copied. Gallery and dialog images use `object-contain`.
- Icons remain the project's existing Heroicons outline set. No new inline
  SVG drawings, raster mockups or generated illustrations are introduced.

## Scope of the adaptation

This is a style-led adaptation, not a copy of PT's business offering. Pricing,
waitlists, LINE/cross-device claims, adherence percentages, customer counts and
unimplemented reporting features are excluded. The homepage shows actual
catalog/client fixture counts, explains browser-local demo storage, and keeps
confirmation with the therapist. The competition hyperlink is removed from
all public page chrome, including the footer.

## Sources

- `/Users/tywang/Documents/AI/pt/DESIGN_SYSTEM.md`
- `/Users/tywang/Documents/AI/pt/src/app/globals.css`
- `/Users/tywang/Documents/AI/pt/src/app/page.tsx`
- `/Users/tywang/Documents/AI/pt/src/app/hep/page.tsx`
- `output/playwright/home-redesign-2026-08-31/pt-hep-home-reference.png`

Extracted with `design-context-import`; the undeclared spacing and font-loading
details above were checked directly against source code and the rendered page.
