# CoachPoint WebMCP Challenge — Phase-based Implementation Plan

> Status: Approved implementation direction
> Last updated: 2026-09-01 (Asia/Taipei)
> Related source: [`webmcp-challenge-spec.md`](./webmcp-challenge-spec.md)
> Reusable source project: `/Users/tywang/Documents/AI/pt`

## 0. Implementation Status

Updated after the first implementation checkpoint on 2026-08-28:

- **Phase 0 — locally complete.** A separate Next.js 16.3.3 competition
  project, MIT license, asset-license boundary, challenge provenance, direct
  WebMCP adapter, landing page, therapist route, and patient route are
  implemented. The npm production audit reports zero vulnerabilities.
- **Phase 1 — complete.** Fifteen demo-only exercises, structured filters,
  post-operative clarification, dosage boundaries, duration estimation,
  draft validation, human-only confirmation, and deterministic tests are
  implemented.
- **Phase 2 — complete for the therapist gate.** The manual UI supports case
  context, catalog search, details, adding/removing exercises, dosage editing,
  drag ordering, keyboard-accessible reordering, duration/warnings, explicit
  confirmation, patient links, activity attribution, reset, and browser
  persistence.
- **Phase 3 — complete and route-scoped to the editor.**
  `search_exercises`, `get_exercise_details`, `get_program_editor_state`, and
  revision-guarded `draft_program` register directly on a valid program-editor
  route with awaited registration and AbortController cleanup. Native Codex
  in-app Browser calls successfully update and durably persist the shared UI.
- **Phase 4 — original single-workspace functional gate passed.**
  Unit/contract tests, typecheck, lint, production build, headless browser
  checks, manual workflow probes, native in-app Browser
  discovery/invocation, and route cleanup all pass for the original
  `/therapist` workspace.
- **Phase 4 external-release items remain:** confirm the public license for the
  reused exercise illustrations, create the public remote repository, deploy
  to HTTPS, and repeat browser verification on the deployed origin.
- **Phase 4.5A–D — local software acceptance passed.** The browser-local
  V2 synthetic caseload, deterministic V1 migration, three-client dashboard,
  client program hub, immutable confirmed-version history, and client/program
  scoped editor routes are implemented. Dashboard `list_clients` and
  client-detail `get_client_summary` consume the same visible, hydrated
  projections as the UI. Ninety tests, typecheck, lint, production build,
  mobile/manual-mode checks and three isolated native-WebMCP workflows pass.
  The three-run gate used simulated therapist UI confirmation, not an agent
  confirmation tool or real clinical care. Deployed HTTPS and clinician
  acceptance remain external gates. Evidence: [Phase 4.5 acceptance](./docs/phase-4.5-acceptance.md).
- **Homepage refinement — complete locally (2026-08-31).** The English
  homepage follows the PT `hep` branch's illustration-first marketing style,
  with a working movement-preview gallery, workflow explanation and honest
  browser-local demo FAQ. Competition hyperlinks are removed entirely from
  public chrome, including the footer. Ninety-two tests and responsive/browser
  QA pass. Source tokens and visual evidence are recorded in
  `docs/design/pt-hep/` and `design-qa.md`. That count records the homepage
  checkpoint; the current suite baseline is 217 tests after camera, audio,
  reusable runner/aggregate extraction, patient persistence/WebMCP, and the
  therapist feedback projection.
- **Phase 5 — complete locally.** Confirmed programs open in the same browser,
  create a versioned patient session, support timer/manual sets, pause/resume,
  skip, stop, RPE, pain reporting, a pain safety gate at 5/10, per-transition
  persistence, completion summaries, and refresh recovery. The complete
  therapist-to-patient fallback flow and pain gate pass real browser probes.
- **Phase 6 — core implementation complete; user-assisted camera/audio
  acceptance pending.**
  MediaPipe 1.0.1, its self-hosted WASM runtime, and the lite pose model are
  included. The Motion Lab implements side selection, knee-angle calculation,
  stable-frame debouncing, half-squat phases, per-repetition metrics, quality
  flags, set summaries, a test-only deterministic fixture, skeleton overlay,
  GPU-to-CPU runtime fallback, and no-raw-frame retention. The page enumerates
  cameras automatically without opening a stream. When browser privacy hides
  the full list, the single primary action performs a one-time permission check
  and releases its temporary stream before set startup. It supports selectable
  devices, exact device constraints, device-change/disconnect handling, and
  Stop/unmount stream cleanup. The standalone camera demo now has an explicit
  six-rep target that
  auto-completes and releases the stream. Tracking loss resets an incomplete
  repetition and side selection uses visibility hysteresis to avoid
  frame-to-frame oscillation.
  Audio coaching is opt-in and English-only. Repetition completion belongs to
  the browser reflex path and uses an immediate, non-verbal earcon; speech is
  reserved for a few set milestones rather than queued once per repetition.
  Natural voices rank ahead of novelty voices, an explicit voice choice is
  persisted, and a preview is available. The current 217-test suite passes; the
  test fixture counts three repetitions and the self-hosted GPU runtime/model
  loads in headless Chromium. This is a software baseline, not real-camera
  acceptance. By explicit user decision, OBS is the provisional integration
  device and patient-route development may proceed; physical-camera validation
  remains a release gate rather than a development blocker. See
  [Motion Lab camera acceptance](./docs/motion-lab-camera-acceptance.md).
