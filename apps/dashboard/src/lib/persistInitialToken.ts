import { sanitizeHubToken, writeStoredDashboardToken } from "./storage";

declare global {
  interface Window {
    __syncoreDashboardInitialToken?: string;
  }
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

export function persistInitialDashboardToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  const searchParams = new URLSearchParams(window.location.search);
  const token = sanitizeHubToken(
    searchParams.get("token") ?? searchParams.get("hubToken")
  ) ?? readInitialNavigationToken();
  if (token) {
    (
      window as typeof window & { __syncoreDashboardInitialToken?: string }
    ).__syncoreDashboardInitialToken = token;
    writeStoredDashboardToken(token);
  }
}
