import assert from "node:assert/strict";
import test from "node:test";

import {
  createHalfSquatCameraSetController,
  type HalfSquatCameraSetState,
  type HalfSquatCameraSetTerminalResult,
} from "../src/components/motion/half-squat-camera-set-controller.ts";
import { HALF_SQUAT_REPLAY } from "../src/motion/replay.ts";
import type { PoseRuntime } from "../src/motion/mediapipe-runtime.ts";
import type { NormalizedLandmarkLike } from "../src/motion/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface FakeTrack {
  track: MediaStreamTrack;
  stopCalls: number;
  end(): void;
}

function fakeTrack(deviceId: string): FakeTrack {
  let stopCalls = 0;
  let ended: (() => void) | null = null;
  const track = {
    readyState: "live",
    stop() {
      stopCalls += 1;
    },
    getSettings() {
      return { deviceId };
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type !== "ended") return;
      ended = () => {
        if (typeof listener === "function") listener(new Event("ended"));
        else listener.handleEvent(new Event("ended"));
      };
    },
  } as unknown as MediaStreamTrack;
  return {
    track,
    get stopCalls() {
      return stopCalls;
    },
    end() {
      ended?.();
    },
  };
}

function fakeStream(track: MediaStreamTrack): MediaStream {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function fakeVideo() {
  let pauseCalls = 0;
  let playCalls = 0;
  const video = {
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null as MediaProvider | null,
    async play() {
      playCalls += 1;
    },
    pause() {
      pauseCalls += 1;
    },
  } as unknown as HTMLVideoElement;
  return {
    video,
    get pauseCalls() {
      return pauseCalls;
    },
    get playCalls() {
      return playCalls;
    },
  };
}

function fakeRuntime(
  detections: readonly NormalizedLandmarkLike[][] = [],
) {
  let closeCalls = 0;
  let detectionIndex = 0;
  const runtime = {
    delegate: "CPU" as const,
    connections: [],
    landmarker: {
      detectForVideo() {
        const landmarks = detections[detectionIndex] ?? [];
        detectionIndex += 1;
        return { landmarks: landmarks.length > 0 ? [landmarks] : [] };
      },
      close() {
        closeCalls += 1;
      },
    },
  } as unknown as PoseRuntime;
  return {
    runtime,
    get closeCalls() {
      return closeCalls;
    },
  };
}

function landmarksForKneeAngle(angleDeg: number): NormalizedLandmarkLike[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }));
  const radians = (angleDeg * Math.PI) / 180;
  landmarks[23] = { x: 0.5, y: 0.3, visibility: 0.95 };
  landmarks[25] = { x: 0.5, y: 0.5, visibility: 0.95 };
  landmarks[27] = {
    x: 0.5 + Math.sin(radians) * 0.2,
    y: 0.5 - Math.cos(radians) * 0.2,
    visibility: 0.95,
  };
  return landmarks;
}

class FakeFrameScheduler {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  readonly request = (callback: FrameRequestCallback): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  readonly cancel = (id: number): void => {
    this.callbacks.delete(id);
  };

  runNext(timestampMs: number): boolean {
    const entry = this.callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (!entry) return false;
    this.callbacks.delete(entry[0]);
    entry[1](timestampMs);
    return true;
  }

  get size(): number {
    return this.callbacks.size;
  }
}

function videoDevice(
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    deviceId,
    label,
    kind: "videoinput",
    groupId: "",
    toJSON: () => ({}),
  };
}