- **Phase 7 isolated contract checkpoint — locally verified.** Motion Lab exposes one
  route-scoped, read-only `get_latest_motion_lab_set_result` tool backed by a
  terminal-only allowlisted projection. It refuses to expose live session state
  and becomes readable only after a completed or stopped set has an aggregate.
  It is explicitly labeled `isolated_demo` and returns no frames, landmarks,
  raw angles, per-repetition time series, camera details, identity, or PII. All
  canonical patient-route cognitive tools remain behind the standalone
  physical-camera motion-engine gate. Native in-app Browser verification covers
  both pre-set `result_unavailable` and a fresh 6/6 terminal aggregate.
- **Phase 7 patient camera and post-set read — implemented locally.** A
  therapist-confirmed half-squat set uses the reusable camera controller with
  an exact prescribed target and explicit human prepare/start/Stop controls.
  A sanitized aggregate is persisted into `awaiting_check_in`, then explicit
  RPE/pain completes the set through the same immutable domain operations used
  by the UI. `review_completed_set` returns only the latest persisted checked-in
  result and is unavailable during active sensing or staged check-in. Patient
  storage uses a versioned structural guard and V1 migration; the therapist
  client hub reads the same envelope for adherence and latest observations.
- **Phase 7 next-set focus — implemented locally.** Patient sessions carry a
  monotonic transition revision and append-only coaching-focus history.
  `stage_next_set_focus` requires the exact revision and supported evidence from
  the latest checked-in set, stages only visible pending text, and cannot change
  dosage. The target set is blocked until the patient accepts or dismisses the
  suggestion; accepted text is shown separately in setup and camera preview.
- **Phase 8 adherence read — implemented locally.** The client hub registers
  identity-free `get_adherence_summary`, returning validated progress,
  aggregate RPE/pain, bounded deviations and the existing safe motion review.
  It cannot diagnose or modify the prescription or patient session.

## 1. Confirmed Product Direction

CoachPoint is an agent-native home exercise program (HEP) platform with two primary workflows.

### Therapist workflow

A therapist describes a case to an agent, for example:

> Shoulder impingement, six weeks post-op, with 15 minutes available each day.

The agent uses WebMCP tools to search the exercise catalog, inspect structured exercise details, and create a visible program draft. The therapist reviews the draft in the UI, changes dosage and ordering, and explicitly confirms the final prescription.

The division of responsibility is intentional:

- The agent handles search, comparison, time estimation, and draft assembly.
- The therapist retains clinical judgment and final confirmation authority.
- The agent cannot activate or confirm a prescription.

### Patient workflow

The patient opens their program page and grants camera access. MediaPipe
processes the pose locally in the browser. The page counts repetitions,
evaluates configured movement rules, displays the skeleton overlay, and owns
all time-critical feedback: immediate visual state, a short local earcon for a
completed repetition, and optional English speech only at set milestones.

The browser handles the active set without an agent in the loop. After the set
ends, the patient can ask the agent how it went; WebMCP then returns one concise
browser-derived aggregate for interpretation. Future patient-route tools may
stage a visible coaching focus for the next set, but the agent does not start
the camera, monitor repetitions, poll frames, speak on each repetition, advise
deeper range without a therapist-approved target, or autonomously change the
confirmed dosage. Any staged change remains a human-reviewed UI action.

The patient workflow is the main WebMCP differentiator because the relevant live page state and locally derived motion metrics exist inside the browser. Raw video is not uploaded or exposed to the agent.

## 2. Confirmed Implementation Order

The original therapist gate preceded the completed patient fallback and motion
engine work. For all remaining work, the new Phase 4.5 hub gate must pass
before patient WebMCP, the therapist-patient feedback loop, or release.

```text
Data and safety boundaries
→ Therapist manual UI
→ Therapist WebMCP workflow
→ Original therapist acceptance gate
→ Synthetic caseload and program hub
→ Reopened therapist acceptance gate
→ Patient session foundation
→ MediaPipe motion engine
→ Patient WebMCP workflow
→ Therapist-patient feedback loop
→ Competition hardening and submission
```

This ordering keeps the therapist-side product and its authority boundaries
stable before the patient cognitive layer and release. The already completed
patient fallback and motion-engine foundations remain intact; Phase 4.5 is now
locally verified, with its deployed-origin gate still pending.

## 3. Architectural Principle: Reflex, Event-Cue, and Cognitive Layers

