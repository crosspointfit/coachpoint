# Patient OBS Golden-Path Evidence

Date: 2026-09-01

Status: **passed for provisional OBS integration**

This is synthetic product verification, not clinical validation or
physical-camera acceptance.

## Workflow verified

1. A human therapist confirmed revision 2 for Demo Client — Knee.
2. The immutable prescription contained Supported Half Squat, two sets of
   eight repetitions.
3. The patient route loaded the therapist-confirmed target of eight reps.
4. Before movement, `review_completed_set` returned the uniform recoverable
   `result_unavailable` response.
5. The user explicitly prepared and started OBS Virtual Camera.
6. Browser-local pose processing accepted 8/8 repetitions and released the
   camera automatically.
7. Before check-in, the aggregate was visibly staged while
   `review_completed_set` remained unavailable.
8. The user explicitly recorded RPE 8 and Pain 0 and saved the set.
9. `review_completed_set` returned the persisted, therapist-confirmed result.
10. The therapist client hub showed 1/2 resolved sets and the same latest
    camera observations and patient check-in.

## Persisted result

| Field | Value |
| --- | --- |
| Outcome | completed |
| Prescribed / completed repetitions | 8 / 8 |
| Target achieved | true |
| True wall-clock set duration | 27.597 seconds |
| Detected repetition window | 26.1 seconds |
| Average detected knee range proxy | 57.8° |
| Detected range decline | 1.1° |
| Quality labels | `demo_depth_threshold_not_reached` |
| RPE / Pain | 8 / 0 |
| Pain gate | inactive; threshold 5 |
| Continuation | allowed by configured product gate |

The demo depth label is not a therapist-approved range target and must not be
translated into advice to move deeper. RPE 8 is an explicit patient report;
the agent may describe it as high effort but cannot change dosage.

## Second set and session completion

The second therapist-confirmed set also completed and was checked in through
the same OBS flow. `review_completed_set` selected the second result as latest,
the patient page closed the session at 2/2, and the therapist hub showed the
same 2/2 adherence state.

| Field | Set 1 | Set 2 |
| --- | ---: | ---: |
| Completed repetitions | 8 / 8 | 8 / 8 |
| True set duration | 27.597s | 29.09s |
| Detected repetition window | 26.1s | 26.1s |
| Average detected knee range proxy | 57.8° | 44.3° |
| Detected range decline | 1.1° | 0° |
| RPE / Pain | 8 / 0 | 8 / 0 |

The second set's average 2D range proxy was 13.5° lower than the first while
showing no within-set range decline. This is a camera-derived observation, not
a clinical conclusion or instruction to increase range. Both sets carried the
demo depth-threshold label.

After the second check-in, continuation was correctly blocked by
`session_closed`, not by pain. The session summary reported two completed sets,
zero skipped sets, average RPE 8 and highest pain 0.

## Privacy and authority verified

- Result persisted only as an allowlisted aggregate plus explicit check-in.
- No patient identity, program code, route/set/session IDs, camera details,
  frames, raw landmarks, raw angles or per-repetition time series were exposed
  by `review_completed_set`.
- The agent could explain the result but could not start/stop the camera,
  change the exercise or dosage, confirm a prescription, or override pain.

## UI follow-up

The first patient camera layout exposed two nested responsive-grid problems.
The final layout gives the camera/check-in area a full-width row across the
prescription card. During a running set, the large setup area collapses to a
single compact status bar with camera name, on-device status and human End
control; the video remains the dominant surface.

## Automated and build evidence

- 193 tests pass.
- ESLint and TypeScript pass.
- Next.js 16 production build passes with the official `--webpack` fallback.
- Default Turbopack build was blocked on this task host before compilation
  because the environment denied its temporary worker-port binding.

## Deferred release evidence

- Built-in physical camera counting and LED cleanup
- External-browser/WebMCP origin verification
- Public HTTPS deployment verification
