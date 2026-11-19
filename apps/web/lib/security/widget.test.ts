import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const configProtect = vi.fn();
const chatProtect = vi.fn();
vi.mock("./arcjet", () => ({
  widgetConfigArcjet: { protect: configProtect },
  widgetChatArcjet: { protect: chatProtect },
}));

const widget = await import("./widget");
const { PROTECT_TIMEOUT_MS, protectWidgetChat, protectWidgetConfig } = widget;

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const req = () => new Request("https://askwell.test/api/widget/config");

type Kind = "allow" | "rate_limit" | "injection" | "error";
function decision(kind: Kind) {
  return {
    isDenied: () => kind === "rate_limit" || kind === "injection",
    isErrored: () => kind === "error",
    reason: {
      isPromptInjection: () => kind === "injection",
      isRateLimit: () => kind === "rate_limit",
      isError: () => kind === "error",
      message: "decide timeout",
    },
  };
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  configProtect.mockReset();
  chatProtect.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
  vi.useRealTimers();
});

describe("protectWidgetConfig", () => {
  it("allows when Arcjet allows, keyed by public key", async () => {
    configProtect.mockResolvedValue(decision("allow"));
    expect(await protectWidgetConfig(req(), { publicKey: KEY })).toEqual({ allowed: true });
    expect(configProtect).toHaveBeenCalledWith(expect.any(Request), { publicKey: KEY });
  });

  it("blocks with rate_limit when the rate limit denies", async () => {
    configProtect.mockResolvedValue(decision("rate_limit"));
    expect(await protectWidgetConfig(req(), { publicKey: KEY })).toEqual({ allowed: false, reason: "rate_limit" });
  });
});

describe("protectWidgetChat", () => {
  it("passes the message to prompt-injection detection", async () => {
    chatProtect.mockResolvedValue(decision("allow"));
    expect(await protectWidgetChat(req(), { publicKey: KEY, message: "hi" })).toEqual({ allowed: true });
    expect(chatProtect).toHaveBeenCalledWith(expect.any(Request), { publicKey: KEY, detectPromptInjectionMessage: "hi" });
  });

  it("maps a prompt-injection denial to injection, and a rate-limit denial to rate_limit", async () => {
    chatProtect.mockResolvedValueOnce(decision("injection"));
    expect(await protectWidgetChat(req(), { publicKey: KEY, message: "x" })).toEqual({ allowed: false, reason: "injection" });
    chatProtect.mockResolvedValueOnce(decision("rate_limit"));
    expect(await protectWidgetChat(req(), { publicKey: KEY, message: "x" })).toEqual({ allowed: false, reason: "rate_limit" });
  });

  it("never logs the message text on a block", async () => {
    chatProtect.mockResolvedValue(decision("injection"));
    await protectWidgetChat(req(), { publicKey: KEY, message: "secret visitor text" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret visitor text");
  });

  it("onBlocked is a no-op hook for Phase 4", () => {
    expect(widget.onBlocked("injection", KEY)).toBeUndefined();
  });
});

describe("fail open", () => {
  it("allows and logs on an ERROR decision", async () => {
    chatProtect.mockResolvedValue(decision("error"));
    expect(await protectWidgetChat(req(), { publicKey: KEY, message: "secret visitor text" })).toEqual({ allowed: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("errored, allowing"), "decide timeout");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret visitor text");
  });

  it("allows and logs when Arcjet throws", async () => {
    configProtect.mockRejectedValue(new Error("network down"));
    expect(await protectWidgetConfig(req(), { publicKey: KEY })).toEqual({ allowed: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed, allowing"), "network down");
  });

  it("allows and logs when Arcjet times out", async () => {
    vi.useFakeTimers();
    configProtect.mockReturnValue(new Promise(() => {}));
    const pending = protectWidgetConfig(req(), { publicKey: KEY });
    await vi.advanceTimersByTimeAsync(PROTECT_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ allowed: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed, allowing"), expect.stringContaining("did not answer"));
  });
});
