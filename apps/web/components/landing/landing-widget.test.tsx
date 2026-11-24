import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Capture the effect instead of running React's client renderer (these tests run in node).
const effects = vi.hoisted(() => [] as (() => void | (() => void))[]);
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (fn: () => void | (() => void)) => void effects.push(fn),
}));
const mount = vi.hoisted(() => vi.fn<(doc: Document, appUrl: string, key: string) => () => void>(() => () => undefined));
vi.mock("../../lib/landing/mount-loader", () => ({ mountLandingLoader: mount }));

const { LandingWidget } = await import("./landing-widget");

const APP_URL = "https://askwell.test";
const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";

function render(widgetKey: string | null) {
  effects.length = 0;
  mount.mockClear();
  const html = renderToStaticMarkup(<LandingWidget appUrl={APP_URL} widgetKey={widgetKey} />);
  vi.stubGlobal("document", { body: {} });
  const cleanups = effects.map((fn) => fn());
  vi.unstubAllGlobals();
  return { html, cleanups };
}

describe("LandingWidget", () => {
  it("with a key: mounts the loader for that key from the app URL", () => {
    const { html, cleanups } = render(KEY);
    expect(html).toBe("");
    expect(mount).toHaveBeenCalledOnce();
    expect(mount.mock.calls[0]?.slice(1)).toEqual([APP_URL, KEY]);
    expect(typeof cleanups[0]).toBe("function");
  });

  it("without a key: renders nothing and adds no script", () => {
    const { html, cleanups } = render(null);
    expect(html).toBe("");
    expect(mount).not.toHaveBeenCalled();
    expect(cleanups).toEqual([undefined]);
  });
});
