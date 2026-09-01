export interface CameraDeviceOption {
  deviceId: string;
  label: string;
  hasDeviceLabel: boolean;
}

export interface CameraDiscoveryResult {
  devices: CameraDeviceOption[];
  preferredDeviceId: string | null;
}

export interface CameraDiscoveryOptions {
  signal?: AbortSignal;
}

export function selectCameraDeviceId(
  devices: readonly CameraDeviceOption[],
  ...preferredIds: Array<string | null | undefined>
): string | null {
  for (const deviceId of preferredIds) {
    if (deviceId && devices.some((device) => device.deviceId === deviceId)) {
      return deviceId;
    }
  }
  return devices[0]?.deviceId ?? null;
}

function unsupportedCameraError(): Error {
  const error = new Error("Camera APIs are unavailable in this browser context.");
  error.name = "NotSupportedError";
  return error;
}

function abortedCameraError(): Error {
  const error = new Error("Camera discovery was interrupted.");
  error.name = "AbortError";
  return error;
}

function resolveMediaDevices(mediaDevices?: MediaDevices): MediaDevices {
  if (mediaDevices) return mediaDevices;
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw unsupportedCameraError();
  }
  return navigator.mediaDevices;
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Cleanup must not replace the original discovery result or error.
    }
  }
}

export async function enumerateCameraDevices(
  mediaDevices?: MediaDevices,
): Promise<CameraDeviceOption[]> {
  const source = resolveMediaDevices(mediaDevices);
  const devices = await source.enumerateDevices();
  const videoDevices = devices.filter(
    (device) => device.kind === "videoinput" && device.deviceId.trim().length > 0,
  );

  return videoDevices.map((device, index) => {
    const label = device.label.trim();
    return {
      deviceId: device.deviceId,
      label: label || `Camera ${index + 1}`,
      hasDeviceLabel: label.length > 0,
    };
  });
}

export async function discoverCameraDevices(
  mediaDevices?: MediaDevices,
  options: CameraDiscoveryOptions = {},
): Promise<CameraDiscoveryResult> {
  const source = resolveMediaDevices(mediaDevices);
  const permissionStream = await source.getUserMedia({
    audio: false,
    video: true,
  });
  let released = false;
  const releasePermissionStream = () => {
    if (released) return;
    released = true;
    stopStream(permissionStream);
  };
  const stopOnAbort = () => releasePermissionStream();
  options.signal?.addEventListener("abort", stopOnAbort, { once: true });

  try {
    if (options.signal?.aborted) throw abortedCameraError();
    const activeDeviceId = permissionStream
      .getVideoTracks()[0]
      ?.getSettings().deviceId;
    const devices = await enumerateCameraDevices(source);
    if (options.signal?.aborted) throw abortedCameraError();
    const preferredDeviceId =
      activeDeviceId && devices.some((device) => device.deviceId === activeDeviceId)
        ? activeDeviceId
        : devices[0]?.deviceId ?? null;

    return { devices, preferredDeviceId };
  } finally {
    options.signal?.removeEventListener("abort", stopOnAbort);
    releasePermissionStream();
  }
}

export function buildCameraConstraints(
  deviceId: string | null,
): MediaStreamConstraints {
  const selectedDevice = deviceId && deviceId.trim().length > 0
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: "user" } };

  return {
    audio: false,
    video: {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 720, max: 720 },
      aspectRatio: { ideal: 4 / 3 },
      frameRate: { ideal: 30, max: 30 },
      ...selectedDevice,
    },
  };
}

export function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";

  switch (name) {
    case "NotAllowedError":
      return "Camera permission was denied. Allow camera access in your browser settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found. Connect a camera or choose another device, then try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "The selected camera is busy or unavailable. Close other apps using it, then try again.";
    case "NotSupportedError":
      return "Camera access is not supported in this browser. Use a current browser on HTTPS or localhost.";
    case "SecurityError":
      return "Camera access is blocked by this page's security settings. Open the page over HTTPS or localhost and allow camera access.";
    case "AbortError":
      return "Camera startup was interrupted. Reconnect the camera and try again.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Unable to start the camera. Check the connection and try again.";
  }
}
