import {
  buildCameraConstraints,
  describeCameraError,
  discoverCameraDevices,
  selectCameraDeviceId,
  type CameraDeviceOption,
} from "../../motion/camera.ts";
import {
  createHalfSquatSetRunner,
  type HalfSquatSetRunner,
  type HalfSquatSetRunnerSnapshot,
  type HalfSquatSetRunnerTrackingState,
} from "../../motion/half-squat-runner.ts";
import {
  createPoseRuntime,
  type PoseConnection,
  type PoseRuntime,
} from "../../motion/mediapipe-runtime.ts";
import {
  createMotionSetAggregate,
  type MotionAggregateQualityEvent,
  type MotionSetAggregate,
  type MotionTargetSource,
} from "../../motion/set-aggregate.ts";
import type { NormalizedLandmarkLike } from "../../motion/types.ts";

export type HalfSquatCameraSetStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "starting"
  | "running"
  | "completed"
  | "stopped"
  | "error"
  | "unsupported";

export type HalfSquatCameraRuntimeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface HalfSquatCameraSetTarget {
  readonly targetRepetitions: number;
  readonly source: MotionTargetSource;
  readonly exerciseId?: string;
  readonly exerciseName?: string;
}

export interface SanitizedHalfSquatSetSummary {
  readonly completedRepetitions: number;
  readonly targetAchieved: boolean;
  readonly detectedRepetitionWindowSeconds: number;
  readonly averageDetectedKneeRangeDeg: number;
  readonly detectedRangeDeclineDeg: number;
  readonly qualityEventLabels: readonly MotionAggregateQualityEvent[];
}

export interface HalfSquatCameraSetTerminalResult {
  readonly outcome: "completed" | "stopped";
  readonly summary: SanitizedHalfSquatSetSummary;
  readonly aggregate: MotionSetAggregate;
}

export interface HalfSquatCameraSetState {
  readonly status: HalfSquatCameraSetStatus;
  readonly devices: readonly CameraDeviceOption[];
  readonly selectedCameraId: string | null;
  readonly activeCameraId: string | null;
  readonly runtimeStatus: HalfSquatCameraRuntimeStatus;
  readonly runtimeDelegate: "GPU" | "CPU" | null;
  readonly trackingState: HalfSquatSetRunnerTrackingState | "not_started";
  readonly snapshot: HalfSquatSetRunnerSnapshot | null;
  readonly cue: string;
  readonly error: string | null;
}

export interface HalfSquatCameraSetControllerBindings {
  readonly readTarget: () => HalfSquatCameraSetTarget;
  readonly readSelectedCameraId: () => string | null;
  readonly getVideoElement: () => HTMLVideoElement | null;
  readonly getCanvasElement: () => HTMLCanvasElement | null;
  readonly onStateChange: (state: HalfSquatCameraSetState) => void;
  readonly onTerminal: (result: HalfSquatCameraSetTerminalResult) => void;
  readonly onRepCompleted?: (
    completedRepetition: number,
    targetRepetitions: number,
  ) => void;
  readonly releaseAudio?: () => void | Promise<void>;
}

export interface HalfSquatCameraSetControllerDependencies {
  readonly getMediaDevices?: () => MediaDevices;
  readonly createRuntime?: () => Promise<PoseRuntime>;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly inferenceIntervalMs?: number;
}

export interface HalfSquatCameraSetController {
  prepare(): Promise<boolean>;
  start(): Promise<boolean>;
  stop(): void;
  dispose(): void;
  getState(): HalfSquatCameraSetState;
}

const INITIAL_CUE = "Camera set has not started.";

function cloneDevices(
  devices: readonly CameraDeviceOption[],
): CameraDeviceOption[] {
  return devices.map((device) => ({ ...device }));
}

function cloneSnapshot(
  snapshot: HalfSquatSetRunnerSnapshot | null,
): HalfSquatSetRunnerSnapshot | null {
  return snapshot ? { ...snapshot } : null;
}

function cloneState(state: HalfSquatCameraSetState): HalfSquatCameraSetState {
  return {
    ...state,
    devices: cloneDevices(state.devices),
    snapshot: cloneSnapshot(state.snapshot),
  };
}

