import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function sanitizeDevtoolsToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[^A-Za-z0-9]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

export function generateDevtoolsToken(length = 20): string {
  let token = "";
  while (token.length < length) {
    const bytes = randomBytes(length);
    for (const byte of bytes) {
      if (byte >= 248) {
        continue;
      }
      token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
      if (token.length === length) {
        break;
      }
    }
  }
  return token;
}

export function readDevtoolsTokenFromUrl(requestUrl: string | undefined): string | null {
  if (!requestUrl) {
    return null;
  }
  try {
    const url = new URL(requestUrl, "ws://localhost");
    return url.searchParams.get("token") ?? url.searchParams.get("hubToken");
  } catch {
    return null;
  }
}

export function isAllowedDashboardOrigin(
  originHeader: string | undefined,
  dashboardPort: number
): boolean {
  if (!originHeader) {
    return false;
  }
  try {
    const origin = new URL(originHeader);
    if (!isLoopbackHostname(origin.hostname)) {
      return false;
    }
    const expectedPort = String(dashboardPort);
    const originPort =
      origin.port ||
      (origin.protocol === "https:" ? "443" : origin.protocol === "http:" ? "80" : "");
    return originPort === expectedPort;
  } catch {
    return false;
  }
}

export function isAuthorizedDashboardRequest(input: {
  requestUrl: string | undefined;
  originHeader: string | undefined;
  dashboardPort: number;
  expectedToken: string;
}): boolean {
  if (!isAllowedDashboardOrigin(input.originHeader, input.dashboardPort)) {
    return false;
  }
  const providedToken = readDevtoolsTokenFromUrl(input.requestUrl);
  if (!providedToken) {
    return false;
  }
  return tokensMatch(providedToken, input.expectedToken);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
