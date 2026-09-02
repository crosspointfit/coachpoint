import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareProgramDraftContext,
  type DraftContextSearchRequest,
} from "../src/domain/draft-context.ts";
import { getSyntheticClient } from "../src/domain/caseload.ts";
import type { ProgramDraft } from "../src/domain/types.ts";

function kneeContext() {
  const context = getSyntheticClient("demo-knee")?.caseContext;
  assert.ok(context);
  return context;
}

function currentDraft(): ProgramDraft {
  const context = kneeContext();
  return {
    id: "draft-test",
    patientLabel: context.patientLabel,
    caseContext: context,
    items: [],
    estimatedMinutes: 0,
    warnings: [],
    createdAt: "2026-09-02T00:00:00.000Z",
    source: "therapist",
    revision: 4,
  };
}

test("prepares one compact route context from multiple catalog searches", () => {
  const context = kneeContext();
  const searches: DraftContextSearchRequest[] = [
    {
      query: "heel raise",
      bodyRegion: "ankle",
      equipment: "chair",
      maxResults: 1,
    },
    {
      query: "half squat",
      bodyRegion: "knee",
      equipment: "chair",
      maxResults: 1,
    },
  ];

  const result = prepareProgramDraftContext({
    caseContext: context,
    currentDraft: currentDraft(),
    searches,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.expectedDraftRevision, 4);
  assert.deepEqual(
    result.value.movements.map((movement) => movement.id),
    ["heel-raise", "half-squat"],
  );
  assert.equal(result.value.movements[0]?.defaultDosage.reps, 12);
  assert.equal(result.value.movements[1]?.coachingMode, "camera");
  assert.match(
    result.value.movements[1]?.contraindications[0] ?? "",
    /loaded knee bending/i,
  );
  assert.deepEqual(result.value.caseIssues, []);
  assert.notEqual(result.value.caseContext, context);
  assert.notEqual(result.value.caseContext.goals, context.goals);

  const serialized = JSON.stringify(result.value);
  assert.ok(serialized.length < 1_500, `fast-path payload was ${serialized.length} characters`);
  for (const forbidden of [
    "imagePath",
    "thumbnailPath",
    "sourceFile",
    "nameZh",
    "confirmedCode",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("deduplicates one movement and reports unmatched search intents", () => {
  const result = prepareProgramDraftContext({
    caseContext: kneeContext(),
    currentDraft: null,
    searches: [
      { query: "half squat", maxResults: 1 },
      { query: "supported half squat", maxResults: 1 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.expectedDraftRevision, 0);
  assert.equal(result.value.movements.length, 1);
  assert.equal(result.value.searchSummary.requestCount, 2);
  assert.deepEqual(result.value.searchSummary.unmatchedQueries, []);
});

test("returns visible case issues without inventing missing post-op context", () => {
  const context = {
    ...kneeContext(),
    diagnosis: "Synthetic post-op knee case",
    postOpWeeks: 6,
    procedure: undefined,
    protocol: undefined,
  };
  const result = prepareProgramDraftContext({
    caseContext: context,
    currentDraft: null,
    searches: [{ query: "half squat" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.caseIssues[0]?.code, "needs_clarification");
  assert.match(result.value.caseIssues[0]?.field ?? "", /procedure/);
});

test("fails closed for oversized or malformed batched searches", () => {
  const context = kneeContext();
  const invalidCases: unknown[] = [
    [],
    [
      { query: "one" },
      { query: "two" },
      { query: "three" },
      { query: "four" },
    ],
    [{ query: "" }],
    [{ query: "half squat", maxResults: 3 }],
    [{ query: "half squat", bodyRegion: "foreign" }],
    [{ query: "half squat", equipment: 42 }],
  ];

  for (const searches of invalidCases) {
    const result = prepareProgramDraftContext({
      caseContext: context,
      currentDraft: null,
      searches: searches as DraftContextSearchRequest[],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors[0]?.code, "invalid_draft_context_search");
      assert.equal(result.errors[0]?.recoverable, true);
    }
  }
});
