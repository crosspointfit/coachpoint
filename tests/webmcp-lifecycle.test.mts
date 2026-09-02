import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { createToolExecutor } from "../src/lib/webmcp/execution.ts";
import { startWebMcpRegistration } from "../src/lib/webmcp/registration.ts";
import {
  useWebMcpTools,
  type WebMcpRegistrationState,
} from "../src/lib/webmcp/use-webmcp-tools.ts";
import type {
  ToolHandler,
  ToolResult,
  WebMcpModelContext,
  WebMcpRegistrationOptions,
  WebMcpToolDescriptor,
} from "../src/lib/webmcp/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function descriptor(
  name: string,
  handler: ToolHandler<unknown> = () => ({ name }),
): WebMcpToolDescriptor {
  return {
    name,
    description: `Lifecycle test for ${name}.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: createToolExecutor(handler),
  };
}

interface ActiveRegistration {
  tool: WebMcpToolDescriptor;
  signal?: AbortSignal;
}

class StrictModelContext implements WebMcpModelContext {
  readonly calls: ActiveRegistration[] = [];
  readonly active = new Map<string, ActiveRegistration>();
  readonly beforeReady?: (callIndex: number) => void | Promise<void>;

  constructor(beforeReady?: (callIndex: number) => void | Promise<void>) {
    this.beforeReady = beforeReady;
  }

  async registerTool(
    tool: WebMcpToolDescriptor,
    options: WebMcpRegistrationOptions = {},
  ): Promise<void> {
    options.signal?.throwIfAborted();
    if (this.active.has(tool.name)) {
      throw new Error(`Duplicate active registration: ${tool.name}`);
    }
    const entry = { tool, signal: options.signal };
    const callIndex = this.calls.push(entry) - 1;
    this.active.set(tool.name, entry);
    options.signal?.addEventListener(
      "abort",
      () => {
        if (this.active.get(tool.name) === entry) {
          this.active.delete(tool.name);
        }
      },
      { once: true },
    );
    await this.beforeReady?.(callIndex);
    options.signal?.throwIfAborted();
  }

  getTool(name: string): WebMcpToolDescriptor {
    const entry = this.active.get(name);
    assert.ok(entry, `Expected ${name} to be active.`);
    return entry.tool;
  }
}

function assertCancelled(result: ToolResult): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]?.code, "cancelled");
    assert.equal(result.errors[0]?.recoverable, true);
  }
}

test("a retained route descriptor cannot execute after owner abort", async () => {
  const host = new StrictModelContext();
  let handlerCalls = 0;
  const registration = startWebMcpRegistration(host, [
    descriptor("draft_program", () => {
      handlerCalls += 1;
      return { saved: true };
    }),
  ]);
  await registration.ready;
  const retained = host.getTool("draft_program");

  registration.abort();

  assert.equal(host.active.size, 0);
  assertCancelled(await retained.execute({}));
  assert.equal(handlerCalls, 0);
});

test("an already-cancelled invocation never reaches a live route handler", async () => {
  const host = new StrictModelContext();
  let handlerCalls = 0;
  const registration = startWebMcpRegistration(host, [
    descriptor("list_clients", () => {
      handlerCalls += 1;
      return {};
    }),
  ]);
  await registration.ready;
  const invocation = new AbortController();
  invocation.abort();

  assertCancelled(
    await host.getTool("list_clients").execute({}, { signal: invocation.signal }),
  );
  assert.equal(handlerCalls, 0);
  assert.equal(registration.signal.aborted, false);
  registration.abort();
});

test("route cancellation reaches in-flight handlers before their write", { timeout: 2000 }, async () => {
  const host = new StrictModelContext();
  const work = deferred<void>();
  const entered = deferred<AbortSignal>();
  let writes = 0;
  const registration = startWebMcpRegistration(host, [
    descriptor("draft_program", async (_input, { signal }) => {
      entered.resolve(signal);
      await work.promise;
      signal.throwIfAborted();
      writes += 1;
      return { saved: true };
    }),
  ]);
  await registration.ready;
  const invocation = new AbortController();
  const result = host.getTool("draft_program").execute(
    {},
    { signal: invocation.signal },
  );
  const receivedSignal = await entered.promise;

  registration.abort();

  assert.equal(receivedSignal.aborted, true);
  assert.equal(invocation.signal.aborted, false);
  assertCancelled(await result);
  work.resolve(undefined);
  await work.promise;
  assert.equal(writes, 0);
});

test("invocation cancellation does not retire the route or the next invocation", { timeout: 2000 }, async () => {
  const host = new StrictModelContext();
  const entered = deferred<AbortSignal>();
  let first = true;
  const registration = startWebMcpRegistration(host, [
    descriptor("get_client_summary", async (_input, { signal }) => {
      if (first) {
        first = false;
        entered.resolve(signal);
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      return { clientId: "demo-shoulder" };
    }),
  ]);
  await registration.ready;
  const tool = host.getTool("get_client_summary");
  const invocation = new AbortController();
  const result = tool.execute({}, { signal: invocation.signal });
  const receivedSignal = await entered.promise;

  invocation.abort();

  assert.equal(receivedSignal.aborted, true);
  assertCancelled(await result);
  assert.equal(registration.signal.aborted, false);
  assert.equal(host.active.size, 1);
  assert.deepEqual(await tool.execute({}), {
    ok: true,
    value: { clientId: "demo-shoulder" },
  });
  registration.abort();
});

test("owner abort settles promptly when an in-flight handler ignores cancellation", { timeout: 2000 }, async () => {
  const host = new StrictModelContext();
  const entered = deferred<void>();
  const delayed = deferred<void>();
  const registration = startWebMcpRegistration(host, [
    descriptor("list_clients", async () => {
      entered.resolve(undefined);
      await delayed.promise;
      return { clients: [] };
    }),
  ]);
  await registration.ready;
  const result = host.getTool("list_clients").execute({});
  await entered.promise;

  registration.abort();

  assertCancelled(await result);
  // A late rejection must stay handled after the caller has received cancel.
  delayed.reject(new Error("Late handler failure"));
});

test("pending registration abort rejects ready without waiting for the host", { timeout: 2000 }, async () => {
  const pending = deferred<void>();
  const host = new StrictModelContext(() => pending.promise);
  const registration = startWebMcpRegistration(host, [
    descriptor("list_clients"),
    descriptor("must_not_register"),
  ]);
  const rejected = assert.rejects(registration.ready, { name: "AbortError" });

  registration.abort();

  await rejected;
  assert.equal(host.active.size, 0);
  assert.equal(host.calls.length, 1);
  pending.resolve(undefined);
  await pending.promise;
  assert.equal(host.calls.length, 1);
  assert.equal(host.active.size, 0);
});

test("registration failure aborts every partially registered route tool", async () => {
  const host = new StrictModelContext((callIndex) => {
    if (callIndex === 1) throw new Error("Host refused registration");
  });
  const registration = startWebMcpRegistration(host, [
    descriptor("search_exercises"),
    descriptor("get_exercise_details"),
    descriptor("draft_program"),
  ]);

  await assert.rejects(registration.ready, /Host refused registration/);

  assert.equal(registration.signal.aborted, true);
  assert.equal(host.calls.length, 2);
  assert.equal(host.active.size, 0);
});

test("duplicate names fail before exposing any part of a route set", async () => {
  const host = new StrictModelContext();
  const registration = startWebMcpRegistration(host, [
    descriptor("list_clients"),
    descriptor("list_clients"),
  ]);

  await assert.rejects(registration.ready, /duplicate WebMCP tool names/);

  assert.equal(registration.signal.aborted, true);
  assert.equal(host.calls.length, 0);
  assert.equal(host.active.size, 0);
});

test("rapid remount replaces an awaiting owner without duplicate tools", { timeout: 2000 }, async () => {
  const pending = deferred<void>();
  const host = new StrictModelContext((callIndex) =>
    callIndex === 0 ? pending.promise : undefined,
  );
  const first = startWebMcpRegistration(host, [descriptor("get_client_summary")]);
  const firstRejected = assert.rejects(first.ready, { name: "AbortError" });
  const retained = host.getTool("get_client_summary");

  const second = startWebMcpRegistration(host, [descriptor("get_client_summary")]);
  await second.ready;
  await firstRejected;

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.equal(host.active.size, 1);
  assert.equal(host.active.get("get_client_summary")?.signal, second.signal);
  assertCancelled(await retained.execute({}));

  // A late failure/cleanup belonging to the old owner cannot remove the new one.
  pending.reject(new Error("Late registration rejection"));
  first.abort();
  await Promise.resolve();
  assert.equal(host.active.get("get_client_summary")?.signal, second.signal);
  second.abort();
  assert.equal(host.active.size, 0);
});

test("route transitions and repeated back/forward keep one exact tool set", async () => {
  const host = new StrictModelContext();
  const dashboard = ["list_clients"];
  const hub = ["get_client_summary"];
  const editor = [
    "search_exercises",
    "get_exercise_details",
    "get_program_editor_state",
    "draft_program",
    "prepare_draft_context",
  ];
  const path = [dashboard, hub, editor, hub, [], hub, editor, hub, dashboard];
  let previous: ReturnType<typeof startWebMcpRegistration> | undefined;

  for (const names of path) {
    const current = startWebMcpRegistration(host, names.map((name) => descriptor(name)));
    assert.deepEqual(await current.ready, names);
    assert.deepEqual([...host.active.keys()], names);
    if (previous) {
      assert.equal(previous.signal.aborted, true);
      previous.abort();
      assert.deepEqual([...host.active.keys()], names);
    }
    previous = current;
  }

  previous?.abort();
  assert.equal(host.active.size, 0);
});

test("separate document contexts do not cancel one another", async () => {
  const hostA = new StrictModelContext();
  const hostB = new StrictModelContext();
  const a = startWebMcpRegistration(hostA, [descriptor("list_clients")]);
  const b = startWebMcpRegistration(hostB, [descriptor("list_clients")]);
  await Promise.all([a.ready, b.ready]);

  a.abort();

  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, false);
  assert.equal(hostB.active.size, 1);
  b.abort();
});

test("empty pre-hydration descriptors do not claim agent readiness", () => {
  let state: WebMcpRegistrationState | undefined;
  function Probe() {
    state = useWebMcpTools([]);
    return null;
  }

  renderToString(createElement(Probe));

  assert.deepEqual(state, { status: "checking", error: null, toolNames: [] });
});
