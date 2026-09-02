# CoachPoint — WebMCP Challenge demo video script

Target runtime: **2:45–2:55**. Hard ceiling: **under 3:00**.

Recording language: English narration with burned-in English captions.

## One-sentence story

CoachPoint turns one browser page into a shared rehabilitation workspace: an
agent assembles the repetitive work, a therapist retains prescription
authority, the patient's browser measures movement locally, and WebMCP brings
only the saved result back into a human-reviewed care loop.

## Why this cut matches the judging criteria

| Criterion | What the video must prove |
| --- | --- |
| WebMCP Leverage | Show named, real tool calls and the visible UI state they read or update. Make it impossible to mistake the flow for DOM clicking. |
| Execution | Tell one complete therapist → patient → therapist story, not a feature tour. |
| Potential Impact | Name the specific gap: therapists lose visibility between visits, while patients need simple home guidance. Do not use unsupported market statistics. |
| Creativity & Ambition | Emphasize the unique split: browser-local motion reflexes, WebMCP reasoning at set boundaries, and explicit human authority. |

The criteria are equally weighted, but WebMCP Leverage is the first tie-break
criterion. Give the named tools and visible state transitions enough screen
time to be understood.

## Recommended final structure

Use an edited screen recording, not a single live take. Cut agent waiting time
to two or three seconds, but do not fabricate responses or tool results.

Keep the whole story on **Demo Client — Knee**, with the therapist workflow as
the main act:

1. Therapist opens the case context: knee mobility, stair confidence, twelve
   minutes, and chair support.
2. Agent searches and inspects two catalog movements, then creates a visible
   two-exercise draft: `Supported Heel Raise` followed by
   `Supported Half Squat` at `2 × 10`.
3. Therapist expands the clinical review notes, moves Half Squat to the first
   position, changes `10` to `8`, and confirms by hand.
4. Patient-side proof is intentionally short: the patient starts the remembered
   OBS camera, completes only the first `8/8` set, and records
   `RPE 8 / Pain 0`.
5. Agent reads the persisted set and stages a next-set focus; the patient
   explicitly accepts it.
6. Back on the client hub, the therapist-side agent reads the resulting
   `1/4` adherence summary.

## 2:55 shot-by-shot script

| Time | Screen and operator action | English narration |
| --- | --- | --- |
| `0:00–0:12` | Begin in `/therapist` on the synthetic client directory, then open `Demo Client — Knee`. Keep the professional case UI—not motion footage—as the first image. | “A therapist should not spend a visit assembling repetitive home-exercise paperwork. But an agent should never make the clinical decision. CoachPoint separates those jobs.” |
| `0:12–0:27` | Show the client context: knee mobility, stair confidence, twelve-minute target, and available support equipment. Click `New prescription` and enter the editor. | “This synthetic knee case starts with goals, available time, and equipment defined by the therapist. No real patient identity is required.” |
| `0:27–0:58` | Ask Prompt A in ordinary therapist language. Do not name functions or schema fields. Keep the agent's real call cards visible afterward: `get_program_editor_state`, search, details, then `draft_program`. Cut waiting time only. End on the `Agent-created` draft in the UI. | “Through WebMCP, the agent reads the route-bound editor revision, searches the curated movement library, checks dosage defaults, precautions, and contraindications, then assembles a visible draft in the real workspace.” |
| `0:58–1:13` | Pause on both exercise illustrations and the daily estimate. Expand `clinical review notes` and show the warnings, then collapse them. | “The result is not hidden in chat. The therapist can inspect every movement, the daily estimate, and the clinical review notes directly in the interface.” |
| `1:13–1:36` | Move `Supported Half Squat` above `Supported Heel Raise`. Open `Edit dosage`, change Half Squat from `10` to `8`, close editing, and show the updated estimate. | “I can now apply professional judgment: reorder the session and reduce the camera-tracked set from ten repetitions to eight. The agent's draft remains fully editable.” |
| `1:36–1:47` | Click `Confirm prescription` yourself. Hold the confirmed badge and patient link for one second. | “There is deliberately no confirmation tool. Only the therapist can confirm and activate the prescription.” |
| `1:47–1:57` | Click `Open patient view`. Briefly show the four-set queue, immutable eight-rep first target, and `Camera remembered`; the human clicks `Start camera set`. | “That human-confirmed version becomes an anonymous patient program. Camera permission and Start also remain human controls.” |
| `1:57–2:14` | Add disclosure `Synthetic demo · OBS replay for repeatability · processed on device`. Show two consecutive reps, then cut to `7/8` and `8/8`; retain landmarks, cue, exercise thumbnail, and Stop controls. | “The patient segment is supporting evidence: MediaPipe and counting run locally in the browser, without agent latency and without sending raw video or landmarks to the agent.” |
| `2:14–2:23` | Let the first set end. Enter `RPE 8` and `Pain 0`, then click `Save set result`. | “Afterward, the patient explicitly reports effort and pain. Only a bounded set aggregate is saved.” |
| `2:23–2:38` | Paste Prompt B. Show `review_completed_set`, `stage_next_set_focus`, the pending suggestion, and a quick human `Accept focus` click beside the unchanged eight-rep target. | “WebMCP now reasons at the meaningful boundary: it explains the saved result and stages one focus. The patient accepts it; the prescription itself does not change.” |
| `2:38–2:50` | Return to the `Demo Client — Knee` hub. Paste Prompt C and show `get_adherence_summary` beside the visible `1/4` completion, RPE, pain, and camera observation. | “Back in the therapist workspace, the same record becomes an identity-free follow-up summary the therapist can verify against the screen.” |
| `2:50–2:55` | Final card: `Agent efficiency · Browser-local evidence · Human authority`, followed by `Open source · CoachPoint by Crosspoint`. | “CoachPoint gives agents useful work—not clinical authority.” |