export function createInitialHalfSquatCameraSetState(): HalfSquatCameraSetState {
  return {
    status: "idle",
    devices: [],
    selectedCameraId: null,
    activeCameraId: null,
    runtimeStatus: "idle",
    runtimeDelegate: null,
    trackingState: "not_started",
    snapshot: null,
    cue: INITIAL_CUE,
    error: null,
  };
}

function unsupportedCameraError(): Error {
  const error = new Error("Camera APIs are unavailable in this browser context.");
  error.name = "NotSupportedError";
  return error;
}

function defaultMediaDevices(): MediaDevices {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof navigator === "undefined" ||
    !navigator.mediaDevices
  ) {
    throw unsupportedCameraError();
  }
  return navigator.mediaDevices;
}

function defaultRequestFrame(callback: FrameRequestCallback): number {
  return window.requestAnimationFrame(callback);
}

function defaultCancelFrame(handle: number): void {
  window.cancelAnimationFrame(handle);
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // Cleanup should remain best-effort across browser and virtual cameras.
    }
  }
}

function clearCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: readonly NormalizedLandmarkLike[],
  connections: readonly PoseConnection[],
): void {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#E0F0FA";
  context.lineWidth = Math.max(2, width / 320);
  for (const connection of connections) {
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];
    if (
      !start ||
      !end ||
      (start.visibility ?? 1) < 0.45 ||
      (end.visibility ?? 1) < 0.45
    ) {
      continue;
    }
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  }
  context.fillStyle = "#EF5B3E";
  for (const landmark of landmarks) {
    if ((landmark.visibility ?? 1) < 0.45) continue;
    context.beginPath();
    context.arc(
      landmark.x * width,
      landmark.y * height,
      Math.max(2.5, width / 220),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

function safeCloseRuntime(runtime: PoseRuntime | null): void {
  try {
    runtime?.landmarker.close();
  } catch {
    // A runtime that already closed needs no further cleanup.
  }
}

function safeReleaseAudio(
  releaseAudio: HalfSquatCameraSetControllerBindings["releaseAudio"],
): void {
  try {
    const release = releaseAudio?.();
    if (release && typeof release.then === "function") {
      void release.catch(() => undefined);
    }
  } catch {
    // Audio release cannot prevent camera/model teardown.
  }
}

function terminalSummary(
  aggregate: MotionSetAggregate,
): SanitizedHalfSquatSetSummary {
  return {
    completedRepetitions: aggregate.actual.completedRepetitions,
    targetAchieved: aggregate.actual.targetAchieved,
    detectedRepetitionWindowSeconds:
      aggregate.actual.detectedRepetitionWindowSeconds,
    averageDetectedKneeRangeDeg:
      aggregate.measurements.averageDetectedKneeRangeDeg,
    detectedRangeDeclineDeg:
      aggregate.measurements.detectedRangeDeclineDeg,
    qualityEventLabels: [...aggregate.qualityEventLabels],
  };
}

/**
 * Imperative owner for one camera set. The controller is dependency-injected
 * so its late-start and cleanup behavior can be verified without opening a
 * real camera. Construction performs no media or model work.
 */
export function createHalfSquatCameraSetController(
  bindings: HalfSquatCameraSetControllerBindings,
  dependencies: HalfSquatCameraSetControllerDependencies = {},
): HalfSquatCameraSetController {
  const getMediaDevices = dependencies.getMediaDevices ?? defaultMediaDevices;
  const loadRuntime = dependencies.createRuntime ?? createPoseRuntime;
  const requestFrame = dependencies.requestFrame ?? defaultRequestFrame;
  const cancelFrame = dependencies.cancelFrame ?? defaultCancelFrame;
  const inferenceIntervalMs = Math.max(
    16,
    dependencies.inferenceIntervalMs ?? 70,
  );

  let state = createInitialHalfSquatCameraSetState();
  let disposed = false;
  let generation = 0;
  let discoveryController: AbortController | null = null;
  let stream: MediaStream | null = null;
  let runtime: PoseRuntime | null = null;
  let pendingRuntime:
    | { readonly generation: number; readonly promise: Promise<PoseRuntime> }
    | null = null;
  let runner: HalfSquatSetRunner | null = null;
  let activeTarget: HalfSquatCameraSetTarget | null = null;
  let animationHandle: number | null = null;
  let lastInferenceAtMs = Number.NEGATIVE_INFINITY;
  let terminalEmitted = false;

  const publish = (patch: Partial<HalfSquatCameraSetState>): void => {
    if (disposed) return;
    state = {
      ...state,
      ...patch,
      devices: patch.devices
        ? cloneDevices(patch.devices)
        : cloneDevices(state.devices),
      snapshot:
        patch.snapshot === undefined
          ? cloneSnapshot(state.snapshot)
          : cloneSnapshot(patch.snapshot),
    };
    bindings.onStateChange(cloneState(state));
  };

  const clearActiveMedia = (closeModel: boolean): void => {
    discoveryController?.abort();
    discoveryController = null;
    if (animationHandle !== null) {
      cancelFrame(animationHandle);
      animationHandle = null;
    }
    const currentStream = stream;
    stream = null;
    stopStream(currentStream);

    const video = bindings.getVideoElement();
    if (video) {
      try {
        video.pause();
      } catch {
        // Some test and embedded video elements do not implement pause.
      }
      video.srcObject = null;
    }
    clearCanvas(bindings.getCanvasElement());
    safeReleaseAudio(bindings.releaseAudio);
    lastInferenceAtMs = Number.NEGATIVE_INFINITY;

    if (closeModel) {
      const currentRuntime = runtime;
      runtime = null;
      safeCloseRuntime(currentRuntime);
    }
  };

  const beginOperation = (closeModel: boolean): number => {
    generation += 1;
    clearActiveMedia(closeModel);
    return generation;
  };

  const isCurrent = (token: number): boolean =>
    !disposed && generation === token;

  const ensureRuntime = async (token: number): Promise<PoseRuntime> => {
    if (runtime) return runtime;
    if (pendingRuntime?.generation === token) return pendingRuntime.promise;

    const promise = loadRuntime();
    pendingRuntime = { generation: token, promise };
    try {
      const loaded = await promise;
      if (!isCurrent(token)) {
        safeCloseRuntime(loaded);
        throw new DOMException("Camera set was cancelled.", "AbortError");
      }
      runtime = loaded;
      return loaded;
    } finally {
      if (pendingRuntime?.promise === promise) pendingRuntime = null;
    }
  };

  const failBeforeRunning = (
    caught: unknown,
    token: number,
  ): false => {
    if (!isCurrent(token)) return false;
    const unsupported =
      caught instanceof Error && caught.name === "NotSupportedError";
    generation += 1;
    clearActiveMedia(true);
    runner = null;
    activeTarget = null;
    publish({
      status: unsupported ? "unsupported" : "error",
      activeCameraId: null,
      runtimeStatus: unsupported ? "idle" : "error",
      runtimeDelegate: null,
      trackingState: "not_started",
      snapshot: null,
      cue: "Camera set could not start.",
      error: describeCameraError(caught),
    });
    return false;
  };

  const finishTerminal = (
    outcome: "completed" | "stopped",
    token: number,
    failure?: unknown,
  ): void => {
    if (!isCurrent(token) || terminalEmitted || !runner || !activeTarget) {
      return;
    }
    terminalEmitted = true;
    const finalSnapshot = runner.getSnapshot();
    const detectorSummary = runner.getSummary();
    const aggregate = createMotionSetAggregate({
      target: {
        exerciseId: activeTarget.exerciseId ?? "half-squat",
        exerciseName:
          activeTarget.exerciseName ?? "Supported Half Squat",
        targetRepetitions: activeTarget.targetRepetitions,
        source: activeTarget.source,
      },
      outcome,
      summary: detectorSummary,
    });
    const result: HalfSquatCameraSetTerminalResult = {
      outcome,
      summary: terminalSummary(aggregate),
      aggregate,
    };

    generation += 1;
    clearActiveMedia(true);
    runner = null;
    activeTarget = null;
    publish({
      status: failure
        ? "error"
        : outcome === "completed"
          ? "completed"
          : "stopped",
      activeCameraId: null,
      runtimeStatus: "idle",
      runtimeDelegate: null,
      trackingState:
        finalSnapshot.trackingState === "tracked" ? "tracked" : "lost",
      snapshot: finalSnapshot,
      cue:
        outcome === "completed"
          ? "Set target reached. Camera released."
          : "Set stopped. Camera released.",
      error: failure ? describeCameraError(failure) : null,
    });
    try {
      bindings.onTerminal(result);
    } catch {
      // A consumer callback cannot retain or reactivate released resources.
    }
  };

  const prepare = async (): Promise<boolean> => {
    if (
      disposed ||
      state.status === "preparing" ||
      state.status === "starting" ||
      state.status === "running"
    ) {
      return false;
    }
    const token = beginOperation(true);
    terminalEmitted = false;
    runner = null;
    activeTarget = null;
    publish({
      status: "preparing",
      activeCameraId: null,
      runtimeStatus: "loading",
      runtimeDelegate: null,
      trackingState: "not_started",
      snapshot: null,
      cue: "Preparing camera access and local pose tracking.",
      error: null,
    });

    let mediaDevices: MediaDevices;
    try {
      mediaDevices = getMediaDevices();
    } catch (caught) {
      return failBeforeRunning(caught, token);
    }

    const controller = new AbortController();
    discoveryController = controller;
    const [discoveryResult, runtimeResult] = await Promise.allSettled([
      discoverCameraDevices(mediaDevices, { signal: controller.signal }),
      ensureRuntime(token),
    ]);
    if (!isCurrent(token)) return false;
    discoveryController = null;

    if (discoveryResult.status === "rejected") {
      return failBeforeRunning(discoveryResult.reason, token);
    }
    if (runtimeResult.status === "rejected") {
      return failBeforeRunning(runtimeResult.reason, token);
    }

    const requestedCameraId =
      bindings.readSelectedCameraId() ?? state.selectedCameraId;
    const selectedCameraId = selectCameraDeviceId(
      discoveryResult.value.devices,
      requestedCameraId,
      discoveryResult.value.preferredDeviceId,
    );
    publish({
      status: "ready",
      devices: discoveryResult.value.devices,
      selectedCameraId,
      runtimeStatus: "ready",
      runtimeDelegate: runtimeResult.value.delegate,
      cue: "Camera access and local pose tracking are ready.",
      error: null,
    });
    return true;
  };

  const start = async (): Promise<boolean> => {
    if (
      disposed ||
      state.status === "preparing" ||
      state.status === "starting" ||
      state.status === "running"
    ) {
      return false;
    }
    const token = beginOperation(false);
    const target = bindings.readTarget();
    const requestedCameraId =
      bindings.readSelectedCameraId() ?? state.selectedCameraId;
    activeTarget = { ...target };
    runner = createHalfSquatSetRunner({
      targetRepetitions: target.targetRepetitions,
    });
    terminalEmitted = false;
    publish({
      status: "starting",
      selectedCameraId: requestedCameraId,
      activeCameraId: null,
      runtimeStatus: runtime ? "ready" : "loading",
      runtimeDelegate: runtime?.delegate ?? null,
      trackingState: "acquiring",
      snapshot: runner.getSnapshot(),
      cue: "Opening the selected camera.",
      error: null,
    });

    let mediaDevices: MediaDevices;
    try {
      mediaDevices = getMediaDevices();
    } catch (caught) {
      return failBeforeRunning(caught, token);
    }

    let loadedRuntime: PoseRuntime;
    try {
      loadedRuntime = await ensureRuntime(token);
    } catch (caught) {
      return failBeforeRunning(caught, token);
    }
    if (!isCurrent(token)) return false;
    publish({
      runtimeStatus: "ready",
      runtimeDelegate: loadedRuntime.delegate,
    });

    let openedStream: MediaStream;
    try {
      openedStream = await mediaDevices.getUserMedia(
        buildCameraConstraints(requestedCameraId),
      );
    } catch (caught) {
      return failBeforeRunning(caught, token);
    }
    if (!isCurrent(token)) {
      stopStream(openedStream);
      return false;
    }
    stream = openedStream;

    const video = bindings.getVideoElement();
    if (!video) {
      return failBeforeRunning(
        new Error("Camera preview is unavailable."),
        token,
      );
    }
    video.srcObject = openedStream;
    try {
      await video.play();
    } catch (caught) {
      return failBeforeRunning(caught, token);
    }
    if (!isCurrent(token)) {
      stopStream(openedStream);
      return false;
    }

    const videoTrack = openedStream.getVideoTracks()[0];
    if (!videoTrack) {
      return failBeforeRunning(
        new Error("The selected input did not provide a video track."),
        token,
      );
    }
    const activeCameraId = videoTrack.getSettings().deviceId ?? null;
    videoTrack.addEventListener?.(
      "ended",
      () => {
        if (stream === openedStream && isCurrent(token)) {
          finishTerminal("stopped", token);
        }
      },
      { once: true },
    );

    publish({
      status: "running",
      selectedCameraId: requestedCameraId,
      activeCameraId,
      runtimeStatus: "ready",
      runtimeDelegate: loadedRuntime.delegate,
      trackingState: "acquiring",
      snapshot: runner.getSnapshot(),
      cue: "Stand tall with your full side profile visible.",
      error: null,
    });

    const frameLoop = (timestampMs: number): void => {
      animationHandle = null;
      if (!isCurrent(token) || stream !== openedStream || !runner) return;
      try {
        if (
          video.readyState >= 2 &&
          timestampMs - lastInferenceAtMs >= inferenceIntervalMs
        ) {
          lastInferenceAtMs = timestampMs;
          const detection = loadedRuntime.landmarker.detectForVideo(
            video,
            timestampMs,
          );
          const landmarks = detection.landmarks[0] as
            | NormalizedLandmarkLike[]
            | undefined;
          const step = landmarks?.length
            ? runner.process({
                type: "landmarks",
                landmarks,
                timestampMs,
              })
            : runner.process({ type: "missing_frame" });

          if (landmarks?.length) {
            const canvas = bindings.getCanvasElement();
            if (canvas) {
              drawPose(
                canvas,
                video,
                landmarks,
                loadedRuntime.connections,
              );
            }
          } else {
            clearCanvas(bindings.getCanvasElement());
          }
          publish({
            trackingState: step.snapshot.trackingState,
            snapshot: step.snapshot,
            cue: step.analysis.valid ? step.update.cue : step.analysis.cue,
          });
          if (step.update.event?.type === "rep_completed") {
            try {
              bindings.onRepCompleted?.(
                step.update.event.record.rep,
                step.snapshot.targetRepetitions,
              );
            } catch {
              // Optional local feedback cannot interrupt counting or cleanup.
            }
          }
          if (step.targetReached) {
            finishTerminal("completed", token);
            return;
          }
        }
        if (isCurrent(token) && stream === openedStream) {
          animationHandle = requestFrame(frameLoop);
        }
      } catch (caught) {
        finishTerminal("stopped", token, caught);
      }
    };
    animationHandle = requestFrame(frameLoop);
    return true;
  };

  const stop = (): void => {
    if (disposed) return;
    if (
      state.status === "idle" ||
      state.status === "completed" ||
      state.status === "stopped"
    ) {
      return;
    }
    const token = generation;
    if (state.status === "running" && runner && activeTarget) {
      finishTerminal("stopped", token);
      return;
    }

    generation += 1;
    clearActiveMedia(true);
    runner = null;
    activeTarget = null;
    publish({
      status: "stopped",
      activeCameraId: null,
      runtimeStatus: "idle",
      runtimeDelegate: null,
      trackingState: "not_started",
      snapshot: null,
      cue: "Camera set stopped. Resources released.",
      error: null,
    });
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    discoveryController?.abort();
    discoveryController = null;
    if (animationHandle !== null) {
      cancelFrame(animationHandle);
      animationHandle = null;
    }
    stopStream(stream);
    stream = null;
    const video = bindings.getVideoElement();
    if (video) {
      try {
        video.pause();
      } catch {
        // Best-effort unmount cleanup.
      }
      video.srcObject = null;
    }
    clearCanvas(bindings.getCanvasElement());
    safeReleaseAudio(bindings.releaseAudio);
    safeCloseRuntime(runtime);
    runtime = null;
    runner = null;
    activeTarget = null;
  };

  return {
    prepare,
    start,
    stop,
    dispose,
    getState: () => cloneState(state),
  };
}
