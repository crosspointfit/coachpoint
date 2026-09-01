import assert from "node:assert/strict";
import test from "node:test";

import {
  createMotionSetAggregate,
  type MotionSetAggregateInput,
} from "../src/motion/set-aggregate.ts";
import type { HalfSquatSetSummary } from "../src/motion/types.ts";

const SUMMARY: HalfSquatSetSummary = {
  completedReps: 6,
  detectedRepetitionWindowSeconds: 24.5,
  averageRangeDeg: 47.2,
  rangeDeclineDeg: 11.4,
  averageMinAngleDeg: 121.6,
  qualityFlags: ["limited_depth", "range_decline"],
  reps: [
    {
      rep: 1,
      startedAtMs: 100,
      completedAtMs: 4_100,
      durationMs: 4_000,
      minAngleDeg: 124,
      maxAngleDeg: 171,
      rangeDeg: 47,
      limitedDepth: true,
    },
  ],
};

function aggregate(
  overrides: Partial<MotionSetAggregateInput> = {},
) {
  return createMotionSetAggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 6,
      source: "isolated_demo",
    },
    outcome: "completed",
    summary: SUMMARY,
    ...overrides,
  });
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectKeys(item, keys);
  }
  return keys;
}

test("creates a JSON-safe isolated-demo aggregate without motion time series", () => {
  const result = aggregate();

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.kind, "motion_set_aggregate");
  assert.equal(result.target.source, "isolated_demo");
  assert.equal(result.outcome, "completed");
  assert.equal(result.actual.completedRepetitions, 6);
  assert.equal(result.actual.targetAchieved, true);
  assert.equal(result.actual.detectedRepetitionWindowSeconds, 24.5);
  assert.equal(result.measurements.context, "camera_2d_demo_proxy");
  assert.equal(result.measurements.averageDetectedKneeRangeDeg, 47.2);
  assert.equal(result.measurements.detectedRangeDeclineDeg, 11.4);
  assert.deepEqual(result.qualityEventLabels, [
    "demo_depth_threshold_not_reached",
    "detected_range_decline",
  ]);

  const roundTrip = JSON.parse(JSON.stringify(result));
  assert.deepEqual(roundTrip, result);

  const keys = collectKeys(result);
  for (const forbiddenKey of [
    "reps",
    "frames",
    "landmarks",
    "startedAtMs",
    "completedAtMs",
    "durationMs",
    "minAngleDeg",
    "maxAngleDeg",
    "rangeDeg",
  ]) {
    assert.equal(keys.has(forbiddenKey), false, forbiddenKey);
  }
});

test("keeps confirmed target authority separate from demo measurement status", () => {
  const result = aggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 8,
      source: "therapist_confirmed",
    },
  });

  assert.equal(result.target.source, "therapist_confirmed");
  assert.equal(result.target.targetRepetitions, 8);
  assert.equal(result.authorityBoundary.targetIsTherapistConfirmed, true);
  assert.equal(result.clinicalBoundary.clinicalAssessment, false);
  assert.equal(
    result.clinicalBoundary.intendedUse,
    "demo_coaching_support_only",
  );
  assert.equal(result.measurements.context, "camera_2d_demo_proxy");
  assert.deepEqual(result.privacyBoundary, {
    patientIdentityIncluded: false,
    cameraDetailsIncluded: false,
    rawFramesIncluded: false,
    rawLandmarksIncluded: false,
    perRepTimeSeriesIncluded: false,
  });
  assert.equal(result.authorityBoundary.agentCanStartCamera, false);
  assert.equal(result.authorityBoundary.agentCanStopCamera, false);
  assert.equal(result.authorityBoundary.agentCanControlSet, false);
  assert.equal(result.authorityBoundary.agentCanChangeTarget, false);
});

test("supports stopped partial sets without fabricating target achievement", () => {
  const result = aggregate({
    outcome: "stopped",
    summary: {
      ...SUMMARY,
      completedReps: 2,
      detectedRepetitionWindowSeconds: 7.3,
      qualityFlags: [],
      reps: SUMMARY.reps,
    },
  });

  assert.equal(result.outcome, "stopped");
  assert.equal(result.actual.completedRepetitions, 2);
  assert.equal(result.actual.targetAchieved, false);
  assert.equal(result.actual.detectedRepetitionWindowSeconds, 7.3);
  assert.deepEqual(result.qualityEventLabels, []);
});

test("normalizes non-finite numbers and fails closed for invalid runtime enums", () => {
  const result = createMotionSetAggregate({
    target: {
      exerciseId: "   ",
      exerciseName: "",
      targetRepetitions: Number.NaN,
      source: "agent_proposed" as "isolated_demo",
    },
    outcome: "unknown" as "stopped",
    summary: {
      ...SUMMARY,
      completedReps: Number.POSITIVE_INFINITY,
      detectedRepetitionWindowSeconds: Number.NaN,
      averageRangeDeg: Number.NEGATIVE_INFINITY,
      rangeDeclineDeg: -4,
    },
  });

  assert.equal(result.target.exerciseId, "unknown-exercise");
  assert.equal(result.target.exerciseName, "Unknown exercise");
  assert.equal(result.target.targetRepetitions, 1);
  assert.equal(result.target.source, "isolated_demo");
  assert.equal(result.outcome, "stopped");
  assert.equal(result.actual.completedRepetitions, 0);
  assert.equal(result.actual.detectedRepetitionWindowSeconds, 0);
  assert.equal(result.measurements.averageDetectedKneeRangeDeg, 0);
  assert.equal(result.measurements.detectedRangeDeclineDeg, 0);

  const numbers: number[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "number") numbers.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(result);
  assert.ok(numbers.every((value) => Number.isFinite(value) && value >= 0));
});

test("copies an explicit allowlist and ignores polluted summary and target data", () => {
  const pollutedSummary = Object.assign({}, SUMMARY, {
    patientLabel: "SECRET_PATIENT",
    cameraDeviceId: "SECRET_CAMERA",
    frames: ["SECRET_FRAME"],
    landmarks: ["SECRET_LANDMARK"],
    rawAngles: ["SECRET_ANGLE"],
  });
  const pollutedTarget = Object.assign(
    {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 6,
      source: "isolated_demo" as const,
    },
    {
      patientLabel: "SECRET_TARGET_PATIENT",
      therapistNote: "SECRET_NOTE",
    },
  );

  const result = createMotionSetAggregate({
    target: pollutedTarget,
    outcome: "completed",
    summary: pollutedSummary,
  });
  const serialized = JSON.stringify(result);

  for (const sentinel of [
    "SECRET_PATIENT",
    "SECRET_CAMERA",
    "SECRET_FRAME",
    "SECRET_LANDMARK",
    "SECRET_ANGLE",
    "SECRET_TARGET_PATIENT",
    "SECRET_NOTE",
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
  assert.deepEqual(Object.keys(result).sort(), [
    "actual",
    "authorityBoundary",
    "clinicalBoundary",
    "kind",
    "measurements",
    "outcome",
    "privacyBoundary",
    "qualityEventLabels",
    "schemaVersion",
    "target",
  ]);
});
