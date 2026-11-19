import { describe, expect, it } from "vitest";
import {
  isProtectedRoute,
  matchesPrefix,
  normalizePath,
  projectIdFromPath,
  projectPath,
  projectSectionPath,
  routeAccess,
} from "./routes";

describe("routeAccess", () => {
  it.each([
    ["/dashboard", "protected-page"],
    ["/dashboard/billing", "protected-page"],
    ["/dashboard/projects/abc/knowledge", "protected-page"],
    ["/api/projects", "protected-api"],
    ["/api/projects/abc", "protected-api"],
    ["/api/knowledge/abc/finalize", "protected-api"],
    ["/api/conversations", "protected-api"],
  ] as const)("protects %s", (path, access) => {
    expect(routeAccess(path)).toBe(access);
    expect(isProtectedRoute(path)).toBe(true);
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/embed",
    "/embed/abc",
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("leaves %s public", (path) => {
    expect(routeAccess(path)).toBe("public");
    expect(isProtectedRoute(path)).toBe(false);
  });

  it("does not over-match look-alike paths", () => {
    expect(isProtectedRoute("/dashboardx")).toBe(false);
    expect(isProtectedRoute("/api/projectsx")).toBe(false);
  });

  it("can't be bypassed with a trailing slash or different case", () => {
    expect(routeAccess("/dashboard/")).toBe("protected-page");
    expect(routeAccess("/Dashboard")).toBe("protected-page");
    expect(routeAccess("/API/Projects/")).toBe("protected-api");
  });
});

describe("helpers", () => {
  it("matchesPrefix needs a segment boundary", () => {
    expect(matchesPrefix("/a", "/a")).toBe(true);
    expect(matchesPrefix("/a/b", "/a")).toBe(true);
    expect(matchesPrefix("/ab", "/a")).toBe(false);
  });

  it("normalizePath keeps the root", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("//")).toBe("/");
    expect(normalizePath("/A/b//")).toBe("/a/b");
  });
});

describe("project paths", () => {
  const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

  it("builds project and section paths", () => {
    expect(projectPath(ID)).toBe(`/dashboard/projects/${ID}`);
    expect(projectSectionPath(ID, "")).toBe(`/dashboard/projects/${ID}`);
    expect(projectSectionPath(ID, "install")).toBe(`/dashboard/projects/${ID}/install`);
    expect(projectPath("a/b")).toBe("/dashboard/projects/a%2Fb");
  });

  it("reads the project id from a path under a project", () => {
    expect(projectIdFromPath(`/dashboard/projects/${ID}`)).toBe(ID);
    expect(projectIdFromPath(`/dashboard/projects/${ID}/install`)).toBe(ID);
    expect(projectIdFromPath(`/dashboard/projects/${ID}/knowledge/x`)).toBe(ID);
  });

  it("returns null outside a project", () => {
    for (const path of ["/dashboard", "/dashboard/billing", "/dashboard/projects", "/dashboard/projects/", "/dashboard/projectsx/1", "/"]) {
      expect(projectIdFromPath(path), path).toBeNull();
    }
    expect(projectIdFromPath("/dashboard/projects/%E0%A4%A")).toBeNull();
  });
});
