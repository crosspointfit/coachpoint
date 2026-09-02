"use client";

import Image from "next/image";
import {
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  HandRaisedIcon,
  ShieldCheckIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useHalfSquatCameraSet } from "../motion/useHalfSquatCameraSet";
import type {
  HalfSquatCameraSetState,
  HalfSquatCameraSetTerminalResult,
} from "../motion/half-squat-camera-set-controller";
import type { CameraDeviceOption } from "../../motion/camera";
import {
  readPatientCameraPreference,
  resolvePatientCameraPreference,
  savePatientCameraPreference,
  type PatientCameraPreference,
} from "./patient-camera-preference";
import type { PatientMotionAudioControls } from "./usePatientMotionAudioCoach";

export interface PatientCameraSetPanelHandle {
  stop(reason?: string): void;
}

interface PatientCameraSetPanelProps {
  setId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseThumbnailPath: string;
  setNumber: number;
  totalSets: number;
  targetRepetitions: number;
  setIsActive: boolean;
  disabled: boolean;
  coachingFocus?: string;
  audio: PatientMotionAudioControls;
  onBeginCameraSet: () => boolean;
  onCameraStartFailed: (setId: string) => void;
  onTerminal: (
    setId: string,
    result: HalfSquatCameraSetTerminalResult,
    stopReason?: string,
  ) => boolean;
  onUseManualFallback: () => void;
}

interface UnsavedTerminalResult {
  readonly result: HalfSquatCameraSetTerminalResult;
  readonly stopReason?: string;
}

function devicePreferences(
  devices: readonly CameraDeviceOption[],
): readonly PatientCameraPreference[] {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim() || `Camera ${index + 1}`,
  }));
}

const PatientCameraSetPanel = forwardRef<
  PatientCameraSetPanelHandle,
  PatientCameraSetPanelProps
