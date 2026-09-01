"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VOICE_COACH_DEFAULT_PITCH,
  VOICE_COACH_DEFAULT_RATE,
  VOICE_COACH_DEFAULT_VOLUME,
  completedRepFeedback,
  createAudioCoach,
  createHalfSquatSetRunner,
  listEnglishVoices,
  projectMotionLabSetResult,
  selectEnglishVoice,
  type HalfSquatSetSummary,
  type HalfSquatSetRunner,
  type HalfSquatSetRunnerSnapshot,
  type EnglishVoiceOption,
  type NormalizedLandmarkLike,
  type AudioCoach,
  type MotionLabSetResultProjection,
} from "@/motion";
import {
  createMotionLabToolDescriptors,
  useWebMcpTools,
  type WebMcpToolDescriptor,
} from "@/lib/webmcp";
import {
  buildCameraConstraints,
  describeCameraError,
  discoverCameraDevices,
  enumerateCameraDevices,
  selectCameraDeviceId,
  type CameraDeviceOption,
} from "@/motion/camera";
import {
  createPoseRuntime,
  type PoseConnection,
  type PoseRuntime,
} from "@/motion/mediapipe-runtime";

type LabMode = "idle" | "camera";
type LabOutcome = "ready" | "camera-completed" | "camera-stopped";
type RuntimeStatus = "idle" | "loading" | "ready" | "error";
type CameraStatus =
  | "idle"
  | "starting"
  | "running"
  | "error"
  | "unsupported";
type CameraListStatus = "loading" | "ready" | "empty" | "error";

const CAMERA_TARGET_REPS = 6;
const AGENT_REVIEW_PROMPT =
  "How did I do in that set? Use get_latest_motion_lab_set_result and explain the result in plain language.";

