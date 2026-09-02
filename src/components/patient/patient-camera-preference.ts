export const PATIENT_CAMERA_PREFERENCE_STORAGE_KEY =
  "coachpoint.patient-camera-preference.v1";

const MAX_DEVICE_ID_LENGTH = 512;
const MAX_DEVICE_LABEL_LENGTH = 512;

export interface PatientCameraPreference {
  readonly deviceId: string;
  readonly label: string;
}

export type PatientCameraPreferenceStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

function browserStorage(): PatientCameraPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizedPreference(
  value: unknown,
): PatientCameraPreference | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !Object.hasOwn(descriptors, "deviceId") ||
    !Object.hasOwn(descriptors, "label") ||
    Reflect.ownKeys(descriptors).some(
      (key) => key !== "deviceId" && key !== "label",
    ) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined,
    )
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.deviceId !== "string" ||
    typeof candidate.label !== "string"
  ) {
    return null;
  }
  const deviceId = candidate.deviceId.trim();
  const label = candidate.label.trim();
  if (
    deviceId.length === 0 ||
    deviceId.length > MAX_DEVICE_ID_LENGTH ||
    label.length > MAX_DEVICE_LABEL_LENGTH
  ) {
    return null;
  }
  return { deviceId, label };
}

export function readPatientCameraPreference(
  storage: PatientCameraPreferenceStorage | null = browserStorage(),
): PatientCameraPreference | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PATIENT_CAMERA_PREFERENCE_STORAGE_KEY);
    if (raw === null) return null;
    return normalizedPreference(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePatientCameraPreference(
  preference: PatientCameraPreference,
  storage: PatientCameraPreferenceStorage | null = browserStorage(),
): void {
  if (!storage) return;
  const normalized = normalizedPreference(preference);
  if (!normalized) return;
  try {
    storage.setItem(
      PATIENT_CAMERA_PREFERENCE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Camera selection remains usable when browser storage is unavailable.
  }
}

/**
 * Resolves the stored device against the current enumeration. The current
 * browser label wins over the stored label so renamed devices do not show
 * stale copy. No camera API or permission is touched here.
 */
export function resolvePatientCameraPreference(
  devices: readonly PatientCameraPreference[],
  preferred: PatientCameraPreference | null,
): PatientCameraPreference | null {
  const available = devices
    .map((device) => normalizedPreference(device))
    .filter((device): device is PatientCameraPreference => device !== null);
  if (available.length === 0) return null;
  if (preferred) {
    const match = available.find(
      (device) => device.deviceId === preferred.deviceId,
    );
    if (match) return { ...match };
  }
  return { ...available[0]! };
}