WebMCP should not be treated as a high-frequency streaming transport. The
agent must not read joint angles on every camera frame or sit in the critical
path for counting, safety, or audio timing.

### Browser reflex layer

Runs at frame or near-frame speed:

- MediaPipe PoseLandmarker
- Landmark confidence and smoothing
- Joint-angle calculation
- Rep state machine
- Immediate safety and stop state
- Immediate on-screen feedback
- A short Web Audio earcon when a repetition is accepted

### Browser event-cue layer

Runs only when the reflex layer emits a meaningful event:

- Optional English speech at halfway, last repetition, and set completion;
  never one utterance for every repetition
- Low-frequency visual coaching for a persistent quality issue rather than
  narration of transient frame noise
- A user-gesture-armed audio coordinator that plays unqueued earcons, replaces
  stale milestone speech, and tags delayed work with a set-generation
  identifier so audio from a stopped or previous set cannot leak into the
  current one. Persistent quality coaching will add priority, expiry,
  deduplication, and per-cue cooldowns.
- Safety and Stop preempt lower-priority audio and remain locally enforceable
  even when speech synthesis is unavailable

### Agent cognitive layer

Runs after set and session boundaries, in response to the user:

- Read the confirmed prescription and a fixed derived result
- Prepare a visible, human-reviewed session setup without opening the camera
- Stay out of the active set; the user asks for review after it ends
- Interpret persisted set-level summaries
- Stage one visible next-set coaching focus for human acceptance
- Generate session and follow-up summaries without changing confirmed dosage

This separation is both more reliable and a stronger competition story than asking an agent to poll raw pose data continuously.

---

## Phase 0 — Competition Edition Foundation

### Goal

Create a clean, public-ready competition project containing only the required CoachPoint functionality.

### Implementation

- Create a separate Next.js 16 project in `/Users/tywang/Documents/AI/coachpoint` rather than changing the existing `pt` product directly.
- Selectively reuse approved material from `/Users/tywang/Documents/AI/pt`:
  - Design tokens and visual rules
  - Exercise catalog data
  - Search logic
  - Selected UI patterns
  - Only the exercise images needed by the competition edition
- Add:
  - MIT `LICENSE` for code
  - `LICENSE-ASSETS.md` for approved reusable assets
  - `CHALLENGE_WORK.md` separating pre-existing work from work created during the challenge
- Establish the base routes:
  - `/`
  - `/therapist`
  - `/patient/[code]`
- Create a small direct WebMCP registration adapter using:
  - `document.modelContext.registerTool(...)`
  - Feature detection
  - Awaited tool registration
  - `AbortController` registration ownership and cleanup
  - `execute(input, { signal })`
  - Structured success and recoverable error results
  - A visible tool activity log in the UI
- Preserve a complete human-operable UI when WebMCP is unavailable.

### Completion gate

- Production build, lint, and base tests pass.
- A sample tool is discoverable in ChatGPT’s built-in browser and supported Chrome.
- Tool registration does not duplicate after refresh or React remount.
- Navigating away removes the page-specific tools without ghost registrations.

---

## Phase 1 — Therapist Data Model and Clinical Boundaries

### Goal

Build domain logic that supports a professional therapist workflow before building the interface.

### Exercise data model

Each curated exercise should contain at least:

- Stable public ID
- English and Chinese names
- Body region
- Movement goals
- Difficulty
- Patient position
- Required equipment
- Estimated duration
- Default sets, reps, hold duration, and frequency
- Precautions
- Contraindications
- Protocol or rehabilitation-phase tags
- Coaching mode: `camera` or `timer`
- Therapist review status

### Core domain models

- `Exercise`
- `CaseContext`
- `ProgramDraft`
- `ProgramItem`
- `ConfirmedProgram`
- `ProgramRevision`
- `AgentActivity`

### Domain services

- `searchExercises(filters)`
- `getExerciseDetails(id)`
- `validateCaseContext(context)`
- `validateDraft(items, constraints)`
- `estimateProgramDuration(items)`
- `createProgramDraft(context, items)`
- `confirmProgram(draftId)`

The UI and WebMCP tools must call these shared domain services. WebMCP must not introduce a second, less validated code path.

### Clinical and safety rules

- The agent may only select exercises and dosage ranges present in the curated catalog.
- The agent may not invent exercises, contraindications, protocols, or dosage.
- “Six weeks post-op” is insufficient by itself to determine a safe program. If the procedure or therapist-approved protocol is missing, the workflow returns `needs_clarification`.
- Every agent-created draft is visibly labeled `Agent draft — therapist review required`.
- Only the therapist-facing UI can confirm and activate the prescription.
- Competition data must use synthetic cases and anonymous labels, not real patient data.

### Completion gate

- Search, validation, time estimation, and drafting can be tested without React UI.
- Invalid exercise IDs, invalid dosage, excessive duration, and missing post-operative context produce clear recoverable errors.
- The example case can produce a useful candidate set without becoming an active prescription.