The narration is deliberately plain and approximately 230 words. Do not add a
separate architecture tour unless the edit finishes below 2:45.

## Prompt A — natural therapist request

Say or paste this only after the program editor reports that site tools are
ready. This is the exact user-facing prompt for the recording; it deliberately
contains no function names, IDs, revision numbers, or schema syntax:

```text
Please help me draft a home program for this synthetic knee client.

They have twelve minutes a day and a chair, step, and wall. I want two supported standing exercises that work toward better stair confidence. Please check the movement library and the safety notes before choosing them.

Use two sets for each exercise, once daily, with forty-five seconds of rest. Put the calf exercise before the supported squat, and start the squat at ten repetitions.

Leave the result as a draft for me to review. I will adjust it and make the final decision.
```

Why this order and `10` are intentional: the human moves Half Squat to the top
and edits `10` to `8`. That makes ordering, dosage judgment, and confirmation
visibly human-controlled instead of reducing the therapist to a final click.

Expected agent behavior, shown by the tool-call cards but never spoken by the
user: read the editor state, search for suitable catalog movements, inspect the
two selected movements, then create one visible draft using the live revision.

## Prompt B — natural patient follow-up

Paste this only after `8/8`, the explicit `RPE 8 / Pain 0` check-in, and `Save
set result`. The patient does not need to know any tool name:

```text
I've finished that set and saved how it felt. How did I do?

Please explain the result in plain language. If it is safe to continue and my effort was high, suggest one short reminder to help me keep the next set calm and controlled—but leave it for me to accept or dismiss.

Do not change my exercise or dosage, and do not start the camera for me.
```

The correct visible result is a pending suggestion with human `Accept focus`
and `Dismiss` controls. The agent must not start set two.

Expected internal behavior: one result review followed, when allowed, by one
revision-safe focus-stage call using evidence already present in the saved set.

## Prompt C — natural therapist follow-up

Return to the `Demo Client — Knee` client hub, wait for its site tools to become
ready, and paste:

```text
How is this client doing with the current home program?

Give me a concise two-sentence pre-visit summary covering completed work, repetitions, effort, pain, and the latest camera-based observation. Keep camera range clearly described as a two-dimensional browser estimate rather than a clinical conclusion.

Do not diagnose or change the prescription.
```

Expected internal behavior: the agent discovers and calls the route-owned
adherence tool once, then summarizes only the returned fields.

## Recording setup

### Final environment

- Record the final video from the deployed HTTPS build, not `localhost` and not
  the Next.js development server.
- Use the latest ChatGPT desktop app with GPT-5.6 Sol or GPT-5.6 Terra. Do not
  use Luna for this recording because Site tools are currently disabled there.
- Keep the app and agent conversation visible together. A practical 1920×1080
  layout is approximately 70% app and 30% agent panel, with browser zoom near
  90%.
- Use one browser profile and one origin for the complete flow because this
  competition build intentionally stores its synthetic program/session locally.
- Enable Do Not Disturb, close personal tabs, hide bookmarks and account data,
  and remove desktop notifications.

### OBS and camera

- Start OBS Virtual Camera before opening the patient route.
- Use the already verified, original half-squat clip with hip, knee, and ankle
  continuously visible.
