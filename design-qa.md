# Therapist workspace design QA

- source visual truth path: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-gallery-first.png`
- implementation screenshot path: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-implementation.png`
- viewport: `1440 × 1024` CSS px, desktop light theme
- pixel dimensions and density normalization: source `1487 × 1058` px; implementation `1440 × 1024` px at device scale factor 1. The aspect ratios differ by less than 0.1%. Both were normalized to 1000 px wide without distortion and placed in one `2040 × 820` comparison canvas.
- state: synthetic shoulder case; site tools ready; visible agent-created three-movement draft; clinical notes collapsed; three additional gallery items staged; therapist-confirmed patient-link strip visible.

## Full-view comparison evidence

- Combined evidence: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-comparison.png`
- The implementation preserves the source hierarchy: primary navigation, compact case strip, image-dominant adaptive two/three-column library, whole-card selection, sticky selection tray, compact prescription editor, one consequential coral confirmation action, and quiet attributed activity.
- The implementation intentionally gives slightly more horizontal space to the gallery and uses denser prescription rows. This supports the approved “choose from a movement library” workflow and the request to reduce text/table density.
- The black circular `N` visible at the lower-left of development captures is the Next.js development toolbar, not product UI.

## Focused region comparison evidence

- Gallery: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-comparison-gallery.png`
  - Whole-card blue selection states, checkmarks, image-led scanning, category filters, selection count, thumbnails, and batch-add action are all visually and functionally present.
- Prescription: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-comparison-draft.png`
  - The source ordering, dosage summary, warning disclosure, edit affordance, reorder/remove controls, daily-time total, and therapist-only confirmation hierarchy are preserved.

## Required fidelity surfaces

- Fonts and typography: IBM Plex Sans/clinical system fallbacks retain the source's compact humanist hierarchy. Display headings, metadata, monospace time values, truncation, line height, and optical weights remain legible at the target viewport.
- Spacing and layout rhythm: the split workspace, compact top strip, 12–16 px radii, quiet borders, low elevation, one document scroll, sticky right-side draft, and sticky selection tray retain the source rhythm without nested scrolling. The denser right column is an intentional product adaptation.
- Colors and visual tokens: navy `#14355F`, blue `#0369A1`, pale blue `#E0F0FA`, warm off-white, and coral `#EF5B3E` map directly to the imported PT design system. There are no gradients, glass effects, or ornamental color drift.
- Image quality and asset fidelity: all 15 gallery assets were recreated from the original PT illustrations with the built-in image generation edit workflow, normalized to text-free `4:3` compositions, and delivered as optimized `960 × 720` WebP files. Full figures, equipment, support surfaces, and motion arrows remain inside safe margins; no placeholder, emoji, custom SVG approximation, or CSS-drawn substitute is used. Evidence: `/Users/tywang/Documents/AI/coachpoint/design-references/exercise-thumbnails-contact-sheet.png` and `/Users/tywang/Documents/AI/coachpoint/design-references/exercise-thumbnails-gallery-preview.png`.
- Copy and content: labels are workflow-specific and concise. The implementation retains synthetic-data labeling, clinical-review language, agent/therapist attribution, and the explicit therapist-only consequence boundary.

## Findings

- No actionable P0, P1, or P2 differences remain.
- [P3] The implementation's prescription rows are intentionally more compact than the visual target. This fits three editable movements above the fold and directly answers the request to reduce text-heavy table presentation.
- [P3] The generated movement artwork is appropriate for the competition demo but still requires licensed therapist sign-off before any production clinical use, especially the tendon-glide sequence and procedure-specific shoulder range.

## Responsive and runtime evidence

- Mobile screenshot: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-mobile.png` at `375 × 812`; document scroll width equals viewport width (`375`), with the region chip row intentionally horizontally scrollable.
- Tablet screenshot: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-workspace-tablet.png` at `768 × 1024`; document scroll width equals viewport width (`768`).
- Primary interactions tested in the browser: gallery select/deselect, three-item selection tray, batch add, remove/restored item, dosage editor open/close, case drawer open/close, therapist confirmation, CTA-to-inline-success replacement, copy/open patient actions, post-confirmation revise/new-draft choices, and generated patient-link state.
- Short-viewport regression checks: `1024 × 650`, `1280 × 720`, `1502 × 754`, `768 × 1024`, and `375 × 812`. The selection tray and its action remained fully visible at every size, document width matched viewport width, and no library/draft nested vertical scroller remained.
- Long-content regression: an eight-item draft at `1280 × 720` kept the draft header and confirmation action visible throughout document scrolling; a one-result catalog filter kept the selection tray visible until the shared grid boundary.
- Browser console after the final pass: zero errors and zero warnings. All visible optimized exercise images completed with non-zero natural widths. No unlabeled buttons or document-level horizontal overflow were detected.

## Comparison history

