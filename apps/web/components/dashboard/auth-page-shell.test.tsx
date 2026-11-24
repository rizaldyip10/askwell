import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthPageShell } from "./auth-page-shell";

// Clerk's control components render their children only in the matching load state.
let clerkState: "loading" | "loaded" | "failed" = "loading";
vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: ({ children }: { children: React.ReactNode }) => (clerkState === "loading" ? children : null),
  ClerkFailed: ({ children }: { children: React.ReactNode }) => (clerkState === "failed" ? children : null),
}));

const render = (state: typeof clerkState) => {
  clerkState = state;
  return renderToStaticMarkup(
    <AuthPageShell retryHref="/sign-up">
      <div data-testid="clerk-card" />
    </AuthPageShell>,
  );
};

describe("AuthPageShell states", () => {
  it("shows a loading skeleton while Clerk loads", () => {
    const html = render("loading");
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading…");
    expect(html).not.toContain('role="alert"');
  });

  it("shows an error with a full-page retry link when Clerk fails to load", () => {
    const html = render("failed");
    expect(html).toContain('role="alert"');
    expect(html).toContain("This page couldn&#x27;t load");
    expect(html).toMatch(/<a href="\/sign-up"[^>]*>Try again<\/a>/);
    expect(html).not.toContain("Loading…");
  });

  it("shows only Clerk's card once loaded", () => {
    const html = render("loaded");
    expect(html).toContain('data-testid="clerk-card"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
});
