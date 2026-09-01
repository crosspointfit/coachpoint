"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  useHalfSquatCameraSet,
} from "../motion/useHalfSquatCameraSet";
import type {
  HalfSquatCameraSetTerminalResult,
} from "../motion/half-squat-camera-set-controller";

export interface PatientCameraSetPanelHandle {
  stop(reason?: string): void;
}

interface PatientCameraSetPanelProps {
  setId: string;
  exerciseId: string;
  exerciseName: string;
  targetRepetitions: number;
  setIsActive: boolean;
  disabled: boolean;
  onBeginCameraSet: () => boolean;
  onCameraStartFailed: (setId: string) => void;
  onTerminal: (
    result: HalfSquatCameraSetTerminalResult,
    stopReason?: string,
  ) => void;
  onUseManualFallback: () => void;
}

const PatientCameraSetPanel = forwardRef<
  PatientCameraSetPanelHandle,
  PatientCameraSetPanelProps
>(function PatientCameraSetPanel(
  {
    exerciseId,
    exerciseName,
    setId,
    targetRepetitions,
    setIsActive,
    disabled,
    onBeginCameraSet,
    onCameraStartFailed,
    onTerminal,
    onUseManualFallback,
  },
  forwardedRef,
) {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const stopReasonRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const startAttemptRef = useRef(0);
  const startInFlightRef = useRef(false);
  const camera = useHalfSquatCameraSet({
    targetRepetitions,
    selectedCameraId,
    targetSource: "therapist_confirmed",
    exerciseId,
    exerciseName,
    onTerminal: (result) => {
      const stopReason =
        result.outcome === "stopped"
          ? stopReasonRef.current ?? "Camera input ended before the prescribed target."
          : undefined;
      stopReasonRef.current = null;
      onTerminal(result, stopReason);
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startAttemptRef.current += 1;
    };
  }, []);

  const stop = useCallback((reason = "Patient ended the camera set early.") => {
    stopReasonRef.current = reason;
    camera.stop();
  }, [camera]);

  useImperativeHandle(
    forwardedRef,
    () => ({ stop }),
    [stop],
  );

  const prepare = async () => {
    if (disabled) return;
    await camera.prepare();
  };

  const start = async () => {
    if (disabled) return;
    if (camera.state.status !== "ready") return;
    if (startInFlightRef.current) return;
    const attempt = startAttemptRef.current + 1;
    startAttemptRef.current = attempt;
    startInFlightRef.current = true;
    if (!setIsActive && !onBeginCameraSet()) {
      startInFlightRef.current = false;
      return;
    }
    const started = await camera.start();
    if (startAttemptRef.current === attempt) {
      startInFlightRef.current = false;
    }
    if (
      !started &&
      mountedRef.current &&
      startAttemptRef.current === attempt
    ) {
      onCameraStartFailed(setId);
    }
  };

  const busy = camera.state.status === "preparing" ||
    camera.state.status === "starting";
  const running = camera.state.status === "running";
  const prepared = camera.state.status === "ready";
  const displayedCameraId =
    selectedCameraId ?? camera.state.selectedCameraId ?? "";
  const activeCameraLabel =
    camera.state.devices.find(
      (device) =>
        device.deviceId ===
        (camera.state.activeCameraId ?? displayedCameraId),
    )?.label ?? "Camera active";
  const completedRepetitions =
    camera.state.snapshot?.completedRepetitions ?? 0;

  return (
    <section className="min-w-0 overflow-hidden rounded-[18px] border border-[#173A64] bg-ink-900 text-white">
      <div>
        <div className="relative aspect-video min-h-[240px] bg-[#0E2848] sm:min-h-[300px]">
          <video
            ref={camera.videoRef}
            muted
            playsInline
            aria-label="Live camera preview"
            className={`h-full w-full object-contain ${running ? "block" : "hidden"}`}
          />
          <canvas
            ref={camera.canvasRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${running ? "block" : "hidden"}`}
          />
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-100">
                Therapist-confirmed target
              </p>
              <p className="mt-3 font-mono text-5xl font-bold tabular-nums">
                {targetRepetitions}
                <span className="ml-2 text-base text-white/65">reps</span>
              </p>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
                Camera processing stays on this device. Starting and stopping remain human controls.
              </p>
            </div>
          )}
          {running && (
            <>
              <div className="absolute right-4 top-4 rounded-full bg-[#081B31]/90 px-3 py-1.5 font-mono text-sm font-bold">
                {completedRepetitions} / {targetRepetitions}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-[#081B31]/92 px-5 py-4">
                <p className="font-bold">{camera.state.cue}</p>
              </div>
            </>
          )}
        </div>

        {running ? (
          <div className="border-t border-white/15 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#65C18C]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-primary-100">
                    Camera set running
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/60" title={activeCameraLabel}>
                    {activeCameraLabel} · on-device processing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => stop()}
                className="focus-ring min-h-10 shrink-0 rounded-xl border border-[#F08B78] bg-white px-4 text-xs font-extrabold text-danger"
              >
                End set
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-white/15 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-100">
              Camera set
            </p>
            <p className="mt-2 text-sm font-bold capitalize">
              {camera.state.status.replaceAll("_", " ")}
            </p>
            <p className="mt-2 text-xs leading-5 text-white/65">
              {camera.state.cue}
            </p>

            {camera.state.devices.length > 0 && (
              <label className="mt-5 block text-xs font-bold text-white/75">
                Camera
                <select
                  value={displayedCameraId}
                  disabled={disabled || busy}
                  onChange={(event) =>
                    setSelectedCameraId(event.target.value || null)
                  }
                  className="focus-ring mt-2 h-11 w-full rounded-xl border border-white/20 bg-white px-3 text-sm font-semibold text-ink-900 disabled:bg-slate-200"
                >
                  {camera.state.devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {camera.state.error && (
              <p role="alert" className="mt-4 rounded-xl bg-[#FBEEEA] px-3 py-2 text-xs leading-5 text-danger">
                {camera.state.error}
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {prepared ? (
              <button
                type="button"
                onClick={() => void start()}
                disabled={disabled || busy}
                className="focus-ring min-h-12 rounded-xl bg-coral-500 px-4 text-sm font-extrabold text-white disabled:bg-slate-500"
              >
                Start camera set
              </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void prepare()}
                  disabled={disabled || busy}
                  className={`focus-ring min-h-12 rounded-xl bg-white px-4 text-sm font-extrabold text-ink-900 disabled:bg-slate-500 ${busy ? "sm:col-span-2" : ""}`}
                >
                  {busy ? "Preparing…" : "Set up camera"}
                </button>
              )}

              {!busy && (
                <button
                  type="button"
                  onClick={onUseManualFallback}
                  disabled={disabled}
                  className="focus-ring min-h-11 rounded-xl border border-white/30 px-4 text-sm font-bold text-white hover:bg-white/10 disabled:border-white/10 disabled:text-white/35"
                >
                  Use manual fallback
                </button>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-4 text-white/55">
              No video frames, raw landmarks, or per-repetition time series are saved.
            </p>
          </div>
        )}
      </div>
    </section>
  );
});

PatientCameraSetPanel.displayName = "PatientCameraSetPanel";

export default PatientCameraSetPanel;
