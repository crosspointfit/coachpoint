import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hubPath = new URL(
  "../src/components/therapist/ClientProgramHub.tsx",
  import.meta.url,
);

test("therapist client hub reads the validated patient session for the active code", async () => {
  const source = await readFile(hubPath, "utf8");

  assert.match(source, /readPatientSession\(activePatientCode\)/);
  assert.match(source, /getSessionProgress\(patientSession\)/);
  assert.match(source, /projectLatestPatientMotionResult\(patientSession\)/);
  assert.match(source, /window\.addEventListener\("storage", refresh\)/);
  assert.match(source, /window\.addEventListener\("focus", refresh\)/);
});

test("therapist client hub shows adherence and checked-in motion observations", async () => {
  const source = await readFile(hubPath, "utf8");

  assert.match(source, /Adherence and latest camera result/);
  assert.match(source, /Resolved sets/);
  assert.match(source, /Skipped \/ stopped/);
  assert.match(source, /average detected range/);
  assert.match(source, /latestPatientMotion\.checkIn\.rpe/);
  assert.match(source, /latestPatientMotion\.checkIn\.pain/);
  assert.doesNotMatch(source, /localStorage\.getItem/);
});