function initialRunnerSnapshot(): HalfSquatSetRunnerSnapshot {
  return {
    targetRepetitions: CAMERA_TARGET_REPS,
    completedRepetitions: 0,
    repPhase: "seeking_standing",
    consecutiveMissingFrames: 0,
    trackingState: "acquiring",
    targetReached: false,
  };
}

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
  const runnerRef = useRef<HalfSquatSetRunner | null>(null);
  if (runnerRef.current === null) {
    runnerRef.current = createHalfSquatSetRunner({
      targetRepetitions: CAMERA_TARGET_REPS,
    });
  }

  const [mode, setMode] = useState<LabMode>("idle");
  const [outcome, setOutcome] = useState<LabOutcome>("ready");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("idle");
  const [runnerSnapshot, setRunnerSnapshot] =
    useState<HalfSquatSetRunnerSnapshot>(initialRunnerSnapshot);
  const [angle, setAngle] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<number | null>(null);
  const [cue, setCue] = useState(
    "Choose a camera, then start when your full side profile is in view.",
  );
  const [announcement, setAnnouncement] = useState("");
  const [summary, setSummary] = useState<HalfSquatSetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraListStatus, setCameraListStatus] =
    useState<CameraListStatus>("loading");
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [cameraAccessReady, setCameraAccessReady] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(
    VOICE_COACH_DEFAULT_VOLUME,
  );
  const [englishVoices, setEnglishVoices] = useState<EnglishVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [voiceListResolved, setVoiceListResolved] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [reviewPromptCopied, setReviewPromptCopied] = useState(false);
  const [motionToolDescriptors, setMotionToolDescriptors] = useState<
    readonly WebMcpToolDescriptor[]
  >([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PoseRuntime | null>(null);
  const runtimePromiseRef = useRef<Promise<PoseRuntime> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastInferenceRef = useRef(0);
  const cameraAttemptRef = useRef(0);
  const deviceListAttemptRef = useRef(0);
  const cameraDiscoveryAbortRef = useRef<AbortController | null>(null);
  const selectedCameraIdRef = useRef<string | null>(null);
  const rememberedCameraIdRef = useRef<string | null>(null);
  const voiceEnabledRef = useRef(false);
  const voicePreferenceEnabledRef = useRef(false);
  const voiceVolumeRef = useRef(VOICE_COACH_DEFAULT_VOLUME);
  const selectedVoiceURIRef = useRef("");
  const preferredVoiceURIRef = useRef("");
  const audioCoachRef = useRef<AudioCoach | null>(null);
  const pendingSpeechTimerRef = useRef<number | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioGenerationRef = useRef(0);
  const motionResultProjectionRef =
    useRef<MotionLabSetResultProjection | null>(null);
  const mountedRef = useRef(true);
  const coachCueUntilRef = useRef(0);

  const stopCamera = useCallback((invalidateAttempt = true) => {
    if (invalidateAttempt) cameraAttemptRef.current += 1;
    cameraDiscoveryAbortRef.current?.abort();
    cameraDiscoveryAbortRef.current = null;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    coachCueUntilRef.current = 0;
  }, []);

  const readReviewableRunnerSummary = useCallback(() => {
    const current = runnerRef.current?.getSummary() ?? null;
    return current && current.completedReps > 0 ? current : null;
  }, []);

  const getAudioCoach = useCallback(() => {
    if (!audioCoachRef.current) {
      audioCoachRef.current = createAudioCoach();
    }
    return audioCoachRef.current;
  }, []);

  const cancelCoachPlayback = useCallback(() => {
    audioGenerationRef.current += 1;
    if (pendingSpeechTimerRef.current !== null) {
      window.clearTimeout(pendingSpeechTimerRef.current);
      pendingSpeechTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    activeUtteranceRef.current = null;
    audioCoachRef.current?.cancel();
  }, []);

  const stopLab = useCallback(() => {
    const stoppedMode = mode;
    cancelCoachPlayback();
    stopCamera();
    setMode("idle");
    setCameraStatus((current) =>
      current === "unsupported" ? "unsupported" : "idle",
    );
    setSummary(readReviewableRunnerSummary());
    setAngle(null);
    setVisibility(null);
    setOutcome(
      stoppedMode === "camera"
        ? "camera-stopped"
        : "ready",
    );
    setCue(
      runtimePromiseRef.current
        ? "Motion lab stopped and the camera was released. The local model may finish loading for the next run."
        : "Motion lab stopped. Camera and local processing were released.",
    );
    setAnnouncement("Set stopped. Camera released.");
  }, [cancelCoachPlayback, mode, readReviewableRunnerSummary, stopCamera]);

  const resetCounter = useCallback(() => {
    setRunnerSnapshot(runnerRef.current!.reset());
    setAngle(null);
    setVisibility(null);
    setSummary(null);
    setReviewPromptCopied(false);
    setError(null);
    setOutcome("ready");
    coachCueUntilRef.current = 0;
  }, []);

  const speakCoach = useCallback((message: string) => {
    if (!voiceEnabledRef.current || typeof window === "undefined") return;
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") return;

    const voices = synthesis.getVoices();
    const englishVoice = selectEnglishVoice(
      voices,
      selectedVoiceURIRef.current,
    );
    if (!englishVoice) return;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = englishVoice.lang;
    utterance.rate = VOICE_COACH_DEFAULT_RATE;
    utterance.pitch = VOICE_COACH_DEFAULT_PITCH;
    utterance.volume = voiceVolumeRef.current;
    utterance.voice = englishVoice;
    activeUtteranceRef.current = utterance;
    const clearCurrentUtterance = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
      }
    };
    utterance.onend = clearCurrentUtterance;
    utterance.onerror = clearCurrentUtterance;
    synthesis.speak(utterance);
  }, []);

  const scheduleCoachSpeech = useCallback((message: string, delayMs = 140) => {
    if (!voiceEnabledRef.current) return;
    const generation = audioGenerationRef.current;
    if (pendingSpeechTimerRef.current !== null) {
      window.clearTimeout(pendingSpeechTimerRef.current);
    }
    window.speechSynthesis?.cancel();
    activeUtteranceRef.current = null;
    pendingSpeechTimerRef.current = window.setTimeout(() => {
      pendingSpeechTimerRef.current = null;
      if (
        !mountedRef.current ||
        !voiceEnabledRef.current ||
        audioGenerationRef.current !== generation
      ) {
        return;
      }
      speakCoach(message);
    }, delayMs);
  }, [speakCoach]);

  const toggleAudioCoaching = () => {
    const next = !voiceEnabledRef.current;
    voiceEnabledRef.current = next;
    voicePreferenceEnabledRef.current = next;
    setVoiceEnabled(next);
    try {
      window.localStorage.setItem(
        "coachpoint.motion.voice-enabled",
        String(next),
      );
    } catch {
      // The current page preference still works when storage is unavailable.
    }
    if (next) {
      void getAudioCoach().arm();
      setAnnouncement(
        "Audio coaching on. A chime confirms each repetition; voice plays at milestones.",
      );
    } else {
      cancelCoachPlayback();
      setAnnouncement("Audio coaching off.");
    }
  };

  const ensureRuntime = useCallback(async (): Promise<PoseRuntime> => {
    if (runtimeRef.current) return runtimeRef.current;
    if (runtimePromiseRef.current) return runtimePromiseRef.current;
    setRuntimeStatus("loading");
    const promise = createPoseRuntime();
    runtimePromiseRef.current = promise;
    try {
      const runtime = await promise;
      if (!mountedRef.current) {
        runtime.landmarker.close();
        throw new DOMException("Motion Lab was closed.", "AbortError");
      }
      runtimeRef.current = runtime;
      setRuntimeStatus("ready");
      return runtime;
    } catch (caught) {
      if (mountedRef.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        setRuntimeStatus("error");
      }
      throw caught;
    } finally {
      if (runtimePromiseRef.current === promise) {
        runtimePromiseRef.current = null;
      }
    }
  }, []);

  const getCameraApi = useCallback((): MediaDevices => {
    let mediaDevices: MediaDevices | undefined;
    try {
      mediaDevices = navigator.mediaDevices;
    } catch {
      mediaDevices = undefined;
    }
    if (
      !window.isSecureContext ||
      !mediaDevices ||
      typeof mediaDevices.getUserMedia !== "function" ||
      typeof mediaDevices.enumerateDevices !== "function"
    ) {
      const unsupported = new Error("Camera access requires HTTPS or localhost in a current browser.");
      unsupported.name = "NotSupportedError";
      throw unsupported;
    }
    return mediaDevices;
  }, []);

  const applyCameraDevices = useCallback((
    devices: CameraDeviceOption[],
    ...preferredDeviceIds: Array<string | null | undefined>
  ): string | null => {
    setCameraDevices(devices);
    const next = selectCameraDeviceId(
      devices,
      ...preferredDeviceIds,
      rememberedCameraIdRef.current,
      selectedCameraIdRef.current,
    );
    selectedCameraIdRef.current = next;
    setSelectedCameraId(next);
    return next;
  }, []);

  const refreshCameraDevices = useCallback(async (options?: {
    announceFailure?: boolean;
    markLoading?: boolean;
    preferredDeviceId?: string;
    stopRemovedActive?: boolean;
  }): Promise<string | null> => {
    const listAttempt = deviceListAttemptRef.current + 1;
    deviceListAttemptRef.current = listAttempt;
    if (options?.markLoading) setCameraListStatus("loading");
    try {
      const devices = await enumerateCameraDevices(getCameraApi());
      if (
        !mountedRef.current ||
        deviceListAttemptRef.current !== listAttempt
      ) {
        return null;
      }
      const activeTrack = streamRef.current?.getVideoTracks()[0];
      const activeDeviceId = activeTrack?.getSettings().deviceId;
      const activeDeviceMissing =
        options?.stopRemovedActive &&
        !!streamRef.current &&
        !!activeDeviceId &&
        !devices.some((device) => device.deviceId === activeDeviceId);
      if (activeDeviceMissing && activeTrack?.readyState !== "ended") {
        setCameraListStatus(devices.length > 0 ? "ready" : "empty");
        return selectedCameraIdRef.current;
      }
      const selected = applyCameraDevices(
        devices,
        options?.preferredDeviceId,
        activeDeviceId,
        selectedCameraIdRef.current,
      );
      setCameraListStatus(devices.length > 0 ? "ready" : "empty");
      if (devices.some((device) => device.hasDeviceLabel)) {
        setCameraAccessReady(true);
      }

      if (activeDeviceMissing && streamRef.current) {
        rememberedCameraIdRef.current = selected;
        try {
          if (selected) {
            window.localStorage.setItem(
              "coachpoint.motion.camera-id",
              selected,
            );
          } else {
            window.localStorage.removeItem("coachpoint.motion.camera-id");
          }
        } catch {
          // The fallback selection still works without storage.
        }
        cancelCoachPlayback();
        stopCamera();
        setMode("idle");
        setCameraStatus("error");
        setOutcome("camera-stopped");
        setAngle(null);
        setVisibility(null);
        setSummary(readReviewableRunnerSummary());
        setCameraError(
          devices.length > 0
            ? "The active camera was removed. Another available camera is selected for the next set."
            : "The active camera was removed. Connect a camera before starting again.",
        );
        setCue("Camera disconnected. The set ended safely.");
        setAnnouncement("Camera disconnected. Set stopped.");
      }
      return selected;
    } catch (caught) {
      if (
        !mountedRef.current ||
        deviceListAttemptRef.current !== listAttempt
      ) {
        return null;
      }
      const unsupported =
        caught instanceof Error && caught.name === "NotSupportedError";
      setCameraListStatus("error");
      if (unsupported) setCameraStatus("unsupported");
      if (options?.announceFailure || unsupported) {
        setCameraError(describeCameraError(caught));
      }
      return null;
    }
  }, [
    applyCameraDevices,
    cancelCoachPlayback,
    getCameraApi,
    readReviewableRunnerSummary,
    stopCamera,
  ]);

  const prepareCameraAccess = async () => {
    cancelCoachPlayback();
    stopCamera();
    const attempt = cameraAttemptRef.current + 1;
    cameraAttemptRef.current = attempt;
    const listAttempt = deviceListAttemptRef.current + 1;
    deviceListAttemptRef.current = listAttempt;
    const discoveryController = new AbortController();
    cameraDiscoveryAbortRef.current = discoveryController;
    setCameraStatus("starting");
    setCameraError(null);
    setCue("Allow camera access once so every available camera can be named before the set.");
    try {
      const discovery = await discoverCameraDevices(getCameraApi(), {
        signal: discoveryController.signal,
      });
      if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;

      setCameraAccessReady(true);
      if (deviceListAttemptRef.current === listAttempt) {
        applyCameraDevices(
          discovery.devices,
          rememberedCameraIdRef.current,
          discovery.preferredDeviceId,
          selectedCameraIdRef.current,
        );
        setCameraListStatus(
          discovery.devices.length > 0 ? "ready" : "empty",
        );
      } else {
        void refreshCameraDevices();
      }
      setCameraStatus("idle");
      if (discovery.devices.length === 0) {
        setCue("Default camera access is ready. Start the set when you are positioned.");
        setAnnouncement("Default camera access ready.");
      } else {
        setCue("Camera access is ready. Choose the camera you want, then start the set.");
        setAnnouncement("Camera list ready. Choose a camera before starting.");
      }
    } catch (caught) {
      if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;
      const unsupported =
        caught instanceof Error && caught.name === "NotSupportedError";
      setCameraStatus(unsupported ? "unsupported" : "error");
      setCameraError(describeCameraError(caught));
      setCue("Camera access was not completed. Check browser permission and try again.");
      setAnnouncement("Camera access was not completed.");
    } finally {
      if (cameraDiscoveryAbortRef.current === discoveryController) {
        cameraDiscoveryAbortRef.current = null;
      }
    }
  };

  const startCamera = async () => {
    if (!cameraAccessReady) {
      await prepareCameraAccess();
      return;
    }
    cancelCoachPlayback();
    if (voiceEnabledRef.current) {
      void getAudioCoach().arm();
    }
    stopCamera();
    resetCounter();
    const attempt = cameraAttemptRef.current + 1;
    cameraAttemptRef.current = attempt;
    setCameraError(null);

    const cameraId = selectedCameraIdRef.current;
    let mediaDevices: MediaDevices;
    try {
      mediaDevices = getCameraApi();
    } catch (caught) {
      if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;
      setMode("idle");
      setCameraStatus(caught instanceof Error && caught.name === "NotSupportedError" ? "unsupported" : "error");
      setCameraError(describeCameraError(caught));
      setCue("Camera unavailable. Check access, then try the set again.");
      setAnnouncement("Camera unavailable.");
      return;
    }

    setCameraStatus("starting");
    setCue("Loading the local pose model before opening the selected camera…");

    let runtime: PoseRuntime;
    try {
      runtime = await ensureRuntime();
    } catch (caught) {
      if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;
      setMode("idle");
      setCameraStatus("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "The local pose model could not start.",
      );
      setCue("Local pose processing could not start. Try the set again.");
      return;
    }
    if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;

    setCue("Opening the selected camera…");
    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia(buildCameraConstraints(cameraId));
    } catch (caught) {
      if (!mountedRef.current || cameraAttemptRef.current !== attempt) return;
      setMode("idle");
      setCameraStatus("error");
      setCameraError(describeCameraError(caught));
      setCue("Camera unavailable. Choose another input or check browser access.");
      if (
        caught instanceof Error &&
        (caught.name === "NotFoundError" ||
          caught.name === "OverconstrainedError")
      ) {
        void refreshCameraDevices({ markLoading: true });
      }
      return;
    }
    if (!mountedRef.current || cameraAttemptRef.current !== attempt) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      cancelCoachPlayback();
      stopCamera();
      setCameraStatus("error");
      setCameraError("Camera preview is unavailable.");
      setCue("Camera preview could not start. Choose another input and try again.");
      return;
    }

    video.srcObject = stream;
    try {
      await video.play();
    } catch (caught) {
      const wasCurrent =
        streamRef.current === stream && cameraAttemptRef.current === attempt;
      if (wasCurrent) {
        cancelCoachPlayback();
        stopCamera();
      }
      if (mountedRef.current && wasCurrent) {
        setMode("idle");
        setCameraStatus("error");
        setCameraError(
          caught instanceof Error && caught.message
            ? `The camera connected, but its preview could not start: ${caught.message}`
            : "The camera connected, but its preview could not start. Try another input.",
        );
        setCue("Camera preview could not start. Choose another input and try again.");
      }
      return;
    }
    if (!mountedRef.current || cameraAttemptRef.current !== attempt) {
      if (streamRef.current === stream) stopCamera(false);
      else stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      cancelCoachPlayback();
      stopCamera();
      setMode("idle");
      setCameraStatus("error");
      setCameraError("The selected input did not provide a video track. Choose another camera.");
      setCue("Camera unavailable. Choose another input and try again.");
      return;
    }
    const activeDeviceId = videoTrack.getSettings().deviceId;
    videoTrack.addEventListener(
      "ended",
      () => {
        if (streamRef.current !== stream) return;
        cancelCoachPlayback();
        stopCamera();
        setMode("idle");
        setCameraStatus("error");
        setOutcome("camera-stopped");
        setAngle(null);
        setVisibility(null);
        setSummary(readReviewableRunnerSummary());
        setCameraError("The selected camera disconnected. Choose an available input and start again.");
        setCue("Camera disconnected. The current set stopped safely.");
        setAnnouncement("Camera disconnected. Set stopped.");
        void refreshCameraDevices({ markLoading: true });
      },
      { once: true },
    );
    setMode("camera");
    setCameraStatus("running");
    const startCue = `Stand tall when you are ready. Complete ${CAMERA_TARGET_REPS} controlled reps.`;
    setCue(startCue);
    coachCueUntilRef.current = performance.now() + 2_500;
    setAnnouncement("Set started. Target: six controlled repetitions.");
    void refreshCameraDevices({ preferredDeviceId: activeDeviceId });

    const failInference = (caught: unknown) => {
      if (streamRef.current !== stream) return;
      cancelCoachPlayback();
      stopCamera();
      setMode("idle");
      setCameraStatus("error");
      setOutcome("camera-stopped");
      setAngle(null);
      setVisibility(null);
      setSummary(readReviewableRunnerSummary());
      setCameraError(
        caught instanceof Error
          ? `Local pose processing stopped: ${caught.message}`
          : "Local pose processing stopped unexpectedly.",
      );
      setCue("Local pose processing stopped safely. Check the setup before trying again.");
      setAnnouncement("Pose tracking stopped. Camera released.");
    };

    const loop = (timestampMs: number) => {
      animationRef.current = null;
      if (streamRef.current !== stream || !videoRef.current) return;
      try {
        if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          timestampMs - lastInferenceRef.current >= 70
        ) {
          lastInferenceRef.current = timestampMs;
          const result = runtime.landmarker.detectForVideo(video, timestampMs);
          const landmarks = result.landmarks[0] as
            | NormalizedLandmarkLike[]
            | undefined;
          if (landmarks && landmarks.length > 0) {
            if (canvasRef.current) {
              drawPose(
                canvasRef.current,
                video,
                landmarks,
                runtime.connections,
              );
            }
            const runnerStep = runnerRef.current!.process({
              type: "landmarks",
              landmarks,
              timestampMs,
            });
            setRunnerSnapshot(runnerStep.snapshot);
            setAngle(runnerStep.analysis.kneeAngleDeg ?? null);
            setVisibility(runnerStep.analysis.visibility ?? null);
            if (!runnerStep.analysis.valid) {
              coachCueUntilRef.current = 0;
              setCue(runnerStep.analysis.cue);
            } else if (timestampMs >= coachCueUntilRef.current) {
              setCue(runnerStep.update.cue);
            }
            if (runnerStep.update.event?.type === "rep_completed") {
              const completedRep = runnerStep.update.event.record.rep;
              const feedback = completedRepFeedback(
                completedRep,
                CAMERA_TARGET_REPS,
              ) ?? {
                completedRep,
                targetReps: CAMERA_TARGET_REPS,
                earcon: "rep" as const,
                milestone: null,
                voiceCue: null,
              };
              const visualCue =
                feedback.voiceCue ??
                `${completedRep} of ${CAMERA_TARGET_REPS} complete.`;
              coachCueUntilRef.current =
                timestampMs + (feedback.voiceCue ? 2_200 : 1_000);
              setCue(visualCue);
              setAnnouncement(
                `Repetition ${completedRep} of ${CAMERA_TARGET_REPS} complete. ${feedback.voiceCue ?? ""}`.trim(),
              );
              if (runnerStep.targetReached && streamRef.current === stream) {
                const completedSummary = runnerRef.current!.getSummary();
                cancelCoachPlayback();
                stopCamera();
                setMode("idle");
                setCameraStatus("idle");
                setOutcome("camera-completed");
                setSummary(completedSummary);
                setAngle(null);
                setVisibility(null);
                setCue(
                  `Set complete — ${CAMERA_TARGET_REPS} of ${CAMERA_TARGET_REPS} reps recorded. Camera released; no video frame was retained.`,
                );
                setAnnouncement(
                  `Set complete. ${CAMERA_TARGET_REPS} of ${CAMERA_TARGET_REPS} repetitions recorded.`,
                );
                if (voiceEnabledRef.current) {
                  getAudioCoach().playEarcon(feedback.earcon);
                  if (feedback.voiceCue) {
                    scheduleCoachSpeech(feedback.voiceCue, 280);
                  }
                }
                return;
              }
              if (voiceEnabledRef.current) {
                getAudioCoach().playEarcon(feedback.earcon);
                if (feedback.voiceCue) {
                  scheduleCoachSpeech(feedback.voiceCue);
                }
              }
            }
          } else {
            const canvas = canvasRef.current;
            canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
            const runnerStep = runnerRef.current!.process({
              type: "missing_frame",
            });
            setRunnerSnapshot(runnerStep.snapshot);
            setAngle(null);
            setVisibility(null);
            coachCueUntilRef.current = 0;
            setCue(runnerStep.analysis.cue);
          }
        }
        if (streamRef.current === stream) {
          animationRef.current = requestAnimationFrame(loop);
        }
      } catch (caught) {
        failInference(caught);
      }
    };
    animationRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    mountedRef.current = true;
    const synthesis =
      "speechSynthesis" in window ? window.speechSynthesis : null;
    const refreshSpeechSupport = () => {
      const hasSpeechApi =
        !!synthesis && typeof SpeechSynthesisUtterance !== "undefined";
      const voices = synthesis?.getVoices() ?? [];
      const voiceOptions = listEnglishVoices(voices);
      const selectedVoice = selectEnglishVoice(
        voices,
        preferredVoiceURIRef.current,
      );
      const available = hasSpeechApi && selectedVoice !== null;
      if (voices.length > 0) setVoiceListResolved(true);
      setEnglishVoices(voiceOptions);
      setSpeechAvailable(available);
      if (selectedVoice) {
        selectedVoiceURIRef.current = selectedVoice.voiceURI;
        setSelectedVoiceURI(selectedVoice.voiceURI);
      } else {
        setSelectedVoiceURI("");
      }
      return available;
    };
    let mediaDevices: MediaDevices | null = null;
    let cameraApiError: unknown;
    try {
      mediaDevices = getCameraApi();
    } catch (caught) {
      cameraApiError = caught;
    }

    const refreshForLifecycle = () => {
      void refreshCameraDevices({ stopRemovedActive: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshForLifecycle();
    };

    const startupTimer = window.setTimeout(() => {
      try {
        rememberedCameraIdRef.current =
          window.localStorage.getItem("coachpoint.motion.camera-id");
        const storedVoiceEnabled =
          window.localStorage.getItem("coachpoint.motion.voice-enabled") ===
          "true";
        voicePreferenceEnabledRef.current = storedVoiceEnabled;
        voiceEnabledRef.current = storedVoiceEnabled;
        setVoiceEnabled(storedVoiceEnabled);
        preferredVoiceURIRef.current =
          window.localStorage.getItem("coachpoint.motion.voice-uri") ?? "";
        const storedVolume = Number(
          window.localStorage.getItem("coachpoint.motion.voice-volume"),
        );
        const nextVolume =
          Number.isFinite(storedVolume) &&
          storedVolume >= 0.1 &&
          storedVolume <= 0.7
            ? storedVolume
            : VOICE_COACH_DEFAULT_VOLUME;
        voiceVolumeRef.current = nextVolume;
        setVoiceVolume(nextVolume);
      } catch {
        // Use the safe defaults when storage is unavailable.
      }
      refreshSpeechSupport();
      if (cameraApiError) {
        setCameraStatus("unsupported");
        setCameraListStatus("error");
        setCameraError(describeCameraError(cameraApiError));
      } else {
        void refreshCameraDevices({ markLoading: true });
      }
      void ensureRuntime().catch((caught) => {
        if (
          mountedRef.current &&
          !(caught instanceof DOMException && caught.name === "AbortError")
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The local pose model could not be loaded.",
          );
          setCue("Pose tracking could not be prepared. Try starting the set again.");
        }
      });
    }, 0);
    const voiceResolutionTimer = window.setTimeout(() => {
      setVoiceListResolved(true);
    }, 2_500);

    const handleVoicesChanged = () => {
      setVoiceListResolved(true);
      refreshSpeechSupport();
    };

    mediaDevices?.addEventListener?.("devicechange", refreshForLifecycle);
    synthesis?.addEventListener?.("voiceschanged", handleVoicesChanged);
    if (mediaDevices) {
      window.addEventListener("focus", refreshForLifecycle);
      document.addEventListener("visibilitychange", handleVisibility);
    }
    return () => {
      window.clearTimeout(startupTimer);
      window.clearTimeout(voiceResolutionTimer);
      mountedRef.current = false;
      deviceListAttemptRef.current += 1;
      mediaDevices?.removeEventListener?.("devicechange", refreshForLifecycle);
      synthesis?.removeEventListener?.("voiceschanged", handleVoicesChanged);
      if (mediaDevices) {
        window.removeEventListener("focus", refreshForLifecycle);
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      cancelCoachPlayback();
      stopCamera();
      const audioCoach = audioCoachRef.current;
      audioCoachRef.current = null;
      void audioCoach?.close();
      runtimeRef.current?.landmarker.close();
      runtimeRef.current = null;
    };
  }, [
    cancelCoachPlayback,
    ensureRuntime,
    getCameraApi,
    refreshCameraDevices,
    stopCamera,
  ]);

  const cameraBusy = cameraStatus === "starting";
  const recordedReps =
    summary?.completedReps ?? runnerSnapshot.completedRepetitions;
  const cameraResult =
    outcome === "camera-completed"
      ? {
          label: "Set complete",
          value: String(recordedReps),
          suffix: `/ ${CAMERA_TARGET_REPS} reps`,
          detail:
            "Your aggregate result is ready for an agent review. Camera released; no video frame or raw landmarks were retained.",
        }
      : outcome === "camera-stopped"
        ? {
            label: recordedReps > 0 ? "Set ended early" : "Set stopped",
            value: String(recordedReps),
            suffix:
              recordedReps > 0
                ? `/ ${CAMERA_TARGET_REPS} reps`
                : "completed reps",
            detail: cameraError
              ? cameraError
              : recordedReps > 0
                ? "Your partial result is ready for an agent review. Camera released; no video frame was retained."
                : "Camera released. Start again when you are ready; no video frame was retained.",
          }
        : null;
  const displayedReps = cameraResult
    ? recordedReps
    : runnerSnapshot.completedRepetitions;
  const phaseLabel =
    outcome === "camera-completed"
      ? "Complete"
      : outcome === "camera-stopped"
        ? "Stopped"
        : mode === "idle"
          ? "Ready"
          : runnerSnapshot.repPhase.replace("_", " ");
  const progressPercent = Math.min(
    100,
    Math.round((displayedReps / CAMERA_TARGET_REPS) * 100),
  );
  const cameraStatusText =
    cameraStatus === "running"
      ? "Camera live"
      : cameraStatus === "starting"
        ? "Preparing camera"
        : cameraStatus === "unsupported"
          ? "Camera unavailable"
          : cameraStatus === "error"
            ? "Camera needs attention"
            : cameraListStatus === "loading"
              ? "Checking connected cameras"
              : !cameraAccessReady
                ? "Camera permission needed"
                : cameraListStatus === "empty"
                  ? "Default camera available"
                  : cameraListStatus === "ready"
                    ? `${cameraDevices.length} camera${cameraDevices.length === 1 ? "" : "s"} found`
                    : "Camera scan needs attention";
  const modelStatusText =
    runtimeStatus === "ready"
      ? "Pose tracking ready · On-device"
      : runtimeStatus === "loading"
        ? "Preparing pose tracking"
        : runtimeStatus === "error"
          ? "Pose tracking retries on start"
          : "Pose tracking queued";
  const cameraHelperText =
    cameraStatus === "unsupported"
      ? "Camera access requires a current browser on HTTPS or localhost."
      : cameraListStatus === "loading"
      ? "Checking connected cameras automatically…"
      : !cameraAccessReady
        ? "Allow camera access once to reveal every available camera before the set."
      : cameraListStatus === "empty"
        ? "This browser provides a default camera without a selectable device name."
      : cameraDevices.length > 0
        ? "Connected cameras are detected automatically. Names may update after browser permission."
        : "Your browser will request camera access when you start the set.";
  const actionLabel =
    cameraStatus === "starting"
      ? cameraAccessReady
        ? "Cancel start"
        : "Cancel camera setup"
      : mode === "camera"
        ? "End set"
        : !cameraAccessReady
          ? "Allow camera access"
          : cameraListStatus === "empty"
            ? "Start with default camera"
        : outcome === "camera-completed" || outcome === "camera-stopped"
          ? "Start another set"
          : "Start 6-rep set";
  const showMobileStickyAction =
    mode === "camera" || cameraBusy || !!cameraResult;
  const motionToolPhase = cameraBusy
    ? "preparing"
    : mode === "camera"
      ? "running"
      : outcome === "camera-completed"
        ? "completed"
        : outcome === "camera-stopped"
          ? "stopped"
          : cameraStatus === "error" ||
              cameraStatus === "unsupported" ||
              runtimeStatus === "error"
            ? "error"
            : "ready";
  const motionResultProjection = projectMotionLabSetResult({
    phase: motionToolPhase,
    targetReps: CAMERA_TARGET_REPS,
    summary,
  });

  useEffect(() => {
    motionResultProjectionRef.current = motionResultProjection;
  }, [motionResultProjection]);

  useEffect(() => {
    return () => {
      motionResultProjectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const descriptors = createMotionLabToolDescriptors(
      () => motionResultProjectionRef.current,
    );
    void Promise.resolve().then(() => {
      if (active) setMotionToolDescriptors(descriptors);
    });
    return () => {
      active = false;
    };
  }, []);

  const motionWebMcp = useWebMcpTools(motionToolDescriptors);
  const motionWebMcpText =
    motionWebMcp.status === "ready"
      ? "Post-set result tool ready"
      : motionWebMcp.status === "unsupported"
        ? "Manual browser mode"
        : motionWebMcp.status === "error"
          ? "Site tool needs attention"
          : "Checking site tool";

  return (
    <main className="flex-1 bg-bg">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-end justify-between gap-6 px-5 py-7 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Motion lab
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
              Six controlled half-squats
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Pose tracking stays on this device. Your video is never uploaded or saved.
            </p>
          </div>
          <div
            className="flex flex-col gap-2 text-xs font-semibold text-slate-600 sm:flex-row sm:items-center sm:gap-5"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="inline-flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  cameraStatus === "running" ||
                  (cameraStatus === "idle" &&
                    cameraAccessReady &&
                    cameraListStatus === "ready")
                    ? "bg-primary-700"
                    : cameraStatus === "error" || cameraStatus === "unsupported"
                      ? "bg-danger"
                      : cameraListStatus === "loading"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              {cameraStatusText}
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  runtimeStatus === "ready"
                    ? "bg-primary-700"
                    : runtimeStatus === "error"
                      ? "bg-danger"
                      : runtimeStatus === "loading"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              {modelStatusText}
            </span>
            <span
              className="inline-flex items-center gap-2"
              title={
                motionWebMcp.status === "ready"
                  ? "The agent can read one aggregate only after the set ends and you ask for a review. It cannot monitor the camera or movement."
                  : motionWebMcp.error ?? undefined
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  motionWebMcp.status === "ready"
                    ? "bg-primary-700"
                    : motionWebMcp.status === "error"
                      ? "bg-danger"
                      : motionWebMcp.status === "unsupported"
                        ? "bg-slate-400"
                        : "bg-amber-500"
                }`}
                aria-hidden="true"
              />
              {motionWebMcpText}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6 lg:px-8">
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        <section className="rounded-[18px] border border-border bg-white p-5 shadow-[var(--cp-shadow-card)]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,1fr)_240px] lg:items-start">
            <div>
              <label
                className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500"
                htmlFor="motion-camera-select"
              >
                Camera
              </label>
              <select
                id="motion-camera-select"
                value={selectedCameraId ?? ""}
                disabled={mode === "camera" || cameraBusy || cameraListStatus === "loading"}
                onChange={(event) => {
                  deviceListAttemptRef.current += 1;
                  const next = event.target.value || null;
                  selectedCameraIdRef.current = next;
                  rememberedCameraIdRef.current = next;
                  setSelectedCameraId(next);
                  try {
                    if (next) {
                      window.localStorage.setItem(
                        "coachpoint.motion.camera-id",
                        next,
                      );
                    } else {
                      window.localStorage.removeItem(
                        "coachpoint.motion.camera-id",
                      );
                    }
                  } catch {
                    // The current selection still works without storage.
                  }
                  setCameraError(null);
                  setCue("Camera selected. Stand side-on when you start the set.");
                }}
                className="focus-ring mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-ink-900 disabled:bg-slate-100 disabled:text-slate-500"
              >
                {cameraDevices.length === 0 ? (
                  <option value="">
                    {cameraListStatus === "loading"
                      ? "Checking connected cameras…"
                      : cameraAccessReady
                        ? "Default camera"
                        : "Camera names appear after permission"}
                  </option>
                ) : (
                  cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-2 flex items-start justify-between gap-3">
                <p className="text-xs leading-5 text-slate-500">
                  {cameraHelperText}
                </p>
                {cameraListStatus === "error" && cameraStatus !== "unsupported" && (
                  <button
                    type="button"
                    onClick={() =>
                      void refreshCameraDevices({
                        announceFailure: true,
                        markLoading: true,
                      })
                    }
                    disabled={mode === "camera" || cameraBusy}
                    className="focus-ring shrink-0 rounded-md text-xs font-bold text-primary-700 underline-offset-4 hover:underline disabled:text-slate-400 disabled:no-underline"
                  >
                    Retry scan
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    Audio coaching
                  </p>
                  <p
                    id="motion-audio-description"
                    className="mt-1 text-sm font-semibold leading-5 text-ink-900"
                  >
                    A soft chime confirms each rep. English voice plays only at halfway, the last rep, and completion.
                  </p>
                </div>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-900">
                  <input
                    type="checkbox"
                    aria-label="Audio coaching"
                    aria-describedby="motion-audio-description"
                    checked={voiceEnabled}
                    onChange={toggleAudioCoaching}
                    className="focus-ring h-5 w-5 accent-[var(--cp-primary-700)]"
                  />
                  {voiceEnabled ? "On" : "Off"}
                </label>
              </div>
              {speechAvailable ? (
                <>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <label className="block text-xs text-slate-500">
                      Coach voice
                      <select
                        value={selectedVoiceURI}
                        disabled={!voiceEnabled || mode === "camera"}
                        onChange={(event) => {
                          const next = event.target.value;
                          preferredVoiceURIRef.current = next;
                          selectedVoiceURIRef.current = next;
                          setSelectedVoiceURI(next);
                          cancelCoachPlayback();
                          try {
                            window.localStorage.setItem(
                              "coachpoint.motion.voice-uri",
                              next,
                            );
                          } catch {
                            // The current voice still works without storage.
                          }
                        }}
                        className="focus-ring mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-ink-900 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {englishVoices.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!voiceEnabled || mode === "camera"}
                      onClick={() => {
                        cancelCoachPlayback();
                        const generation = audioGenerationRef.current;
                        const coach = getAudioCoach();
                        void coach.arm().then((armed) => {
                          if (
                            !armed ||
                            !mountedRef.current ||
                            !voiceEnabledRef.current ||
                            audioGenerationRef.current !== generation
                          ) {
                            return;
                          }
                          coach.playEarcon("rep");
                          scheduleCoachSpeech(
                            "Halfway. Keep it smooth.",
                            150,
                          );
                        });
                      }}
                      className="focus-ring h-10 rounded-lg border border-primary-700 px-3 text-xs font-bold text-primary-700 hover:bg-primary-100 disabled:border-slate-300 disabled:text-slate-400"
                    >
                      Preview
                    </button>
                  </div>
                  <label className="mt-3 block text-xs text-slate-500">
                    <span className="flex items-center justify-between">
                      Voice volume
                      <output className="font-mono font-bold text-slate-700">
                        {Math.round(voiceVolume * 100)}%
                      </output>
                    </span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.7"
                      step="0.05"
                      value={voiceVolume}
                      disabled={!voiceEnabled}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        voiceVolumeRef.current = next;
                        setVoiceVolume(next);
                        try {
                          window.localStorage.setItem(
                            "coachpoint.motion.voice-volume",
                            String(next),
                          );
                        } catch {
                          // The current page volume still works without storage.
                        }
                      }}
                      className="focus-ring mt-2 h-2 w-full accent-[var(--cp-primary-700)] disabled:opacity-40"
                    />
                  </label>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Rep chimes are available. {voiceListResolved
                    ? "No compatible English voice is available in this browser."
                    : "Natural English voices are still loading…"}
                </p>
              )}
            </div>

            <div
              className={`border-t border-border pt-5 lg:block lg:self-end lg:border-0 lg:pt-0 ${
                showMobileStickyAction ? "hidden" : "block"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  mode === "camera" || cameraBusy
                    ? stopLab()
                    : void startCamera()
                }
                disabled={cameraStatus === "unsupported"}
                className={`focus-ring min-h-12 w-full rounded-xl px-5 text-sm font-extrabold transition-colors disabled:bg-slate-300 disabled:text-slate-600 ${
                  mode === "camera" || cameraBusy
                    ? "border border-danger bg-white text-danger hover:bg-[#FBEEEA]"
                    : "bg-ink-900 text-white hover:bg-primary-800"
                }`}
              >
                {actionLabel}
              </button>
              <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                {mode === "camera"
                  ? "Ending releases the camera immediately."
                  : !cameraAccessReady
                    ? "The one-time permission check opens briefly, then releases the camera."
                    : "One set · 6 reps · camera turns off automatically"}
              </p>
            </div>
          </div>
        </section>

        {(cameraError || error) && (
          <section
            role="alert"
            className="mt-4 rounded-xl border border-[#E9C98F] bg-[#FFF7E8] px-4 py-3 text-sm text-[#765000]"
          >
            <strong>Setup needs attention.</strong>{" "}
            {cameraError ?? error}
          </section>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="self-start overflow-hidden rounded-[18px] border border-[#173A64] bg-ink-900 shadow-[var(--cp-shadow-card)]">
            <div className="relative aspect-[4/3] bg-[#0E2848]">
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Live camera preview"
                className={`h-full w-full object-contain ${mode === "camera" ? "block" : "hidden"}`}
              />
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${mode === "camera" ? "block" : "hidden"}`}
              />

              {mode === "camera" ? (
                <>
                  <div className="absolute left-4 top-4 rounded-full bg-[#081B31]/85 px-3 py-1.5 text-xs font-bold text-white">
                    {visibility !== null && visibility >= 0.6
                      ? "Tracking ready"
                      : "Move fully into frame"}
                  </div>
                  <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-[#081B31]/85 px-3 py-1.5 text-sm font-bold text-white">
                    <span className="font-mono tabular-nums">
                      {displayedReps} / {CAMERA_TARGET_REPS}
                    </span>
                    {voiceEnabled && (
                      <span className="border-l border-white/25 pl-2 text-xs text-white/75">
                        Audio on
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-[#081B31]/92 px-5 py-4 text-white">
                    <p className="text-base font-bold sm:text-lg">{cue}</p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-8 py-8 text-center text-white">
                  {cameraResult ? (
                    <>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-100">
                        {cameraResult.label}
                      </p>
                      <p className="mt-3 font-mono text-5xl font-bold tabular-nums">
                        {cameraResult.value}{" "}
                        <span className="text-lg text-white/65">
                          {cameraResult.suffix}
                        </span>
                      </p>
                      <p className="mt-5 max-w-lg text-sm leading-6 text-white/70">
                        {cameraResult.detail}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-100">
                        Set target
                      </p>
                      <p className="mt-3 font-mono text-6xl font-bold tabular-nums">
                        {CAMERA_TARGET_REPS}
                        <span className="ml-2 text-lg text-white/65">reps</span>
                      </p>
                      <p className="mt-5 max-w-md text-sm leading-6 text-white/70">
                        Camera preview begins with the set. Stand side-on and keep your hip, knee, and ankle visible.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {showMobileStickyAction && (
            <div
              className="sticky z-20 rounded-[16px] border border-border bg-white p-2 shadow-[0_10px_30px_rgba(20,53,95,0.18)] lg:hidden"
              style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <button
                type="button"
                onClick={() =>
                  mode === "camera" || cameraBusy
                    ? stopLab()
                    : void startCamera()
                }
                disabled={cameraStatus === "unsupported"}
                className={`focus-ring min-h-12 w-full rounded-xl px-5 text-sm font-extrabold ${
                  mode === "camera" || cameraBusy
                    ? "border border-danger bg-white text-danger"
                    : "bg-ink-900 text-white"
                }`}
              >
                {actionLabel}
              </button>
            </div>
          )}

          <aside className="space-y-4">
            <section className="rounded-[18px] border border-border bg-white p-5 shadow-[var(--cp-shadow-card)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
                    Set progress
                  </p>
                  <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-ink-900">
                    {displayedReps}
                    <span className="ml-1 text-base text-slate-500">
                      / {CAMERA_TARGET_REPS}
                    </span>
                  </p>
                </div>
                <p className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold capitalize text-primary-700">
                  {phaseLabel}
                </p>
              </div>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Set completion"
                aria-valuemin={0}
                aria-valuemax={CAMERA_TARGET_REPS}
                aria-valuenow={displayedReps}
                aria-valuetext={`${displayedReps} of ${CAMERA_TARGET_REPS} repetitions complete`}
              >
                <div
                  className="h-full rounded-full bg-coral-500 transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Knee angle
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-bold text-ink-900">
                    {angle === null ? "—" : `${Math.round(angle)}°`}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Tracking
                  </dt>
                  <dd className="mt-2 text-sm font-bold text-ink-900">
                    {mode !== "camera"
                      ? "Off"
                      : visibility !== null && visibility >= 0.6
                        ? "Ready"
                        : "Needs framing"}
                  </dd>
                </div>
              </dl>

              {summary && (
                <div className="mt-5 border-t border-border pt-5">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    Set summary
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Detected rep window</dt>
                      <dd className="mt-1 font-mono font-bold text-ink-900">
                        {summary.detectedRepetitionWindowSeconds}s
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Average range</dt>
                      <dd className="mt-1 font-mono font-bold text-ink-900">
                        {summary.averageRangeDeg}°
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Movement notes</dt>
                      <dd className="mt-1 font-bold text-ink-900">
                        {summary.qualityFlags.length > 0
                          ? summary.qualityFlags
                              .map((flag) =>
                                flag === "limited_depth"
                                  ? "Demo depth threshold not reached"
                                  : flag === "range_decline"
                                    ? "Detected range decreased across the set"
                                    : flag.replaceAll("_", " "),
                              )
                              .join(" · ")
                          : "None"}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>

            {motionResultProjection.result && (
              <section className="rounded-[18px] border border-primary-200 bg-primary-100/45 p-5 shadow-[var(--cp-shadow-card)]">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
                  Agent review ready
                </p>
                <h2 className="mt-2 text-lg font-extrabold text-ink-900">
                  Ask how this set went
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The agent did not watch your camera. After you ask, it can read one aggregate snapshot of this set through WebMCP and explain the observations.
                </p>
                <div className="mt-4 rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-ink-900">
                  “{AGENT_REVIEW_PROMPT}”
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(AGENT_REVIEW_PROMPT);
                      setReviewPromptCopied(true);
                      setAnnouncement("Agent review prompt copied.");
                    } catch {
                      setReviewPromptCopied(false);
                      setAnnouncement("Copy failed. Select the prompt text instead.");
                    }
                  }}
                  className="focus-ring mt-3 min-h-11 rounded-xl border border-primary-700 bg-white px-4 text-sm font-extrabold text-primary-700 hover:bg-primary-100"
                >
                  {reviewPromptCopied ? "Prompt copied" : "Copy review prompt"}
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  This 2D camera result is an observation, not a clinical assessment. The agent cannot change your exercise or dosage.
                </p>
              </section>
            )}

            <section className="rounded-[18px] border border-border bg-white p-5 shadow-[var(--cp-shadow-card)]">
              <h2 className="font-extrabold text-ink-900">Position yourself</h2>
              <ol className="mt-3 space-y-3 text-sm leading-5 text-slate-600">
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-primary-700">1</span>
                  Use a side or slight oblique view.
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-primary-700">2</span>
                  Keep your full hip, knee, and ankle in frame.
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-primary-700">3</span>
                  Keep stable support within reach and use only an approved range.
                </li>
              </ol>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-slate-500">
                On-device processing only. Camera and raw landmark data are released when the set ends.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
