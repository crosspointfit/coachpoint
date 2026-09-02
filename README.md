# CoachPoint

CoachPoint is an agent-native home exercise program demo for the 2026 WebMCP
Challenge. A therapist and an agent collaborate on a visible prescription
draft while final clinical confirmation remains a human action.

The durable implementation plan is in
[`webmcp-implementation-phases.md`](./webmcp-implementation-phases.md).

## Implemented therapist flow

1. The therapist opens `/therapist`, chooses a synthetic client, and opens a
   new or existing prescription from that client's program hub.
2. The therapist enters a synthetic case, time budget, equipment, and any
   procedure-specific constraints.
3. The therapist or agent searches the demo-only catalog and inspects precautions.
4. The agent creates a visible draft; the therapist edits dosage and ordering.
5. Only the therapist UI can confirm the prescription and create the anonymous
   patient link.
6. Client detail shows the active version, earlier immutable versions and
   attributed activity. Old patient links keep their original dosage.

Eleven WebMCP tools are split across five route surfaces:

| Route | Tool | Effect |
| --- | --- | --- |
| `/therapist` | `list_clients` | Reads the currently visible filtered directory; at most three synthetic clients. |
| `/therapist/clients/[clientId]` | `get_client_summary` | Reads visible context, current/active plans, up to 20 history entries and five recent activities. |
| `/therapist/clients/[clientId]` | `get_adherence_summary` | Reads identity-free completion, RPE/pain, deviations and latest safe motion observations from the active program's validated patient session. |
| Program editor | `get_program_editor_state` | Reads the route-bound draft revision and confirmation state. |
| Program editor | `prepare_draft_context` | Optional read-only planning path for ambiguous requests; batch-searches compact dosage and safety details without writing. |
| Program editor | `search_exercises` | Read-only structured catalog search. |
| Program editor | `get_exercise_details` | Read-only timing, precautions and contraindications. |
| Program editor | `draft_program` | Preferred one-call path for an explicitly requested draft: resolves ordered movement searches against the route-bound case and writes only a visible review draft; never confirms or activates it. |
| `/motion-lab` | `get_latest_motion_lab_set_result` | Reads the latest completed or stopped isolated-demo set aggregate only after the user asks for a review; it cannot monitor the active set and exposes no camera details or raw motion series. |
| `/patient/[code]` | `review_completed_set` | Reads the latest persisted, checked-in camera set with its therapist-confirmed target, aggregate observations and explicit RPE/pain; it cannot monitor or control the set. |
| `/patient/[code]` | `stage_next_set_focus` | Revision-guarded write that stages one evidence-linked suggestion for visible human Accept/Dismiss; it cannot change prescription dosage or start a set. |

The editor route is
`/therapist/clients/[clientId]/programs/[programId]`. Six route-owned snapshot
tools—`list_clients`, `get_client_summary`, `get_adherence_summary`,
`get_program_editor_state`, and the two post-set result tools—accept `{}` only:
the page, not a supplied identifier, owns their context. Structured catalog
tools accept search intent but no client or program target. They read the same
hydrated projection as the UI without accepting cross-route scope.

Navigation aborts the previous registration owner and its in-flight calls.
Changing filters or draft dosage does not re-register the route's tools.
Invalid/cross-client editor routes, the landing page and patient routes expose
no therapist tools. There is no confirmation, activation or destructive tool.

## Implemented patient session flow

The local patient link supports both camera and camera-independent completion:

- A confirmed program is snapshotted into ordered sets.
- Repetition exercises use manual counting; hold exercises use a visible timer.
- A therapist-confirmed Supported Half Squat can use browser-local camera
  sensing with its exact prescribed repetition target.
- Camera permission, Start and Stop remain explicit human controls, with a
  first-class manual fallback.
- A completed/stopped camera aggregate is persisted before an explicit RPE and
  pain check-in completes the set.
- Each state transition is validated and persisted before visible state changes.
- Pause, resume, skip, stop, RPE, and pain reporting are supported.
- A pain score of 5 or greater activates a non-overridable safety gate and
  stops the active set.
- Refresh restores a versioned, structurally validated session. An interrupted
  camera attempt returns safely to manual fallback instead of fabricating reps.
- A summary is created only after every set is completed, skipped, or stopped.
- `review_completed_set` becomes readable only after camera result persistence
  and check-in; active or staged sets expose no result.
- `stage_next_set_focus` can add one evidence-linked pending suggestion for the
  next same-exercise set using an exact session revision. The patient must
  accept or dismiss it visibly before that target set can start.
- Accepted focus text is displayed separately from prescription dosage and may
  appear over the next camera preview; it never changes the exercise, reps,
  rest, order or range.
