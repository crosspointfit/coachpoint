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
  const [state, setState] = useState<WebMcpRegistrationState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let registration: WebMcpRegistration | null = null;

    void Promise.resolve().then(async () => {
      if (!active) {
        return;
      }

      const modelContext =
        typeof document === "undefined"
          ? null
          : resolveDocumentModelContext(document);

      if (!modelContext) {
        setState({ status: "unsupported", error: null, toolNames: [] });
        return;
      }

      setState({ status: "registering", error: null, toolNames: [] });
      registration = startWebMcpRegistration(modelContext, descriptors);

      try {
        const toolNames = await registration.ready;
        if (active) {
          setState({ status: "ready", error: null, toolNames });
        }
      } catch {
        if (active) {
          setState({
            status: "error",
            error: "WebMCP tool registration failed.",
            toolNames: [],
          });
        }
      }
    });

    return () => {
      active = false;
      registration?.abort();
    };
  }, [descriptors]);

  return state;
}
