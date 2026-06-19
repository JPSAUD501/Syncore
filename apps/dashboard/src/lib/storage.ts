export const DASHBOARD_TOKEN_STORAGE_KEY = "syncore-dashboard-hub-token";
export const RUNTIME_FILTER_STORAGE_KEY = "syncore-dashboard-runtime-filter";
export const EXECUTOR_RUNTIME_STORAGE_KEY =
  "syncore-dashboard-executor-runtime";
export const DASHBOARD_ACTIVITY_STORAGE_KEY =
  "syncore-dashboard-include-dashboard-activity";

export function safeReadLocalStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWriteLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore storage failures */
  }
}

export function safeRemoveLocalStorage(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore storage failures */
  }
}

export function sanitizeHubToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[^A-Za-z0-9]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

export function readStoredDashboardToken(): string | null {
  return sanitizeHubToken(safeReadLocalStorage(DASHBOARD_TOKEN_STORAGE_KEY));
}

export function writeStoredDashboardToken(token: string): void {
  safeWriteLocalStorage(DASHBOARD_TOKEN_STORAGE_KEY, token);
}

export function clearStoredDashboardToken(): void {
  safeRemoveLocalStorage(DASHBOARD_TOKEN_STORAGE_KEY);
}

export function readStringPreference(key: string): string | null {
  const value = safeReadLocalStorage(key);
  return value && value.length > 0 ? value : null;
}

export function writeStringPreference(key: string, value: string | null): void {
  if (value) {
    safeWriteLocalStorage(key, value);
  } else {
    safeRemoveLocalStorage(key);
  }
}

export function readBooleanPreference(key: string): boolean {
  return safeReadLocalStorage(key) === "1";
}

export function writeBooleanPreference(key: string, value: boolean): void {
  safeWriteLocalStorage(key, value ? "1" : "0");
}

export function readJsonPreference<TValue>(
  key: string,
  fallback: TValue
): TValue {
  const stored = safeReadLocalStorage(key);
  if (!stored) {
    return fallback;
  }
  try {
    return JSON.parse(stored) as TValue;
  } catch {
    return fallback;
  }
}

export function writeJsonPreference(key: string, value: unknown): void {
  safeWriteLocalStorage(key, JSON.stringify(value));
}