- The therapist client hub reads the same validated envelope to show adherence,
  RPE/pain and the latest checked-in camera observations.
- `get_adherence_summary` exposes the same identity-free therapist read model
  without returning patient labels, codes, record IDs or raw session data.

No video, camera identifier, landmark, raw angle or per-repetition time series
is stored in the patient session.

## Isolated motion lab

`/motion-lab` contains the Phase 6 browser-local half-squat prototype:

- MediaPipe Tasks Vision 1.0.1 with self-hosted WASM and lite pose model
- GPU delegate with CPU fallback
- Automatic camera enumeration on page load, focus, visibility return and
  device changes without opening a stream or prompting for permission
- A visible selector with safe fallback names before permission, real labels
  after permission, and exact-device startup; there is no Find/Refresh control.
  When browser privacy hides the full list, the single primary action performs
  a one-time permission check, releases its temporary stream, and then lets the
  user choose before starting the set
- `devicechange`, Stop, failed-start, disconnected-track, and unmount cleanup
  that stop the active tracks and browser-local processing
- Side selection from hip, knee, and ankle landmark visibility, with hysteresis
  to avoid rapid left/right switching
- Knee-angle calculation and stable-frame rep state machine
- A reusable pure `HalfSquatSetRunner` that owns target completion,
  tracking-loss reset and coarse events without camera, React, storage, patient
  or agent dependencies
- Tracking-loss reset that discards an incomplete repetition while preserving
  already completed repetition records
- A six-repetition camera demo target that ends the set automatically, releases
  the stream, and creates the browser-derived summary
- Per-repetition minimum angle, range, duration, and limited-depth flag
- A clearly labeled detected-repetition window from the first accepted rep to
  the final accepted rep; it is not presented as total set duration
- Set-level range-decline summary
- A shared, allowlisted `MotionSetAggregate` used by the Motion Lab WebMCP
  projection and ready for a future therapist-confirmed patient target
- A deterministic three-repetition fixture retained for unit and CI checks, not
  exposed as a production UI control
- Camera mode with skeleton overlay, an immediate local earcon for an accepted
  repetition, and opt-in English speech reserved for set milestones rather
  than queued once per repetition
- Restrained user-adjustable speech volume, ranked natural-voice selection,
  and an explicit voice preview
- Raw video and raw landmark frames are never saved in the summary

The current automated suite baseline is 235 passing tests, and the deterministic
fixture plus model loading pass headless Chromium. These software checks do not
mean that a physical camera has passed. A user-assisted device, cleanup,
tracking-loss, and 5–8 repetition accuracy run remains a release gate. Per the
current development decision, OBS is used for provisional integration while
physical-device validation is deferred. Follow the
[Motion Lab camera acceptance checklist](./docs/motion-lab-camera-acceptance.md).

### Motion coaching architecture

Motion Lab intentionally separates three timing layers:

1. The **browser reflex layer** runs MediaPipe, angle calculation, counting,
   tracking-loss and Stop behavior, visual feedback, and the rep
   earcon without waiting for an agent or speech synthesis.
2. The **browser event-cue layer** may speak short English milestones such as
   halfway, last repetition, and set complete. It does not narrate every rep.
   The current audio coordinator is armed only by a user gesture, plays earcons
   without a queue, replaces stale milestone speech, and invalidates delayed
   work from an older set generation. Persistent quality coaching will add
   priority, expiry, deduplication, and per-cue cooldowns.
3. The **WebMCP cognitive layer** interprets a fixed aggregate only after a set
   ends and the user asks how they did. It has no live session-state or
   repetition-monitoring surface, never receives frames or raw landmarks, and
   cannot start the camera, recommend deeper range, or change dosage.

The standalone checkpoint exposes only
`get_latest_motion_lab_set_result`. The canonical patient route now exposes
`review_completed_set` after persistence and explicit check-in plus the
revision-guarded `stage_next_set_focus`. Future work may add
`prepare_motion_session`, with an optional terminal-only `end_motion_session`.
There will be no WebMCP motion-monitoring tool during an active set.

The first read-only contract checkpoint is implemented on `/motion-lab` as
`get_latest_motion_lab_set_result`. Before a result exists it returns a
recoverable `result_unavailable` response instead of exposing live state. Its
target is explicitly labeled `source: "isolated_demo"`; it is not presented as
a therapist-confirmed patient set. The remaining cognitive tools stay gated on
patient-route persistence, pain/RPE check-in, and immutable aggregate results.

After completing a Motion Lab set, ask the browser agent:

> How did I do in that set? Use `get_latest_motion_lab_set_result` and explain
> the result in plain language.