- Formal pass 1: the source and final implementation were normalized into one combined input at a matched desktop viewport and selected-library state. No actionable P0/P1/P2 difference was found, so no post-comparison visual fix iteration was required.
- User-feedback pass 2: a `1502 × 754` capture exposed a clipped bottom tray, competing document/library scroll regions, and confirmation feedback below the fold. The fixed-height grid and both column scrollers were removed, the tray became an inset document-sticky control, the draft became a document-sticky column, and confirmation now replaces the CTA in place with `Confirmed`, copy, and open actions. Evidence: `/Users/tywang/Documents/AI/coachpoint/design-references/reported-scroll-before.png` and `/Users/tywang/Documents/AI/coachpoint/design-references/reported-scroll-after.png`.
- Capture normalization after pass 2: the document was returned to its top position and the interaction state was set to three staged selections so source and implementation showed comparable gallery-selection behavior.
- User-feedback pass 3: the portrait source sheets were being cropped inside landscape card frames. Fifteen dedicated text-free `4:3` thumbnails were generated, six semantically mismatched source poses were corrected against the catalog definitions, the gallery changed to uncropped `object-contain`, and wide desktop layouts now use three columns. The patient session and prescription rows consume the same new thumbnail contract.
- User-feedback pass 4: confirmation was a terminal UI state with no obvious way to continue. The confirmed action panel now exposes `Revise plan` to reopen the current items and `New draft` to clear the workspace for a fresh selection while retaining the already-issued patient link. Evidence: `/Users/tywang/Documents/AI/coachpoint/design-references/post-confirmation-actions.png` and `/Users/tywang/Documents/AI/coachpoint/design-references/new-prescription-draft.png`.

## Implementation checklist

- [x] Image-first movement gallery with whole-card selection
- [x] Fifteen text-free, uncropped, optimized `4:3` movement thumbnails
- [x] Multi-select tray with thumbnails and one batch-add action
- [x] Compact dose summaries with progressive disclosure for editing
- [x] Agent-created draft attribution and collapsible clinical notes
- [x] Therapist-only confirmation with immediate inline success and patient-link actions
- [x] Explicit post-confirmation revise and start-new workflows
- [x] Responsive header, single document scroll, sticky gallery tray, and stacked mobile tray
- [x] Desktop/mobile/tablet visual checks and clean runtime console
- [x] Brand-token and anti-slop review

## Phase 4.5 caseload extension evidence

