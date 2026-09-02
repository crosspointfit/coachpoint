"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  createHalfSquatCameraSetController,
  createInitialHalfSquatCameraSetState,
  type HalfSquatCameraSetController,
  type HalfSquatCameraSetControllerDependencies,
  type HalfSquatCameraSetState,
  type HalfSquatCameraSetTerminalResult,
} from "./half-squat-camera-set-controller";
import type { MotionTargetSource } from "../../motion/set-aggregate";

export interface UseHalfSquatCameraSetOptions {
  readonly targetRepetitions: number;
  readonly selectedCameraId: string | null;
  readonly onTerminal: (result: HalfSquatCameraSetTerminalResult) => void;
  readonly onRepCompleted?: (
    completedRepetition: number,
    targetRepetitions: number,
  ) => void;
  readonly targetSource?: MotionTargetSource;
  readonly exerciseId?: string;
  readonly exerciseName?: string;
  readonly releaseAudio?: () => void | Promise<void>;
  readonly dependencies?: HalfSquatCameraSetControllerDependencies;
}

export interface UseHalfSquatCameraSetResult {
  readonly state: HalfSquatCameraSetState;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly prepare: () => Promise<boolean>;
  readonly start: (
    selectedCameraIdOverride?: string | null,
  ) => Promise<boolean>;
  readonly stop: () => void;
  readonly getState: () => HalfSquatCameraSetState;
}

/**
 * React adapter for the reusable camera-set owner. Mounting this hook allocates
 * no model and requests no camera permission; prepare/start remain explicit
 * human-triggered actions.
 */
export function useHalfSquatCameraSet(
  options: UseHalfSquatCameraSetOptions,
): UseHalfSquatCameraSetResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef(options);
  const controllerRef = useRef<HalfSquatCameraSetController | null>(null);
  const [state, setState] = useState<HalfSquatCameraSetState>(() =>
    createInitialHalfSquatCameraSetState(),
  );
  const stateRef = useRef(state);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const controller = createHalfSquatCameraSetController(
      {
        readTarget: () => ({
          targetRepetitions: optionsRef.current.targetRepetitions,
          source: optionsRef.current.targetSource ?? "isolated_demo",
          exerciseId: optionsRef.current.exerciseId,
          exerciseName: optionsRef.current.exerciseName,
        }),
        readSelectedCameraId: () => optionsRef.current.selectedCameraId,
        getVideoElement: () => videoRef.current,
        getCanvasElement: () => canvasRef.current,
        onStateChange: (nextState) => {
          stateRef.current = nextState;
          setState(nextState);
        },
        onTerminal: (result) => optionsRef.current.onTerminal(result),
        onRepCompleted: (completedRepetition, targetRepetitions) =>
          optionsRef.current.onRepCompleted?.(
            completedRepetition,
            targetRepetitions,
          ),
        releaseAudio: () => optionsRef.current.releaseAudio?.(),
      },
      optionsRef.current.dependencies,
    );
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, []);

  const prepare = useCallback(
    () => controllerRef.current?.prepare() ?? Promise.resolve(false),
    [],
  );
  const start = useCallback((selectedCameraIdOverride?: string | null) => {
    if (selectedCameraIdOverride !== undefined) {
      optionsRef.current = {
        ...optionsRef.current,
        selectedCameraId: selectedCameraIdOverride,
      };
    }
    return controllerRef.current?.start() ?? Promise.resolve(false);
  }, []);
  const stop = useCallback(() => controllerRef.current?.stop(), []);
  const getState = useCallback(
    () => controllerRef.current?.getState() ?? stateRef.current,
    [],
  );

  return { state, videoRef, canvasRef, prepare, start, stop, getState };
}