---

## Phase 2 — Therapist Manual UI

### Goal

Allow a therapist to complete the entire prescription workflow without an agent. The later WebMCP workflow will operate the same underlying product logic.

### Interface

- Exercise catalog with search and filters for:
  - Body region
  - Movement goal
  - Equipment
  - Phase or protocol
  - Difficulty
  - Estimated duration
- Program draft editor with:
  - Drag-and-drop ordering
  - Keyboard-accessible and up/down reorder fallback
  - Editable sets, reps, hold duration, and frequency
  - Total estimated daily duration
  - Precautions and contraindication notices
  - Missing-information warnings
- Explicit therapist confirmation button.
- Confirmation creates:
  - An immutable confirmed revision
  - A high-entropy anonymous patient code
  - A patient program URL
- Agent suggestions, therapist edits, and confirmed values remain distinguishable.

### Completion gate

- A therapist can go from a blank screen to a confirmed program and patient link using the UI alone.
- The interface makes the daily time constraint visible and enforceable.
- Refresh preserves confirmed programs.
- Validation errors and destructive actions are visible and understandable.
- The confirmation action cannot be triggered through WebMCP.

---

## Phase 3 — Therapist WebMCP Collaboration

### Goal

Implement the first complete competition-ready human-agent workflow.

### Initial therapist tools

#### `search_exercises`

- Read-only.
- Searches the curated catalog using structured filters.
- Returns a concise bounded result set.

#### `get_exercise_details`

- Read-only.
- Returns dosage defaults, phase tags, precautions, contraindications, estimated duration, and coaching mode.

#### `draft_program`

- Writes a visible draft into the therapist UI.
- Does not confirm or activate the program.
- Validates item IDs, dosage, duration, and required case context.

### Explicitly excluded at this phase

- `confirm_program`
- `update_draft_item`
- `get_adherence_summary`

Draft modification and final confirmation remain human UI actions. Adherence is added only after patient sessions create real data.

### Target interaction

1. The therapist provides the case description.
2. The agent requests missing procedure or protocol context when necessary.
3. The agent calls `search_exercises`.
4. The agent inspects selected exercises with `get_exercise_details`.
5. The agent calls `draft_program` with a program that fits the time constraint.
6. The draft appears immediately in the shared UI.
7. The therapist reorders items, changes dosage, and confirms the prescription.

### Visible activity trail

Examples:

- `Agent searched 6 exercises`
- `Agent reviewed 3 exercise details`
- `Agent drafted a 14-minute program`
- `Therapist changed 2 doses`
- `Therapist confirmed revision 2`

### Completion gate

- The primary case prompt produces a visible draft from a fresh reload.
- Missing clinical context results in a clarification instead of an unsafe guess.
- Agent tool output and visible UI state always agree.
- Tool selection, schemas, and recovery behavior are tested with at least three distinct synthetic cases.
- The complete workflow succeeds three consecutive times without developer intervention.
- The agent cannot bypass therapist confirmation.

---

## Phase 4 — Therapist Acceptance Gate

### Goal

Stabilize the therapist experience before any MediaPipe implementation begins.

### Required hardening

- Anonymous demo persistence
- An immutable or resettable seed case
- Manual fallback when WebMCP is unavailable
- English-first judge-facing interface
- Suggested prompts and first-run instructions
- Schema validation tests
- Tool lifecycle and route navigation tests
- Fresh reload tests
- Data-minimization review
- HTTPS preview deployment
- Therapist testing instructions in the README

### Acceptance statement

The therapist can describe a synthetic case in one message, the agent can create a visible and reviewable program draft, and the therapist can modify and explicitly confirm it to obtain a usable patient link.

This original single-workspace statement remains the baseline. Once the
caseload hub is introduced, the expanded Phase 4.5 gate below must pass before
patient WebMCP, therapist-patient feedback, or the competition release may
advance.

---

## Phase 4.5 — Synthetic Caseload & Program Hub

### Goal

Evolve the single synthetic therapist workspace into a small, durable
browser-local caseload and program hub without adding authentication, real
patient PII, or autonomous clinical authority.

This phase is an information-architecture and persistence hardening step. It
does not expand the catalog, diagnose conditions, create real clinician or
patient accounts, or allow an agent to confirm a prescription.

### Routes and manual workflow

- `/therapist` becomes the synthetic caseload dashboard.
  - Lists a bounded set of anonymous demo clients.
  - Shows the active-program state and concise visible follow-up flags.
  - Links to client detail and new-program entry points.
- `/therapist/clients/[clientId]` becomes the client detail route.
  - Shows the therapist-supplied case context.
  - Shows the active confirmed program and immutable version history.
  - Shows only session or adherence summaries that already exist and can be
    verified in the visible UI.