## Suggested site-tools prompt

The dashboard can answer "Which synthetic clients need review?" using
`list_clients`. Open a client to read `get_client_summary`, then use **New
prescription** or **Continue draft** to enter that client's editor.

In the shoulder editor:

> Shoulder impingement, six weeks post-op, 15 minutes per day. Search the
> catalog for assisted shoulder mobility using a stick, inspect suitable
> options, read the current draft revision, then create a two-exercise draft
> for my review. Use only synthetic
> case information and the week-six demo protocol shown on the page.

## Development

```bash
npm install
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

The development server uses `http://localhost:4100`.

Open `/therapist` in the latest ChatGPT/Codex built-in browser or in a supported
Chrome build with WebMCP enabled. In a browser without WebMCP, the complete
manual therapist workflow remains available.

## Verification snapshot

The current therapist checkpoint has passed:

- Domain and WebMCP contract tests
- TypeScript and ESLint
- Next.js production build
- npm production dependency audit
- Headless runtime, network, image, layout, and basic accessibility checks
- Manual add, edit/reorder, confirm, patient-link, and local persistence probes
- Native Codex in-app Browser discovery and invocation of the route-owned tools;
  eleven tools are now implemented across five surfaces
- Route cleanup showing no WebMCP tools on the landing page
- Same-browser therapist confirmation through patient-session completion
- Patient pain-gate and in-app Browser refresh-recovery probes
- Motion-engine unit tests, deterministic three-repetition browser replay, and
  self-hosted MediaPipe GPU runtime/model load
- Permission-first camera-domain, exact-device constraint, device fallback,
  tracking-loss reset, side-hysteresis, and terminal-only result-tool tests;
  `npm test` currently reports 235 passing tests
- Native post-set Motion Lab WebMCP verification: pre-set reads return
  `result_unavailable`, while a fresh 6/6 OBS demo result is available only
  after completion with no raw frames, landmarks, or time series
- Patient camera controller, confirmed-target matching, awaiting-check-in,
  pain/Stop race, versioned storage, patient `review_completed_set`, and
  therapist adherence projection contract tests
- Complete therapist-confirmed OBS golden path: 8/8 patient camera set,
  persisted RPE/pain, agent review and therapist 1/2 adherence readback; see
  [Patient OBS golden-path evidence](./docs/patient-obs-golden-path.md)
- Conflict-safe session revisions, append-only coaching focus history, human
  Accept/Dismiss gating, legacy storage normalization, and identity-free
  therapist `get_adherence_summary` tests
- Phase 4.5: three consecutive isolated, native-WebMCP workflows on one
  production build, with simulated therapist UI edits/confirmation, immutable
  patient links, client isolation, reload and back/forward recovery

See [Phase 4.5 acceptance evidence](./docs/phase-4.5-acceptance.md). These are
synthetic software acceptance tests, not clinician sign-off or deployed-origin
verification. The ordinary-browser check also confirms manual mode without WebMCP.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/domain/` | Curated catalog, safety boundaries, duration and draft validation. |
| `src/domain/caseload-views.ts` | Shared UI selectors and allowlisted read-tool projections. |
| `src/components/therapist/` | Manual shared therapist workspace. |
| `src/lib/webmcp/` | Direct registration, schemas, execution boundaries, React lifecycle. |
| `src/lib/caseloadStorage.ts` | V2 client/program persistence, migration and immutable versions. |
| `src/lib/therapistStorage.ts` | Legacy compatibility and same-browser patient version lookup. |
| `src/lib/patientStorage.ts` | Versioned, route-bound patient session validation, V1 migration and clone-safe persistence. |
| `src/motion/` | Browser-local camera discovery, pose analysis and half-squat state machine. |
| `tests/` | Deterministic domain and WebMCP contract tests. |

## Challenge provenance

See [`CHALLENGE_WORK.md`](./CHALLENGE_WORK.md) for the boundary between the
pre-existing Crosspoint exercise library and new WebMCP Challenge work.

## Safety

This competition project uses synthetic cases and is for educational
demonstration only. It does not diagnose conditions or replace instructions
from a qualified clinician.

Post-operative cases require therapist-entered procedure and protocol context.
The curated catalog is marked `demo-only`, and the agent cannot confirm a
prescription.

## Remaining external-release gates

- Confirm a public reuse license for the Crosspoint exercise illustrations, or
  replace them with original skeleton SVGs.
- Create the public repository and HTTPS deployment.
- Verify the deployed origin in both the built-in browser and WebMCP-enabled
  Chrome before submission.
- Complete and record the user-assisted real-camera Motion Lab acceptance gate.
