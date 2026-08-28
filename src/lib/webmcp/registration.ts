import type {
  WebMcpModelContext,
  WebMcpToolDescriptor,
} from "./types.ts";

export interface WebMcpRegistration {
  readonly signal: AbortSignal;
  readonly ready: Promise<readonly string[]>;
  abort: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Feature-detects the standard top-level `document.modelContext` API. */
export function resolveDocumentModelContext(
  documentLike: unknown,
): WebMcpModelContext | null {
  if (!isRecord(documentLike)) {
    return null;
  }

  let modelContext: unknown;
  try {
    modelContext = documentLike.modelContext;
  } catch {
    return null;
  }

  if (!isRecord(modelContext) || typeof modelContext.registerTool !== "function") {
    return null;
  }

  return modelContext as unknown as WebMcpModelContext;
}

async function registerDescriptors(
  modelContext: WebMcpModelContext,
  descriptors: readonly WebMcpToolDescriptor[],
  controller: AbortController,
): Promise<readonly string[]> {
  try {
    for (const descriptor of descriptors) {
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      await modelContext.registerTool(descriptor, {
        signal: controller.signal,
      });
    }

    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    return descriptors.map((descriptor) => descriptor.name);
  } catch (error) {
    controller.abort();
    throw error;
  }
}

/**
 * Starts an awaited registration sequence owned by exactly one controller.
 * Calling `abort()` is the complete route-unmount/remount cleanup operation.
 */
export function startWebMcpRegistration(
  modelContext: WebMcpModelContext,
  descriptors: readonly WebMcpToolDescriptor[],
): WebMcpRegistration {
  const controller = new AbortController();
  const ready = registerDescriptors(modelContext, descriptors, controller);

  return {
    signal: controller.signal,
    ready,
    abort: () => controller.abort(),
  };
}
