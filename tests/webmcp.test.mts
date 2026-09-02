import assert from "node:assert/strict";
import test from "node:test";

import { RecoverableToolError } from "../src/lib/webmcp/execution.ts";
import {
  resolveDocumentModelContext,
  startWebMcpRegistration,
} from "../src/lib/webmcp/registration.ts";
import {
  createTherapistToolDescriptors,
  draftProgramSchema,
  getExerciseDetailsSchema,
  getProgramEditorStateSchema,
  prepareDraftContextSchema,
  searchExercisesSchema,
} from "../src/lib/webmcp/therapist-tools.ts";
import type {
  WebMcpModelContext,
  WebMcpRegistrationOptions,
  WebMcpToolDescriptor,
} from "../src/lib/webmcp/types.ts";

class FakeModelContext implements WebMcpModelContext {
  readonly calls: Array<{
    tool: WebMcpToolDescriptor;
    options?: WebMcpRegistrationOptions;
  }> = [];

  readonly registrations = new Map<string, WebMcpToolDescriptor>();

  get activeNames(): Set<string> {
    return new Set(this.registrations.keys());
  }

  async registerTool(
    tool: WebMcpToolDescriptor,
    options?: WebMcpRegistrationOptions,
  ): Promise<void> {
    options?.signal?.throwIfAborted();
    if (this.registrations.has(tool.name)) {
      throw new Error(`Duplicate active tool: ${tool.name}`);
    }
    this.calls.push({ tool, options });
    this.registrations.set(tool.name, tool);
    options?.signal?.addEventListener(
      "abort",
      () => {
        if (this.registrations.get(tool.name) === tool) {
          this.registrations.delete(tool.name);
        }
      },
      { once: true },
    );
  }
}

const handlers = {
  searchExercises: async (input: unknown) => ({ matches: [input] }),
  getExerciseDetails: async () => ({ id: "shoulder-wall-slide" }),
  getProgramEditorState: async () => ({ revision: 1, itemCount: 0 }),
  prepareDraftContext: async (input: unknown) => ({ prepared: input }),
  draftProgram: async () => ({ id: "draft-1", source: "agent" }),
};

function assertDescribedObjectSchema(schema: unknown): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return;
  }

  const record = schema as Record<string, unknown>;
  if (record.properties && typeof record.properties === "object") {
    assert.equal(record.additionalProperties, false);
    assert.ok(Array.isArray(record.required));

    for (const property of Object.values(
      record.properties as Record<string, unknown>,
    )) {
      assert.equal(typeof (property as Record<string, unknown>).description, "string");
      assertDescribedObjectSchema(property);
    }
  }

  if (record.items) {
    assertDescribedObjectSchema(record.items);
  }
}

test("registers the five editor tools with one ownership signal", async () => {
  const fake = new FakeModelContext();
  const tools = createTherapistToolDescriptors(handlers);
  const registration = startWebMcpRegistration(fake, tools);

  assert.deepEqual(await registration.ready, [
    "search_exercises",
    "get_exercise_details",
    "get_program_editor_state",
    "draft_program",
    "prepare_draft_context",
  ]);
  assert.equal(fake.calls.length, 5);
  assert.ok(fake.calls.every(({ options }) => options?.signal === registration.signal));
  assert.deepEqual([...fake.activeNames], [
    "search_exercises",
    "get_exercise_details",
    "get_program_editor_state",
    "draft_program",
    "prepare_draft_context",
  ]);

  assert.equal(tools[0]?.annotations.readOnlyHint, true);
  assert.equal(tools[1]?.annotations.readOnlyHint, true);
  assert.equal(tools[2]?.annotations.readOnlyHint, true);
  assert.equal(tools[3]?.annotations.readOnlyHint, false);
  assert.equal(tools[3]?.annotations.untrustedContentHint, true);
  assert.equal(tools[4]?.annotations.readOnlyHint, true);
  assert.equal(tools[4]?.annotations.untrustedContentHint, true);
});

test("therapist schemas describe every field and reject extra properties", () => {
  assertDescribedObjectSchema(searchExercisesSchema);
  assertDescribedObjectSchema(getExerciseDetailsSchema);
  assertDescribedObjectSchema(getProgramEditorStateSchema);
  assertDescribedObjectSchema(prepareDraftContextSchema);
  assertDescribedObjectSchema(draftProgramSchema);

  assert.deepEqual(searchExercisesSchema.required, ["query"]);
  assert.ok(searchExercisesSchema.properties.bodyRegion.enum.includes("hand"));
  assert.deepEqual(getExerciseDetailsSchema.required, ["exerciseId"]);
  assert.deepEqual(getProgramEditorStateSchema.required, []);
  assert.deepEqual(prepareDraftContextSchema.required, ["searches"]);
  assert.equal(prepareDraftContextSchema.properties.searches.maxItems, 3);
  assert.deepEqual(draftProgramSchema.required, ["items"]);
  assert.equal(draftProgramSchema.properties.items.maxItems, 4);
  assert.equal("replaceExistingDraft" in draftProgramSchema.properties, false);
  assert.deepEqual(draftProgramSchema.properties.items.items.required, [
    "query",
    "sets",
    "frequencyPerDay",
    "restSeconds",
  ]);
});

