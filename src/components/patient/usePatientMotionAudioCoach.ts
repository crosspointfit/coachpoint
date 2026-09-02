"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  VOICE_COACH_DEFAULT_PITCH,
  VOICE_COACH_DEFAULT_RATE,
  VOICE_COACH_DEFAULT_VOLUME,
  completedRepFeedback,
  createAudioCoach,
  listEnglishVoices,
  selectEnglishVoice,
  type AudioCoach,
  type EnglishVoiceOption,
} from "@/motion";

const AUDIO_ENABLED_STORAGE_KEY = "coachpoint.motion.voice-enabled";
const AUDIO_VOICE_STORAGE_KEY = "coachpoint.motion.voice-uri";
const AUDIO_VOLUME_STORAGE_KEY = "coachpoint.motion.voice-volume";

const MIN_VOLUME = 0.1;
const MAX_VOLUME = 0.7;

export interface PatientMotionAudioControls {
  readonly enabled: boolean;
  readonly volume: number;
  readonly englishVoices: readonly EnglishVoiceOption[];
  readonly selectedVoiceURI: string;
  readonly speechAvailable: boolean;
  readonly voiceListResolved: boolean;
  readonly toggleEnabled: () => void;
  readonly changeVolume: (volume: number) => void;
  readonly changeVoice: (voiceURI: string) => void;
  readonly preview: () => void;
  readonly armForSet: () => void;
  readonly notifyCompletedRep: (
    completedRepetition: number,
    targetRepetitions: number,
  ) => void;
  readonly cancelPlayback: () => void;
}

function safeStorageWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The current browser session still works when storage is unavailable.
  }
}

function boundedVolume(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value))
    : VOICE_COACH_DEFAULT_VOLUME;
}

/**
 * Browser-local audio feedback for the patient camera flow. It owns no camera,
 * patient, persistence, or WebMCP state. Audio is armed only from an explicit
 * user gesture, every accepted rep gets one restrained chime, and speech is
 * reserved for milestones that can tolerate synthesis latency.
 */
