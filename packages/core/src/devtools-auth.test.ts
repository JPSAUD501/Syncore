import { describe, expect, it } from "vitest";
import {
  generateDevtoolsToken,
  isAllowedDashboardOrigin,
  isAuthorizedDashboardRequest,
  readDevtoolsTokenFromUrl,
  sanitizeDevtoolsToken
} from "./devtools-auth.js";

describe("sanitizeDevtoolsToken", () => {
  it("removes non-alphanumeric characters", () => {
    expect(sanitizeDevtoolsToken("ab-c_12+/=Z")).toBe("abc12Z");
  });

  it("returns null when sanitization removes everything", () => {
    expect(sanitizeDevtoolsToken("---")).toBeNull();
  });
});

describe("generateDevtoolsToken", () => {
  it("returns a short alphanumeric token", () => {
    const token = generateDevtoolsToken();
    expect(token).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});

describe("readDevtoolsTokenFromUrl", () => {
  it("reads the new token query parameter", () => {
    expect(readDevtoolsTokenFromUrl("/?token=abc123")).toBe("abc123");
  });

  it("accepts the legacy hubToken query parameter", () => {
    expect(readDevtoolsTokenFromUrl("/?hubToken=legacy123")).toBe("legacy123");
  });
});

describe("isAllowedDashboardOrigin", () => {
  it("accepts loopback origins on the dashboard port", () => {
    expect(isAllowedDashboardOrigin("http://localhost:4310", 4310)).toBe(true);
    expect(isAllowedDashboardOrigin("http://127.0.0.1:4310", 4310)).toBe(true);
  });

  it("rejects non-loopback origins or the wrong port", () => {
    expect(isAllowedDashboardOrigin("http://192.168.0.10:4310", 4310)).toBe(false);
    expect(isAllowedDashboardOrigin("http://localhost:9999", 4310)).toBe(false);
  });
});

describe("isAuthorizedDashboardRequest", () => {
  const expectedToken = "abc123token";

  it("authorizes loopback dashboard requests with the correct token", () => {
    expect(
      isAuthorizedDashboardRequest({
        requestUrl: "/?token=abc123token",
        originHeader: "http://localhost:4310",
        dashboardPort: 4310,
        expectedToken
      })
    ).toBe(true);
  });

  it("rejects requests with a missing token", () => {
    expect(
      isAuthorizedDashboardRequest({
        requestUrl: "/",
        originHeader: "http://localhost:4310",
        dashboardPort: 4310,
        expectedToken
      })
    ).toBe(false);
  });

  it("rejects requests with the wrong token", () => {
    expect(
      isAuthorizedDashboardRequest({
        requestUrl: "/?token=wrongtoken",
        originHeader: "http://localhost:4310",
        dashboardPort: 4310,
        expectedToken
      })
    ).toBe(false);
  });

  it("rejects requests from the wrong origin even with the correct token", () => {
    expect(
      isAuthorizedDashboardRequest({
        requestUrl: "/?token=abc123token",
        originHeader: "http://evil.example:4310",
        dashboardPort: 4310,
        expectedToken
      })
    ).toBe(false);
  });

  it("does not classify non-dashboard browser origins as dashboard auth requests", () => {
    expect(
      isAllowedDashboardOrigin("http://localhost:3000", 4310)
    ).toBe(false);
  });
});
