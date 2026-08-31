# Phase 4.5C–D — Local acceptance

Date: 2026-08-31 (Asia/Taipei)

Result: **passed locally**. This is synthetic software QA, not clinical
validation or deployed HTTPS acceptance.

## Implemented boundary

- Dashboard: `list_clients({})`, at most three currently visible client rows.
- Client hub: `get_client_summary({})`, route-bound visible context, current
  draft, active version, at most 20 history entries and five recent activities.
- Editor: the four existing tools, with route-owner cancellation and a
  pre-commit abort check for `draft_program`.
- Only the therapist UI confirms. No confirmation, activation, deletion,
  navigation-only or fabricated adherence tool was added.
- Read tools consume the same hydrated pure projection as the page. Calls do
  not read, seed, migrate or write browser storage.
- Unknown identifiers and cross-client deep links fail closed.

## Three native workflows

All runs used production build `rZG2TXCMVZTwzvGicjIA7`, native Codex in-app
Browser WebMCP and separate loopback origins. No WebMCP shim was injected.
Each origin started at the validated three-client seed with no programs.
The user's `localhost:4100` draft data was not reset or used by the runs.

| Run | Client / origin | Version-one UI change | Version-two UI change | Result |
| --- | --- | --- | --- | --- |
| 1 | Shoulder / `127.0.0.1:44151` | Assisted flexion: 8 → 6 reps; reorder | 6 → 5 reps | Passed |
| 2 | Knee / `127.0.0.1:44152` | Half squat: 8 → 6 reps; reorder | 6 → 5 reps | Passed |
| 3 | Balance / `127.0.0.1:44153` | Single-leg balance: 20 → 15 sec; reorder | 15 → 10 sec | Passed |

Each run covered:

1. Native directory read and route-bound client summary.
2. A new named editor, native catalog search/details and a visible agent draft.
3. Rejection of a stale draft revision without replacing the newer draft.
4. Simulated therapist UI dosage/order edits and fresh reload recovery.
5. Simulated therapist UI confirmation, then patient-view verification.
6. Agreement between client hub and dashboard; other clients remained unchanged.
7. Reopening, editing and confirming a second immutable version.
8. Old and new patient URLs retained different, correct dosages.
9. Back/forward and direct-link recovery, cross-client rejection and no tools
   on unavailable, landing or patient pages.

UI confirmation clicks were automated test simulations of the therapist
control, not a WebMCP permission for an agent to prescribe. Run 3 required two
document/route read-handle refreshes; the harness fetched the current tools and
did not replay a mutation or confirmation. No application console errors or
warnings were observed during the runs.

## Evidence

- [Combined manifest](../output/playwright/phase-4.5-acceptance-2026-08-31/manifest.json)
- [Run 1 record](../output/playwright/phase-4.5-acceptance-2026-08-31/run-01/manifest.json)
- [Run 2 record](../output/playwright/phase-4.5-acceptance-2026-08-31/run-02/manifest.json)
- [Run 3 record](../output/playwright/phase-4.5-acceptance-2026-08-31/run-03/manifest.json)
- [Dashboard viewport](../output/playwright/phase-4.5-acceptance-2026-08-31/dashboard-viewport.png)
- [Confirmed history viewport](../output/playwright/phase-4.5-acceptance-2026-08-31/run-03/history-viewport.png)
- [Mobile dashboard](../output/playwright/phase-4.5-acceptance-2026-08-31/mobile-dashboard-viewport.png)
- [Mobile client hub](../output/playwright/phase-4.5-acceptance-2026-08-31/mobile-client-hub-viewport.png)

Screenshots are unstitched viewport captures. The browser's full-page capture
produced a scale/stitch artifact, so those raw captures were excluded and
moved to a recoverable temporary backup. Patient/history viewport evidence was
recaptured through read-only navigation after each completed workflow.

## Automated and ordinary-browser checks

- `npm test`: 90 passing tests, including shared projections, allowlists,
  runtime input validation, immutable history, route isolation, storage
  failures, cancellation, partial registration failure and rapid remounts.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- Independent frontend-verify Chromium check: no console errors, failed
  resources, broken images or basic accessibility failures; manual mode works
  without native WebMCP.
- One heuristic warning flagged a 1×1 screen-reader-only label. The follow-up
  probe measured document width = viewport width = 1280; no horizontal page
  overflow exists. See [check](../output/playwright/phase-4.5-acceptance-2026-08-31/frontend-check.json)
  and [probe](../output/playwright/phase-4.5-acceptance-2026-08-31/frontend-probe.json).
- Mobile viewport 375×812: layout/scroll widths both 360 (15px scrollbar),
  with English-only dashboard and client hub. Filter-chip scrolling is intentional.

The first sandboxed rebuild failed because a CSS compiler child process could
not bind a local port; its generated Turbopack cache was moved to a recoverable
backup. An approved clean-cache rebuild passed. No source workaround was needed.

## Repeat the local gate

1. Run the four checks above; keep one production build fixed for all runs.
2. Start a test-only Next server on an unused loopback port, for example
   `./node_modules/.bin/next start --hostname 127.0.0.1 --port 44151`.
3. Use a fresh browser context or a new unused origin, never clear the user's
   active workspace. Verify all three clients have no programs before testing.
4. Follow the workflow above. Refresh the native tool handle after navigation
   when the host reports that the previous handle is stale.
5. Repeat for all three clients on separate fresh origins. Preserve tool
   results and UI evidence; stop only test servers started for the run.

## Remaining gates

- Public illustration licensing/provenance, public repository and HTTPS deployment.
- Repeat the route/workflow verification on the deployed origin.
- Licensed therapist review and a user-assisted real-camera Motion Lab run
  before patient WebMCP coaching advances. No camera permission was requested here.
