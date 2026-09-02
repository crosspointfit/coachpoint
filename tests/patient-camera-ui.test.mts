import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = new URL(
  "../src/components/patient/PatientSessionWorkspace.tsx",
  import.meta.url,
);
const cameraPanelPath = new URL(
  "../src/components/patient/PatientCameraSetPanel.tsx",
  import.meta.url,
);

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source boundary: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("patient workspace persists each domain result before exposing it as visible state", async () => {
  const source = await readFile(workspacePath, "utf8");
  const commit = between(source, "const commitSession =", "useEffect(() =>");
  const persistIndex = commit.indexOf("writePatientSession(code, next)");
  const refIndex = commit.indexOf("sessionRef.current = next");
  const setIndex = commit.indexOf("setSession(next)");

  assert.ok(persistIndex >= 0);
  assert.ok(refIndex > persistIndex);
  assert.ok(setIndex > refIndex);
  assert.match(
    commit,
    /if \(!writePatientSession\(code, next\)\) \{[\s\S]*?return false;/,
  );

  // Session writes belong to explicit hydration/reset/domain commits. There is
  // no effect that writes merely because React session state changed.
  assert.doesNotMatch(
    source,
    /useEffect\([\s\S]{0,300}?writePatientSession\(code, session\)/,
  );
  assert.doesNotMatch(source, /\[code, session\]/);
});

test("patient camera flow keeps the confirmed target, check-in and safety controls in the workspace", async () => {
  const source = await readFile(workspacePath, "utf8");

  assert.match(source, /from "\.\/PatientCameraSetPanel"/);
  assert.match(
    source,
    /focusSet\?\.exerciseId === "half-squat"[\s\S]*?focusSet\.prescribedCoachingMode === "camera"[\s\S]*?focusSet\.prescribedTarget\.reps !== undefined/,
  );
  assert.match(
    source,
    /startExerciseSet\(current, \{ setId: currentSet\.id, mode: "camera" \}\)/,
  );
  assert.match(
    source,
    /targetRepetitions=\{focusSet\.prescribedTarget\.reps \?\? 1\}/,
  );
  assert.match(source, /exerciseThumbnailPath=\{focusExercise\.thumbnailPath\}/);
  assert.match(source, /setNumber=\{focusSet\.prescribedTarget\.setNumber\}/);
  assert.match(source, /totalSets=\{progress\.totalSets\}/);
  assert.match(source, /Therapist-confirmed revision/);

  const terminalHandler = between(
    source,
    "const handleCameraTerminal =",
    "const completeCameraCheckIn =",
  );
  assert.match(terminalHandler, /stageMotionSetResult\(current/);
  assert.match(terminalHandler, /set\.id === originatingSetId/);
  assert.match(terminalHandler, /aggregate: result\.aggregate/);
  assert.match(terminalHandler, /return saved/);
  assert.doesNotMatch(
    terminalHandler,
    /landmarks|frames|startedAtMs|completedAtMs|\breps\s*:/,
  );

  const checkIn = between(
    source,
    "const completeCameraCheckIn =",
    "const recordPain =",
  );
  assert.match(checkIn, /rpe === "" \|\| pain === ""/);
  assert.match(checkIn, /completeMotionSetCheckIn\(current/);
  assert.match(checkIn, /rpe,[\s\S]*?pain,/);
  assert.match(source, /useState<number \| "">\(""\)/g);
  assert.match(source, /setRpe\(""\)/);
  assert.match(source, /setPain\(""\)/);

  assert.match(source, /switchActiveCameraSetToManualFallback\(current/);
  assert.match(source, /onUseManualFallback=\{useManualFallback\}/);
  const painHandler = between(source, "const recordPain =", "const resetSession =");
  assert.doesNotMatch(painHandler, /cameraPanelRef\.current\?\.stop/);
  assert.match(painHandler, /Patient-reported during timer\/manual fallback/);
  assert.doesNotMatch(source, /Pain now · 0–10|End set and record pain/);
  assert.match(
    source,
    /cameraPanelRef\.current\?\.stop\("Patient stopped the demo session\."\)/,
  );
  assert.match(source, /onClick=\{stopPatientSession\}/);
});

test("patient camera panel keeps human Start while remembering a validated local camera", async () => {
  const source = await readFile(cameraPanelPath, "utf8");
  const prepare = between(source, "const prepareCamera =", "const start =");
  const start = between(source, "const start =", "const retryTerminalSave =");
  const stop = between(source, "const stop =", "useImperativeHandle");

  assert.match(source, /targetSource: "therapist_confirmed"/);
  assert.match(prepare, /await cameraPrepare\(\)/);
  assert.doesNotMatch(prepare, /onBeginCameraSet|camera\.start/);
  assert.match(start, /onBeginCameraSet\(\)/);
  assert.match(start, /await cameraStart\(resolvedCamera\.deviceId\)/);
  assert.ok(
    start.indexOf("onBeginCameraSet()") <
      start.indexOf("cameraStart(resolvedCamera.deviceId)"),
  );
  assert.match(stop, /startAttemptRef\.current \+= 1/);
  assert.match(stop, /cameraStop\(\)/);

  assert.match(source, /"Set up camera"/);
  assert.match(source, /Start camera set/);
  assert.match(source, /onClick=\{\(\) => stop\(\)\}/);
  assert.match(source, /fixed inset-0 z-\[100\]/);
  assert.match(source, /On-device pose tracking/);
  assert.match(source, />\s*Pain \/ stop\s*</);
  assert.match(source, />\s*End set\s*</);
  assert.match(source, />\s*Manual fallback\s*</);
  assert.match(source, /Rate pain and effort after the set/);
  assert.doesNotMatch(source, /Pain now · 0–10|type="number"/);

  assert.match(source, /readPatientCameraPreference\(\)/);
  assert.match(source, /resolvePatientCameraPreference/);
  assert.match(source, /savePatientCameraPreference/);
  assert.match(source, /cameraStart\(resolvedCamera\.deviceId\)/);
  assert.match(source, /Available cameras appear here automatically/);

  // The panel owns ephemeral video/canvas refs but has no persistence surface;
  // only its allowlisted terminal result crosses back to the workspace.
  assert.match(source, /onTerminal\(setId, result, stopReason\)/);
  assert.doesNotMatch(
    source,
    /writePatientSession|sessionStorage|JSON\.stringify/,
  );
  assert.match(
    source,
    /No video frames, raw landmarks, or per-repetition time series are saved\./,
  );
});

test("patient coaching focus stays separate and requires an explicit human decision", async () => {
  const source = await readFile(workspacePath, "utf8");
  const panel = await readFile(cameraPanelPath, "utf8");

  assert.match(source, /createPatientFocusToolDescriptors/);
  assert.match(source, /acceptNextSetFocus/);
  assert.match(source, /dismissNextSetFocus/);
  assert.match(source, /Agent suggestion · your decision/);
  assert.match(source, />\s*Accept focus\s*</);
  assert.match(source, />\s*Dismiss\s*</);
  assert.match(source, /This suggestion does not change the therapist-confirmed exercise, repetitions, rest, order, or range/);
  assert.match(source, /Accepted coaching focus/);
  assert.match(source, /coachingFocus=\{acceptedCoachingFocus\?\.focusText\}/);
  assert.match(panel, /Your focus/);
  assert.match(panel, /\{coachingFocus\}/);
  assert.match(
    source,
    /disabled=\{[\s\S]*?pendingCoachingFocus !== null[\s\S]*?\}/,
  );
});

test("running camera UI preserves one mounted owner and moves scoring to post-set check-in", async () => {
  const source = await readFile(cameraPanelPath, "utf8");

  assert.equal((source.match(/useHalfSquatCameraSet\(/g) ?? []).length, 1);
  assert.equal((source.match(/ref=\{camera\.videoRef\}/g) ?? []).length, 1);
  assert.equal((source.match(/ref=\{camera\.canvasRef\}/g) ?? []).length, 1);
  assert.match(source, /const immersive = starting \|\| running/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(source, /src=\{exerciseThumbnailPath\}/);
  assert.match(source, /Set \{setNumber\} of \{totalSets\}/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /Camera result needs to be saved/);
  assert.match(source, />\s*Retry save\s*</);
});
