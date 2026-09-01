import assert from "node:assert/strict";
import test from "node:test";

import { HALF_SQUAT_REPLAY } from "../src/motion/replay.ts";
import {
  createRepCounterState,
  summarizeRepCounter,
  updateRepCounter,
} from "../src/motion/rep-counter.ts";
import {
  projectMotionLabSetResult,
  type MotionLabSetResultProjection,
  type MotionLabSetResultToolView,
} from "../src/motion/webmcp-view.ts";
import {
  createMotionLabToolDescriptors,
  getLatestMotionLabSetResultSchema,
} from "../src/lib/webmcp/motion-tools.ts";
import { startWebMcpRegistration } from "../src/lib/webmcp/registration.ts";
import type {
  WebMcpModelContext,
  WebMcpToolDescriptor,
} from "../src/lib/webmcp/types.ts";

function completedSummary() {
  let state = createRepCounterState();
  for (const frame of HALF_SQUAT_REPLAY) {
    state = updateRepCounter(
      state,
      frame.kneeAngleDeg,
      frame.timestampMs,
    ).state;
  }
  return summarizeRepCounter(state);
}

function completedProjection(): MotionLabSetResultProjection {
  return projectMotionLabSetResult({
    phase: "completed",
    targetReps: 3,
    summary: completedSummary(),
  });
}

function requireResult(
  projection: MotionLabSetResultProjection,
): MotionLabSetResultToolView {
  assert.ok(projection.result);
  return projection.result;
}

test("motion projection exposes one terminal aggregate without live or raw records", () => {
  const sourceSummary = completedSummary();
  const result = requireResult(completedProjection());

  assert.equal(result.resultStatus, "ready_for_review");
  assert.equal(result.exercise.source, "isolated_demo");
  assert.equal(result.authority.targetIsTherapistConfirmed, false);
  assert.equal(result.authority.agentMayExplainResult, true);
  assert.equal(result.authority.agentMayChangeExerciseOrDosage, false);
  assert.equal(result.authority.agentMayRecommendDeeperRange, false);
  assert.equal(result.performance.completedRepetitions, 3);
  assert.equal(result.performance.targetAchieved, true);
  assert.equal(
    result.quality.eventLabels.includes(
      "demo_depth_threshold_not_reached",
    ),
    true,
  );
  assert.equal(result.measurement.context, "camera_2d_demo_proxy");
  assert.equal(
    result.measurement.therapistApprovedRangeTargetAvailable,
    false,
  );
  assert.equal(result.persistence, "ephemeral");
  assert.equal(result.authority.resultIsPersisted, false);

  const serialized = JSON.stringify(result);
  assert.ok(serialized.length < 1_500);
  assert.deepEqual(Object.keys(result).sort(), [
    "authority",
    "exercise",
    "measurement",
    "outcome",
    "performance",
    "persistence",
    "privacy",
    "quality",
    "resultStatus",
    "schemaVersion",
  ]);
  assert.deepEqual(Object.keys(result.performance).sort(), [
    "averageDetectedKneeRangeDeg",
    "completedRepetitions",
    "detectedRangeDeclineDeg",
    "detectedRepetitionWindowSeconds",
    "targetAchieved",
  ]);
  for (const forbidden of [
    "phase",
    "trackingState",
    "startedAtMs",
    "completedAtMs",
    "minAngleDeg",
    "maxAngleDeg",
    "patientLabel",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal("reps" in result.performance, false);
  assert.equal(sourceSummary.reps.length, 3);
});

test("motion projection ignores polluted source fields and normalizes non-finite numbers", () => {
  const polluted = Object.assign(completedSummary(), {
    patientLabel: "SECRET_PATIENT",
    cameraDeviceId: "SECRET_CAMERA",
    frames: ["SECRET_FRAME"],
    landmarks: ["SECRET_LANDMARK"],
    completedReps: Number.POSITIVE_INFINITY,
    detectedRepetitionWindowSeconds: Number.NaN,
    averageRangeDeg: Number.NEGATIVE_INFINITY,
    rangeDeclineDeg: Number.NaN,
  });
  const projection = projectMotionLabSetResult({
    phase: "completed",
    targetReps: Number.NaN,
    summary: polluted,
  });

  assert.equal(projection.result, null);
  const serialized = JSON.stringify(projection);
  for (const sentinel of [
    "SECRET_PATIENT",
    "SECRET_CAMERA",
    "SECRET_FRAME",
    "SECRET_LANDMARK",
  ]) {
    assert.equal(serialized.includes(sentinel), false);
  }
});

test("non-terminal motion projections expose no live result", () => {
  const projection = projectMotionLabSetResult({
    phase: "running",
    targetReps: 6,
    summary: completedSummary(),
  });

  assert.equal(projection.result, null);
  assert.deepEqual(Object.keys(projection).sort(), ["result"]);
});

test("a stopped set with accepted repetitions remains reviewable", () => {
  const result = requireResult(projectMotionLabSetResult({
    phase: "stopped",
    targetReps: 6,
    summary: completedSummary(),
  }));

  assert.equal(result.outcome, "stopped");
  assert.equal(result.performance.completedRepetitions, 3);
  assert.equal(result.performance.targetAchieved, false);
});

test("motion tool descriptor is terminal-only, strict and read-only", () => {
  const descriptors = createMotionLabToolDescriptors(completedProjection);
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0]?.name, "get_latest_motion_lab_set_result");
  assert.equal(descriptors[0]?.annotations.readOnlyHint, true);
  assert.deepEqual(
    descriptors[0]?.inputSchema,
    getLatestMotionLabSetResultSchema,
  );
  assert.equal(getLatestMotionLabSetResultSchema.additionalProperties, false);
  assert.match(descriptors[0]?.description ?? "", /never poll/i);
  assert.match(descriptors[0]?.description ?? "", /post-set review/i);
  assert.match(descriptors[0]?.description ?? "", /do not advise deeper/i);
  assert.match(descriptors[0]?.description ?? "", /no patient identity/i);
});

