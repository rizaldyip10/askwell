import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared/widget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readableTextColor } from "./color";
import { parseConfigResponse } from "./config";
import { init } from "./index";
import { findLoaderScript, readSetup } from "./setup";
import { clampHeight, embedUrl, HOST_TAG, type WidgetHandle } from "./widget";

const APP = "https://app.askwell.test";
const KEY = "pk_abcdefghijklmnop";

function addScript(attrs: Record<string, string>): HTMLScriptElement {
  const s = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  // Keep happy-dom from treating it as a script to run.
  s.type = "text/plain";
  document.head.append(s);
  return s;
}

function okFetch(config: Partial<WidgetConfig> = {}) {
  return vi.fn(async () => new Response(JSON.stringify({ config: { ...DEFAULT_WIDGET_CONFIG, ...config } }), { status: 200 }));
}

let handle: WidgetHandle | null = null;

// Note: happy-dom logs a NotSupportedError for each iframe page it doesn't load. Expected in tests.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  handle?.destroy();
  handle = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function mount(config: Partial<WidgetConfig> = {}): Promise<WidgetHandle> {
  addScript({ src: `${APP}/widget.js`, "data-key": KEY });
  handle = await init(window, okFetch(config));
  if (!handle) throw new Error("widget did not mount");
  return handle;
}

describe("setup", () => {
  it("finds the script by src + data-key and reads the app origin from its src", () => {
    addScript({ src: `${APP}/widget.js`, "data-key": KEY });
    expect(readSetup(findLoaderScript(document))).toEqual({ key: KEY, appOrigin: APP });
  });

  it.each(["", "pk_short", "sk_abcdefghijklmnop", "pk_abcdefghijklmnop<", "pk_" + "a".repeat(65)])(
    "rejects key %j",
    (key) => {
      addScript({ src: `${APP}/widget.js`, "data-key": key });
      expect(readSetup(findLoaderScript(document))).toBeNull();
    },
  );
});

