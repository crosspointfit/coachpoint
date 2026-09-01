import assert from "node:assert/strict";
import test from "node:test";

import {
  createHalfSquatSetRunner,
  type HalfSquatSetRunnerCoarseEvent,
} from "../src/motion/half-squat-runner.ts";
import { HALF_SQUAT_REPLAY } from "../src/motion/replay.ts";
import type { NormalizedLandmarkLike } from "../src/motion/types.ts";

function landmarksForKneeAngle(
  angleDeg: number,
  visibility = 0.95,
): NormalizedLandmarkLike[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }));
  const radians = (angleDeg * Math.PI) / 180;
  landmarks[23] = { x: 0.5, y: 0.3, visibility };
  landmarks[25] = { x: 0.5, y: 0.5, visibility };
  landmarks[27] = {
    x: 0.5 + Math.sin(radians) * 0.2,
    y: 0.5 - Math.cos(radians) * 0.2,
    visibility,
  };
  return landmarks;
}

function runReplay(
  targetRepetitions: number,
): {
  runner: ReturnType<typeof createHalfSquatSetRunner>;
  events: HalfSquatSetRunnerCoarseEvent[];
} {
  const runner = createHalfSquatSetRunner({ targetRepetitions });
  const events: HalfSquatSetRunnerCoarseEvent[] = [];
  for (const frame of HALF_SQUAT_REPLAY) {
    const step = runner.process({
      type: "landmarks",
      landmarks: landmarksForKneeAngle(frame.kneeAngleDeg),
      timestampMs: frame.timestampMs,
    });
    events.push(...step.events);
  }
  return { runner, events };
}

test("runner converts the deterministic landmark replay into one target event", () => {
  const { runner, events } = runReplay(3);
  const snapshot = runner.getSnapshot();
  const summary = runner.getSummary();

  assert.equal(snapshot.completedRepetitions, 3);
  assert.equal(snapshot.targetReached, true);
  assert.equal(snapshot.lockedSide, "left");
  assert.equal(summary.completedReps, 3);
  assert.ok(summary.detectedRepetitionWindowSeconds > 0);
  assert.equal(
    events.filter((event) => event.type === "rep_completed").length,
    3,
  );
  assert.deepEqual(
    events.filter((event) => event.type === "target_reached"),
    [{ type: "target_reached", completedRepetitions: 3 }],
  );
});

test("configurable target completion makes later frames terminal no-ops", () => {
  const { runner, events } = runReplay(2);
  const before = runner.getSnapshot();
  const after = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(120),
    timestampMs: 99_000,
  });

  assert.equal(before.completedRepetitions, 2);
  assert.equal(before.targetReached, true);
  assert.equal(runner.getSummary().completedReps, 2);
  assert.equal(after.analysis.valid, false);
  assert.equal(after.analysis.cue, "Set target reached.");
  assert.equal(after.update.state.reps, 2);
  assert.equal(after.snapshot.completedRepetitions, 2);
  assert.equal(after.events.length, 0);
  assert.equal(
    events.filter((event) => event.type === "target_reached").length,
    1,
  );
});

test("sustained low visibility resets an incomplete rep once and clears the side lock", () => {
  const runner = createHalfSquatSetRunner({
    targetRepetitions: 6,
    missingFrameResetThreshold: 3,
  });
  const angles = [165, 165, 165, 150, 130, 128, 126];
  angles.forEach((angle, index) => {
    runner.process({
      type: "landmarks",
      landmarks: landmarksForKneeAngle(angle),
      timestampMs: index * 100,
    });
  });
  assert.equal(runner.getSnapshot().repPhase, "lowered");
  assert.equal(runner.getSnapshot().lockedSide, "left");

  const first = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(126, 0.2),
    timestampMs: 800,
  });
  const second = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(126, 0.2),
    timestampMs: 900,
  });
  const threshold = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(126, 0.2),
    timestampMs: 1_000,
  });
  const afterThreshold = runner.process({ type: "missing_frame" });

  assert.equal(first.snapshot.trackingState, "lost");
  assert.ok(first.events.some((event) => event.type === "tracking_lost"));
  assert.equal(first.trackingReset, false);
  assert.equal(second.trackingReset, false);
  assert.equal(threshold.trackingReset, true);
  assert.equal(threshold.snapshot.repPhase, "seeking_standing");
  assert.equal(threshold.snapshot.lockedSide, undefined);
  assert.ok(
    threshold.events.some(
      (event) => event.type === "counter_reset_after_tracking_loss",
    ),
  );
  assert.equal(afterThreshold.trackingReset, false);
  assert.equal(runner.getSummary().completedReps, 0);
});