test("construction is inert and explicit prepare releases its temporary camera", async () => {
  const permissionTrack = fakeTrack("camera-2");
  const permissionStream = fakeStream(permissionTrack.track);
  const runtime = fakeRuntime();
  const constraints: MediaStreamConstraints[] = [];
  const mediaDevices = {
    async getUserMedia(value: MediaStreamConstraints) {
      constraints.push(value);
      return permissionStream;
    },
    async enumerateDevices() {
      return [
        videoDevice("camera-1", "Built-in Camera"),
        videoDevice("camera-2", "External Camera"),
      ];
    },
  } as unknown as MediaDevices;
  let runtimeLoads = 0;
  let audioCancellations = 0;
  const states: HalfSquatCameraSetState[] = [];

  const controller = createHalfSquatCameraSetController(
    {
      readTarget: () => ({
        targetRepetitions: 6,
        source: "isolated_demo",
      }),
      readSelectedCameraId: () => "camera-2",
      getVideoElement: () => null,
      getCanvasElement: () => null,
      onStateChange: (state) => states.push(state),
      onTerminal: () => assert.fail("prepare must not emit a set result"),
      releaseAudio: () => {
        audioCancellations += 1;
      },
    },
    {
      getMediaDevices: () => mediaDevices,
      createRuntime: async () => {
        runtimeLoads += 1;
        return runtime.runtime;
      },
    },
  );

  assert.equal(constraints.length, 0);
  assert.equal(runtimeLoads, 0);
  assert.equal(controller.getState().status, "idle");

  assert.equal(await controller.prepare(), true);
  assert.equal(constraints.length, 1);
  assert.equal(runtimeLoads, 1);
  assert.equal(permissionTrack.stopCalls, 1);
  assert.equal(controller.getState().status, "ready");
  assert.equal(controller.getState().selectedCameraId, "camera-2");
  assert.deepEqual(
    controller.getState().devices.map((device) => device.label),
    ["Built-in Camera", "External Camera"],
  );

  controller.stop();
  assert.equal(runtime.closeCalls, 1);
  assert.ok(audioCancellations >= 2);
  assert.equal(states.at(-1)?.status, "stopped");
});

