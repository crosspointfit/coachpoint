# CoachPoint

CoachPoint is an agent-native home exercise program demo for the 2026 WebMCP
Challenge. A therapist and an agent collaborate on a visible prescription
draft while final clinical confirmation remains a human action.

The durable implementation plan is in
[`webmcp-implementation-phases.md`](./webmcp-implementation-phases.md).

## Implemented therapist flow

1. A therapist enters a synthetic case, time budget, equipment, and any
   procedure-specific constraints.
2. The therapist or agent searches a curated, demo-only exercise catalog.
3. The agent can inspect precautions and create a visible draft.
4. The therapist reorders exercises and edits dosage in the same UI.
5. Only the therapist UI can confirm the prescription and create the anonymous
   patient link.
6. Human, agent, and system activity remains visibly attributed.

The three route-scoped WebMCP tools are:

| Tool | Effect |
| --- | --- |
| `search_exercises` | Read-only structured search of the curated catalog. |
| `get_exercise_details` | Read-only details, timing, precautions, and contraindications. |
| `draft_program` | Creates a visible draft; never confirms or activates it. |

Navigating away from `/therapist` aborts the shared registration owner and
removes all three tools.

## Implemented patient fallback flow

The local patient link now supports a complete camera-independent session:

- A confirmed program is snapshotted into ordered sets.
- Repetition exercises use manual counting; hold exercises use a visible timer.
- Each state transition is persisted immediately.
- Pause, resume, skip, stop, RPE, and pain reporting are supported.
- A pain score of 5 or greater activates a non-overridable safety gate and
  stops the active set.
- Refresh restores the resolved sets and current session state.
- A summary is created only after every set is completed, skipped, or stopped.

This fallback is intentionally complete before camera sensing is added.

## Isolated motion lab

`/motion-lab` contains the Phase 6 browser-local half-squat prototype:

- MediaPipe Tasks Vision 1.0.1 with self-hosted WASM and lite pose model
- GPU delegate with CPU fallback
- Side selection from hip, knee, and ankle landmark visibility
- Knee-angle calculation and stable-frame rep state machine
- Per-repetition minimum angle, range, duration, and limited-depth flag
- Set-level range-decline summary
- Deterministic three-repetition replay for judge and CI-style browser checks
- Optional camera mode with skeleton overlay and spoken rep counts
- Raw video and raw landmark frames are never saved in the summary

The deterministic replay and model loading pass headless Chromium. A real
camera accuracy run remains a human-assisted verification gate before patient
WebMCP orchestration is added.

## Suggested site-tools prompt

> Shoulder impingement, six weeks post-op, 15 minutes per day. Search the
> catalog for assisted shoulder mobility using a stick, inspect suitable
> options, then create a two-exercise draft for my review. Use only synthetic
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
- Native Codex in-app Browser discovery and invocation of all three site tools
- Route cleanup showing no WebMCP tools on the landing page
- Same-browser therapist confirmation through patient-session completion
- Patient pain-gate and in-app Browser refresh-recovery probes
- Motion-engine unit tests, deterministic three-repetition browser replay, and
  self-hosted MediaPipe GPU runtime/model load

## Project structure

| Path | Purpose |
| --- | --- |
| `src/domain/` | Curated catalog, safety boundaries, duration and draft validation. |
| `src/components/therapist/` | Manual shared therapist workspace. |
| `src/lib/webmcp/` | Direct registration, schemas, execution boundaries, React lifecycle. |
| `src/lib/therapistStorage.ts` | Versioned browser persistence for synthetic demo state. |
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
