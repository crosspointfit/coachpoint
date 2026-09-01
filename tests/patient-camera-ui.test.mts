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
  const apply = between(source, "const apply =", "const startNextSet =");
  const persistIndex = apply.indexOf("writePatientSession(code, result.value)");
  const refIndex = apply.indexOf("sessionRef.current = result.value");
  const setIndex = apply.indexOf("setSession(result.value)");

  assert.ok(persistIndex >= 0);
  assert.ok(refIndex > persistIndex);
  assert.ok(setIndex > refIndex);
  assert.match(
    apply,
    /if \(!writePatientSession\(code, result\.value\)\) \{[\s\S]*?return false;/,
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
  assert.match(source, /Therapist-confirmed revision/);

  const terminalHandler = between(
    source,
    "const handleCameraTerminal =",
    "const completeCameraCheckIn =",
  );
  assert.match(terminalHandler, /stageMotionSetResult\(current/);
  assert.match(terminalHandler, /aggregate: result\.aggregate/);
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
  assert.match(
    source,
    /cameraPanelRef\.current\?\.stop\("Patient reported pain during the camera set\."\)/,
  );
  assert.match(
    source,
    /cameraPanelRef\.current\?\.stop\("Patient stopped the demo session\."\)/,
  );
  assert.match(source, /onClick=\{stopPatientSession\}/);
});

test("patient camera panel requires explicit human prepare, start and Stop actions", async () => {
  const source = await readFile(cameraPanelPath, "utf8");
  const prepare = between(source, "const prepare =", "const start =");
  const start = between(source, "const start =", "const busy =");
  const stop = between(source, "const stop =", "useImperativeHandle");

  assert.match(source, /targetSource: "therapist_confirmed"/);
  assert.match(prepare, /await camera\.prepare\(\)/);
  assert.doesNotMatch(prepare, /onBeginCameraSet|camera\.start/);
  assert.match(start, /onBeginCameraSet\(\)/);
  assert.match(start, /await camera\.start\(\)/);
  assert.ok(start.indexOf("onBeginCameraSet()") < start.indexOf("camera.start()"));
  assert.match(stop, /camera\.stop\(\)/);

  assert.match(source, /"Set up camera"/);
  assert.match(source, /Start camera set/);
  assert.match(source, /onClick=\{\(\) => stop\(\)\}/);
  assert.match(source, /Camera set running/);
  assert.match(source, />\s*End set\s*</);
  assert.match(source, />\s*Use manual fallback\s*</);
  assert.match(
    source,
    /Starting and stopping remain human controls\./,
  );

  // The panel owns ephemeral video/canvas refs but has no persistence surface;
  // only its allowlisted terminal result crosses back to the workspace.
  assert.match(source, /onTerminal\(result, stopReason\)/);
  assert.doesNotMatch(
    source,
    /writePatientSession|localStorage|sessionStorage|JSON\.stringify/,
  );
  assert.match(
    source,
    /No video frames, raw landmarks, or per-repetition time series are saved\./,
  );
});
