# Motion Lab camera acceptance

Date prepared: 2026-09-01 (Asia/Taipei)

Status: **pending user-assisted physical verification**. The current 239-test automated
baseline includes camera discovery/constraint/error contracts, tracking-loss
reset, side hysteresis, deterministic fixtures, English voice-selection
contracts, and local model loading. Cleanup and device-change handling are
implemented in the page, but the suite does not
exercise a physical camera, browser permission UI, device LED, USB hot-plug, or
real movement-counting accuracy. It also does not establish the new earcon
timing, stale-speech cancellation, or cross-set audio-isolation gate.

## Implemented software boundary

- Cameras are enumerated automatically without opening a stream or prompting
  for access. Names may be generic until permission is granted.
- There is no separate Find or Refresh control. If browser privacy hides the
  full list, the primary action requests permission once, releases the temporary
  stream, and refreshes the selector before the user starts the set.
- The operator can choose a listed device while the lab is idle. A real run
  requests that device with an exact `deviceId` constraint.
- `devicechange` refreshes the list. Removing the active input stops the set
  safely and selects an available fallback when one exists.
- Stop, failed or stale startup, track disconnection, and page unmount
  cancel processing, stop media tracks, clear the video/canvas, and cancel
  queued audio.
- Five consecutive missing/invalid pose results reset an incomplete repetition
  to standing acquisition without deleting completed repetitions.
- Visibility hysteresis keeps the current knee side until the alternative is
  meaningfully clearer, reducing left/right oscillation.
- The camera demo targets six completed repetitions, then stops local
  processing, releases the stream, and creates its summary automatically.
- Audio coaching is off by default. When enabled, repetition completion uses an
  immediate local earcon; spoken output is English-only and reserved for a
  few set milestones rather than queued once per repetition. The page excludes
  novelty voices, prefers a ranked natural English voice, and exposes voice
  selection, Preview, and volume.
- Raw camera frames and raw landmark streams are not retained in set summaries.

### Audio coordination target

The real-camera gate must validate the browser event-cue path, not agent-driven
or per-repetition narration. The current audio coordinator already provides a
user-gesture-armed context, unqueued earcons, latest-wins milestone speech,
safe cancellation/close, and set-generation invalidation. The persistent
quality-cue extension will additionally:

- assign priority so safety and Stop preempt completion and milestone speech;
- expire cues that are no longer useful instead of draining an old queue;
- deduplicate repeated events;
- apply a cooldown to equivalent coaching cues; and
- attach a set-generation identifier so delayed work from a stopped or prior
  set cannot speak during the next one.

WebMCP is outside this timing loop. No agent tool may receive frames or raw
landmarks, trigger rep audio, request camera permission, or enforce safety.

## Setup

