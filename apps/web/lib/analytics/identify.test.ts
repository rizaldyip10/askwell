import { describe, expect, it, vi } from "vitest";
import { identifyUser, type IdentifyClient } from "./identify";

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
