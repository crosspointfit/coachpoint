# Patient camera workspace — design QA

## Comparison target

- Source visual truth: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-target.png`
- Browser-rendered implementation: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-implementation.png`
- Full-view comparison: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-comparison.png`
- Focused coach-rail comparison: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-rail-comparison.png`
- Responsive evidence: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-responsive-900.png`
- Responsive before/after comparison: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-responsive-comparison.png`
- Route: `http://localhost:4100/patient/CP_183AE49A2D0C4DAD8D5CA44F5128F92B`

## Normalization and state

- Source pixels: `1485 × 1059`.
- Implementation pixels: `1485 × 1059` from an explicit `1485 × 1059` CSS viewport.
- Density normalization: the browser capture and source have identical pixel dimensions; no resampling was used for the final comparison.
- State: active `Supported Half Squat` camera set using `OBS Virtual Camera`, with live on-device pose overlay, repetitions, coaching cue, exercise thumbnail, and human Stop controls visible.
- Expected dynamic-state differences: the source mock shows set 2 at 4/8 with an accepted focus; the captured implementation shows set 1 at 0/8 without a staged focus. These values are session-driven. Their component slots and hierarchy were compared, but the copy and counts were not treated as static fidelity defects.

## Findings

- No actionable P0, P1, or P2 findings remain.
- [P3] The implementation keeps the established compact CoachPoint/Crosspoint wordmark instead of enlarging the generated mock wordmark. This is intentional reuse of the product design system and does not affect the task hierarchy.
- [P3] The implementation adds `effort` and the no-video privacy assurance to the source's post-set pain note. This is intentional clinical-safety and privacy clarification; scoring still happens only after the set.

## Required fidelity surfaces

- Fonts and typography: IBM Plex Sans is retained from the product. The final coach rail uses source-aligned display weight and scale for exercise, repetition, cue, and stop controls; wrapping remains readable at both captured viewports.
- Spacing and layout rhythm: the desktop uses a large inset camera stage and a `380px` XL rail, with the exercise thumbnail on the rail's right and two stacked Stop actions. Major-region proportions now track the source. The 900px layout keeps camera, cue, and both persistent controls visible.
- Colors and visual tokens: existing CoachPoint navy, white, primary blue, and coral semantic action colors match the source intent without adding an unrelated palette or decorative gradient.
- Image quality and asset fidelity: the real local half-squat illustration and live OBS feed are used at correct aspect ratios with `object-contain`; the pose overlay remains sharp and aligned. Icons come from Heroicons, including the pain/stop hand icon; no placeholder, emoji, handcrafted SVG, or CSS illustration substitutes are present.
- Copy and content: exercise identity, set progress, live coaching, explicit post-set scoring, on-device processing, and no-video-storage language are coherent and visible. No in-motion Pain/RPE input remains.
- Accessibility and behavior: the immersive view is an ARIA modal dialog, traps focus, supports Escape, restores focus and body scrolling, uses an ARIA live cue, provides alt text for the exercise asset, and keeps practical button targets. Camera Start remains human-triggered.

## Full-view and focused evidence

- Full-view evidence: `running-comparison.png` confirms the header/camera/rail composition, inset media frame, rail width, image placement, repetition hierarchy, palette, and stacked bottom controls.
- Focused evidence: `running-rail-comparison.png` was necessary because rail typography and button treatment were too small to judge in the full-view composite. It confirms the final exercise title, thumbnail, repetition scale, cue hierarchy, coral actions, and pain icon.
- Responsive evidence: `running-responsive-comparison.png` confirms that the earlier below-fold control issue was removed and that the final 900px state presents the live cue plus both stop controls without overlap or horizontal overflow.

## Comparison history

1. Desktop pass — blocked by two P2 fidelity differences.
   - Earlier evidence: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-comparison-before-refinement.png`.
   - Earlier findings: the camera was edge-to-edge instead of inset; the rail was narrow and dense; the exercise asset order, repetition scale, and side-by-side stop controls drifted from the source.
   - Fixes: added the inset rounded media frame; widened the XL rail to `380px`; placed the exercise copy before the thumbnail; increased rail typography; highlighted the current repetition in coral; stacked both controls; added the Heroicons pain hand.
   - Post-fix evidence: `running-comparison.png` and `running-rail-comparison.png`.

2. 900px pass — blocked by one P2 responsive issue.
   - Earlier evidence: `/Users/tywang/Documents/AI/coachpoint/docs/design/patient-camera/running-responsive-900-before-fix.png`.
   - Earlier finding: the rail's natural-height row pushed `End set` below the fixed viewport.
   - Fixes: changed the mobile grid to bounded `minmax` rows; made the coach content independently scrollable; kept the rail header and control footer fixed; tightened only sub-LG type and spacing.
   - Post-fix evidence: `running-responsive-900.png` and `running-responsive-comparison.png` show camera, live cue, `Pain / stop`, and `End set` together.

## Interaction and runtime checks

- User-operated human Start with remembered `OBS Virtual Camera` reached the immersive running view.
- Live video, pose landmarks, exercise asset, rep counter, progress, and live cue rendered together.
- `Pain / stop` and `End set` remained visible; they were not activated during capture so the running evidence stayed stable.
- WebMCP tools remained registered without being called to monitor the active set.
- Browser console: no React, network, or application errors. MediaPipe emitted its known OpenGL/projection runtime warnings only.
- Automated verification: `225/225` tests, ESLint, TypeScript, and the Next.js Webpack production build passed.

## Implementation checklist

- [x] Compact remembered-camera setup with explicit human Start.
- [x] Large running camera stage with local pose overlay.
- [x] Exercise illustration and set context in the coach rail.
- [x] Live cue and accepted-focus slot remain separate.
- [x] No in-motion numeric pain input; post-set Pain/RPE check-in remains authoritative.
- [x] Persistent Pain/stop and End set controls.
- [x] Desktop and 900px responsive verification.
- [x] Same-size full-view and focused visual comparisons.

final result: passed
