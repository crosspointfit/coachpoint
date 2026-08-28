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

  readonly activeNames = new Set<string>();

  async registerTool(
    tool: WebMcpToolDescriptor,
    options?: WebMcpRegistrationOptions,
  ): Promise<void> {
    this.calls.push({ tool, options });
    this.activeNames.add(tool.name);
    options?.signal?.addEventListener(
      "abort",
      () => this.activeNames.delete(tool.name),
      { once: true },
    );
  }
}

const handlers = {
  searchExercises: async (input: unknown) => ({ matches: [input] }),
  getExerciseDetails: async () => ({ id: "shoulder-wall-slide" }),
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

test("registers the three therapist tools with one ownership signal", async () => {
  const fake = new FakeModelContext();
  const tools = createTherapistToolDescriptors(handlers);
  const registration = startWebMcpRegistration(fake, tools);

  assert.deepEqual(await registration.ready, [
    "search_exercises",
    "get_exercise_details",
    "draft_program",
  ]);
  assert.equal(fake.calls.length, 3);
  assert.ok(fake.calls.every(({ options }) => options?.signal === registration.signal));
  assert.deepEqual([...fake.activeNames], [
    "search_exercises",
    "get_exercise_details",
    "draft_program",
  ]);

  assert.equal(tools[0]?.annotations.readOnlyHint, true);
  assert.equal(tools[1]?.annotations.readOnlyHint, true);
  assert.equal(tools[2]?.annotations.readOnlyHint, false);
  assert.equal(tools[2]?.annotations.untrustedContentHint, true);
});

test("therapist schemas describe every field and reject extra properties", () => {
  assertDescribedObjectSchema(searchExercisesSchema);
  assertDescribedObjectSchema(getExerciseDetailsSchema);
  assertDescribedObjectSchema(draftProgramSchema);

  assert.deepEqual(searchExercisesSchema.required, ["query"]);
  assert.ok(searchExercisesSchema.properties.bodyRegion.enum.includes("hand"));
  assert.deepEqual(getExerciseDetailsSchema.required, ["exerciseId"]);
  assert.deepEqual(draftProgramSchema.required, ["caseContext", "items"]);
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
    "draft_program",
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

  assert.deepEqual(await thrownFailureTools[2]?.execute({}), {
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
