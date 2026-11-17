import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSignedInAccount } from "./current-account";
import { ensureAccount } from "./ensure-account";

vi.mock("server-only", () => ({}));

const protect = vi.fn<() => Promise<{ userId: string }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: () => protect() } }));

vi.mock("./ensure-account", () => ({ ensureAccount: vi.fn() }));
const ensureAccountMock = vi.mocked(ensureAccount);

beforeEach(() => {
  protect.mockReset();
  ensureAccountMock.mockReset();
});

describe("ensureSignedInAccount", () => {
  it("uses the user ID from Clerk auth() and reports ready", async () => {
    protect.mockResolvedValue({ userId: "user_from_clerk" });
    ensureAccountMock.mockResolvedValue(undefined);

    await expect(ensureSignedInAccount()).resolves.toBe("ready");
    expect(ensureAccountMock).toHaveBeenCalledWith("user_from_clerk");
  });

  it("reports error (and logs it) when the account row can't be created", async () => {
    protect.mockResolvedValue({ userId: "user_x" });
    ensureAccountMock.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(ensureSignedInAccount()).resolves.toBe("error");
    expect(log).toHaveBeenCalledWith("[accounts] ensureAccount failed", expect.objectContaining({ userId: "user_x" }));
    log.mockRestore();
  });

  it("doesn't swallow Clerk's sign-in redirect", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    protect.mockRejectedValue(redirect);

    await expect(ensureSignedInAccount()).rejects.toBe(redirect);
    expect(ensureAccountMock).not.toHaveBeenCalled();
  });
});