>(function PatientCameraSetPanel(
  {
    exerciseId,
    exerciseName,
    exerciseThumbnailPath,
    setId,
    setNumber,
    totalSets,
    targetRepetitions,
    setIsActive,
    disabled,
    coachingFocus,
    audio,
    onBeginCameraSet,
    onCameraStartFailed,
    onTerminal,
    onUseManualFallback,
  },
  forwardedRef,
) {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [cameraPreference, setCameraPreference] =
    useState<PatientCameraPreference | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unsavedTerminal, setUnsavedTerminal] =
    useState<UnsavedTerminalResult | null>(null);
  const stopReasonRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const startAttemptRef = useRef(0);
  const startInFlightRef = useRef(false);
  const immersiveRef = useRef<HTMLElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);
  const audioArmForSet = audio.armForSet;
  const audioCancelPlayback = audio.cancelPlayback;
  const audioNotifyCompletedRep = audio.notifyCompletedRep;

  const camera = useHalfSquatCameraSet({
    targetRepetitions,
    selectedCameraId,
    targetSource: "therapist_confirmed",
    exerciseId,
    exerciseName,
    onRepCompleted: audioNotifyCompletedRep,
    onTerminal: (result) => {
      const stopReason =
        result.outcome === "stopped"
          ? stopReasonRef.current ??
            "Camera input ended before the prescribed target."
          : undefined;
      stopReasonRef.current = null;
      if (result.outcome === "stopped") {
        audioCancelPlayback();
      }
      if (!onTerminal(setId, result, stopReason)) {
        setUnsavedTerminal({ result, stopReason });
      }
    },
  });

  const cameraPrepare = camera.prepare;
  const cameraStart = camera.start;
  const cameraStop = camera.stop;
  const getCameraState = camera.getState;

  useEffect(() => {
    mountedRef.current = true;
    const stored = readPatientCameraPreference();
    setCameraPreference(stored);
    setSelectedCameraId(stored?.deviceId ?? null);
    setPreferenceLoaded(true);
    return () => {
      mountedRef.current = false;
      startAttemptRef.current += 1;
      startInFlightRef.current = false;
    };
  }, []);

  const rememberAvailableCamera = useCallback(
    (
      state: HalfSquatCameraSetState,
      preferred: PatientCameraPreference | null,
    ): PatientCameraPreference | null => {
      const resolved = resolvePatientCameraPreference(
        devicePreferences(state.devices),
        preferred,
      );
      if (!resolved) return null;
      setSelectedCameraId(resolved.deviceId);
      setCameraPreference(resolved);
      savePatientCameraPreference(resolved);
      return resolved;
    },
    [],
  );

  const stop = useCallback(
    (reason = "Patient ended the camera set early.") => {
      const statusBeforeStop = getCameraState().status;
      startAttemptRef.current += 1;
      startInFlightRef.current = false;
      stopReasonRef.current = reason;
      audioCancelPlayback();
      cameraStop();

      // A stream that is still opening has no aggregate to stage. Move the
      // already-persisted camera set to its explicit manual recovery path.
      if (statusBeforeStop === "starting") {
        stopReasonRef.current = null;
        onCameraStartFailed(setId);
      }
    },
    [
      audioCancelPlayback,
      cameraStop,
      getCameraState,
      onCameraStartFailed,
      setId,
    ],
  );

  useImperativeHandle(forwardedRef, () => ({ stop }), [stop]);

  const preferredSelection = useCallback((): PatientCameraPreference | null => {
    if (!selectedCameraId) return cameraPreference;
    const liveDevice = getCameraState().devices.find(
      (device) => device.deviceId === selectedCameraId,
    );
    return {
      deviceId: selectedCameraId,
      label:
        liveDevice?.label.trim() ||
        cameraPreference?.label ||
        "Selected camera",
    };
  }, [cameraPreference, getCameraState, selectedCameraId]);

  const prepareCamera = useCallback(async () => {
    if (disabled) return null;
    const prepared = await cameraPrepare();
    if (!prepared || !mountedRef.current) return null;
    return rememberAvailableCamera(
      getCameraState(),
      preferredSelection(),
    );
  }, [
    cameraPrepare,
    disabled,
    getCameraState,
    preferredSelection,
    rememberAvailableCamera,
  ]);

  const start = useCallback(async () => {
    if (disabled || !preferenceLoaded || unsavedTerminal) return;
    if (startInFlightRef.current) return;

    const attempt = startAttemptRef.current + 1;
    startAttemptRef.current = attempt;
    startInFlightRef.current = true;
    audioArmForSet();

    let resolvedCamera: PatientCameraPreference | null;
    const liveState = getCameraState();
    if (liveState.status === "ready") {
      resolvedCamera = rememberAvailableCamera(
        liveState,
        preferredSelection(),
      );
    } else {
      resolvedCamera = await prepareCamera();
    }

    if (!mountedRef.current || startAttemptRef.current !== attempt) return;
    if (!resolvedCamera) {
      startInFlightRef.current = false;
      audioCancelPlayback();
      return;
    }

    if (!setIsActive && !onBeginCameraSet()) {
      startInFlightRef.current = false;
      audioCancelPlayback();
      return;
    }

    const started = await cameraStart(resolvedCamera.deviceId);
    if (startAttemptRef.current === attempt) {
      startInFlightRef.current = false;
    }
    if (
      !started &&
      mountedRef.current &&
      startAttemptRef.current === attempt
    ) {
      audioCancelPlayback();
      onCameraStartFailed(setId);
    }
  }, [
    audioArmForSet,
    audioCancelPlayback,
    cameraStart,
    disabled,
    getCameraState,
    onBeginCameraSet,
    onCameraStartFailed,
    preferenceLoaded,
    preferredSelection,
    prepareCamera,
    rememberAvailableCamera,
    setId,
    setIsActive,
    unsavedTerminal,
  ]);

  const retryTerminalSave = () => {
    if (!unsavedTerminal) return;
    if (
      onTerminal(
        setId,
        unsavedTerminal.result,
        unsavedTerminal.stopReason,
      )
    ) {
      setUnsavedTerminal(null);
    }
  };

  const useManualFallback = () => {
    audioCancelPlayback();
    onUseManualFallback();
  };

  const busy =
    camera.state.status === "preparing" ||
    camera.state.status === "starting";
  const starting = camera.state.status === "starting";
  const running = camera.state.status === "running";
  const immersive = starting || running;
  const prepared = camera.state.status === "ready";
  const displayedCameraId =
    selectedCameraId ?? camera.state.selectedCameraId ?? "";
  const activeCameraLabel =
    camera.state.devices.find(
      (device) =>
        device.deviceId ===
        (camera.state.activeCameraId ?? displayedCameraId),
    )?.label ||
    cameraPreference?.label ||
    "Camera active";
  const completedRepetitions =
    camera.state.snapshot?.completedRepetitions ?? 0;
  const progressPercent = Math.min(
    100,
    Math.round((completedRepetitions / targetRepetitions) * 100),
  );
  const canStartDirectly = prepared || cameraPreference !== null;

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    window.requestAnimationFrame(() => endButtonRef.current?.focus());

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop("Camera set stopped because the page was hidden.");
      }
    };
    const handlePageHide = () => {
      stop("Camera set stopped because the page was left.");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [immersive, stop]);

  const handleImmersiveKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stop(
        starting
          ? "Patient cancelled camera startup."
          : "Patient ended the camera set early.",
      );
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      immersiveRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleCameraSelection = (deviceId: string) => {
    setSelectedCameraId(deviceId || null);
    const chosen = devicePreferences(camera.state.devices).find(
      (device) => device.deviceId === deviceId,
    );
    if (!chosen) return;
    setCameraPreference(chosen);
    savePatientCameraPreference(chosen);
  };

  return (
    <section
      ref={immersiveRef}
      role={immersive ? "dialog" : undefined}
      aria-modal={immersive ? true : undefined}
      aria-label={immersive ? `${exerciseName} camera set` : undefined}
      onKeyDown={immersive ? handleImmersiveKeyDown : undefined}
      className={
        immersive
          ? "fixed inset-0 z-[100] flex min-h-0 flex-col bg-[#071B31] text-white"
          : "relative min-w-0 rounded-[18px] border border-border bg-white text-ink-900 shadow-[var(--cp-shadow-card)]"
      }
    >
      {immersive && (
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/10 bg-white px-5 text-ink-900 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-sm font-black text-white">
              CP
            </span>
            <span>
              <span className="block text-[15px] font-extrabold tracking-[-0.01em]">
                CoachPoint
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                by Crosspoint
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <div className="hidden items-center gap-2 sm:flex">
              <ShieldCheckIcon className="h-5 w-5 text-primary-700" aria-hidden="true" />
              <span>On-device pose tracking</span>
              <span className="h-2 w-2 rounded-full bg-[#3FA976]" aria-label="Camera processing active" />
            </div>
            <button
              type="button"
              onClick={audio.toggleEnabled}
              aria-pressed={audio.enabled}
              className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-ink-900 hover:bg-slate-50"
            >
              {audio.enabled ? (
                <SpeakerWaveIcon className="h-5 w-5 text-primary-700" aria-hidden="true" />
              ) : (
                <SpeakerXMarkIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
              )}
              {audio.enabled ? "Audio on" : "Audio off"}
            </button>
          </div>
        </header>
      )}

      <div
        className={
          immersive
            ? "grid min-h-0 flex-1 grid-rows-[minmax(42vh,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_380px]"
            : "relative"
        }
      >
        <div
          className={
            immersive
              ? "relative min-h-0 bg-[#071B31] p-4 sm:p-5"
              : "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          }
        >
          <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-[#061525] shadow-[0_12px_32px_rgba(0,0,0,0.2)]">
            <video
              ref={camera.videoRef}
              muted
              playsInline
              aria-label="Live camera preview"
              className="h-full w-full object-contain"
            />
            <canvas
              ref={camera.canvasRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />

            <div className="absolute left-4 top-4 flex max-w-[70%] items-center gap-2 rounded-full bg-[#071B31]/90 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
              <VideoCameraIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{activeCameraLabel}</span>
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-[#071B31]/90 px-3 py-2 font-mono text-sm font-bold text-white shadow-lg backdrop-blur-sm">
              {completedRepetitions} / {targetRepetitions}
            </div>

            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#071B31]/88 px-6 text-center">
                <div>
                  <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" />
                  <p className="mt-4 text-lg font-extrabold">Opening your camera…</p>
                  <p className="mt-2 text-sm text-white/65">
                    The set starts only after the local tracker is ready.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {immersive ? (
          <aside className="flex min-h-0 flex-col overflow-hidden border-t border-white/10 bg-[#102D4F] lg:border-l lg:border-t-0">
            <div className="border-b border-white/10 p-4 lg:p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-100 lg:text-xs">
                    Current exercise
                  </p>
                  <h2 className="mt-1 text-base font-extrabold leading-5 text-white lg:text-xl lg:leading-7">
                    {exerciseName}
                  </h2>
                  <p className="mt-1 text-xs text-white/60 lg:text-sm">
                    Set {setNumber} of {totalSets}
                  </p>
                </div>
                <div className="h-[72px] w-[90px] shrink-0 overflow-hidden rounded-xl bg-white lg:h-[84px] lg:w-[104px]">
                  <Image
                    src={exerciseThumbnailPath}
                    alt={`${exerciseName} demonstration`}
                    width={320}
                    height={240}
                    sizes="104px"
                    className="h-full w-full object-contain"
                    priority
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 lg:space-y-5 lg:p-5">
              <div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-100 lg:text-xs">
                      Repetitions
                    </p>
                    <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums lg:text-6xl">
                      <span className="text-coral-500">{completedRepetitions}</span>
                      <span className="ml-2 text-2xl text-white lg:text-4xl">
                        / {targetRepetitions}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-white/60">
                    {progressPercent}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12 lg:mt-4">
                  <div
                    className="h-full rounded-full bg-coral-500 transition-[width]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {coachingFocus && (
                <div className="rounded-xl border border-primary-200/35 bg-[#173C65] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-100 lg:text-xs">
                    Your focus
                  </p>
                  <p className="mt-2 text-sm font-bold leading-5 text-white lg:text-base lg:leading-6">
                    {coachingFocus}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-100 lg:text-xs">
                  Live coaching
                </p>
                <p aria-live="polite" className="mt-2 text-sm font-bold leading-5 text-white lg:text-lg lg:leading-7">
                  {camera.state.cue}
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 p-4 lg:p-5">
              <p className="mb-2 text-[11px] leading-4 text-white/55 lg:mb-3 lg:text-sm lg:leading-5">
                Rate pain and effort after the set. No video is saved.
              </p>
              {starting ? (
                <button
                  ref={endButtonRef}
                  type="button"
                  onClick={() => stop("Patient cancelled camera startup.")}
                  className="focus-ring min-h-11 w-full rounded-xl border border-white/35 bg-white px-4 text-sm font-extrabold text-ink-900 lg:min-h-12"
                >
                  Cancel start
                </button>
              ) : (
                <div className="grid gap-2 lg:gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      stop(
                        "Patient reported pain or discomfort during the camera set.",
                      )
                    }
                    className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#F08B78] bg-transparent px-3 text-sm font-extrabold text-[#F7A191] hover:bg-white/5 lg:min-h-12 lg:text-base"
                  >
                    <HandRaisedIcon className="h-5 w-5" aria-hidden="true" />
                    Pain / stop
                  </button>
                  <button
                    ref={endButtonRef}
                    type="button"
                    onClick={() => stop()}
                    className="focus-ring min-h-11 rounded-xl border border-[#F08B78] bg-transparent px-3 text-sm font-extrabold text-[#F7A191] hover:bg-white/5 lg:min-h-12 lg:text-base"
                  >
                    End set
                  </button>
                </div>
              )}
            </div>
          </aside>
        ) : (
          <div className="p-4 sm:p-5">
            {unsavedTerminal ? (
              <div role="alert" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden="true" />
                  <div>
                    <p className="font-extrabold text-ink-900">Camera result needs to be saved</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      The camera was released safely, but browser storage did not accept the aggregate yet.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={retryTerminalSave}
                    className="focus-ring min-h-11 rounded-xl bg-primary-700 px-4 text-sm font-extrabold text-white"
                  >
                    Retry save
                  </button>
                  <button
                    type="button"
                    onClick={useManualFallback}
                    className="focus-ring min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
                  >
                    Manual fallback
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                      <VideoCameraIcon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-ink-900">
                          {prepared
                            ? "Camera ready"
                            : cameraPreference
                              ? "Camera remembered"
                              : "Set up your camera"}
                        </p>
                        {(prepared || cameraPreference) && (
                          <span className="h-2 w-2 rounded-full bg-[#3FA976]" aria-label="Camera available" />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500" title={cameraPreference?.label}>
                        {cameraPreference?.label ||
                          "One-time access, then CoachPoint remembers this device."}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Camera and audio settings"
                      aria-expanded={settingsOpen}
                      onClick={() => setSettingsOpen((open) => !open)}
                      disabled={busy}
                      className="focus-ring ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 sm:ml-2"
                    >
                      <Cog6ToothIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={() =>
                        canStartDirectly
                          ? void start()
                          : void prepareCamera()
                      }
                      disabled={disabled || busy || !preferenceLoaded}
                      className="focus-ring min-h-11 rounded-xl bg-coral-500 px-5 text-sm font-extrabold text-white hover:bg-coral-600 disabled:bg-slate-300 sm:min-w-[162px]"
                    >
                      {!preferenceLoaded
                        ? "Checking camera…"
                        : busy
                          ? "Preparing camera…"
                          : canStartDirectly
                            ? "Start camera set"
                            : "Set up camera"}
                    </button>
                    <button
                      type="button"
                      onClick={useManualFallback}
                      disabled={disabled || busy}
                      className="focus-ring min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Manual fallback
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                      Audio coaching
                    </p>
                    <p
                      id={`patient-audio-description-${setId}`}
                      className="mt-1 text-sm font-semibold leading-5 text-ink-900"
                    >
                      A soft chime confirms each rep. English voice plays only at halfway, the last rep, and completion.
                    </p>
                  </div>
                  <label className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-bold text-ink-900">
                    <input
                      type="checkbox"
                      aria-label="Audio coaching"
                      aria-describedby={`patient-audio-description-${setId}`}
                      checked={audio.enabled}
                      onChange={audio.toggleEnabled}
                      className="focus-ring h-5 w-5 accent-[var(--cp-primary-700)]"
                    />
                    {audio.enabled ? "On" : "Off"}
                  </label>
                </div>

                {settingsOpen && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                    <div>
                      {camera.state.devices.length > 0 ? (
                        <label className="block text-xs font-bold text-slate-600">
                          Camera
                          <select
                            value={displayedCameraId}
                            disabled={disabled || busy}
                            onChange={(event) =>
                              handleCameraSelection(event.target.value)
                            }
                            className="focus-ring mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-ink-900 disabled:bg-slate-100"
                          >
                            {camera.state.devices.map((device, index) => (
                              <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Camera ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="text-xs leading-5 text-slate-500">
                          Available cameras appear here automatically after the first setup permission.
                        </p>
                      )}
                    </div>

                    <div className="md:border-l md:border-border md:pl-4">
                      {audio.speechAvailable ? (
                        <>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                            <label className="block text-xs font-bold text-slate-600">
                              Coach voice
                              <select
                                value={audio.selectedVoiceURI}
                                disabled={!audio.enabled || busy}
                                onChange={(event) =>
                                  audio.changeVoice(event.target.value)
                                }
                                className="focus-ring mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-ink-900 disabled:bg-slate-100 disabled:text-slate-500"
                              >
                                {audio.englishVoices.map((voice) => (
                                  <option key={voice.voiceURI} value={voice.voiceURI}>
                                    {voice.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={audio.preview}
                              disabled={!audio.enabled || busy}
                              className="focus-ring h-11 rounded-xl border border-primary-700 px-3 text-xs font-bold text-primary-700 hover:bg-primary-100 disabled:border-slate-300 disabled:text-slate-400"
                            >
                              Preview
                            </button>
                          </div>
                          <label className="mt-4 block text-xs font-bold text-slate-600">
                            <span className="flex items-center justify-between">
                              Voice volume
                              <output className="font-mono font-bold text-slate-700">
                                {Math.round(audio.volume * 100)}%
                              </output>
                            </span>
                            <input
                              type="range"
                              min="0.1"
                              max="0.7"
                              step="0.05"
                              value={audio.volume}
                              disabled={!audio.enabled}
                              onChange={(event) =>
                                audio.changeVolume(Number(event.target.value))
                              }
                              className="focus-ring mt-3 h-2 w-full accent-[var(--cp-primary-700)] disabled:opacity-40"
                            />
                          </label>
                        </>
                      ) : (
                        <p className="text-xs leading-5 text-slate-500">
                          Rep chimes are available. {audio.voiceListResolved
                            ? "No compatible English voice is available in this browser."
                            : "Natural English voices are still loading…"}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {camera.state.error && (
                  <p role="alert" className="mt-4 rounded-xl bg-[#FBEEEA] px-3 py-2 text-xs leading-5 text-danger">
                    {camera.state.error}
                  </p>
                )}

                <p className="mt-4 flex items-center gap-2 text-[11px] leading-4 text-slate-500">
                  <ShieldCheckIcon className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
                  Pose processing stays on this device. No video frames, raw landmarks, or per-repetition time series are saved.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
});

PatientCameraSetPanel.displayName = "PatientCameraSetPanel";

export default PatientCameraSetPanel;
