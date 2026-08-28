import type {
  JsonObject,
  JsonValue,
  ToolError,
  ToolHandler,
  ToolResult,
  WebMcpExecuteContext,
} from "./types.ts";

const INTERNAL_ERROR: ToolError = {
  code: "internal_error",
  message: "The tool could not complete the request.",
  recoverable: false,
};

const CANCELLED_ERROR: ToolError = {
  code: "cancelled",
  message: "Tool execution was cancelled.",
  recoverable: true,
};

/** A safe, intentional validation failure that may be returned to the agent. */
export class RecoverableToolError extends Error {
  readonly errors: ToolError[];

  constructor(errors: readonly ToolError[]) {
    super("The tool input could not be validated.");
    this.name = "RecoverableToolError";
    this.errors = errors.map(normalizeToolError);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToolError(error: ToolError): ToolError {
  const normalized: ToolError = {
    code: error.code,
    message: error.message,
    recoverable: error.recoverable,
  };

  if (error.field) {
    normalized.field = error.field;
  }

  return normalized;
}

function isToolError(value: unknown): value is ToolError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.recoverable === "boolean" &&
    (value.field === undefined || typeof value.field === "string")
  );
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) {
    return true;
  }

  return isRecord(error) && error.name === "AbortError";
}

function toJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    throw new TypeError("Tool results must be JSON-serializable.");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Tool results must not contain circular references.");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => toJsonValue(item, ancestors));
    }

    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }
      result[key] = toJsonValue(item, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeHandlerResult(result: unknown): ToolResult {
  if (isRecord(result) && result.ok === false && Array.isArray(result.errors)) {
    if (!result.errors.every(isToolError)) {
      return { ok: false, errors: [{ ...INTERNAL_ERROR }] };
    }

    return {
      ok: false,
      errors: result.errors.map(normalizeToolError),
    };
  }

  if (isRecord(result) && result.ok === true && "value" in result) {
    return { ok: true, value: toJsonValue(result.value) };
  }

  return { ok: true, value: toJsonValue(result) };
}

function neverAbortedSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * Adds the common cancellation, JSON-output, and sanitized-error boundary used
 * by every WebMCP tool. Domain validation failures remain recoverable objects;
 * unexpected exceptions never expose stack traces or exception messages.
 */
export function createToolExecutor<TInput>(
  handler: ToolHandler<TInput>,
): (
  input: unknown,
  context?: WebMcpExecuteContext,
) => Promise<ToolResult> {
  return async (input, context = {}) => {
    const signal = context.signal ?? neverAbortedSignal();

    if (signal.aborted) {
      return { ok: false, errors: [{ ...CANCELLED_ERROR }] };
    }

    try {
      const result = await handler(input as TInput, { signal });

      if (signal.aborted) {
        return { ok: false, errors: [{ ...CANCELLED_ERROR }] };
      }

      return normalizeHandlerResult(result);
    } catch (error) {
      if (isAbortError(error, signal)) {
        return { ok: false, errors: [{ ...CANCELLED_ERROR }] };
      }

      if (error instanceof RecoverableToolError) {
        return {
          ok: false,
          errors: error.errors.map(normalizeToolError),
        };
      }

      return { ok: false, errors: [{ ...INTERNAL_ERROR }] };
    }
  };
}
