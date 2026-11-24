import { afterEach, describe, expect, it, vi } from "vitest";
import { LATE_MOUNT_SWEEP_MS, WIDGET_HOST_TAG, mountLandingLoader } from "./mount-loader";

/** Just enough of a DOM for the helper: a body with children, elements, a MutationObserver. */
class FakeElement {
  parent: FakeBody | null = null;
  dataset: Record<string, string> = {};
  src = "";
  defer = false;
  constructor(readonly tagName: string) {}
  remove() {
    this.parent?.removeChild(this);
  }
}

class FakeBody {
  children: FakeElement[] = [];
  observers = new Set<() => void>();
  appendChild(el: FakeElement) {
    el.parent = this;
    this.children.push(el);
    for (const cb of [...this.observers]) cb();
  }
  removeChild(el: FakeElement) {
    this.children = this.children.filter((c) => c !== el);
    el.parent = null;
  }
}

function fakeDocument() {
  const body = new FakeBody();
  class MutationObserver {
    constructor(private readonly cb: () => void) {}
    observe() {
      body.observers.add(this.cb);
    }
    disconnect() {
      body.observers.delete(this.cb);
    }
  }
  const doc = {
    body,
    createElement: (tag: string) => new FakeElement(tag),
    querySelectorAll: (tag: string) => body.children.filter((c) => c.tagName === tag),
    defaultView: { MutationObserver, setTimeout, clearTimeout },
  };
  return { doc: doc as unknown as Document, body };
}

const APP_URL = "https://askwell.test";
const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";

describe("mountLandingLoader", () => {
  afterEach(() => vi.useRealTimers());

  it("adds the loader script like the Install snippet: src, data-key, defer", () => {
    const { doc, body } = fakeDocument();
    mountLandingLoader(doc, APP_URL, KEY);
    expect(body.children).toHaveLength(1);
    const [script] = body.children;
    expect(script?.tagName).toBe("script");
    expect(script?.src).toBe(`${APP_URL}/widget.js`);
    expect(script?.dataset.key).toBe(KEY);
    expect(script?.defer).toBe(true);
  });

  it("cleanup removes the script and the widget it rendered, and clears the key", () => {
    const { doc, body } = fakeDocument();
    const cleanup = mountLandingLoader(doc, APP_URL, KEY);
    const script = body.children[0];
    body.appendChild(new FakeElement(WIDGET_HOST_TAG));
    cleanup();
    expect(body.children).toHaveLength(0);
    expect(script?.dataset.key).toBeUndefined();
  });

  it("removes a widget that mounts late, after leaving the page, until the sweep ends", () => {
    vi.useFakeTimers();
    const { doc, body } = fakeDocument();
    mountLandingLoader(doc, APP_URL, KEY)();
    body.appendChild(new FakeElement(WIDGET_HOST_TAG));
    expect(body.children).toHaveLength(0);

    vi.advanceTimersByTime(LATE_MOUNT_SWEEP_MS);
    body.appendChild(new FakeElement(WIDGET_HOST_TAG));
    expect(body.children).toHaveLength(1);
  });

  it("stops the sweep when the visitor comes back, so the new widget stays", () => {
    vi.useFakeTimers();
    const { doc, body } = fakeDocument();
    mountLandingLoader(doc, APP_URL, KEY)();
    mountLandingLoader(doc, APP_URL, KEY);
    body.appendChild(new FakeElement(WIDGET_HOST_TAG));
    expect(body.children.map((c) => c.tagName)).toEqual(["script", WIDGET_HOST_TAG]);
  });
});
