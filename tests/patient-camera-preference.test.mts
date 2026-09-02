import assert from "node:assert/strict";
import test from "node:test";

import {
  PATIENT_CAMERA_PREFERENCE_STORAGE_KEY,
  readPatientCameraPreference,
  resolvePatientCameraPreference,
  savePatientCameraPreference,
  type PatientCameraPreferenceStorage,
} from "../src/components/patient/patient-camera-preference.ts";

class MemoryStorage implements PatientCameraPreferenceStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("blocked");
    this.values.set(key, value);
  }
}

test("stores and reads one global non-PII camera preference", () => {
  const storage = new MemoryStorage();

  savePatientCameraPreference(
    { deviceId: "usb-camera", label: "External Camera" },
    storage,
  );

  assert.equal(
    PATIENT_CAMERA_PREFERENCE_STORAGE_KEY,
    "coachpoint.patient-camera-preference.v1",
  );
  assert.deepEqual(
    JSON.parse(
      storage.values.get(PATIENT_CAMERA_PREFERENCE_STORAGE_KEY) ?? "null",
    ),
    { deviceId: "usb-camera", label: "External Camera" },
  );
  assert.deepEqual(readPatientCameraPreference(storage), {
    deviceId: "usb-camera",
    label: "External Camera",
  });
  assert.doesNotMatch(PATIENT_CAMERA_PREFERENCE_STORAGE_KEY, /patientId|code|session|setId/i);
});

test("restores a connected device and uses its current browser label", () => {
  const devices = [
    { deviceId: "built-in", label: "Built-in Camera" },
    { deviceId: "usb-camera", label: "Renamed External Camera" },
  ];

  assert.deepEqual(
    resolvePatientCameraPreference(devices, {
      deviceId: "usb-camera",
      label: "Old External Label",
    }),
    { deviceId: "usb-camera", label: "Renamed External Camera" },
  );
});

test("falls back to the first current camera or null when none remain", () => {
  const devices = [
    { deviceId: "built-in", label: "Built-in Camera" },
    { deviceId: "usb-camera", label: "External Camera" },
  ];

  assert.deepEqual(
    resolvePatientCameraPreference(devices, {
      deviceId: "disconnected",
      label: "Disconnected Camera",
    }),
    devices[0],
  );
  assert.deepEqual(resolvePatientCameraPreference(devices, null), devices[0]);
  assert.equal(
    resolvePatientCameraPreference([], {
      deviceId: "usb-camera",
      label: "External Camera",
    }),
    null,
  );
});

test("read and save remain fail-safe when storage is missing or throws", () => {
  const storage = new MemoryStorage();
  storage.failRead = true;
  assert.equal(readPatientCameraPreference(storage), null);

  storage.failWrite = true;
  assert.doesNotThrow(() =>
    savePatientCameraPreference(
      { deviceId: "usb-camera", label: "External Camera" },
      storage,
    ),
  );
  assert.equal(readPatientCameraPreference(null), null);
  assert.doesNotThrow(() =>
    savePatientCameraPreference(
      { deviceId: "usb-camera", label: "External Camera" },
      null,
    ),
  );
});

test("malformed, polluted and oversized stored values fail closed", () => {
  const storage = new MemoryStorage();
  const invalidValues = [
    "not-json",
    "null",
    "[]",
    JSON.stringify({ deviceId: "", label: "Camera" }),
    JSON.stringify({ deviceId: "camera", label: "Camera", patientId: "private" }),
    JSON.stringify({ deviceId: "x".repeat(513), label: "Camera" }),
    JSON.stringify({ deviceId: "camera", label: "x".repeat(513) }),
    JSON.stringify({ deviceId: 1, label: "Camera" }),
  ];

  for (const raw of invalidValues) {
    storage.values.set(PATIENT_CAMERA_PREFERENCE_STORAGE_KEY, raw);
    assert.equal(readPatientCameraPreference(storage), null, raw);
  }

  storage.values.clear();
  savePatientCameraPreference(
    {
      deviceId: "camera",
      label: "Camera",
      patientId: "private",
    } as never,
    storage,
  );
  assert.equal(storage.values.size, 0);
});

test("resolution ignores malformed current devices without mutating input", () => {
  const devices = [
    { deviceId: "", label: "Invalid" },
    { deviceId: "valid", label: " Current Camera " },
  ];
  const before = structuredClone(devices);

  assert.deepEqual(resolvePatientCameraPreference(devices, null), {
    deviceId: "valid",
    label: "Current Camera",
  });
  assert.deepEqual(devices, before);
});
