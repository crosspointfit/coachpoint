import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = new URL(
  "../src/components/therapist/TherapistWorkspace.tsx",
  import.meta.url,
);

test("preferred draft context handler stays route-bound, batched and truly read-only", async () => {
  const source = await readFile(workspacePath, "utf8");
  const start = source.indexOf("prepareDraftContext: async");
  const end = source.indexOf("draftProgram: async", start);

  assert.ok(start >= 0);
  assert.ok(end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /readProgramWorkspaceForClient\(clientId, programId\)/);
  assert.match(handler, /prepareProgramDraftContext\(/);
  assert.match(handler, /searches: input\.searches/);
  assert.match(handler, /signal\.throwIfAborted\(\)/);
  assert.doesNotMatch(
    handler,
    /write[A-Z]|set[A-Z]|appendActivity|createProgramDraft|confirmProgram/,
  );
});

test("preferred draft write resolves the library and persists in one route-bound call", async () => {
  const source = await readFile(workspacePath, "utf8");
  const start = source.indexOf("draftProgram: async");
  const end = source.indexOf("\n        },\n      });", start);

  assert.ok(start >= 0);
  assert.ok(end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /readProgramWorkspaceForClient\(clientId, programId\)/);
  assert.match(handler, /prepareProgramDraftContext\(/);
  assert.match(handler, /createProgramDraft\(/);
  assert.match(handler, /writeClientProgramWorkspace\(/);
  assert.match(handler, /signal\.throwIfAborted\(\)/);
  assert.match(handler, /confirmed_program_requires_human_reopen/);
  assert.match(handler, /visible_draft_must_be_empty/);
  assert.doesNotMatch(handler, /confirmProgram\(/);
});