- `/therapist/clients/[clientId]/programs/[programId]` becomes the program editor.
  - Reuses the validated catalog search, details, draft validation, dosage,
    ordering, duration, warning, and manual confirmation operations.
  - Supports a visible agent-created draft and subsequent therapist edits.
  - Keeps the final confirmation control in the therapist UI only.

All three routes must remain fully usable without WebMCP. The route parameter
uses a stable synthetic `clientId`; it is not a patient link code and must not
contain real identity data.

### Versioned persistence

Replace the single-workspace v1 shape with a versioned v2 therapist store that
can represent:

- Synthetic clients keyed by stable `clientId`
- At most one current editable draft per client
- Immutable confirmed programs keyed by patient program code
- Each client's ordered confirmed-version history and `activeProgramCode`
- Client-scoped, bounded activity attribution

The URL alone owns the selected client and editor context. The V2
`activeClientId`/`activeProgramId` fields are retained as legacy compatibility
metadata, not UI/tool selection authority. Active confirmed versions are
resolved per client by the shared deterministic confirmation-time selector.

Confirmation creates a new immutable confirmed version and a new patient
program code. Older confirmed versions and their patient links remain readable
for historical integrity, while the client record points to the new active
version. A later revision must not mutate the confirmed-program snapshot used
by an existing patient session.

Implement a one-time, idempotent v1-to-v2 migration. The former workspace is
imported as one synthetic client, existing confirmed programs remain readable,
and repeated reads do not duplicate clients, drafts, programs, or activities.
Corrupt or orphaned nested records fail closed and remain resettable to the
documented synthetic seed.

Tool-backed writes must validate and persist before returning success. They
must not rely only on a later React persistence effect, because an agent may
navigate immediately after a successful call. A failed write must not advance
an active-program pointer or show a successful confirmation state.

### Minimal route-scoped WebMCP tools

Register tools only from the leaf route that owns their visible context. Do
not register a persistent therapist tool set from a shared layout.

#### Dashboard: `/therapist`

- `list_clients`
  - Read-only and bounded.
  - Accepts `{}` only and follows the currently visible search/status filters.
  - Returns at most three synthetic client rows and the visible aggregate counts.
  - Returns only the anonymous labels, active-program status, concise visible
    follow-up flags, and route identifiers represented on the dashboard.

#### Client detail: `/therapist/clients/[clientId]`

- `get_client_summary`
  - Read-only.
  - Accepts `{}` only; arbitrary client/program identifiers are rejected.
  - Returns the visible case context, active confirmed version, immutable
    program history, and only currently implemented, visible session facts.
  - History is capped at 20 concise rows with total/truncation metadata;
    recent activity is capped at the five visible rows. Raw dosage/items and
    unseen historical notes are excluded. No session/adherence aggregate is
    returned until one exists in this UI.
  - Patient-entered notes, skip reasons, and similar fields remain untrusted
    content.

#### Program editor: `/therapist/clients/[clientId]/programs/[programId]`

- `get_program_editor_state`
  - Read-only.
  - Returns the route-bound client context, time constraint, current draft
    revision, and active confirmed-version summary.
- `search_exercises`
  - Retains the existing bounded, read-only catalog search contract.
- `get_exercise_details`
  - Retains the existing read-only safety and dosage detail contract.
- `draft_program`
  - Writes a visible, validated draft only.
  - Is bound to the client loaded by the route rather than accepting an
    arbitrary target client.
  - Requires the expected draft revision so a stale agent call cannot silently
    overwrite newer therapist edits.
  - Returns `awaiting_therapist_review` and never confirms, activates, or
    publishes a prescription.

Do not add `confirm_program`, `activate_program`, `publish_program`,
`update_draft_item`, destructive client tools, or navigation-only tools in this
phase. `get_adherence_summary` was added later in Phase 8 only after real,
visible, aggregated session data existed.

Each route owns one awaited registration controller. Navigating, refreshing,
using browser back/forward, switching clients, or remounting must abort the old
controller before the next route's exact tool set becomes active. Draft edits
must not cause repeated unregister/register churn.

### Verification

- Contract tests assert the exact tool names, annotations, fully described
  schemas, bounded results, and recoverable errors for each route.
- Lifecycle tests cover dashboard → client A → editor A → client B →
  landing, including rapid navigation, cancellation, remount, refresh, and
  browser back/forward with no duplicate or ghost tools.
- A cancelled or stale `draft_program` call cannot persist a partial or
  cross-client update.
- Persistence tests cover v2 round trips, client isolation, immutable version
  history, old patient links, draft refresh recovery, nested corruption,
  storage failure, and idempotent v1 migration.
- The existing domain rejection for an agent confirmation attempt remains in
  place, and no confirmation-capable WebMCP or declarative form tool exists on
  any therapist route.
- All visible summaries and tool results use the same stored domain operations
  and agree after fresh reload and deep-link entry.

### Reopened acceptance gate