test("camera run completes through the runner and emits only a sanitized aggregate", async () => {
  const activeTrack = fakeTrack("camera-2");
  const activeStream = fakeStream(activeTrack.track);
  const video = fakeVideo();
  const scheduler = new FakeFrameScheduler();
  const detections = HALF_SQUAT_REPLAY.map((frame) =>
    landmarksForKneeAngle(frame.kneeAngleDeg),
  );
  const runtime = fakeRuntime(detections);
  const constraints: MediaStreamConstraints[] = [];
  const terminals: HalfSquatCameraSetTerminalResult[] = [];
  let audioCancellations = 0;
  const mediaDevices = {
    async getUserMedia(value: MediaStreamConstraints) {
      constraints.push(value);
      return activeStream;
    },
    async enumerateDevices() {
      return [];
    },
  } as unknown as MediaDevices;
  const controller = createHalfSquatCameraSetController(
    {
      readTarget: () => ({
        targetRepetitions: 1,
        source: "therapist_confirmed",
      }),
      readSelectedCameraId: () => "camera-2",
      getVideoElement: () => video.video,
      getCanvasElement: () => null,
      onStateChange: () => undefined,
      onTerminal: (result) => terminals.push(result),
      releaseAudio: () => {
        audioCancellations += 1;
      },
    },
    {
      getMediaDevices: () => mediaDevices,
      createRuntime: async () => runtime.runtime,
      requestFrame: scheduler.request,
      cancelFrame: scheduler.cancel,
      inferenceIntervalMs: 16,
    },
  );

  assert.equal(await controller.start(), true);
  assert.equal(video.playCalls, 1);
  assert.equal(controller.getState().status, "running");
  assert.deepEqual(constraints[0], {
    audio: false,
    video: {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 720, max: 720 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30, max: 30 },
      deviceId: { exact: "camera-2" },
    },
  });

  for (const frame of HALF_SQUAT_REPLAY) {
    if (terminals.length > 0) break;
    assert.equal(scheduler.runNext(frame.timestampMs), true);
  }

  assert.equal(terminals.length, 1);
  const terminal = terminals[0]!;
  assert.equal(terminal.outcome, "completed");
  assert.equal(terminal.summary.completedRepetitions, 1);
  assert.equal(terminal.summary.targetAchieved, true);
  assert.equal(terminal.aggregate.target.source, "therapist_confirmed");
  assert.equal(terminal.aggregate.authorityBoundary.agentCanControlSet, false);
  assert.equal("reps" in terminal.summary, false);
  assert.equal("reps" in terminal.aggregate, false);
  const serialized = JSON.stringify(terminal);
  for (const forbidden of [
    "startedAtMs",
    "completedAtMs",
    "durationMs",
    "minAngleDeg",
    "maxAngleDeg",
    "landmarks",
    "frames",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(runtime.closeCalls, 1);
  assert.ok(video.pauseCalls >= 1);
  assert.equal(scheduler.size, 0);
  assert.ok(audioCancellations >= 2);
  assert.equal(controller.getState().status, "completed");
});

test("human Stop emits one stopped result and releases RAF, track, model and audio", async () => {
  const activeTrack = fakeTrack("camera-1");
  const activeStream = fakeStream(activeTrack.track);
  const runtime = fakeRuntime();
  const video = fakeVideo();
  const scheduler = new FakeFrameScheduler();
  const terminals: HalfSquatCameraSetTerminalResult[] = [];
  let audioCancellations = 0;
  const controller = createHalfSquatCameraSetController(
    {
      readTarget: () => ({
        targetRepetitions: 4,
        source: "isolated_demo",
      }),
      readSelectedCameraId: () => "camera-1",
      getVideoElement: () => video.video,
      getCanvasElement: () => null,
      onStateChange: () => undefined,
      onTerminal: (result) => terminals.push(result),
      releaseAudio: () => {
        audioCancellations += 1;
      },
    },
    {
      getMediaDevices: () => ({
        getUserMedia: async () => activeStream,
      }) as unknown as MediaDevices,
      createRuntime: async () => runtime.runtime,
      requestFrame: scheduler.request,
      cancelFrame: scheduler.cancel,
    },
  );

  assert.equal(await controller.start(), true);
  assert.equal(scheduler.size, 1);
  controller.stop();
  controller.stop();

  assert.equal(terminals.length, 1);
  assert.equal(terminals[0]?.outcome, "stopped");
  assert.equal(terminals[0]?.summary.completedRepetitions, 0);
  assert.equal(activeTrack.stopCalls, 1);
  assert.equal(runtime.closeCalls, 1);
  assert.equal(scheduler.size, 0);
  assert.ok(audioCancellations >= 2);
  assert.equal(controller.getState().status, "stopped");
});

test("dispose invalidates a late camera stream without emitting a terminal result", async () => {
  const late = deferred<MediaStream>();
  const lateTrack = fakeTrack("camera-late");
  const runtime = fakeRuntime();
  const video = fakeVideo();
  let mediaRequests = 0;
  let terminalCalls = 0;
  let audioCancellations = 0;
  const controller = createHalfSquatCameraSetController(
    {
      readTarget: () => ({
        targetRepetitions: 6,
        source: "isolated_demo",
      }),
      readSelectedCameraId: () => "camera-late",
      getVideoElement: () => video.video,
      getCanvasElement: () => null,
      onStateChange: () => undefined,
      onTerminal: () => {
        terminalCalls += 1;
      },
      releaseAudio: () => {
        audioCancellations += 1;
      },
    },
    {
      getMediaDevices: () => ({
        getUserMedia: () => {
          mediaRequests += 1;
          return late.promise;
        },
      }) as unknown as MediaDevices,
      createRuntime: async () => runtime.runtime,
    },
  );

  const starting = controller.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mediaRequests, 1);

  controller.dispose();
  late.resolve(fakeStream(lateTrack.track));

  assert.equal(await starting, false);
  assert.equal(lateTrack.stopCalls, 1);
  assert.equal(runtime.closeCalls, 1);
  assert.equal(terminalCalls, 0);
  assert.ok(audioCancellations >= 2);
});
