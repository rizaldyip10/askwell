import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "../supabase/service";
import { getWidgetConfigByKey } from "./config";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/service", () => ({ createServiceClient: vi.fn() }));

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";

const STORED_ROW = {
  button_color: "#1a2b3c",
  position: "top-left",
  label: "Chat with us",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};
const STORED: WidgetConfig = {
  buttonColor: "#1a2b3c",
  position: "top-left",
  label: "Chat with us",
  animation: "scale",
  headerText: "Hi there",
  showBadge: false,
};

// A fake of the one query chain the helper uses: from().select().eq().maybeSingle().
const calls = { from: vi.fn(), select: vi.fn(), eq: vi.fn() };
let result: { data: unknown; error: unknown };

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset();
  const chain = {
    select: (...args: unknown[]) => (calls.select(...args), chain),
    eq: (...args: unknown[]) => (calls.eq(...args), chain),
    maybeSingle: async () => result,
  };
  vi.mocked(createServiceClient).mockReturnValue({
    from: (table: string) => (calls.from(table), chain),
  } as unknown as ReturnType<typeof createServiceClient>);
});

const project = (plan: string | null, config: typeof STORED_ROW | null = STORED_ROW) => ({
  data: { widget_configs: config, accounts: plan === null ? null : { plan } },
  error: null,
});

describe("getWidgetConfigByKey", () => {
  it("looks the project up by public_key, selecting only config columns and the plan", async () => {
    result = project("pro");
    await getWidgetConfigByKey(KEY);

    expect(calls.from).toHaveBeenCalledWith("projects");
    expect(calls.eq).toHaveBeenCalledWith("public_key", KEY);
    const select = String(calls.select.mock.calls[0]?.[0]);
    expect(select).toMatch(/widget_configs\(/);
    expect(select).toMatch(/accounts\(plan\)/);
    // Nothing that identifies the project or owner.
    expect(select).not.toMatch(/\b(id|name|owner_id|public_key|messages_used)\b/);
  });

  it("Free gets the defaults with the badge, whatever is stored", async () => {
    result = project("free");
    await expect(getWidgetConfigByKey(KEY)).resolves.toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
  });

  it("Pro gets the stored config, mapped to camelCase", async () => {
    result = project("pro");
    await expect(getWidgetConfigByKey(KEY)).resolves.toEqual(STORED);
  });

  it("returns only the config fields", async () => {
    result = project("pro");
    const config = await getWidgetConfigByKey(KEY);
    expect(Object.keys(config ?? {}).sort()).toEqual(
      ["animation", "buttonColor", "headerText", "label", "position", "showBadge"],
    );
  });

  it("an unknown or missing plan is treated as Free", async () => {
    for (const plan of ["enterprise", null]) {
      result = project(plan);
      await expect(getWidgetConfigByKey(KEY), String(plan)).resolves.toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
    }
  });

  it("an unknown key gets null", async () => {
    result = { data: null, error: null };
    await expect(getWidgetConfigByKey(KEY)).resolves.toBeNull();
  });

  it("falls back to the plan-applied defaults when the config row is missing", async () => {
    result = project("free", null);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getWidgetConfigByKey(KEY)).resolves.toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("throws on a database error", async () => {
    result = { data: null, error: { message: "boom" } };
    await expect(getWidgetConfigByKey(KEY)).rejects.toThrow(/boom/);
  });

  it("a Pro owner who downgrades keeps the stored config, but the widget shows the defaults again", async () => {
    // Same stored row, before and after the downgrade: only accounts.plan changes.
    result = project("pro");
    await expect(getWidgetConfigByKey(KEY)).resolves.toEqual(STORED);

    result = project("free");
    await expect(getWidgetConfigByKey(KEY)).resolves.toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
    expect(calls.from).not.toHaveBeenCalledWith("widget_configs"); // read only: nothing rewritten
  });
});
