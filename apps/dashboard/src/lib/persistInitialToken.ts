const DASHBOARD_TOKEN_STORAGE_KEY = "syncore-dashboard-hub-token";

export {};

declare global {
  interface Window {
    __syncoreDashboardInitialToken?: string;
  }
}

function sanitizeHubToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[^A-Za-z0-9]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

function readTokenFromUrl(url: string): string | null {
  try {
    const searchParams = new URL(url).searchParams;
    return sanitizeHubToken(
      searchParams.get("token") ?? searchParams.get("hubToken")
    );
  } catch {
    return null;
  }
}

function readInitialNavigationToken(): string | null {
  try {
    const navigation = performance.getEntriesByType("navigation")[0];
    return navigation ? readTokenFromUrl(navigation.name) : null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const searchParams = new URLSearchParams(window.location.search);
  const token = sanitizeHubToken(
    searchParams.get("token") ?? searchParams.get("hubToken")
  ) ?? readInitialNavigationToken();
  if (token) {
    (
      window as typeof window & { __syncoreDashboardInitialToken?: string }
    ).__syncoreDashboardInitialToken = token;
    try {
      window.localStorage.setItem(DASHBOARD_TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore storage failures */
    }
  }
}
