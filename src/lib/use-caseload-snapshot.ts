"use client";

import { useEffect, useState } from "react";
import type { TherapistCaseloadStore } from "../domain/caseload.ts";
import { CASELOAD_STORAGE_KEY, readCaseload } from "./caseloadStorage.ts";

/**
 * Hydration/migration belongs to the human page lifecycle. Read-only tools use
 * this same committed UI snapshot and never seed or rewrite browser storage.
 */
export function useCaseloadSnapshot(): TherapistCaseloadStore | null {
  const [snapshot, setSnapshot] = useState<TherapistCaseloadStore | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next = readCaseload();
      setSnapshot((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CASELOAD_STORAGE_KEY || event.key === null) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return snapshot;
}
