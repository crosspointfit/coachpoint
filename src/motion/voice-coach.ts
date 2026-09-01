export const VOICE_COACH_LANGUAGE = "en-US";
export const VOICE_COACH_DEFAULT_VOLUME = 0.28;
export const VOICE_COACH_DEFAULT_RATE = 0.95;
export const VOICE_COACH_DEFAULT_PITCH = 1;

export interface EnglishVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  label: string;
  localService: boolean;
  default: boolean;
}

const NOVELTY_VOICE_NAMES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "fred",
  "good news",
  "grandma",
  "grandpa",
  "hysterical",
  "jester",
  "junior",
  "organ",
  "pipe organ",
  "princess",
  "ralph",
  "rocko",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
]);

const QUALITY_VOICE_PATTERN = /\b(natural|neural|enhanced|premium)\b/i;
const TRUSTED_PROVIDER_PATTERN = /\b(google|microsoft)\b/i;

function normalizedLanguage(language: string): string {
  return language.trim().replaceAll("_", "-").toLowerCase();
}

function normalizedVoiceName(name: string): string {
  return name
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  const language = normalizedLanguage(voice.lang);
  return language === "en" || language.startsWith("en-");
}

function isNoveltyVoice(voice: SpeechSynthesisVoice): boolean {
  const normalizedName = normalizedVoiceName(voice.name);
  if (NOVELTY_VOICE_NAMES.has(normalizedName)) return true;

  const normalizedUri = voice.voiceURI
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return [...NOVELTY_VOICE_NAMES].some(
    (name) =>
      normalizedUri.endsWith(` ${name}`) || normalizedUri === name,
  );
}

function voiceScore(
  voice: SpeechSynthesisVoice,
  preferredVoiceURI?: string | null,
): number {
  const searchable = `${voice.name} ${voice.voiceURI}`;
  const language = normalizedLanguage(voice.lang);
  const normalizedName = normalizedVoiceName(voice.name);
  let score = 0;

  if (preferredVoiceURI && voice.voiceURI === preferredVoiceURI) {
    score += 1_000_000;
  }
  if (normalizedName === "samantha") score += 100_000;
  if (QUALITY_VOICE_PATTERN.test(searchable)) score += 10_000;
  if (TRUSTED_PROVIDER_PATTERN.test(searchable)) score += 5_000;
  if (language === "en-us") score += 1_000;
  if (voice.localService) score += 100;
  if (voice.default) score += 10;
  return score;
}

function compareVoices(
  preferredVoiceURI?: string | null,
): (left: SpeechSynthesisVoice, right: SpeechSynthesisVoice) => number {
  const compareText = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0;
  return (left, right) => {
    const scoreDifference =
      voiceScore(right, preferredVoiceURI) -
      voiceScore(left, preferredVoiceURI);
    if (scoreDifference !== 0) return scoreDifference;

    return (
      compareText(left.voiceURI, right.voiceURI) ||
      compareText(left.name, right.name) ||
      compareText(left.lang, right.lang)
    );
  };
}

function rankedEnglishVoices(
  voices: readonly SpeechSynthesisVoice[],
  preferredVoiceURI?: string | null,
): SpeechSynthesisVoice[] {
  return voices
    .filter((voice) => isEnglishVoice(voice) && !isNoveltyVoice(voice))
    .slice()
    .sort(compareVoices(preferredVoiceURI));
}

/**
 * Picks a predictable, non-novelty English speech voice. An available user
 * preference wins first, followed by trusted and explicitly higher-quality
 * voices, US English, local voices, and browser defaults.
 */
export function selectEnglishVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferredVoiceURI?: string | null,
): SpeechSynthesisVoice | null {
  return rankedEnglishVoices(voices, preferredVoiceURI)[0] ?? null;
}

/**
 * Returns safe English voices in the same deterministic order used by the
 * automatic selector. Persist voiceURI, not name: display names are not unique.
 */
export function listEnglishVoices(
  voices: readonly SpeechSynthesisVoice[],
): EnglishVoiceOption[] {
  const seenUris = new Set<string>();
  return rankedEnglishVoices(voices)
    .filter((voice) => {
      if (seenUris.has(voice.voiceURI)) return false;
      seenUris.add(voice.voiceURI);
      return true;
    })
    .map((voice) => {
      const displayName = voice.name.trim().replace(/\s*\([^)]*\)\s*$/, "");
      return {
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        label: `${displayName} (${voice.lang})${voice.localService ? " · On-device" : ""}`,
        localService: voice.localService,
        default: voice.default,
      };
    });
}
