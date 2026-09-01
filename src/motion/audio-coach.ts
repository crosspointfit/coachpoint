export type MotionEarcon = "rep" | "complete" | "warning";

export type RepFeedbackMilestone = "halfway" | "last_one" | "complete";

export interface CompletedRepFeedback {
  completedRep: number;
  targetReps: number;
  earcon: "rep" | "complete";
  milestone: RepFeedbackMilestone | null;
  voiceCue: string | null;
}

export type AudioContextFactory = () => AudioContext | null;

export interface AudioCoach {
  arm(): Promise<boolean>;
  isArmed(): boolean;
  playEarcon(kind: MotionEarcon): boolean;
  cancel(): void;
  close(): Promise<void>;
}

interface ToneStep {
  frequencyHz: number;
  startsAfterSeconds: number;
  durationSeconds: number;
  peakGain: number;
  oscillatorType: OscillatorType;
}

interface ActiveTone {
  oscillator: OscillatorNode;
  gain: GainNode;
}

const EARCON_TONES: Record<MotionEarcon, readonly ToneStep[]> = {
  rep: [
    {
      frequencyHz: 660,
      startsAfterSeconds: 0,
      durationSeconds: 0.065,
      peakGain: 0.025,
      oscillatorType: "sine",
    },
  ],
  complete: [
    {
      frequencyHz: 523.25,
      startsAfterSeconds: 0,
      durationSeconds: 0.08,
      peakGain: 0.028,
      oscillatorType: "sine",
    },
    {
      frequencyHz: 783.99,
      startsAfterSeconds: 0.095,
      durationSeconds: 0.12,
      peakGain: 0.032,
      oscillatorType: "sine",
    },
  ],
  warning: [
    {
      frequencyHz: 392,
      startsAfterSeconds: 0,
      durationSeconds: 0.09,
      peakGain: 0.025,
      oscillatorType: "triangle",
    },
    {
      frequencyHz: 293.66,
      startsAfterSeconds: 0.1,
      durationSeconds: 0.11,
      peakGain: 0.025,
      oscillatorType: "triangle",
    },
  ],
};

/**
 * Maps a validated rep event onto time-appropriate local feedback. Every rep
 * gets a short earcon, while speech is reserved for milestones that can
 * tolerate natural speech latency.
 */
export function completedRepFeedback(
  completedRep: number,
  targetReps = 6,
): CompletedRepFeedback | null {
  if (
    !Number.isInteger(completedRep) ||
    !Number.isInteger(targetReps) ||
    targetReps < 1 ||
    completedRep < 1 ||
    completedRep > targetReps
  ) {
    return null;
  }

  if (completedRep === targetReps) {
    return {
      completedRep,
      targetReps,
      earcon: "complete",
      milestone: "complete",
      voiceCue: "Set complete. Nice work.",
    };
  }

  if (completedRep === targetReps - 1) {
    return {
      completedRep,
      targetReps,
      earcon: "rep",
      milestone: "last_one",
      voiceCue: "Last one. Stay controlled.",
    };
  }

  if (completedRep * 2 === targetReps) {
    return {
      completedRep,
      targetReps,
      earcon: "rep",
      milestone: "halfway",
      voiceCue: "Halfway. Keep it smooth.",
    };
  }

  return {
    completedRep,
    targetReps,
    earcon: "rep",
    milestone: null,
    voiceCue: null,
  };
}

function defaultAudioContextFactory(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    (typeof AudioContext === "undefined" ? undefined : AudioContext) ??
    browserWindow.webkitAudioContext;

  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

function safelyDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already-disconnected audio nodes are harmless during cleanup.
  }
}

/**
 * Coordinates immediate Web Audio earcons without introducing another queue.
 * Call arm() from a user gesture; playEarcon() never creates or resumes an
 * AudioContext on its own.
 */
export function createAudioCoach(
  audioContextFactory: AudioContextFactory = defaultAudioContextFactory,
): AudioCoach {
  let context: AudioContext | null = null;
  let armPromise: Promise<boolean> | null = null;
  let disposed = false;
  const activeTones = new Set<ActiveTone>();

  const removeTone = (tone: ActiveTone) => {
    activeTones.delete(tone);
    tone.oscillator.onended = null;
    safelyDisconnect(tone.oscillator);
    safelyDisconnect(tone.gain);
  };

  const cancel = () => {
    for (const tone of [...activeTones]) {
      tone.oscillator.onended = null;
      try {
        tone.oscillator.stop();
      } catch {
        // A source that already ended needs no further cleanup.
      }
      removeTone(tone);
    }
  };

  const safelyCloseContext = async (candidate: AudioContext) => {
    if (candidate.state === "closed") return;
    try {
      await candidate.close();
    } catch {
      // Context teardown must remain safe during unmount and browser shutdown.
    }
  };

  const arm = async (): Promise<boolean> => {
    if (disposed) return false;
    if (context?.state === "running") return true;
    if (armPromise) return armPromise;

    const pending = (async () => {
      let candidate = context;
      if (!candidate || candidate.state === "closed") {
        try {
          candidate = audioContextFactory();
        } catch {
          candidate = null;
        }
      }
      if (!candidate || candidate.state === "closed") {
        context = null;
        return false;
      }

      context = candidate;
      if (candidate.state === "suspended") {
        try {
          await candidate.resume();
        } catch {
          if (context === candidate) context = null;
          await safelyCloseContext(candidate);
          return false;
        }
      }

      if (disposed) {
        if (context === candidate) context = null;
        await safelyCloseContext(candidate);
        return false;
      }

      if (candidate.state !== "running") {
        if (context === candidate) context = null;
        return false;
      }

      return true;
    })();

    armPromise = pending;
    try {
      const armed = await pending;
      return !disposed && armed;
    } finally {
      if (armPromise === pending) armPromise = null;
    }
  };

  const playEarcon = (kind: MotionEarcon): boolean => {
    const currentContext = context;
    if (disposed || currentContext?.state !== "running") return false;

    cancel();
    try {
      const now = currentContext.currentTime;
      for (const step of EARCON_TONES[kind]) {
        const startsAt = now + step.startsAfterSeconds;
        const attackEndsAt = startsAt + Math.min(0.012, step.durationSeconds / 3);
        const endsAt = startsAt + step.durationSeconds;
        const oscillator = currentContext.createOscillator();
        const gain = currentContext.createGain();
        const tone = { oscillator, gain };

        activeTones.add(tone);
        oscillator.type = step.oscillatorType;
        oscillator.frequency.setValueAtTime(step.frequencyHz, startsAt);
        gain.gain.setValueAtTime(0, startsAt);
        gain.gain.linearRampToValueAtTime(step.peakGain, attackEndsAt);
        gain.gain.linearRampToValueAtTime(0, endsAt);
        oscillator.connect(gain);
        gain.connect(currentContext.destination);
        oscillator.onended = () => removeTone(tone);
        oscillator.start(startsAt);
        oscillator.stop(endsAt + 0.01);
      }
      return true;
    } catch {
      cancel();
      return false;
    }
  };

  const close = async () => {
    if (disposed) return;
    disposed = true;
    cancel();
    const currentContext = context;
    context = null;
    if (currentContext) await safelyCloseContext(currentContext);
  };

  return {
    arm,
    isArmed: () => !disposed && context?.state === "running",
    playEarcon,
    cancel,
    close,
  };
}