- Dashboard: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-caseload-dashboard.png`
- Client program hub: `/Users/tywang/Documents/AI/coachpoint/design-references/client-program-hub.png`
- Mobile dashboard: `/Users/tywang/Documents/AI/coachpoint/design-references/therapist-caseload-mobile.png`
- Mobile client hub: `/Users/tywang/Documents/AI/coachpoint/design-references/client-program-hub-mobile.png`
- The extension reuses the existing CoachPoint typography, navy/blue/coral tokens, synthetic-data labeling, status semantics, radii, borders, and low-elevation surfaces rather than introducing a second dashboard visual language.
- Browser checks covered v1 workspace/registry migration, three-client rendering, client detail, immutable program history, named editor deep links, new-program creation, fresh reload recovery, fail-closed cross-client links, Client A/B isolation, four route-scoped editor tools, stale-agent revision rejection, durable agent writes, editor-tool cleanup on dashboard return, English-only copy, zero horizontal overflow at 375 px, zero broken images, and a clean console.

final result: passed

## Phase 4.5C–D route-tool acceptance

- Read-only readiness badges reuse existing CoachPoint tokens on the dashboard
  and client hub. The active plan now visibly shows its therapist confirmation
  timestamp, matching the read-tool payload.
- Native three-run evidence and unstitched desktop/mobile screenshots are in
  `docs/phase-4.5-acceptance.md` and
  `output/playwright/phase-4.5-acceptance-2026-08-31/`.
- One ordinary-browser overflow heuristic flagged only the clipped 1×1 search
  label; directed measurement confirmed no document overflow. Native mobile
  layout/scroll widths both equal 360 within the 375px viewport.
- Full-page screenshot stitching artifacts were excluded from final evidence;
  the retained viewport images were visually inspected.

## Homepage redesign — PT HEP reference, 2026-08-31

### Scope and visual target

- User direction: remove the competition hyperlink entirely (not move it to
  the footer), and improve the CoachPoint homepage using the PT `hep` branch's
  design style. This is a style-led adaptation, not a copy of PT's commercial
  claims, Chinese content, product routes or feature promises.
- source visual truth path:
  `/Users/tywang/Documents/AI/coachpoint/output/playwright/home-redesign-2026-08-31/pt-hep-home-reference.png`
- implementation screenshot path:
  `/Users/tywang/Documents/AI/coachpoint/output/playwright/home-redesign-2026-08-31/coachpoint-home-desktop.png`
- source branch: `pt/hep`, commit `641c3b05a5a41fa0424aecc89f5e52d9e1959302`.
- Imported token reference: `docs/design/pt-hep/DESIGN_SYSTEM.md` and
  `docs/design/pt-hep/design-tokens.json` (15 colors, existing font stack,
  radii, shadows and component provenance).
- viewport/state: both desktop captures are 1280×720 CSS pixels, at page top,
  light theme, no open preview. Both final PNGs are 1280×720 pixels; no density
  resampling, cropping or full-page stitching was used. Mobile comparison is
  375×812 CSS/pixel dimensions on both sides.

### Comparison evidence and required surfaces

The source and final implementation were opened together in one paired-image
comparison input. They were judged as a style adaptation with the intentional
content/asset changes below, not claimed as a pixel-identical clone.

- Fonts and typography: navy, heavy two-line display hierarchy and quiet
  supporting text follow the source. The English heading was shortened for
  mobile wrapping. CoachPoint's existing English-first IBM Plex Sans/system
  fallback stack is retained; PT's Chinese webfonts are not copied.
- Spacing/layout: generous split hero, 48px alignment-grid motif, grouped
  primary/secondary actions, three compact facts, staggered exercise cards,
  numbered workflow, native FAQ and navy closing CTA follow the PT rhythm.
  Marketing layout is scoped to home classes; therapist layout is unchanged.
- Colors/tokens: source warm white, navy, blue, coral and border colors map to
  existing CoachPoint tokens. No new gradient, glass layer or decorative art
  system was added; the existing source-backed grid class is reused.
- Image quality: the source-style Bridge/Chin Tuck/Bird Dog collage uses the
  existing text-free WebP assets. Collage overlap is decorative, as in the
  source. The functional gallery and preview dialog show full 4:3 images with
  `object-contain`; all 18 homepage images loaded after gallery traversal.
- Copy/content: all visible copy is English. The live fixture counts are 15
  movements and three demo clients. No PT pricing, adherence percentages,
  customer numbers, waitlist or cross-device promises were copied. Same-browser
  storage and human-only confirmation are explicitly explained.
- Icons and identity: existing CP/CoachPoint branding and Heroicons outline
  assets remain; the source's Crosspoint logo is not substituted into the app.

Focused card comparison used `pt-hep-gallery-reference.png` and
`coachpoint-home-gallery.png` together. The source's portrait marquee is
intentionally replaced by larger text-free cards with manual navigation.
`coachpoint-home-preview-dialog.png` and `coachpoint-home-mobile-dialog.png`
were inspected for image containment, long-title wrapping and accessible close
controls. The dialog is an additional functional preview, not a static mock.

### Comparison and fix history

1. Desktop pass 1 (`coachpoint-home-pass1.png`): [P2] the floating review note
   obscured the Bird Dog caption. The note was narrowed, moved left and given
   shorter copy. Final desktop evidence shows all three labels unobstructed.
2. Mobile pass 1 (`coachpoint-home-mobile-pass1.png`): [P2] the long English
   title and wrapped CTA row delayed the visual content. The title and CTA
   labels were shortened, and the collage spacing was tightened. The 375px
   final capture shows the primary actions on one row and the illustration
   beginning within the first viewport.
3. Interaction pass: [P2] native Escape behavior did not close reliably through
   the embedded browser keyboard path. An explicit Escape handler now closes
   the dialog, restores body scrolling and returns focus to the invoking card.
   The close header stays visible while the mobile dialog scrolls.
4. Runtime follow-up: snap-padding tolerance fixes the carousel's edge-button
   state. Hero-shared thumbnails and the visible dialog image load eagerly,
   resolving Next.js LCP hints without eagerly loading the whole gallery.

### Verified interactions and runtime

- Breakpoints: 320×740, 375×812, 768×1024 and 1280×720. Document scroll width
  equals layout width at all four sizes; no visible Chinese copy or competition
  link remains. Horizontal gallery scrolling is intentional and contained.
- Gallery: next/previous movement navigation, disabled edge controls, complete
  traversal of all 15 items, full-image preview and long exercise titles.
- Dialog: initial focus inside the modal, Escape close, close-button action,
  body-scroll restoration, focus return and visible close control after mobile
  internal scrolling (close button remained at y≈62–106 in an 812px viewport).
- FAQ expands; workspace CTA and dialog link reach `/therapist`; browser back
  returns home with no residual therapist WebMCP tools or body scroll lock.
- Latest browser pass: zero console errors and zero warnings. Earlier
  image-loading development hints were fixed and rechecked on a fresh reload.
- `npm test`: 92 passed. Typecheck, lint and production build passed.
- Anti-slop static checks on the homepage and new gallery returned no findings.
  The qualitative pass found no unsupported metrics or filler business claims.

### Remaining notes

- [P3] Exact font rendering still depends on CoachPoint's existing local/system
  fallback availability; self-hosting the same English font as PT can be a
  separate typography-only refinement.
- No clinical approval, camera validation, deployment or patient-data mutation
  was performed in this homepage task.

### Implementation checklist

- [x] Competition hyperlink removed from global header, with no footer replacement
- [x] Source-grounded English hero and real movement imagery
- [x] Working gallery, accessible preview, internal navigation and FAQ
- [x] Desktop/mobile comparison, image and runtime checks
- [x] Existing therapist workflow and WebMCP boundaries preserved

final result: passed