test("motion result tool refuses to act as a live monitor", async () => {
  let projection = projectMotionLabSetResult({
    phase: "ready",
    targetReps: 6,
    summary: null,
  });
  const descriptor = createMotionLabToolDescriptors(() => projection)[0]!;

  const ready = await descriptor.execute({});
  assert.equal(ready.ok, false);
  if (!ready.ok) assert.equal(ready.errors[0]?.code, "result_unavailable");
  const unavailableMessage = ready.ok ? "" : ready.errors[0]?.message;

  projection = projectMotionLabSetResult({
    phase: "running",
    targetReps: 6,
    summary: completedSummary(),
  });
  const running = await descriptor.execute({});
  assert.equal(running.ok, false);
  if (!running.ok) {
    assert.equal(running.errors[0]?.code, "result_unavailable");
    assert.match(running.errors[0]?.message ?? "", /do not poll/i);
    assert.equal(running.errors[0]?.message, unavailableMessage);
  }

  projection = projectMotionLabSetResult({
    phase: "stopped",
    targetReps: 6,
    summary: null,
  });
  const stoppedWithoutResult = await descriptor.execute({});
  assert.equal(stoppedWithoutResult.ok, false);
  if (!stoppedWithoutResult.ok) {
    assert.equal(stoppedWithoutResult.errors[0]?.code, "result_unavailable");
    assert.equal(stoppedWithoutResult.errors[0]?.message, unavailableMessage);
  }

  projection = completedProjection();
  const completed = await descriptor.execute({});
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  const result = completed.value as unknown as MotionLabSetResultToolView;
  assert.equal(result.resultStatus, "ready_for_review");
});

test("motion result tool rejects caller scope, hidden keys and malformed inputs", async () => {
  const descriptor = createMotionLabToolDescriptors(completedProjection)[0]!;
  const hidden = Object.defineProperty({}, "setId", {
    value: "foreign-set",
    enumerable: false,
  });
  const inherited = Object.create({ setId: "foreign-set" });

  for (const input of [
    null,
    [],
    { setId: "foreign-set" },
    hidden,
    inherited,
  ]) {
    const result = await descriptor.execute(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0]?.code, "invalid_input");
  }

  const nullPrototype = await descriptor.execute(Object.create(null));
  assert.equal(nullPrototype.ok, true);
});

test("motion result tool reports unavailable context and honors early abort", async () => {
  let getterCalls = 0;
  const descriptor = createMotionLabToolDescriptors(() => {
    getterCalls += 1;
    return null;
  })[0]!;

  const unavailable = await descriptor.execute({});
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.errors[0]?.code, "context_unavailable");
  }
  assert.equal(getterCalls, 1);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await descriptor.execute({}, { signal: controller.signal });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.errors[0]?.code, "cancelled");
  assert.equal(getterCalls, 1);
});

test("motion result values are cloned before they reach an agent", async () => {
  const projection = completedProjection();
  const descriptor = createMotionLabToolDescriptors(() => projection)[0]!;
  const first = await descriptor.execute({});
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const firstValue = first.value as unknown as MotionLabSetResultToolView;
  firstValue.performance.completedRepetitions = 99;

  const second = await descriptor.execute({});
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondValue = second.value as unknown as MotionLabSetResultToolView;
  assert.equal(secondValue.performance.completedRepetitions, 3);
  assert.equal(projection.result?.performance.completedRepetitions, 3);
});

test("motion route registration aborts a retained result tool on unmount", async () => {
  let registered: WebMcpToolDescriptor | null = null;
  const modelContext: WebMcpModelContext = {
    async registerTool(tool) {
      registered = tool;
    },
  };
  let projection = completedProjection();
  const registration = startWebMcpRegistration(
    modelContext,
    createMotionLabToolDescriptors(() => projection),
  );
  assert.deepEqual(await registration.ready, [
    "get_latest_motion_lab_set_result",
  ]);
  const retainedTool = registered as WebMcpToolDescriptor | null;
  assert.ok(retainedTool);
  if (!retainedTool) return;

  projection = projectMotionLabSetResult({
    phase: "running",
    targetReps: 6,
    summary: null,
  });
  const live = await retainedTool.execute({});
  assert.equal(live.ok, false);
  if (!live.ok) assert.equal(live.errors[0]?.code, "result_unavailable");

  registration.abort();
  const retained = await retainedTool.execute({});
  assert.equal(retained.ok, false);
  if (!retained.ok) assert.equal(retained.errors[0]?.code, "cancelled");
});