From a documented synthetic seed, a therapist can open the dashboard, choose a
client, enter the program editor, and collaborate with an agent to create a
visible draft. The therapist can then modify and explicitly confirm that draft
through the UI, return to client detail or the dashboard, and see the new
immutable active version while the prior patient link remains readable.

This complete multi-route workflow must succeed three consecutive times from
a fresh browser state. At every step, only the current route's minimal tools
are registered, client A operations cannot affect client B, refresh and deep
links preserve the correct data, and the agent cannot bypass therapist
confirmation. Repeat the same gate on the deployed HTTPS origin before
release.

### Local gate result — 2026-08-31

Three sequential runs passed against production build
`rZG2TXCMVZTwzvGicjIA7` on isolated loopback origins: shoulder, knee and balance.
Each used the native in-app Browser WebMCP transport, then simulated therapist
UI dosage/order edits and two confirmations. Fresh reload, client isolation,
old/new patient-link immutability, history, back/forward and route cleanup
passed. Run 3 refreshed two stale read handles after document/route changes;
no write or confirmation was replayed. Pending-registration and in-flight
cancellation are additionally covered by deterministic lifecycle tests.

See [the acceptance report](./docs/phase-4.5-acceptance.md) for evidence,
reproduction steps, manual-mode results and the remaining external gates.

---

## Phase 5 — Patient Session Foundation Without Camera

### Goal

Build the patient session state, persistence, pain, and recovery paths before adding motion detection.

### Implementation

- Load a confirmed prescription by anonymous patient code.
- Display today’s exercise list and progress.
- Support timer and manual-completion exercise modes.
- Provide Start, Pause, Stop, and Resume controls.
- Collect optional RPE and pain reports.
- Persist each completed set immediately rather than waiting for the final agent summary.
- Recover the current session after refresh or tool cancellation.
- Lock or pause further exercise when the configured pain threshold is reached.
- Preserve the complete workflow when camera access is denied.

### Completion gate

- A patient can complete a whole session without camera access.
- Refresh does not erase completed sets.
- Stop and pain controls always override agent suggestions or tool activity.
- Partial, skipped, and stopped sets are distinguishable in stored results.

---

## Phase 6 — Standalone Motion Engine

### Goal

Validate MediaPipe and the hero movement independently from WebMCP and agent behavior.

### P0 movement

- Test half squat first, using a side or oblique camera orientation.
- If normal laptop-camera conditions are not reliable, switch the hero movement to an upper-body shoulder movement that fits more easily within the camera frame.

### Motion modules

- Automatic non-streaming camera enumeration and one-time permission setup
- Selectable labeled devices and exact-device startup
- Device-change, Stop, disconnected-track, and unmount stream cleanup
- MediaPipe PoseLandmarker
- Skeleton overlay
- Landmark presence and visibility thresholds
- Smoothing, side-selection hysteresis, and tracking-loss reset
- Joint-angle calculation
- Configurable two-threshold rep state machine
- Pure configurable set runner with target completion, coarse tracking events,
  terminal no-op behavior and no camera/React/patient/WebMCP dependencies
- Quality flags
- On-screen cues
- Immediate local repetition earcon
- Opt-in English milestone speech with voice preview and volume control; no
  per-repetition TTS and no agent-authored speech during an active set
- Audio coordination with immediate unqueued earcons, latest-wins milestone
  speech, safe cancellation/close, and set-generation invalidation; persistent
  quality cues will add priority, expiry, deduplication, and cooldown
- Deterministic motion fixture for tests only; no production replay control
- Allowlisted motion-set aggregate shared by human UI and WebMCP projections;
  no frames, landmarks or per-repetition records

Do not build a general expression or detection DSL in this phase. Use a typed detector configuration. Generalize only when a second real movement proves which abstractions are shared.

### Completion gate

- A 5–8 repetition set reaches at least 90% counting accuracy in the defined setup.
- No more than one false repetition occurs per set.
- Low confidence, missing landmarks, or the person leaving the frame does not increment the counter.
- The repetition earcon is immediate and does not wait for speech synthesis.
- Spoken cues occur only at defined milestones, remain short and English-only,
  and stale or duplicate cues do not play after Stop or set completion.
- Raw camera frames do not leave the browser.

The deterministic and camera-domain portions of this gate are covered by the
current 217-test software baseline. Physical-device behavior and counting
accuracy are still pending and must be recorded with the
[user-assisted acceptance checklist](./docs/motion-lab-camera-acceptance.md);
do not treat automated tests or headless model loading as a real-camera pass.

---

## Phase 7 — Patient WebMCP Cognitive Layer

### Goal

Connect the stable patient session and motion engine to an event- and
set-boundary agent layer without placing WebMCP in the real-time motion loop.

### Read-only contract checkpoint

