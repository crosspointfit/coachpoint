import assert from "node:assert/strict";
import test from "node:test";

import { calculateAngleDeg, selectKneeSide } from "../src/motion/angle.ts";
import {
  createRepCounterState,
  summarizeRepCounter,
  updateRepCounter,
} from "../src/motion/rep-counter.ts";
import { HALF_SQUAT_REPLAY } from "../src/motion/replay.ts";
import type { NormalizedLandmarkLike } from "../src/motion/types.ts";

test("calculates a stable 90 and 180 degree joint angle", () => {
  assert.equal(calculateAngleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }), 90);
  assert.equal(calculateAngleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 180);
});

test("selects the knee side with better minimum landmark visibility", () => {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  landmarks[23] = { x: 0, y: 0, visibility: 0.4 };
  landmarks[25] = { x: 0, y: 1, visibility: 0.4 };
  landmarks[27] = { x: 1, y: 1, visibility: 0.4 };
  landmarks[24] = { x: 0, y: 0, visibility: 0.9 };
  landmarks[26] = { x: 0, y: 1, visibility: 0.8 };
  landmarks[28] = { x: 1, y: 1, visibility: 0.85 };
  assert.equal(selectKneeSide(landmarks)?.side, "right");
  assert.equal(selectKneeSide(landmarks)?.visibility, 0.8);
});

test("noise and an incomplete descent do not count a repetition", () => {
  let state = createRepCounterState();
  const angles = [160, 158, 162, 159, 163, 165, 166, 150, 140, 138, 150, 162, 163, 164];
  angles.forEach((angle, index) => {
    state = updateRepCounter(state, angle, index * 100).state;
  });
  assert.equal(state.reps, 0);
});

test("deterministic replay counts three debounced repetitions", () => {
  let state = createRepCounterState();
  for (const frame of HALF_SQUAT_REPLAY) {
    state = updateRepCounter(state, frame.kneeAngleDeg, frame.timestampMs).state;
  }
  assert.equal(state.reps, 3);
  assert.equal(state.records.length, 3);
  assert.deepEqual(state.records.map((record) => record.minAngleDeg), [116, 123, 132]);
});

test("summary reports limited depth and range decline without raw frames", () => {
  let state = createRepCounterState();
  for (const frame of HALF_SQUAT_REPLAY) {
    state = updateRepCounter(state, frame.kneeAngleDeg, frame.timestampMs).state;
  }
  const summary = summarizeRepCounter(state);
  assert.equal(summary.completedReps, 3);
  assert.ok(summary.qualityFlags.includes("limited_depth"));
  assert.ok(summary.rangeDeclineDeg > 0);
  assert.equal("landmarks" in summary, false);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(summary))), JSON.stringify(summary));
});

test("degenerate landmarks return null instead of NaN", () => {
  const point: NormalizedLandmarkLike = { x: 0, y: 0 };
  assert.equal(calculateAngleDeg(point, point, { x: 1, y: 1 }), null);
});