Use synthetic/demo activity only. Open
[`http://localhost:4100/motion-lab`](http://localhost:4100/motion-lab) in a
current camera-capable browser on localhost, or use the deployed HTTPS origin.
If available, connect one external USB or virtual camera in addition to the
built-in camera. Keep the browser's site-permission control and the camera's
activity indicator visible when practical.

Record the browser/version, operating system, built-in camera name, external
camera name, lighting, camera angle, and tester distance in the result table.

## User-assisted checks

1. **Automatic discovery and permission boundary** — With camera permission
   unset, reload and confirm that the selector populates automatically without
   a permission prompt or camera indicator. Generic names are acceptable before
   permission. Click **Allow camera access**, grant access once, and confirm
   that the temporary stream releases and the selector refreshes with
   browser-provided camera names before **Start 6-rep set** appears.
2. **Built-in exact selection** — Select the built-in camera, start the camera
   lab, and confirm that the preview comes from that device. Stop the lab and
   confirm that the camera indicator turns off and the selector becomes usable.
3. **External exact selection** — Select the external camera while idle, start
   again, and confirm that the preview comes from the external device rather
   than silently falling back to the built-in camera. Stop before switching
   inputs again.
4. **Tracking-loss reset** — Begin lowering into a repetition, then cover the
   lens or leave the frame for at least one second. Confirm that no repetition
   is added, the incomplete repetition is discarded, and standing must be
   reacquired after tracking returns. Previously completed repetitions must
   remain intact.
5. **Stop cleanup** — Start a live session, click **End set**, and confirm that
   the preview and skeleton stop, pending audio is cancelled, and the camera
   activity indicator turns off within the browser/OS's normal release delay.
6. **Device removal** — Start with the external camera, then unplug or disable
   it. Confirm that the current set stops safely, an actionable message appears,
   and the selector refreshes to the built-in fallback or an honest no-camera
   state. The counter must not continue after disconnection.
7. **Permission denial recovery** — Reset/block the site's camera permission,
   reload, confirm that no prompt appears automatically, then click Start and
   deny access. Confirm that the page returns to idle with actionable guidance
   and allows another attempt after browser permission is corrected.
8. **Navigation cleanup** — Start the camera, navigate away from Motion Lab,
   and confirm that the camera activity indicator turns off. Returning to Motion
   Lab must not reveal a hidden active stream or continuing repetition count.
9. **Counting and auto-completion gate** — Re-enable the chosen camera, stand
   side-on or slightly oblique with hip, knee, and ankle visible, then perform
   the six deliberate half squats shown by the target through a comfortable
   therapist-approved range. Confirm that the sixth valid repetition ends the
   set automatically, releases the camera, and shows a six-rep summary. Compare
   the visible count with a manual count. The gate requires at least 90%
   counting accuracy, no more than one false repetition, and no count while
   landmarks are missing or confidence is low.
10. **Rep earcon and English milestone voice** — Confirm that Audio coaching is
    off on first use. Enable it, choose a natural English voice, use **Preview**,
    lower the visible voice volume, and run a set. Confirm that every accepted
    rep gets one short, immediate non-verbal earcon without waiting for TTS.
    Speech should be limited to short milestones such as halfway, last
    repetition, and set complete; it must not narrate each
    count or read non-English numbers. Perform two faster repetitions and
    confirm that stale speech is dropped rather than played late. Turning Audio
    coaching off or ending the set must cancel pending speech, and audio from
    that set must not leak into a new set.
11. **Post-set WebMCP result checkpoint** — Before starting and while a set is
    running, call `get_latest_motion_lab_set_result` once and confirm that it
    returns the recoverable `result_unavailable` response rather than live reps,
    phase, tracking state, or camera data. After the set ends, ask “How did I do
    in that set?” and confirm that one call returns the completed or stopped
    aggregate. The exercise source must say `isolated_demo`; output must contain
    no frames, landmarks, raw angles, per-repetition records, camera identifiers,
    patient identity, or control that can start or change the set. Confirm that
    the agent describes observations without diagnosing, advising deeper range,
    or changing dosage.

Stop immediately if the movement is uncomfortable or unsafe. This is product
verification, not a clinical assessment or exercise recommendation.

## Result record

Preliminary run on 2026-09-01: the in-app browser selected **OBS Virtual
Camera**, loaded the GPU delegate, and displayed six detected repetitions with
high landmark visibility. That build still required manual Stop and exposed a
stretched preview background; both behaviors were corrected afterward. The
follow-up OBS run reached 6/6, auto-completed, released the stream, and produced
a terminal aggregate. After the result-only WebMCP redesign, the in-app browser
verified both boundaries: a pre-set `get_latest_motion_lab_set_result` call
returned `result_unavailable`, while a fresh post-set call returned the 6/6
aggregate (19.1-second detected repetition window, 57.2° average detected knee
range, 0° detected range decline) with no raw frames, landmarks, or time
series. The repetition window is not presented as total set duration. Manual counting
accuracy, false-repetition count, and physical camera LED checks remain
pending.

| Field | Observation |
| --- | --- |
| Date / tester | 2026-09-01 / user-assisted in-app Browser checkpoint; physical-camera tester pending |
| Browser / OS | Codex in-app Browser on macOS; external-browser coverage pending |
| Built-in / external device | OBS Virtual Camera observed; physical devices pending |
| Permission and labeled discovery | Pending |
| Built-in and external exact selection | Pending |
| Tracking-loss reset | Pending |
| Stop and navigation LED release | Pending |
| Device-removal handling | Pending |
| Denied-permission recovery | Pending |
| Rep earcon / English milestone voice / cancellation | Pending |
| Post-set WebMCP result / privacy and interpretation boundary | Pre-set refusal and fresh 6/6 terminal result verified on isolated OBS demo |
| Manual reps / detected reps / false reps | Manual count pending / 6 detected / false count pending |
| Counting accuracy | Pending |
| Overall result | **Not yet run** |

The physical release gate remains open until the device, counting, cleanup and
audio checks above pass and are recorded. By explicit user decision, OBS is the
provisional integration device and patient-route implementation may continue;
that decision does not count as physical-camera acceptance or remove the
release gate.
