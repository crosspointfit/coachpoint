"use client";

import { useEffect, useRef, useState } from "react";
import {
  HALF_SQUAT_REPLAY,
  createRepCounterState,
  processHalfSquatFrame,
  summarizeRepCounter,
  updateRepCounter,
  type HalfSquatSetSummary,
  type NormalizedLandmarkLike,
  type RepCounterState,
} from "@/motion";
import {
  createPoseRuntime,
  type PoseConnection,
  type PoseRuntime,
} from "@/motion/mediapipe-runtime";

type LabMode = "idle" | "replay" | "camera";
type RuntimeStatus = "idle" | "loading" | "ready" | "error";

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: readonly NormalizedLandmarkLike[],
  connections: readonly PoseConnection[],
) {
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
    if (!start || !end || (start.visibility ?? 1) < 0.45 || (end.visibility ?? 1) < 0.45) {
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
    context.arc(landmark.x * width, landmark.y * height, Math.max(2.5, width / 220), 0, Math.PI * 2);
    context.fill();
  }
}

export default function MotionLab() {
  const [mode, setMode] = useState<LabMode>("idle");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("idle");
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | null>(null);
  const [repState, setRepState] = useState<RepCounterState>(() =>
    createRepCounterState(),
  );
  const [angle, setAngle] = useState<number | null>(null);
  const [side, setSide] = useState<string>("—");
  const [visibility, setVisibility] = useState<number | null>(null);
  const [cue, setCue] = useState(
    "Choose deterministic replay or start the optional camera lab.",
  );
  const [summary, setSummary] = useState<HalfSquatSetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PoseRuntime | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastInferenceRef = useRef(0);
  const stateRef = useRef<RepCounterState>(createRepCounterState());
  const replayTokenRef = useRef(0);

  const stopCamera = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopLab = () => {
    replayTokenRef.current += 1;
    stopCamera();
    setMode("idle");
    setSummary(summarizeRepCounter(stateRef.current));
    setCue("Motion lab stopped. Review the browser-derived summary below.");
  };

  useEffect(() => {
    return () => {
      replayTokenRef.current += 1;
      stopCamera();
      runtimeRef.current?.landmarker.close();
      runtimeRef.current = null;
    };
  }, []);

  const resetCounter = () => {
    const initial = createRepCounterState();
    stateRef.current = initial;
    setRepState(initial);
    setAngle(null);
    setSide("—");
    setVisibility(null);
    setSummary(null);
    setError(null);
  };

  const runReplay = async () => {
    stopCamera();
    resetCounter();
    setMode("replay");
    setRuntimeStatus("ready");
    setDelegate(null);
    const token = replayTokenRef.current + 1;
    replayTokenRef.current = token;
    let current = createRepCounterState();
    for (const frame of HALF_SQUAT_REPLAY) {
      if (replayTokenRef.current !== token) return;
      const update = updateRepCounter(
        current,
        frame.kneeAngleDeg,
        frame.timestampMs,
      );
      current = update.state;
      stateRef.current = current;
      setRepState(current);
      setAngle(frame.kneeAngleDeg);
      setSide("synthetic side profile");
      setVisibility(1);
      setCue(update.cue);
      await new Promise((resolve) => window.setTimeout(resolve, 90));
    }
    if (replayTokenRef.current !== token) return;
    setSummary(summarizeRepCounter(current));
    setMode("idle");
    setCue("Replay complete. Only per-repetition summaries were retained.");
  };

  const ensureRuntime = async (): Promise<PoseRuntime> => {
    if (runtimeRef.current) return runtimeRef.current;
    setRuntimeStatus("loading");
    const runtime = await createPoseRuntime();
    runtimeRef.current = runtime;
    setRuntimeStatus("ready");
    setDelegate(runtime.delegate);
    return runtime;
  };

  const loadModelOnly = async () => {
    setError(null);
    setCue("Loading the self-hosted pose model and WASM runtime…");
    try {
      const runtime = await ensureRuntime();
      setCue(
        `Local pose runtime ready with the ${runtime.delegate} delegate. Camera permission has not been requested.`,
      );
    } catch (caught) {
      setRuntimeStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The local pose runtime could not be loaded.",
      );
      setCue("Local pose runtime failed to load. Deterministic replay remains available.");
    }
  };

  const startCamera = async () => {
    resetCounter();
    setRuntimeStatus("loading");
    setCue("Loading the local pose model…");
    try {
      const runtime = await ensureRuntime();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 960 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setMode("camera");
      setCue("Stand side-on with your hip, knee, and ankle visible.");

      const loop = (timestampMs: number) => {
        if (streamRef.current !== stream || !videoRef.current) return;
        if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          timestampMs - lastInferenceRef.current >= 70
        ) {
          lastInferenceRef.current = timestampMs;
          const result = runtime.landmarker.detectForVideo(video, timestampMs);
          const landmarks = result.landmarks[0] as
            | NormalizedLandmarkLike[]
            | undefined;
          if (landmarks) {
            if (canvasRef.current) {
              drawPose(
                canvasRef.current,
                video,
                landmarks,
                runtime.connections,
              );
            }
            const processed = processHalfSquatFrame(
              stateRef.current,
              landmarks,
              timestampMs,
            );
            stateRef.current = processed.update.state;
            setRepState(processed.update.state);
            setAngle(processed.analysis.kneeAngleDeg ?? null);
            setSide(processed.analysis.side ?? "—");
            setVisibility(processed.analysis.visibility ?? null);
            setCue(processed.update.cue);
            if (processed.update.event?.type === "rep_completed") {
              window.speechSynthesis?.speak(
                new SpeechSynthesisUtterance(
                  String(processed.update.event.record.rep),
                ),
              );
            }
          } else {
            setAngle(null);
            setVisibility(null);
            setCue("Step back until your full side profile is visible.");
          }
        }
        animationRef.current = requestAnimationFrame(loop);
      };
      animationRef.current = requestAnimationFrame(loop);
    } catch (caught) {
      stopCamera();
      setMode("idle");
      setRuntimeStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "The camera motion lab could not start.",
      );
      setCue("Camera unavailable. The deterministic replay remains available.");
    }
  };

  return (
    <main className="flex-1 bg-bg">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start justify-between gap-6 px-6 py-8 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Phase 6 · isolated motion lab
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
              Browser-local half-squat sensing
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              The lab validates angle calculation, debounced counting, and set summaries before motion is connected to patient WebMCP tools. It is not a clinical assessment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runReplay()}
              disabled={mode !== "idle"}
              className="focus-ring h-12 rounded-xl border border-primary-700 bg-white px-5 text-sm font-bold text-primary-700 hover:bg-primary-100 disabled:opacity-40"
            >
              Run deterministic replay
            </button>
            <button
              type="button"
              onClick={() => void loadModelOnly()}
              disabled={mode !== "idle" || runtimeStatus === "loading"}
              className="focus-ring h-12 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {runtimeStatus === "ready" ? "Local pose model ready" : "Load local pose model"}
            </button>
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={mode !== "idle" || runtimeStatus === "loading"}
              className="focus-ring h-12 rounded-xl bg-coral-500 px-5 text-sm font-extrabold text-white hover:bg-coral-600 disabled:bg-slate-300"
            >
              {runtimeStatus === "loading" ? "Loading local model…" : "Start optional camera"}
            </button>
            {mode !== "idle" && (
              <button
                type="button"
                onClick={stopLab}
                className="focus-ring h-12 rounded-xl border border-danger px-5 text-sm font-bold text-danger"
              >
                Stop lab
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section className="overflow-hidden border border-border bg-ink-900 shadow-[var(--cp-shadow-card)]">
          <div className="relative aspect-[4/3] min-h-[420px] bg-[#0E2848]">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`h-full w-full object-cover ${mode === "camera" ? "block" : "hidden"}`}
            />
            <canvas
              ref={canvasRef}
              className={`pointer-events-none absolute inset-0 h-full w-full ${mode === "camera" ? "block" : "hidden"}`}
            />
            {mode !== "camera" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/30">
                  <span className="font-mono text-4xl font-bold tabular-nums">
                    {angle === null ? "—" : Math.round(angle)}°
                  </span>
                </div>
                <p className="mt-6 max-w-lg text-sm leading-6 text-white/70">
                  Deterministic replay uses synthetic knee angles. Camera mode processes landmarks locally and does not upload frames.
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-[#081B31]/90 px-5 py-4 text-white">
              <p className="text-lg font-bold" aria-live="polite">{cue}</p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="border border-border bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">Live metrics</p>
            <dl className="mt-4 grid grid-cols-2 gap-px bg-border">
              <div className="bg-white p-4"><dt className="text-[10px] font-bold uppercase text-slate-500">Reps</dt><dd className="mt-1 font-mono text-3xl font-bold text-ink-900">{repState.reps}</dd></div>
              <div className="bg-white p-4"><dt className="text-[10px] font-bold uppercase text-slate-500">Knee angle</dt><dd className="mt-1 font-mono text-3xl font-bold text-ink-900">{angle === null ? "—" : `${Math.round(angle)}°`}</dd></div>
              <div className="bg-white p-4"><dt className="text-[10px] font-bold uppercase text-slate-500">Phase</dt><dd className="mt-1 text-sm font-bold capitalize text-ink-900">{repState.phase.replace("_", " ")}</dd></div>
              <div className="bg-white p-4"><dt className="text-[10px] font-bold uppercase text-slate-500">Side</dt><dd className="mt-1 text-sm font-bold capitalize text-ink-900">{side}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Visibility: {visibility === null ? "—" : visibility.toFixed(2)} · Delegate: {delegate ?? "replay / not loaded"}
            </p>
          </section>

          <section className="border-l-2 border-primary-700 bg-white p-5">
            <h2 className="font-extrabold text-ink-900">Camera setup</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>Use a clear side or slight oblique view.</li>
              <li>Keep hip, knee, and ankle visible.</li>
              <li>Keep stable support within reach.</li>
              <li>Move only through therapist-approved range.</li>
            </ol>
          </section>

          {error && (
            <section role="alert" className="border-l-4 border-warning bg-[#FFF7E8] p-4 text-sm text-[#765000]">
              <strong>Camera fallback:</strong> {error}
            </section>
          )}
        </aside>
      </div>

      {summary && (
        <section className="mx-auto mb-10 w-full max-w-[1280px] px-6 lg:px-8">
          <div className="border-t-2 border-primary-700 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">Browser-derived set summary</p>
                <h2 className="mt-2 text-2xl font-black text-ink-900">No raw frames retained</h2>
              </div>
              <p className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
                {summary.qualityFlags.length > 0 ? summary.qualityFlags.join(" · ") : "no quality flags"}
              </p>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div><dt className="text-xs text-slate-500">Completed reps</dt><dd className="mt-1 font-mono text-2xl font-bold">{summary.completedReps}</dd></div>
              <div><dt className="text-xs text-slate-500">Duration</dt><dd className="mt-1 font-mono text-2xl font-bold">{summary.durationSeconds}s</dd></div>
              <div><dt className="text-xs text-slate-500">Average range</dt><dd className="mt-1 font-mono text-2xl font-bold">{summary.averageRangeDeg}°</dd></div>
              <div><dt className="text-xs text-slate-500">Range decline</dt><dd className="mt-1 font-mono text-2xl font-bold">{summary.rangeDeclineDeg}°</dd></div>
              <div><dt className="text-xs text-slate-500">Average min angle</dt><dd className="mt-1 font-mono text-2xl font-bold">{summary.averageMinAngleDeg}°</dd></div>
            </dl>
          </div>
        </section>
      )}
    </main>
  );
}
