// CORS (project.md §9): public widget routes allow any origin; owner and system routes do not.
// Owner and system handlers are called for real with a cross-origin request and must never
// answer with an Access-Control-* header. None of them exports OPTIONS, so a cross-origin
// preflight gets Next's default answer (no Access-Control-Allow-Origin), which browsers refuse.
// (The proxy answers an owner-route preflight even earlier, with a 401, because it carries no session.)

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeAccess } from "../auth/routes";
import { WIDGET_CORS_HEADERS } from "../widget/http";

vi.mock("server-only", () => ({}));
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock(), clerkClient: vi.fn() }));
const verifyWebhookMock = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: (...args: unknown[]) => verifyWebhookMock(...args) }));
vi.mock("../billing/sync-plan", () => ({ syncAccountPlan: vi.fn() }));

const APP_DIR = fileURLToPath(new URL("../../app", import.meta.url));
const WEB_DIR = fileURLToPath(new URL("../..", import.meta.url));
const ORIGIN = "https://customer.example";
const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

// Every owner and system route, by its URL. A new route under app/api fails the coverage check below.
const ROUTES: Record<string, () => Promise<Record<string, unknown>>> = {
  "/api/projects": () => import("../../app/api/projects/route"),
  "/api/projects/[id]": () => import("../../app/api/projects/[id]/route"),
  "/api/projects/[id]/config": () => import("../../app/api/projects/[id]/config/route"),
  "/api/projects/[id]/conversations": () => import("../../app/api/projects/[id]/conversations/route"),
  "/api/projects/[id]/knowledge": () => import("../../app/api/projects/[id]/knowledge/route"),
  "/api/projects/[id]/knowledge/upload-url": () => import("../../app/api/projects/[id]/knowledge/upload-url/route"),
  "/api/projects/[id]/knowledge/finalize": () => import("../../app/api/projects/[id]/knowledge/finalize/route"),
  "/api/knowledge/[id]": () => import("../../app/api/knowledge/[id]/route"),
  "/api/conversations/[id]": () => import("../../app/api/conversations/[id]/route"),
  "/api/clerk/webhook": () => import("../../app/api/clerk/webhook/route"),
  "/api/posthog-config": () => import("../../app/api/posthog-config/route"),
};
const WIDGET_ROUTES = ["/api/widget/config", "/api/widget/chat"];

/** `relative()` with `/` separators on every OS (Windows gives `\`), to compare with URL paths. */
const relativePosix = (from: string, to: string) => relative(from, to).split(sep).join("/");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))),
  );
  return nested.flat();
}

function crossOrigin(path: string, method: string): Request {
  const url = `https://askwell.test${path.replace("[id]", ID)}`;
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    ...(hasBody ? { body: "{}" } : {}),
  });
}

function expectNoCors(res: Response) {
  const cors = [...res.headers.keys()].filter((k) => k.startsWith("access-control-"));
  expect(cors).toEqual([]);
}

beforeEach(() => {
  authMock.mockReset();
  verifyWebhookMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("route inventory", () => {
  it("lists every API route: owner/system here, plus the two widget routes", async () => {
    const files = (await walk(join(APP_DIR, "api"))).map((f) => relativePosix(APP_DIR, f));
    const paths = files
      .filter((f) => /\/route\.ts$/.test(f))
      .map((f) => `/${f.replace(/\/route\.ts$/, "")}`)
      .sort();
    expect(paths).toEqual([...Object.keys(ROUTES), ...WIDGET_ROUTES].sort());
  });
});

describe("owner and system routes send no CORS headers", () => {
  it.each(Object.keys(ROUTES))("%s exports no OPTIONS handler", async (path) => {
    const mod = await ROUTES[path]!();
    expect(mod.OPTIONS).toBeUndefined();
  });

  it.each(Object.keys(ROUTES).filter((p) => routeAccess(p.replace("[id]", ID)) === "protected-api"))(
    "%s: a signed-out cross-origin request gets 401 without CORS (and the proxy gates it)",
    async (path) => {
      authMock.mockResolvedValue({ userId: null });
      const mod = await ROUTES[path]!();
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);
      for (const method of handlers) {
        const res = await (mod[method] as Handler)(crossOrigin(path, method), {
          params: Promise.resolve({ id: ID }),
        });
        expect(res.status, method).toBe(401);
        expectNoCors(res);
      }
    },
  );

  it("/api/clerk/webhook: a bad signature (400) and an ignored event (200) send no CORS", async () => {
    const { POST } = await import("../../app/api/clerk/webhook/route");
    verifyWebhookMock.mockRejectedValueOnce(new Error("bad signature"));
    const bad = await POST(crossOrigin("/api/clerk/webhook", "POST") as never);
    expect(bad.status).toBe(400);
    expectNoCors(bad);

    verifyWebhookMock.mockResolvedValueOnce({ type: "user.created", data: {} });
    const ignored = await POST(crossOrigin("/api/clerk/webhook", "POST") as never);
    expect(ignored.status).toBe(200);
    expectNoCors(ignored);
  });

  it("/api/posthog-config sends no CORS, configured or not", async () => {
    const { GET } = await import("../../app/api/posthog-config/route");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expectNoCors(GET());
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    expectNoCors(GET());
    vi.unstubAllEnvs();
  });
});

describe("widget routes allow any origin", () => {
  it.each(WIDGET_ROUTES)("%s answers the preflight with 204 and the CORS headers", async (path) => {
    const mod = (await import(`../../app/api/widget/${path.split("/").pop()}/route.ts`)) as { OPTIONS: () => Response };
    const res = mod.OPTIONS();
    expect(res.status).toBe(204);
    for (const [name, value] of Object.entries(WIDGET_CORS_HEADERS)) expect(res.headers.get(name)).toBe(value);
  });

  it("are never gated by the proxy (Clerk would redirect a cross-origin call)", () => {
    for (const path of WIDGET_ROUTES) expect(routeAccess(path)).toBe("public");
  });
});

describe("only the widget code sets Access-Control-* headers", () => {
  it("no other source file in apps/web mentions Access-Control-Allow-Origin", async () => {
    const files = [...(await walk(join(WEB_DIR, "app"))), ...(await walk(join(WEB_DIR, "lib"))), join(WEB_DIR, "proxy.ts")]
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    const offenders: string[] = [];
    for (const f of files) {
      if (/Access-Control-Allow-Origin/i.test(await readFile(f, "utf8"))) offenders.push(relativePosix(WEB_DIR, f));
    }
    // lib/widget/http.ts: the widget API routes. next.config.ts (not scanned) adds it for /widget.js only.
    expect(offenders).toEqual(["lib/widget/http.ts"]);
  });
});
