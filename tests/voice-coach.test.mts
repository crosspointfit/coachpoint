import assert from "node:assert/strict";
import test from "node:test";

import {
  VOICE_COACH_DEFAULT_RATE,
  VOICE_COACH_DEFAULT_VOLUME,
  VOICE_COACH_LANGUAGE,
  listEnglishVoices,
  selectEnglishVoice,
} from "../src/motion/voice-coach.ts";

function voice(
  name: string,
  lang: string,
  isDefault = false,
): SpeechSynthesisVoice {
  return {
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

test("voice coach uses restrained English speech defaults", () => {
  assert.equal(VOICE_COACH_LANGUAGE, "en-US");
  assert.equal(VOICE_COACH_DEFAULT_VOLUME, 0.28);
  assert.equal(VOICE_COACH_DEFAULT_RATE, 0.95);
});

test("voice selection prefers US English over a default voice in another locale", () => {
  const britishDefault = voice("British default", "en-GB", true);
  const usVoice = voice("US voice", "en-US");
  const selected = selectEnglishVoice([
    voice("Mandarin", "zh-TW"),
    britishDefault,
    usVoice,
  ]);

  assert.equal(selected, usVoice);
});

test("voice selection accepts normalized US locales and defaults within a tier", () => {
  const firstUsVoice = voice("First US", "EN_us");
  const defaultUsVoice = voice("Default US", "en-US", true);

  assert.equal(
    selectEnglishVoice([firstUsVoice, defaultUsVoice]),
    defaultUsVoice,
  );
});

test("voice selection falls back to any English voice, then silence", () => {
  const englishVoice = voice("Irish English", "en-IE");
  assert.equal(
    selectEnglishVoice([voice("Japanese", "ja-JP"), englishVoice]),
    englishVoice,
  );
  assert.equal(selectEnglishVoice([voice("Japanese", "ja-JP")]), null);
  assert.equal(selectEnglishVoice([]), null);
});

test("voice selection ranks Samantha ahead of an earlier novelty voice", () => {
  const albert = voice("Albert", "en-US", true);
  const samantha = voice("Samantha", "en-US");
  assert.equal(selectEnglishVoice([albert, samantha]), samantha);
});

test("voice selection honors a safe user-selected voice URI", () => {
  const samantha = voice("Samantha", "en-US");
  const selected = voice("Daniel", "en-GB");
  assert.equal(
    selectEnglishVoice([samantha, selected], selected.voiceURI),
    selected,
  );
});

test("a preferred voice is restored when a later browser voice list includes it", () => {
  const samantha = voice("Samantha", "en-US");
  const daniel = voice("Daniel", "en-GB");
  const preferredVoiceURI = daniel.voiceURI;

  assert.equal(
    selectEnglishVoice([samantha], preferredVoiceURI),
    samantha,
  );
  assert.equal(
    selectEnglishVoice([samantha, daniel], preferredVoiceURI),
    daniel,
  );
});

test("voice selection ignores stale and novelty preferred URIs", () => {
  const samantha = voice("Samantha", "en-US");
  const albert = voice("Albert", "en-US");
  assert.equal(
    selectEnglishVoice([samantha, albert], albert.voiceURI),
    samantha,
  );
  assert.equal(selectEnglishVoice([samantha], "missing-voice"), samantha);
});

test("novelty-only English lists return no usable voice", () => {
  assert.equal(
    selectEnglishVoice([
      voice("Albert", "en-US"),
      voice("Fred", "en-US"),
      voice("Zarvox", "en-US"),
    ]),
    null,
  );
});

test("quality markers rank deterministically and voice options exclude novelty", () => {
  const generic = voice("Plain voice", "en-US", true);
  const natural = voice("Microsoft Aria Online (Natural)", "en-US");
  const enhanced = voice("Ava Enhanced", "en-US");
  const novelty = voice("Boing", "en-US");
  const voices = [generic, natural, enhanced, novelty];

  assert.equal(selectEnglishVoice(voices), natural);
  assert.deepEqual(
    listEnglishVoices(voices).map((option) => option.voiceURI),
    [natural.voiceURI, enhanced.voiceURI, generic.voiceURI],
  );
  assert.match(listEnglishVoices([generic])[0]?.label ?? "", /On-device/);
  assert.match(
    listEnglishVoices([voice("Eddy (English US)", "en-US")])[0]?.label ?? "",
    /^Eddy \(en-US\)/,
  );
});

test("voice ranking does not depend on browser enumeration order", () => {
  const left = voice("Alpha voice", "en-US");
  const right = voice("Beta voice", "en-US");
  assert.equal(
    selectEnglishVoice([right, left])?.voiceURI,
    selectEnglishVoice([left, right])?.voiceURI,
  );
});
