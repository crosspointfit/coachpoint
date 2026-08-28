import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import {
  EXERCISES,
  getExerciseById,
  searchExercises,
} from "../src/domain/catalog.ts";

test("the curated catalog contains one demo-only entry for every copied image", async () => {
  assert.equal(EXERCISES.length, 15);
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, 15);

  for (const exercise of EXERCISES) {
    assert.equal(exercise.reviewStatus, "demo-only");
    assert.match(exercise.imagePath, /^\/exercises\/P0-\d{4}\.png$/);
    assert.match(exercise.precautions[0], /competition demo only/i);
    await access(new URL(`../public${exercise.imagePath}`, import.meta.url));
  }
});

test("getExerciseById and searchExercises support English and Traditional Chinese", () => {
  assert.equal(getExerciseById(" HALF-SQUAT ")?.nameZh, "半蹲");

  const english = searchExercises({ query: "pendulum" });
  assert.deepEqual(english.map((exercise) => exercise.id), ["shoulder-pendulum"]);

  const chinese = searchExercises({ query: "扶椅單腳站" });
  assert.deepEqual(chinese.map((exercise) => exercise.id), ["single-leg-balance"]);
});

test("searchExercises combines structured filters and applies a bounded limit", () => {
  const shoulderStickExercises = searchExercises({
    bodyRegion: "shoulder",
    difficulty: 1,
    goals: ["assisted mobility"],
    equipment: ["stick"],
    phaseTags: ["post-operative-demo"],
  });

  assert.deepEqual(
    shoulderStickExercises.map((exercise) => exercise.id),
    ["shoulder-flexion-stick", "shoulder-external-rotation-stick"],
  );

  assert.equal(searchExercises({ bodyRegion: "hip", limit: 1 }).length, 1);
  assert.deepEqual(
    searchExercises({ bodyRegion: "hand" }).map((exercise) => exercise.id),
    ["tendon-glide-combo"],
  );
  assert.deepEqual(searchExercises({ limit: 0 }), []);
});
