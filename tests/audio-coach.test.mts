import assert from "node:assert/strict";
import test from "node:test";

import {
  completedRepFeedback,
  createAudioCoach,
  type MotionEarcon,
} from "../src/motion/audio-coach.ts";

test("completed rep feedback uses earcons every rep and speech only at milestones", () => {
  const feedback = Array.from({ length: 6 }, (_, index) =>
    completedRepFeedback(index + 1),
  );

  assert.deepEqual(
    feedback.map((item) => item?.earcon),
    ["rep", "rep", "rep", "rep", "rep", "complete"],
  );
  assert.deepEqual(
    feedback.map((item) => item?.milestone),
    [null, null, "halfway", null, "last_one", "complete"],
  );
  assert.deepEqual(
    feedback.map((item) => item?.voiceCue),
    [
      null,
      null,
      "Halfway. Keep it smooth.",
      null,
      "Last one. Stay controlled.",
      "Set complete. Nice work.",
    ],
  );
});

test("completed rep feedback rejects stale and impossible events", () => {
  assert.equal(completedRepFeedback(0), null);
  assert.equal(completedRepFeedback(7), null);
  assert.equal(completedRepFeedback(1.5), null);
  assert.equal(completedRepFeedback(1, 0), null);
});

test("completion and last-one cues take priority in short sets", () => {
  assert.equal(completedRepFeedback(1, 1)?.milestone, "complete");
  assert.equal(completedRepFeedback(1, 2)?.milestone, "last_one");
  assert.equal(completedRepFeedback(2, 2)?.milestone, "complete");
});

interface AudioHarness {
  context: AudioContext;
  get factoryCalls(): number;
  get resumeCalls(): number;
  get closeCalls(): number;
  get oscillators(): readonly OscillatorHarness[];
  setState(state: AudioContextState): void;
}

interface OscillatorHarness {
  frequencyHz?: number;
  type?: OscillatorType;
  starts: number[];
  stops: Array<number | undefined>;
  disconnectCalls: number;
  onended: (() => void) | null;
}

function audioHarness(initialState: AudioContextState = "running"): AudioHarness {
  let state = initialState;
  let factoryCalls = 0;
  let resumeCalls = 0;
  let closeCalls = 0;
  const oscillators: OscillatorHarness[] = [];

  const destination = {} as AudioDestinationNode;
  const context = {
    get state() {
      return state;
    },
    currentTime: 2,
    destination,
    resume: async () => {
      resumeCalls += 1;
      state = "running";
    },
    close: async () => {
      closeCalls += 1;
      state = "closed";
    },
    createGain: () => ({
      gain: {
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
      },
      connect: () => destination,
      disconnect: () => undefined,
    }),
    createOscillator: () => {
      const oscillator: OscillatorHarness = {
        starts: [],
        stops: [],
        disconnectCalls: 0,
        onended: null,
      };
      const node = {
        get type() {
          return oscillator.type ?? "sine";
        },
        set type(value: OscillatorType) {
          oscillator.type = value;
        },
        frequency: {
          setValueAtTime: (value: number) => {
            oscillator.frequencyHz = value;
          },
        },
        connect: () => undefined,
        disconnect: () => {
          oscillator.disconnectCalls += 1;
        },
        start: (when?: number) => oscillator.starts.push(when ?? 0),
        stop: (when?: number) => oscillator.stops.push(when),
        get onended() {
          return oscillator.onended;
        },
        set onended(value: (() => void) | null) {
          oscillator.onended = value;
        },
      };
      oscillators.push(oscillator);
      return node;
    },
  } as unknown as AudioContext;

  Object.defineProperty(context, "__create", {
    value: () => {
      factoryCalls += 1;
      return context;
    },
  });

  return {
    context,
    get factoryCalls() {
      return factoryCalls;
    },
    get resumeCalls() {
      return resumeCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
    get oscillators() {
      return oscillators;
    },
    setState(nextState) {
      state = nextState;
    },
  };
}

function factoryFor(harness: AudioHarness): () => AudioContext {
  return () => {
    const create = (
      harness.context as AudioContext & { __create: () => AudioContext }
    ).__create;
    return create();
  };
}

test("audio coach lazily arms and resumes only from an explicit arm call", async () => {
  const harness = audioHarness("suspended");
  const coach = createAudioCoach(factoryFor(harness));

  assert.equal(harness.factoryCalls, 0);
  assert.equal(coach.playEarcon("rep"), false);
  assert.equal(harness.factoryCalls, 0);

  assert.equal(await coach.arm(), true);
  assert.equal(harness.factoryCalls, 1);
  assert.equal(harness.resumeCalls, 1);
  assert.equal(coach.isArmed(), true);
});

test("audio coach schedules restrained rep, complete, and warning patterns", async () => {
  const harness = audioHarness();
  const coach = createAudioCoach(factoryFor(harness));
  await coach.arm();

  const expectedNodes: Record<MotionEarcon, number> = {
    rep: 1,
    complete: 2,
    warning: 2,
  };
  for (const kind of ["rep", "complete", "warning"] as const) {
    const before = harness.oscillators.length;
    assert.equal(coach.playEarcon(kind), true);
    assert.equal(harness.oscillators.length - before, expectedNodes[kind]);
  }

  assert.equal(harness.oscillators[0]?.frequencyHz, 660);
  assert.equal(harness.oscillators[1]?.frequencyHz, 523.25);
  assert.equal(harness.oscillators[2]?.frequencyHz, 783.99);
  assert.ok(harness.oscillators.every((oscillator) => oscillator.starts.length === 1));
});

test("new earcons cancel active nodes instead of building an audio queue", async () => {
  const harness = audioHarness();
  const coach = createAudioCoach(factoryFor(harness));
  await coach.arm();

  coach.playEarcon("complete");
  const firstPattern = harness.oscillators.slice();
  coach.playEarcon("rep");

  assert.ok(firstPattern.every((oscillator) => oscillator.stops.length === 2));
  assert.ok(firstPattern.every((oscillator) => oscillator.disconnectCalls === 1));
});

test("audio coach cancels and closes safely and tolerates unavailable contexts", async () => {
  const harness = audioHarness();
  const coach = createAudioCoach(factoryFor(harness));
  await coach.arm();
  coach.playEarcon("rep");

  await coach.close();
  await coach.close();

  assert.equal(harness.closeCalls, 1);
  assert.equal(coach.isArmed(), false);
  assert.equal(coach.playEarcon("rep"), false);
  assert.equal(await coach.arm(), false);

  const unavailable = createAudioCoach(() => null);
  assert.equal(await unavailable.arm(), false);
  assert.equal(unavailable.playEarcon("warning"), false);
  await unavailable.close();
});

test("audio coach tolerates contexts that have already closed", async () => {
  const harness = audioHarness("closed");
  const coach = createAudioCoach(factoryFor(harness));

  assert.equal(await coach.arm(), false);
  assert.equal(coach.isArmed(), false);
  assert.equal(coach.playEarcon("rep"), false);
  await coach.close();
  assert.equal(harness.closeCalls, 0);
});

test("audio coach cannot report armed after concurrent disposal", async () => {
  const harness = audioHarness("running");
  const coach = createAudioCoach(factoryFor(harness));

  const arming = coach.arm();
  await coach.close();

  assert.equal(await arming, false);
  assert.equal(coach.isArmed(), false);
});
