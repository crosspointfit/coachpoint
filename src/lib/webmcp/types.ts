import type { JsonSchemaForInference } from "@mcp-b/webmcp-types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ToolError {
  code: string;
  message: string;
  field?: string;
  recoverable: boolean;
}

export type ToolResult<T extends JsonValue = JsonValue> =
  | { ok: true; value: T }
  | { ok: false; errors: ToolError[] };

export interface WebMcpExecuteContext {
  signal?: AbortSignal;
}

export interface WebMcpToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchemaForInference;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: unknown,
    context?: WebMcpExecuteContext,
  ) => Promise<ToolResult>;
}

export interface WebMcpRegistrationOptions {
  signal?: AbortSignal;
}

/**
 * The deliberately small part of `document.modelContext` used by CoachPoint.
 * Keeping this boundary structural makes lifecycle behavior testable in Node.
 */
export interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpToolDescriptor,
    options?: WebMcpRegistrationOptions,
  ) => Promise<void>;
}

export interface ToolHandlerContext {
  signal: AbortSignal;
}

export type ToolHandler<TInput> = (
  input: TInput,
  context: ToolHandlerContext,
) => unknown | Promise<unknown>;
