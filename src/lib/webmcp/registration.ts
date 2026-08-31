import { createToolExecutor } from "./execution.ts";
import type {
  WebMcpModelContext,
  WebMcpToolDescriptor,
} from "./types.ts";

export interface WebMcpRegistration {
  readonly signal: AbortSignal;
  readonly ready: Promise<readonly string[]>;
  abort: () => void;
}

// Each document exposes exactly one CoachPoint leaf-route tool set. A new
// owner also retires the previous one if React transitions overlap briefly.
const owners = new WeakMap<WebMcpModelContext, AbortController>();

/** Settle promptly on abort, even if a host or handler ignores its signal. */
function abortable<T>(
  operation: () => T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    try {
      Promise.resolve(operation()).then(
        (result) => {
          cleanup();
          if (signal.aborted) {
            reject(signal.reason);
          } else {
            resolve(result);
          }
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function ownDescriptor(
  descriptor: WebMcpToolDescriptor,
  ownerSignal: AbortSignal,
): WebMcpToolDescriptor {
  const execute = createToolExecutor((input, { signal }) =>
    abortable(() => descriptor.execute(input, { signal }), signal),
  );

  return {
    ...descriptor,
    execute: (input, context = {}) =>
      execute(input, {
        signal: context.signal
          ? AbortSignal.any([ownerSignal, context.signal])
          : ownerSignal,
      }),
  };
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
    const names = descriptors.map((descriptor) => descriptor.name);
    if (new Set(names).size !== names.length) {
      throw new Error("A route cannot register duplicate WebMCP tool names.");
    }

    for (const descriptor of descriptors) {
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      await abortable(
        () =>
          modelContext.registerTool(
            ownDescriptor(descriptor, controller.signal),
            { signal: controller.signal },
          ),
        controller.signal,
      );
    }

    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    return names;
  } catch (error) {
    controller.abort();
    throw error;
  }
}

/**
 * Starts an awaited registration sequence owned by exactly one controller.
 * Calling `abort()` removes the route tools and cancels their executions.
 * Handlers must honor their signal before committing any asynchronous write.
 */
export function startWebMcpRegistration(
  modelContext: WebMcpModelContext,
  descriptors: readonly WebMcpToolDescriptor[],
): WebMcpRegistration {
  owners.get(modelContext)?.abort();
  const controller = new AbortController();
  owners.set(modelContext, controller);
  controller.signal.addEventListener(
    "abort",
    () => {
      if (owners.get(modelContext) === controller) {
        owners.delete(modelContext);
      }
    },
    { once: true },
  );
  const ready = registerDescriptors(modelContext, descriptors, controller);

  return {
    signal: controller.signal,
    ready,
    abort: () => controller.abort(),
  };
}