test("draft tool is a one-call route-bound write without redundant approval", async () => {
  const tools = createTherapistToolDescriptors(handlers);
  const input = {
    items: [
      {
        query: "supported heel raise",
        bodyRegion: "ankle",
        equipment: "chair",
        sets: 2,
        reps: 12,
        frequencyPerDay: 1,
        restSeconds: 45,
      },
    ],
  };

  assert.deepEqual(await tools[3]?.execute(input), {
    ok: true,
    value: { id: "draft-1", source: "agent" },
  });
  assert.equal(tools[3]?.annotations.readOnlyHint, false);
  assert.match(tools[3]?.description ?? "", /without asking for redundant approval/i);
  assert.match(tools[3]?.description ?? "", /never confirms, activates, or publishes/i);
});

test("preferred draft context tool forwards one bounded batch as a read", async () => {
  const tools = createTherapistToolDescriptors(handlers);
  const input = {
    searches: [
      { query: "heel raise", bodyRegion: "ankle", maxResults: 1 },
      { query: "half squat", bodyRegion: "knee", maxResults: 1 },
    ],
  };

  assert.deepEqual(await tools[4]?.execute(input), {
    ok: true,
    value: { prepared: input },
  });
  assert.equal(tools[4]?.annotations.readOnlyHint, true);
});

test("aborting registration removes route tools and a remount can register cleanly", async () => {
  const fake = new FakeModelContext();
  const tools = createTherapistToolDescriptors(handlers);
  const first = startWebMcpRegistration(fake, tools);
  await first.ready;

  first.abort();
  assert.equal(first.signal.aborted, true);
  assert.equal(fake.activeNames.size, 0);

  const second = startWebMcpRegistration(fake, tools);
  await second.ready;
  assert.equal(second.signal.aborted, false);
  assert.deepEqual([...fake.activeNames], [
    "search_exercises",
    "get_exercise_details",
    "get_program_editor_state",
    "draft_program",
    "prepare_draft_context",
  ]);

  second.abort();
});

test("feature detection handles unsupported and malformed browsers", () => {
  const fake = new FakeModelContext();

  assert.equal(resolveDocumentModelContext(undefined), null);
  assert.equal(resolveDocumentModelContext({}), null);
  assert.equal(resolveDocumentModelContext({ modelContext: {} }), null);
  assert.equal(resolveDocumentModelContext({ modelContext: fake }), fake);
});

test("execute returns recoverable domain and thrown validation errors", async () => {
  const returnedFailureTools = createTherapistToolDescriptors({
    ...handlers,
    getExerciseDetails: async () => ({
      ok: false,
      errors: [
        {
          code: "exercise_not_found",
          message: "Exercise was not found.",
          field: "exerciseId",
          recoverable: true,
        },
      ],
    }),
  });

  assert.deepEqual(
    await returnedFailureTools[1]?.execute({ exerciseId: "missing" }),
    {
      ok: false,
      errors: [
        {
          code: "exercise_not_found",
          message: "Exercise was not found.",
          field: "exerciseId",
          recoverable: true,
        },
      ],
    },
  );

  const thrownFailureTools = createTherapistToolDescriptors({
    ...handlers,
    draftProgram: async () => {
      throw new RecoverableToolError([
        {
          code: "needs_clarification",
          message: "Add the procedure or an approved protocol.",
          field: "caseContext.procedure",
          recoverable: true,
        },
      ]);
    },
  });

  assert.deepEqual(await thrownFailureTools[3]?.execute({}), {
    ok: false,
    errors: [
      {
        code: "needs_clarification",
        message: "Add the procedure or an approved protocol.",
        field: "caseContext.procedure",
        recoverable: true,
      },
    ],
  });
});

test("execute sanitizes unknown failures and returns a plain JSON object", async () => {
  const tools = createTherapistToolDescriptors({
    ...handlers,
    searchExercises: async () => {
      throw new Error("secret database details");
    },
  });

  const failure = await tools[0]?.execute({ query: "shoulder" });
  assert.deepEqual(failure, {
    ok: false,
    errors: [
      {
        code: "internal_error",
        message: "The tool could not complete the request.",
        recoverable: false,
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(failure), /secret database details/);
  assert.equal("content" in (failure ?? {}), false);

  const success = await createTherapistToolDescriptors(handlers)[0]?.execute({
    query: "shoulder",
  });
  assert.deepEqual(success, {
    ok: true,
    value: { matches: [{ query: "shoulder" }] },
  });
  assert.equal("content" in (success ?? {}), false);
});

test("execute forwards and honors the invocation AbortSignal", async () => {
  let receivedSignal: AbortSignal | undefined;
  const tools = createTherapistToolDescriptors({
    ...handlers,
    searchExercises: async (_input, { signal }) => {
      receivedSignal = signal;
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          { once: true },
        );
      });
    },
  });
  const controller = new AbortController();
  const resultPromise = tools[0]?.execute(
    { query: "shoulder" },
    { signal: controller.signal },
  );

  controller.abort();

  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(await resultPromise, {
    ok: false,
    errors: [
      {
        code: "cancelled",
        message: "Tool execution was cancelled.",
        recoverable: true,
      },
    ],
  });
});

test("an already-aborted execution never invokes its handler", async () => {
  let called = false;
  const tools = createTherapistToolDescriptors({
    ...handlers,
    getExerciseDetails: async () => {
      called = true;
      return {};
    },
  });
  const controller = new AbortController();
  controller.abort();

  const result = await tools[1]?.execute(
    { exerciseId: "shoulder-wall-slide" },
    { signal: controller.signal },
  );

  assert.equal(called, false);
  assert.equal(result?.ok, false);
  if (result && !result.ok) {
    assert.equal(result.errors[0]?.code, "cancelled");
  }
});