- Disable looping. Begin the clip with a short standing hold so the detector can
  acquire the standing phase before repetition one.
- Grant camera permission and select OBS once during rehearsal. The final take
  should begin from `Camera remembered` and still show the human Start click.
- Turn app speech off or low during capture so it does not fight the narration.
- The OBS disclosure must remain visible briefly. It proves repeatability and
  avoids implying that the prerecorded source is a live patient.

### Audio and edit

- Record the UI cleanly first, then add narration and captions afterward.
- Prefer no music. If music is used, it must be original or explicitly licensed
  and should remain well below the narration.
- Burn in English captions even when narration is English.
- Export 1080p H.264, check that all tool names remain readable, and target a
  final duration near 2:50.

## Rehearsal sequence

Practice the complete path three times before recording:

1. Start a fresh `Demo Client — Knee` prescription.
2. Confirm that the editor reports four tools ready.
3. Ask natural-language Prompt A. Verify that the agent independently chooses
   the editor-state, search, detail, and draft tools; the user must not name
   them.
4. Expand the clinical review notes, move Half Squat above Heel Raise, and edit
   `10` to `8`.
5. Confirm by human click and verify the patient program contains four total
   sets, with the two eight-rep Half Squat sets first.
6. Open the patient link and confirm `Camera remembered`.
7. Human-click Start and verify `8/8` auto-completion from OBS.
8. Save `RPE 8 / Pain 0`.
9. Run Prompt B and verify exactly one review plus one focus-stage call.
10. Human-click Accept and verify the eight-rep prescription stays unchanged.
11. Return to the client hub; run Prompt C and verify `1/4` plus the visible
    result values match.

A rehearsal passes only when the browser UI, agent response, and tool outputs
show the same numbers and no manual fallback is needed.

## Failure recovery

| Symptom | Recovery before the next take |
| --- | --- |
| Site tools are absent | Confirm the correct route and ready badge, then reload that route once. Do not call therapist tools from the patient page or vice versa. |
| `draft_revision_conflict` | Call `get_program_editor_state` again and recreate the draft using the newest revision. |
| Agent tries to confirm | Leave the behavior visible: there is no confirmation tool. Use the therapist UI button yourself. |
| OBS is not selected | Stop before recording, open camera settings, choose OBS, and let the browser remember it. |
| Repetitions do not count | Use a side or slight-oblique view; keep hip/knee/ankle visible; hold both the standing and lowered endpoints for several frames. |
| A repetition is missed | Stop and restart the take. Do not use manual fallback in the final camera sequence. |
| `review_completed_set` returns `result_unavailable` | Confirm `Save set result` was clicked and `Latest camera set saved · agent review ready` is visible. Never poll during movement. |
| Focus staging fails | It must follow set one, Pain must be below five, continuation must be allowed, and the exact revision from the immediately preceding review must be used. |
| `transition_revision_conflict` | Review the completed set again once, then stage with the newly returned revision. |
| Therapist summary looks stale | Wait for the client hub to hydrate; reload once if required. Keep the same browser profile and origin. |

## Claims to repeat — and claims to avoid

Use these claims:

- “The browser handles every frame.”
- “WebMCP gives the agent a route-bound, privacy-filtered result when reasoning
  is useful.”
- “Only the therapist confirms the prescription.”
- “The patient explicitly reports pain and effort.”
- “No raw video or landmarks are provided to the agent.”

Avoid these claims:

- The agent watches or coaches every camera frame.
- The 2D range proxy is a clinical assessment.
- CoachPoint diagnoses or autonomously prescribes.
- OBS verification is equivalent to clinical or physical-device validation.
- The agent can override pain, change dosage, or start the camera.

## Submission compliance

- Upload the final video to YouTube as **Public**.
- Keep it strictly below three minutes; judges are not required to watch beyond
  the limit.
- Use English narration/captions, or provide a complete English translation.
- Include only original or properly licensed video, imagery, logos, and audio.
- Verify the public HTTPS URL, public repository, visible open-source license,
  setup instructions, and clear documentation of WebMCP work added during the
  competition period.
- Current deadline: September 3, 2026 at 1:00 PM PDT, which is September 4,
  2026 at 4:00 AM in Taipei.
- After the deadline, freeze the submitted repository and live site throughout
  judging. Continue development only in a separate fork.

Official sources:

- https://webmcp.devpost.com/
- https://webmcp.devpost.com/rules
- https://webmcp.devpost.com/resources
- https://learn.chatgpt.com/docs/webmcp
