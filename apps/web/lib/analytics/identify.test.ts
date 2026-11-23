import { describe, expect, it, vi } from "vitest";
import { createSignOutWatcher, identifyUser, syncIdentity, type IdentifyClient } from "./identify";

function fakePosthog(distinctId: string, userState: "anonymous" | "identified") {
  return {
    get_distinct_id: vi.fn(() => distinctId),
    get_property: vi.fn((name: string) => (name === "$user_state" ? userState : undefined)),
    identify: vi.fn(),
    reset: vi.fn(),
  } satisfies IdentifyClient;
}

describe("identifyUser", () => {
  it("identifies an anonymous browser with the Clerk user ID only", () => {
    const ph = fakePosthog("anon-123", "anonymous");
    identifyUser(ph, "user_1");
    expect(ph.identify).toHaveBeenCalledWith("user_1");
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("does nothing when already that user", () => {
    const ph = fakePosthog("user_1", "identified");
    identifyUser(ph, "user_1");
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("resets first when still identified as someone else", () => {
    const ph = fakePosthog("user_old", "identified");
    identifyUser(ph, "user_1");
    expect(ph.reset).toHaveBeenCalledOnce();
    expect(ph.identify).toHaveBeenCalledWith("user_1");
    expect(ph.reset.mock.invocationCallOrder[0]).toBeLessThan(ph.identify.mock.invocationCallOrder[0]!);
  });
});

describe("syncIdentity", () => {
  it("signed in → identifies with the Clerk user ID", () => {
    const ph = fakePosthog("anon-123", "anonymous");
    syncIdentity(ph, "user_1");
    expect(ph.identify).toHaveBeenCalledWith("user_1");
    expect(ph.reset).not.toHaveBeenCalled();
  });

  it("signed out but still identified (other tab, expired session) → resets", () => {
    const ph = fakePosthog("user_1", "identified");
    syncIdentity(ph, null);
    expect(ph.reset).toHaveBeenCalledOnce();
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it("signed out and already anonymous → nothing (keeps the anonymous ID)", () => {
    const ph = fakePosthog("anon-123", "anonymous");
    syncIdentity(ph, null);
    expect(ph.reset).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });
});

describe("createSignOutWatcher", () => {
  it("fires once when a signed-in user goes to Clerk's transitional state (sign-out starts)", () => {
    const signedOut = createSignOutWatcher();
    expect(signedOut({ id: "user_1" })).toBe(false);
    expect(signedOut(undefined)).toBe(true);
    expect(signedOut(null)).toBe(false);
  });

  it("fires when a signed-in user goes straight to null", () => {
    const signedOut = createSignOutWatcher();
    signedOut({ id: "user_1" });
    expect(signedOut(null)).toBe(true);
  });

  it("never fires while Clerk loads or stays signed out", () => {
    const signedOut = createSignOutWatcher();
    expect(signedOut(undefined)).toBe(false);
    expect(signedOut(null)).toBe(false);
  });

  it("doesn't fire on a switch to another user (identifyUser resets then)", () => {
    const signedOut = createSignOutWatcher();
    signedOut({ id: "user_1" });
    expect(signedOut({ id: "user_2" })).toBe(false);
  });
});
