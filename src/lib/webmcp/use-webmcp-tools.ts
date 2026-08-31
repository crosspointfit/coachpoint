"use client";

import { useEffect, useState } from "react";

import {
  resolveDocumentModelContext,
  startWebMcpRegistration,
  type WebMcpRegistration,
} from "./registration.ts";
import type { WebMcpToolDescriptor } from "./types.ts";

export type WebMcpRegistrationStatus =
  | "checking"
  | "unsupported"
  | "registering"
  | "ready"
  | "error";

export interface WebMcpRegistrationState {
  status: WebMcpRegistrationStatus;
  error: string | null;
  toolNames: readonly string[];
}

const INITIAL_STATE: WebMcpRegistrationState = {
  status: "checking",
  error: null,
  toolNames: [],
};

interface OwnedRegistrationState {
  descriptors: readonly WebMcpToolDescriptor[] | null;
  signal: AbortSignal | null;
  value: WebMcpRegistrationState;
}

/**
 * Registers route-scoped tools against `document.modelContext` and aborts the
 * shared registration owner on React remount or route unmount.
 *
 * Callers should memoize `descriptors`; a changed array intentionally replaces
 * the complete registration set.
 */
export function useWebMcpTools(
  descriptors: readonly WebMcpToolDescriptor[],
): WebMcpRegistrationState {
  const [state, setState] = useState<OwnedRegistrationState>({
    descriptors: null,
    signal: null,
    value: INITIAL_STATE,
  });

  useEffect(() => {
    let active = true;
    let registration: WebMcpRegistration | null = null;

    void Promise.resolve().then(async () => {
      if (!active || descriptors.length === 0) {
        return;
      }

      const modelContext =
        typeof document === "undefined"
          ? null
          : resolveDocumentModelContext(document);

      if (!modelContext) {
        setState({
          descriptors,
          signal: null,
          value: { status: "unsupported", error: null, toolNames: [] },
        });
        return;
      }

      registration = startWebMcpRegistration(modelContext, descriptors);
      setState({
        descriptors,
        signal: registration.signal,
        value: { status: "registering", error: null, toolNames: [] },
      });

      try {
        const toolNames = await registration.ready;
        if (active) {
          setState({
            descriptors,
            signal: registration.signal,
            value: { status: "ready", error: null, toolNames },
          });
        }
      } catch {
        if (active) {
          setState({
            descriptors,
            signal: registration.signal,
            value: {
              status: "error",
              error: "WebMCP tool registration failed.",
              toolNames: [],
            },
          });
        }
      }
    });

    return () => {
      active = false;
      registration?.abort();
    };
  }, [descriptors]);

  // Hide the old route's ready state during the render before its effect is
  // replaced. Empty/pre-hydration tool sets never advertise agent readiness.
  if (
    descriptors.length === 0 ||
    state.descriptors !== descriptors ||
    (state.value.status !== "error" && state.signal?.aborted)
  ) {
    return INITIAL_STATE;
  }

  return state.value;
}
