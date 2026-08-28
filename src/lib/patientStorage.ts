const SESSION_KEY_PREFIX = "coachpoint:patient-session:v1:";

function sessionKey(programCode: string): string {
  return `${SESSION_KEY_PREFIX}${programCode}`;
}

export function readPatientSession<T>(programCode: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionKey(programCode));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writePatientSession<T>(
  programCode: string,
  session: T,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(sessionKey(programCode), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearPatientSession(programCode: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionKey(programCode));
}