The standalone `/motion-lab` route currently registers only
`get_latest_motion_lab_set_result` to validate lifecycle, cancellation, strict
empty input, output cloning, terminal-result availability, interpretation
boundaries, and privacy allowlisting. Before or during a set it returns a
recoverable `result_unavailable` error instead of live reps, phase, or tracking
state. The tool marks its target as `source: "isolated_demo"` and cannot be used
as a therapist-confirmed patient result. The canonical
`review_completed_set` tool now lives on `/patient/[code]` after motion
aggregates, explicit pain/RPE check-in and storage guards were implemented.
Conflict-safe agent write tools remain deferred.

#### Standalone checkpoint behavior

- Read-only and annotated with `readOnlyHint: true`.
- Available only after a completed or stopped set has an aggregate and the user
  requests a review; it is not a monitoring or waiting tool.
- Returns the route-owned target, actual result, detected repetition window,
  camera-derived range aggregates, quality-event labels, measurement
  limitations, privacy boundary, and agent authority constraints.
- Returns concise allowlisted fields only. It exposes no video frames, images,
  raw landmarks, raw per-frame angles, patient identifiers, or free-form PII.
- It refuses calls during an active set with `result_unavailable`. The agent
  must not poll or retry until the user says the set has ended.
- The agent may explain observations but may not diagnose, recommend deeper
  range without a therapist-approved target, or change dosage.

### Preferred patient tools

#### `prepare_motion_session`

- Available only while the page is idle and a confirmed exercise target exists.
- Stages the confirmed target and one coaching focus in a visible preparation
  panel for human review.
- It cannot request camera permission, start a set, change dosage, bypass pain,
  or dismiss Stop state.
- The human starts the camera set from the UI after accepting the preparation.

#### `review_completed_set`

- Read-only and annotated with `readOnlyHint: true`.
- Implemented on valid patient routes and available only after the browser has
  persisted a completed or stopped camera result plus explicit RPE/pain.
- Returns a concise derived summary: confirmed target, actual result, true set
  duration, detector repetition window, range aggregates, quality labels, RPE,
  pain, stop reason and continuation safety state.
- It exposes no frames, raw landmarks, raw time series, or PII.
- It is annotated `untrustedContentHint: true` because a bounded stop reason may
  contain patient-entered text.

#### `stage_next_set_focus`

- Implemented and available only after a set result has been persisted and no
  pain/stop gate prevents continuation.
- Stages one short, evidence-linked coaching focus in the visible UI for human
  acceptance or rejection.
- Requires the exact `sessionRevision` returned by `review_completed_set`; every
  successful state mutation increments the revision once.
- It cannot alter repetitions, duration, rest, exercise order, or any other
  therapist-confirmed dosage field.
- Focus history is append-only. Pending blocks the target set until the human
  accepts or dismisses it; accepted text is recorded separately from the
  prescription and actual performance.

#### Optional `end_motion_session`

- Consider only if user testing shows that the existing manual completion UI is
  insufficient.
- Register it only when every set is terminal. It may stage a visible summary
  for review, but cannot stop an active set, discard results, or silently finish
  the session without human acceptance.

All tools handle the WebMCP execution `AbortSignal` and reuse the same validated
domain operations as the human UI.

### State-dependent registration

- The standalone route may keep `get_latest_motion_lab_set_result` registered
  for one stable route lifecycle, but it returns `result_unavailable` while idle
  or running and never exposes live values.
- **Idle / ready:** the valid patient route keeps `review_completed_set` and
  `stage_next_set_focus` registered; both fail closed without eligible state.
  `prepare_motion_session` remains future.
- **Set running / awaiting check-in:** review and focus staging remain
  unavailable; neither tool exposes a start, frame, landmark, angle, counter,
  cue, or safety mutation.
- **Standalone set terminal:** `get_latest_motion_lab_set_result` becomes
  readable.
- **Canonical patient set terminal:** `review_completed_set` becomes readable
  after persisted check-in; `stage_next_set_focus` may stage one pending focus
  only when safety and a same-exercise next set permit it.
- **Session terminal:** the read tools and optional `end_motion_session`

Registration changes must use one route owner with AbortController cleanup.
The surface stays small so overlapping tools do not make agent selection less
reliable.

### Set result contract

- Therapist-confirmed target
- Human-accepted preparation or coaching focus, when present
- Completed repetitions or duration
- Set duration
- Range-of-motion summary
- Tempo and consistency summary
- Range decline
- Quality-event counts
- Tracking-loss count
- RPE
- Pain
- Stop reason

### Authority rules

- Counting, cue timing, tracking-loss handling, pain, and Stop remain local.
- The agent may explain a completed result and stage a next-set coaching focus.
- The agent may not autonomously change repetitions, duration, rest, exercise
  order, skip state, or any therapist-confirmed dosage.
- No tool may request camera permission or start camera capture.
- A staged focus is visibly labeled, requires human acceptance, and is stored
  separately from the confirmed prescription and actual result.
- Pain and Stop gates prevent continuation tools from registering and cannot be
  overridden by agent text or tool input.