describe("init", () => {
  it("bad key → no fetch, nothing rendered", async () => {
    addScript({ src: `${APP}/widget.js`, "data-key": "nope" });
    const fetchImpl = okFetch();
    expect(await init(window, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(document.querySelector(HOST_TAG)).toBeNull();
  });

  it("fetches the config from the app origin with the key", async () => {
    addScript({ src: `${APP}/widget.js`, "data-key": KEY });
    const fetchImpl = okFetch();
    handle = await init(window, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`${APP}/api/widget/config?key=${KEY}`, expect.anything());
  });

  it.each([
    ["404", async () => new Response("not found", { status: 404 })],
    ["bad body", async () => new Response(JSON.stringify({ config: { buttonColor: "red" } }), { status: 200 })],
    ["not JSON", async () => new Response("<html>", { status: 200 })],
    ["network error", async () => Promise.reject(new TypeError("offline"))],
  ])("config failure (%s) → nothing rendered, one warning", async (_, impl) => {
    addScript({ src: `${APP}/widget.js`, "data-key": KEY });
    expect(await init(window, vi.fn(impl))).toBeNull();
    expect(document.querySelector(HOST_TAG)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("adds exactly one element to the host page, and no global styles", async () => {
    const before = document.head.querySelectorAll("style, link").length;
    await mount();
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild?.tagName.toLowerCase()).toBe(HOST_TAG);
    expect(document.head.querySelectorAll("style, link")).toHaveLength(before);
  });

  it("mounts only once when pasted twice", async () => {
    await mount();
    addScript({ src: `${APP}/widget.js`, "data-key": KEY });
    expect(await init(window, okFetch())).toBeNull();
    expect(document.querySelectorAll(HOST_TAG)).toHaveLength(1);
  });
});

describe("button", () => {
  it("uses buttonColor, label and position, with readable text", async () => {
    const { button } = await mount({ buttonColor: "#FFEE00", label: "Help", position: "top-left" });
    expect(button.style.background).toMatch(/#ffee00|rgb\(255, 238, 0\)/i);
    expect(button.style.color).toMatch(/#000000|rgb\(0, 0, 0\)/);
    expect(button.textContent).toContain("Help");
    expect(button.classList.contains("top-left")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Help");
  });

  it("renders the label as text, not HTML", async () => {
    const { button } = await mount({ label: "<img src=x onerror=alert(1)>" });
    expect(button.querySelector("img")).toBeNull();
    expect(button.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("readableTextColor", () => {
  it.each([
    ["#0A0A0A", "#ffffff"],
    ["#ffffff", "#000000"],
    ["#FFEE00", "#000000"],
    ["#1d4ed8", "#ffffff"],
  ])("%s → %s", (bg, fg) => {
    expect(readableTextColor(bg)).toBe(fg);
  });
});

describe("parseConfigResponse", () => {
  it("accepts the default config", () => {
    expect(parseConfigResponse({ config: DEFAULT_WIDGET_CONFIG })).toEqual(DEFAULT_WIDGET_CONFIG);
  });
  it.each([null, {}, { config: { ...DEFAULT_WIDGET_CONFIG, position: "middle" } }, { config: { ...DEFAULT_WIDGET_CONFIG, showBadge: "yes" } }])(
    "rejects %j",
    (body) => {
      expect(parseConfigResponse(body)).toBeNull();
    },
  );
});

describe("panel iframe", () => {
  it("embedUrl includes the key and the encoded host origin", () => {
    expect(embedUrl(APP, KEY, "https://shop.example.com:8443")).toBe(
      `${APP}/embed?key=${KEY}&origin=https%3A%2F%2Fshop.example.com%3A8443`,
    );
  });

  it("is created once on click, pointing at /embed with key and origin", async () => {
    const h = await mount();
    expect(h.frame()).toBeNull();
    h.button.click();
    const frame = h.frame();
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("src")).toBe(embedUrl(APP, KEY, window.location.origin));
    expect(h.isOpen()).toBe(true);
    expect(h.button.getAttribute("aria-expanded")).toBe("true");
    h.button.click();
    expect(h.isOpen()).toBe(false);
    h.button.click();
    expect(h.frame()).toBe(frame);
  });

  it("uses the configured animation", async () => {
    const h = await mount({ animation: "slide" });
    h.open();
    expect(h.frame()?.classList.contains("slide")).toBe(true);
  });

  it("closes on Escape", async () => {
    const h = await mount();
    h.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(h.isOpen()).toBe(false);
  });
});

describe("messages", () => {
  async function opened(): Promise<{ h: WidgetHandle; panel: Window }> {
    const h = await mount();
    h.open();
    const frame = h.frame();
    if (!frame) throw new Error("no frame");
    // happy-dom doesn't load iframe pages in tests, so give the panel a window to compare against.
    const panel = {} as Window;
    Object.defineProperty(frame, "contentWindow", { value: panel });
    return { h, panel };
  }

  const send = (data: unknown, origin: string, source: Window | null) => {
    const event = new MessageEvent("message", { data, origin });
    Object.defineProperty(event, "source", { value: source });
    window.dispatchEvent(event);
  };

  it("askwell:close from the panel hides it", async () => {
    const { h, panel } = await opened();
    send({ type: "askwell:close" }, APP, panel);
    expect(h.isOpen()).toBe(false);
  });

  it("ignores a wrong origin", async () => {
    const { h, panel } = await opened();
    send({ type: "askwell:close" }, "https://evil.test", panel);
    expect(h.isOpen()).toBe(true);
  });

  it("ignores a wrong source, including null", async () => {
    const { h } = await opened();
    send({ type: "askwell:close" }, APP, window);
    send({ type: "askwell:close" }, APP, null);
    expect(h.isOpen()).toBe(true);
  });

  it("ignores malformed messages", async () => {
    const { h, panel } = await opened();
    send({ type: "askwell:unread", count: -1 }, APP, panel);
    send("askwell:close", APP, panel);
    expect(h.isOpen()).toBe(true);
    expect(h.button.querySelector(".dot")?.hasAttribute("hidden")).toBe(true);
  });

  it("askwell:unread shows a count on the button, 0 clears it", async () => {
    const { h, panel } = await opened();
    const dot = h.button.querySelector(".dot");
    send({ type: "askwell:unread", count: 3 }, APP, panel);
    expect(dot?.hasAttribute("hidden")).toBe(false);
    expect(dot?.textContent).toBe("3");
    expect(h.button.getAttribute("aria-label")).toContain("3 unread");
    send({ type: "askwell:unread", count: 0 }, APP, panel);
    expect(dot?.hasAttribute("hidden")).toBe(true);
  });

  it("askwell:resize sets a clamped height", async () => {
    const { h, panel } = await opened();
    send({ type: "askwell:resize", height: 5000 }, APP, panel);
    expect(h.frame()?.style.height).toBe(`${clampHeight(5000, window.innerHeight)}px`);
    expect(clampHeight(5000, 2000)).toBe(600);
    expect(clampHeight(10, 2000)).toBe(320);
    expect(clampHeight(500, 500)).toBe(392);
  });
});