test("explicit missing frames preserve completed reps while requiring reacquisition", () => {
  const runner = createHalfSquatSetRunner({ targetRepetitions: 3 });
  let lastTimestampMs = 0;
  for (const frame of HALF_SQUAT_REPLAY) {
    lastTimestampMs = frame.timestampMs;
    const step = runner.process({
      type: "landmarks",
      landmarks: landmarksForKneeAngle(frame.kneeAngleDeg),
      timestampMs: frame.timestampMs,
    });
    if (step.snapshot.completedRepetitions === 1) break;
  }
  assert.equal(runner.getSummary().completedReps, 1);

  [150, 130, 128, 126].forEach((angle, index) => {
    runner.process({
      type: "landmarks",
      landmarks: landmarksForKneeAngle(angle),
      timestampMs: lastTimestampMs + (index + 1) * 100,
    });
  });
  assert.equal(runner.getSnapshot().repPhase, "lowered");

  const missingSteps = Array.from({ length: 5 }, () =>
    runner.process({ type: "missing_frame" }),
  );
  const lost = missingSteps[0]!;
  const reset = missingSteps.at(-1)!;

  assert.equal(lost.snapshot.trackingState, "lost");
  assert.ok(lost.events.some((event) => event.type === "tracking_lost"));
  assert.equal(reset.trackingReset, true);
  assert.equal(reset.snapshot.repPhase, "seeking_standing");
  assert.equal(runner.getSummary().completedReps, 1);

  let reacquired = runner.process({
      type: "landmarks",
      landmarks: landmarksForKneeAngle(165),
      timestampMs: lastTimestampMs + 1_000,
    });
  assert.equal(reacquired.snapshot.trackingState, "tracked");
  assert.ok(
    reacquired.events.some((event) => event.type === "tracking_acquired"),
  );

  reacquired = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(165),
    timestampMs: lastTimestampMs + 1_100,
  });
  reacquired = runner.process({
    type: "landmarks",
    landmarks: landmarksForKneeAngle(165),
    timestampMs: lastTimestampMs + 1_200,
  });
  assert.equal(reacquired.snapshot.repPhase, "standing");
  assert.equal(reacquired.snapshot.completedRepetitions, 1);
});

test("reset clears runner state and summary without changing its target", () => {
  const { runner } = runReplay(1);
  assert.equal(runner.getSummary().completedReps, 1);

  const reset = runner.reset();

  assert.deepEqual(reset, {
    targetRepetitions: 1,
    completedRepetitions: 0,
    repPhase: "seeking_standing",
    lockedSide: undefined,
    consecutiveMissingFrames: 0,
    trackingState: "acquiring",
    targetReached: false,
  });
  assert.equal(runner.getSummary().completedReps, 0);
  assert.equal(runner.getSummary().detectedRepetitionWindowSeconds, 0);
});

test("runner never retains landmark objects or returns them in coarse state", () => {
  const runner = createHalfSquatSetRunner({ targetRepetitions: 1 });
  const landmarks = landmarksForKneeAngle(165) as Array<
    NormalizedLandmarkLike & { secret?: string }
  >;
  landmarks[23]!.secret = "SECRET_LANDMARK";
  runner.process({ type: "landmarks", landmarks, timestampMs: 0 });

  const serialized = JSON.stringify({
    snapshot: runner.getSnapshot(),
    summary: runner.getSummary(),
  });
  assert.equal(serialized.includes("SECRET_LANDMARK"), false);
  assert.equal(serialized.includes("landmarks"), false);
});
