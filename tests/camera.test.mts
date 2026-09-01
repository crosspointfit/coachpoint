import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCameraConstraints,
  describeCameraError,
  discoverCameraDevices,
  enumerateCameraDevices,
  selectCameraDeviceId,
} from "../src/motion/camera.ts";

test("camera selection preserves the first available preference then falls back", () => {
  const devices = [
    { deviceId: "built-in", label: "Built-in Camera", hasDeviceLabel: true },
    { deviceId: "usb", label: "USB Camera", hasDeviceLabel: true },
  ];
  assert.equal(selectCameraDeviceId(devices, "usb", "built-in"), "usb");
  assert.equal(selectCameraDeviceId(devices, "removed", "built-in"), "built-in");
  assert.equal(selectCameraDeviceId(devices, "removed"), "built-in");
  assert.equal(selectCameraDeviceId([], "usb"), null);
});

function camera(
  deviceId: string,
  label: string,
  kind: MediaDeviceKind = "videoinput",
): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "camera-group",
    kind,
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

function permissionStream(deviceId?: string) {
  let stopCalls = 0;
  const track = {
    getSettings: () => ({ deviceId }),
    stop: () => {
      stopCalls += 1;
    },
  } as unknown as MediaStreamTrack;
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;

  return {
    stream,
    get stopCalls() {
      return stopCalls;
    },
  };
}

function mediaDevicesStub(options: {
  stream?: MediaStream;
  devices?: MediaDeviceInfo[];
  enumerateError?: Error;
}) {
  let permissionConstraints: MediaStreamConstraints | undefined;
  const mediaDevices = {
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      permissionConstraints = constraints;
      return options.stream ?? permissionStream().stream;
    },
    enumerateDevices: async () => {
      if (options.enumerateError) throw options.enumerateError;
      return options.devices ?? [];
    },
  } as unknown as MediaDevices;

  return {
    mediaDevices,
    get permissionConstraints() {
      return permissionConstraints;
    },
  };
}

test("camera discovery requests permission first, prefers the active device, and releases its temporary stream", async () => {
  const permission = permissionStream("usb-camera");
  const source = mediaDevicesStub({
    stream: permission.stream,
    devices: [
      camera("built-in", "Built-in Camera"),
      camera("usb-camera", "USB Camera"),
      camera("microphone", "Microphone", "audioinput"),
      camera("", "Unavailable Camera"),
    ],
  });

  const result = await discoverCameraDevices(source.mediaDevices);

  assert.deepEqual(source.permissionConstraints, { audio: false, video: true });
  assert.deepEqual(result, {
    devices: [
      { deviceId: "built-in", label: "Built-in Camera", hasDeviceLabel: true },
      { deviceId: "usb-camera", label: "USB Camera", hasDeviceLabel: true },
    ],
    preferredDeviceId: "usb-camera",
  });
  assert.equal(permission.stopCalls, 1);
});

test("camera discovery always releases the permission stream when enumeration fails", async () => {
  const permission = permissionStream("built-in");
  const source = mediaDevicesStub({
    stream: permission.stream,
    enumerateError: new Error("enumeration failed"),
  });

  await assert.rejects(
    discoverCameraDevices(source.mediaDevices),
    /enumeration failed/,
  );
  assert.equal(permission.stopCalls, 1);
});

test("camera discovery releases its temporary stream immediately when cancelled during enumeration", async () => {
  const permission = permissionStream("built-in");
  let resolveDevices!: (devices: MediaDeviceInfo[]) => void;
  const devicesPending = new Promise<MediaDeviceInfo[]>((resolve) => {
    resolveDevices = resolve;
  });
  const mediaDevices = {
    getUserMedia: async () => permission.stream,
    enumerateDevices: () => devicesPending,
  } as unknown as MediaDevices;
  const controller = new AbortController();

  const discovery = discoverCameraDevices(mediaDevices, {
    signal: controller.signal,
  });
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();

  assert.equal(permission.stopCalls, 1);
  resolveDevices([camera("built-in", "Built-in Camera")]);
  await assert.rejects(discovery, (error: unknown) => {
    return error instanceof Error && error.name === "AbortError";
  });
  assert.equal(permission.stopCalls, 1);
});

test("camera discovery falls back to the first device and supplies stable blank-label copy", async () => {
  const permission = permissionStream("disconnected-camera");
  const source = mediaDevicesStub({
    stream: permission.stream,
    devices: [camera("built-in", "  "), camera("usb-camera", "USB Camera")],
  });

  assert.deepEqual(await discoverCameraDevices(source.mediaDevices), {
    devices: [
      { deviceId: "built-in", label: "Camera 1", hasDeviceLabel: false },
      { deviceId: "usb-camera", label: "USB Camera", hasDeviceLabel: true },
    ],
    preferredDeviceId: "built-in",
  });
});

test("camera enumeration filters non-video and blank-id devices without requesting permission", async () => {
  const source = mediaDevicesStub({
    devices: [
      camera("front", "Front Camera"),
      camera("audio", "Microphone", "audioinput"),
      camera("   ", "Blank"),
    ],
  });

  assert.deepEqual(await enumerateCameraDevices(source.mediaDevices), [
    { deviceId: "front", label: "Front Camera", hasDeviceLabel: true },
  ]);
  assert.equal(source.permissionConstraints, undefined);
});

test("automatic camera enumeration supplies ordered fallback names without opening a stream", async () => {
  const source = mediaDevicesStub({
    devices: [camera("front", ""), camera("external", "   ")],
  });

  assert.deepEqual(await enumerateCameraDevices(source.mediaDevices), [
    { deviceId: "front", label: "Camera 1", hasDeviceLabel: false },
    { deviceId: "external", label: "Camera 2", hasDeviceLabel: false },
  ]);
  assert.equal(source.permissionConstraints, undefined);
});

test("camera constraints target the selected device exactly", () => {
  assert.deepEqual(buildCameraConstraints("usb-camera"), {
    audio: false,
    video: {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 720, max: 720 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30, max: 30 },
      deviceId: { exact: "usb-camera" },
    },
  });
});

test("camera constraints prefer the user-facing camera without a selection", () => {
  assert.deepEqual(buildCameraConstraints(null), {
    audio: false,
    video: {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 720, max: 720 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: { ideal: "user" },
    },
  });
});

function namedError(name: string, message = "raw camera failure"): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

test("camera errors provide actionable denied, missing, busy, unsupported, security, and abort guidance", () => {
  assert.match(describeCameraError(namedError("NotAllowedError")), /allow camera access/i);
  assert.match(describeCameraError(namedError("NotFoundError")), /connect a camera/i);
  assert.match(describeCameraError(namedError("OverconstrainedError")), /choose another device/i);
  assert.match(describeCameraError(namedError("NotReadableError")), /close other apps/i);
  assert.match(describeCameraError(namedError("NotSupportedError")), /https or localhost/i);
  assert.match(describeCameraError(namedError("SecurityError")), /security settings/i);
  assert.match(describeCameraError(namedError("AbortError")), /reconnect/i);
});

test("unknown camera errors preserve useful details and safely handle non-errors", () => {
  assert.equal(
    describeCameraError(new Error("Virtual camera failed")),
    "Virtual camera failed",
  );
  assert.match(describeCameraError("failure"), /unable to start/i);
});
