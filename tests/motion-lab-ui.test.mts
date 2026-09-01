import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const motionLabPath = new URL(
  "../src/components/motion/MotionLab.tsx",
  import.meta.url,
);

test("Motion Lab exposes one automatic camera-first setup flow", async () => {
  const source = await readFile(motionLabPath, "utf8");

  assert.match(source, /refreshCameraDevices/);
  assert.match(source, /Checking connected cameras automatically/);
  assert.match(source, /Start 6-rep set/);
  assert.match(source, /Audio coaching/);
  assert.match(source, /soft chime confirms each rep/);
  assert.match(source, /completedRepFeedback/);
  assert.match(source, /Coach voice/);
  assert.match(source, /Preview/);
  assert.match(source, /Voice volume/);
  assert.match(source, /Agent review ready/);
  assert.match(source, /Ask how this set went/);
  assert.match(source, /get_latest_motion_lab_set_result/);
  assert.match(source, /The agent did not watch your camera/);
  assert.match(source, /Copy review prompt/);

  assert.doesNotMatch(source, /Run deterministic replay/);
  assert.doesNotMatch(source, /Load local pose model/);
  assert.doesNotMatch(source, /Find cameras/);
  assert.doesNotMatch(source, /Refresh camera list/);
  assert.doesNotMatch(source, /completedRepVoiceCue/);
  assert.doesNotMatch(source, /read_motion_session_state/);
});

test("Motion Lab keeps permission and speech behind explicit controls", async () => {
  const source = await readFile(motionLabPath, "utf8");

  assert.equal(source.match(/\.getUserMedia\(/g)?.length, 1);
  assert.match(source, /onClick=[\s\S]*startCamera/);
  assert.match(source, /voiceEnabledRef\.current/);
  assert.match(source, /utterance\.lang = englishVoice\.lang/);
  assert.doesNotMatch(source, /String\(processed\.update\.event\.record\.rep\)/);
});