### Completion gate

After a completed set, the agent must use its derived metrics to explain one
material observation and stage one evidence-linked focus for the next set. The
user must be able to accept or reject that focus visibly. The demo must show
that no camera permission, real-time counter, safety gate, or confirmed dosage
depends on the agent.

---

## Phase 8 — Therapist-Patient Feedback Loop

### Goal

Close the prescription, execution, and follow-up loop using actual stored patient session data.

### Aggregated data

- Completion rate
- Prescribed versus attempted versus completed dosage
- Agent-proposed coaching focus and human acceptance state
- Pain trend
- Quality flags
- Skipped and stopped exercises
- Session summaries

### Therapist addition

The read-only `get_adherence_summary` tool is implemented after real session
data became available. It reuses the same safe persisted-motion projection and
adds only bounded adherence and deviation fields.

The therapist UI must preserve and display four distinct sources:

- Therapist-confirmed prescription
- Agent coaching suggestion and human acceptance
- Patient actual performance
- Reason for a skip, stop, or deviation

### Completion gate

The therapist-side agent can generate a follow-up summary from actual patient sessions, and every number or claim in that summary can be verified in the visible therapist UI.

---

## Phase 9 — Competition Hardening and Submission

### Product verification

- ChatGPT built-in browser with a WebMCP-enabled supported model
- Chrome 149+ with WebMCP enabled
- Fresh reload
- SPA route navigation
- Tool registration and cleanup
- Consecutive tool calls
- Recoverable validation failure
- Tool cancellation
- Camera permission denial
- Low-confidence pose
- TTS failure
- Storage or network failure
- Deterministic judge demo mode

### Privacy and safety verification

- Raw video is not uploaded.
- Only aggregate motion results are persisted.
- No real patient PII is used.
- Tool inputs request only necessary context.
- Read-only tools use `readOnlyHint`.
- Outputs containing patient-entered notes or reasons use `untrustedContentHint`.
- Pain and stop gates cannot be bypassed.

### Submission package

- Working HTTPS live URL
- Public repository
- Detectable MIT license
- Asset license documentation
- Complete setup and testing instructions
- `CHALLENGE_WORK.md`
- English project description
- Public YouTube demo under three minutes with audio
- Demo visibly showing:
  1. Agent search and visible therapist draft
  2. Therapist edit and confirmation
  3. Browser-led motion sensing
  4. Agent interpretation and a human-reviewed next-set focus based on actual
     set data
  5. Therapist follow-up summary

### Completion gate

- The complete golden path succeeds three consecutive times from a fresh browser state.
- The submitted repository, site, and video contain no unlicensed third-party assets or trademarks.
- The submitted version is frozen during judging; continued work happens in a separate fork.

---

## 4. P0 Scope

The minimum complete competition product includes:

- Curated exercise catalog with structured safety metadata
- Browser-local synthetic caseload dashboard and client detail
- Therapist manual search and route-scoped program editor
- Therapist WebMCP search, details, and draft tools
- Explicit human confirmation
- Anonymous patient link
- Patient timer fallback
- One stable camera-tracked movement
- Immediate browser-side counting and cues
- Agent set-level interpretation and a visible, human-reviewed next-set focus
- Pain and stop gates
- Per-set persistence
- Therapist adherence summary from real session data
- Public live app, repository, license, README, and demo video

## 5. Explicitly Deferred

Do not start these until the complete golden path is stable:

- A second through fifth camera detector
- A general detection DSL
- Authentication, login, full clinician/patient member accounts, and
  multi-user account management; Phase 4.5 remains a browser-local synthetic
  caseload only
- Real patient PII
- Autonomous diagnosis
- A comprehensive clinical protocol engine
- Multilingual UI
- PWA
- Payment
- Complex adherence calendars and advanced charts
- Agent confirmation or activation of a prescription
- Fitness vertical expansion

## 6. Next Implementation Action

The patient camera controller, durable checked-in result, conflict-safe
`review_completed_set` → `stage_next_set_focus` workflow and therapist
`get_adherence_summary` are implemented.
The complete therapist-confirmed knee prescription → patient 8/8 OBS set →
explicit RPE/pain → agent review → therapist 1/2 adherence golden path passed
locally; see [Patient OBS golden-path evidence](./docs/patient-obs-golden-path.md).
Per the user's explicit decision, OBS is the provisional integration device;
physical camera counting, cleanup and external-browser coverage remain release
gates.

Next, restart one synthetic two-set session and record a native WebMCP
stage → visible pending card → human Accept/Dismiss → next-set start probe.
After that final interaction check, shift to public deployment and submission
artifacts rather than adding more camera detectors.

The parallel external-release track still needs an approved public asset
license/provenance boundary, public repository and HTTPS destination. Once
deployed, repeat the complete dashboard → client → editor → human confirmation
→ client history workflow on that origin before competition release.
