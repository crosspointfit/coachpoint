import type { PoseLandmarker } from "@mediapipe/tasks-vision";

export interface PoseConnection {
  start: number;
  end: number;
}

export interface PoseRuntime {
  landmarker: PoseLandmarker;
  delegate: "GPU" | "CPU";
  connections: readonly PoseConnection[];
}

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_PATH = "/models/pose_landmarker_lite.task";

async function createWithDelegate(
  delegate: "GPU" | "CPU",
): Promise<PoseRuntime> {
  const { FilesetResolver, PoseLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputSegmentationMasks: false,
  });
  return {
    landmarker,
    delegate,
    connections: PoseLandmarker.POSE_CONNECTIONS.map((connection) => ({
      start: connection.start,
      end: connection.end,
    })),
  };
}

export async function createPoseRuntime(): Promise<PoseRuntime> {
  try {
    return await createWithDelegate("GPU");
  } catch {
    return createWithDelegate("CPU");
  }
}