export function usePatientMotionAudioCoach(): PatientMotionAudioControls {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(VOICE_COACH_DEFAULT_VOLUME);
  const [englishVoices, setEnglishVoices] = useState<EnglishVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [voiceListResolved, setVoiceListResolved] = useState(false);

  const enabledRef = useRef(false);
  const volumeRef = useRef(VOICE_COACH_DEFAULT_VOLUME);
  const selectedVoiceURIRef = useRef("");
  const audioCoachRef = useRef<AudioCoach | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingSpeechTimerRef = useRef<number | null>(null);
  const playbackGenerationRef = useRef(0);
  const lastCompletedRepRef = useRef(0);
  const mountedRef = useRef(true);

  const getAudioCoach = useCallback(() => {
    if (!audioCoachRef.current) {
      audioCoachRef.current = createAudioCoach();
    }
    return audioCoachRef.current;
  }, []);

  const cancelPlayback = useCallback(() => {
    playbackGenerationRef.current += 1;
    if (pendingSpeechTimerRef.current !== null) {
      window.clearTimeout(pendingSpeechTimerRef.current);
      pendingSpeechTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    activeUtteranceRef.current = null;
    audioCoachRef.current?.cancel();
  }, []);

  const speak = useCallback((message: string) => {
    if (!enabledRef.current || typeof window === "undefined") return;
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") return;

    const englishVoice = selectEnglishVoice(
      synthesis.getVoices(),
      selectedVoiceURIRef.current,
    );
    if (!englishVoice) return;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = englishVoice.lang;
    utterance.rate = VOICE_COACH_DEFAULT_RATE;
    utterance.pitch = VOICE_COACH_DEFAULT_PITCH;
    utterance.volume = volumeRef.current;
    utterance.voice = englishVoice;
    activeUtteranceRef.current = utterance;
    const clearCurrent = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
      }
    };
    utterance.onend = clearCurrent;
    utterance.onerror = clearCurrent;
    synthesis.speak(utterance);
  }, []);

  const scheduleSpeech = useCallback(
    (message: string, delayMs = 140) => {
      if (!enabledRef.current) return;
      const generation = playbackGenerationRef.current;
      if (pendingSpeechTimerRef.current !== null) {
        window.clearTimeout(pendingSpeechTimerRef.current);
      }
      window.speechSynthesis?.cancel();
      activeUtteranceRef.current = null;
      pendingSpeechTimerRef.current = window.setTimeout(() => {
        pendingSpeechTimerRef.current = null;
        if (
          !mountedRef.current ||
          !enabledRef.current ||
          playbackGenerationRef.current !== generation
        ) {
          return;
        }
        speak(message);
      }, delayMs);
    },
    [speak],
  );

  const armForSet = useCallback(() => {
    lastCompletedRepRef.current = 0;
    cancelPlayback();
    if (enabledRef.current) {
      // Called synchronously from the human Start gesture.
      void getAudioCoach().arm();
    }
  }, [cancelPlayback, getAudioCoach]);

  const notifyCompletedRep = useCallback(
    (completedRepetition: number, targetRepetitions: number) => {
      if (
        !enabledRef.current ||
        completedRepetition <= lastCompletedRepRef.current
      ) {
        return;
      }
      const feedback = completedRepFeedback(
        completedRepetition,
        targetRepetitions,
      );
      if (!feedback) return;
      lastCompletedRepRef.current = completedRepetition;
      getAudioCoach().playEarcon(feedback.earcon);
      if (feedback.voiceCue) {
        scheduleSpeech(
          feedback.voiceCue,
          feedback.milestone === "complete" ? 280 : 140,
        );
      }
    },
    [getAudioCoach, scheduleSpeech],
  );

  const toggleEnabled = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    safeStorageWrite(AUDIO_ENABLED_STORAGE_KEY, String(next));
    if (next) {
      // The toggle itself is also an explicit user gesture.
      void getAudioCoach().arm();
    } else {
      cancelPlayback();
    }
  }, [cancelPlayback, getAudioCoach]);

  const changeVolume = useCallback((nextVolume: number) => {
    const next = boundedVolume(nextVolume);
    volumeRef.current = next;
    setVolume(next);
    safeStorageWrite(AUDIO_VOLUME_STORAGE_KEY, String(next));
  }, []);

  const changeVoice = useCallback(
    (voiceURI: string) => {
      selectedVoiceURIRef.current = voiceURI;
      setSelectedVoiceURI(voiceURI);
      safeStorageWrite(AUDIO_VOICE_STORAGE_KEY, voiceURI);
      cancelPlayback();
    },
    [cancelPlayback],
  );

  const preview = useCallback(() => {
    if (!enabledRef.current) return;
    cancelPlayback();
    const generation = playbackGenerationRef.current;
    const coach = getAudioCoach();
    void coach.arm().then((armed) => {
      if (
        !armed ||
        !mountedRef.current ||
        !enabledRef.current ||
        playbackGenerationRef.current !== generation
      ) {
        return;
      }
      coach.playEarcon("rep");
      scheduleSpeech("Halfway. Keep it smooth.", 150);
    });
  }, [cancelPlayback, getAudioCoach, scheduleSpeech]);

  useEffect(() => {
    mountedRef.current = true;
    const synthesis =
      "speechSynthesis" in window ? window.speechSynthesis : null;

    const refreshVoices = () => {
      const hasSpeechApi =
        !!synthesis && typeof SpeechSynthesisUtterance !== "undefined";
      const voices = synthesis?.getVoices() ?? [];
      const options = listEnglishVoices(voices);
      const selected = selectEnglishVoice(
        voices,
        selectedVoiceURIRef.current,
      );
      if (voices.length > 0) setVoiceListResolved(true);
      setEnglishVoices(options);
      setSpeechAvailable(hasSpeechApi && selected !== null);
      if (selected) {
        selectedVoiceURIRef.current = selected.voiceURI;
        setSelectedVoiceURI(selected.voiceURI);
      } else {
        setSelectedVoiceURI("");
      }
    };

    const hydrationTimer = window.setTimeout(() => {
      try {
        const storedEnabled =
          window.localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) === "true";
        const storedVolumeValue = window.localStorage.getItem(
          AUDIO_VOLUME_STORAGE_KEY,
        );
        const storedVolume =
          storedVolumeValue === null
            ? VOICE_COACH_DEFAULT_VOLUME
            : boundedVolume(Number(storedVolumeValue));
        const storedVoiceURI =
          window.localStorage.getItem(AUDIO_VOICE_STORAGE_KEY) ?? "";
        enabledRef.current = storedEnabled;
        volumeRef.current = storedVolume;
        selectedVoiceURIRef.current = storedVoiceURI;
        setEnabled(storedEnabled);
        setVolume(storedVolume);
        setSelectedVoiceURI(storedVoiceURI);
      } catch {
        // Safe defaults remain active when storage is unavailable.
      }
      refreshVoices();
    }, 0);
    const voiceResolutionTimer = window.setTimeout(
      () => setVoiceListResolved(true),
      2_500,
    );
    synthesis?.addEventListener?.("voiceschanged", refreshVoices);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(hydrationTimer);
      window.clearTimeout(voiceResolutionTimer);
      synthesis?.removeEventListener?.("voiceschanged", refreshVoices);
      cancelPlayback();
      const coach = audioCoachRef.current;
      audioCoachRef.current = null;
      void coach?.close();
    };
  }, [cancelPlayback]);

  return {
    enabled,
    volume,
    englishVoices,
    selectedVoiceURI,
    speechAvailable,
    voiceListResolved,
    toggleEnabled,
    changeVolume,
    changeVoice,
    preview,
    armForSet,
    notifyCompletedRep,
    cancelPlayback,
  };
}
