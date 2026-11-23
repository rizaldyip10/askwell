import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { fakeClient, fail, ok } from "../../../../../lib/projects/test-utils";
import type { OwnerClient } from "../../../../../lib/supabase/owner";
import { loadStoredConfig } from "./load-config";

vi.mock("server-only", () => ({}));

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const ROW = { button_color: "#e11d48", position: "top-left", label: "Talk", animation: "scale", header_text: "Hey", show_badge: false };

function owner(result: ReturnType<typeof ok>) {
  const fake = fakeClient();
  fake.queue("widget_configs", result);
  return { fake, client: fake.client as unknown as OwnerClient };
}

describe("loadStoredConfig", () => {
  it("reads the project's row through the owner client, mapped to WidgetConfig", async () => {
    const { fake, client } = owner(ok(ROW));
    await expect(loadStoredConfig(client, ID)).resolves.toEqual({
      buttonColor: "#e11d48",
      position: "top-left",
      label: "Talk",
      animation: "scale",
      headerText: "Hey",
      showBadge: false,
    });
    expect(fake.callsTo("widget_configs")[0]).toContainEqual({ method: "eq", args: ["project_id", ID] });
  });

  it("no row → the defaults", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadStoredConfig(owner(ok(null)).client, ID)).resolves.toEqual(DEFAULT_WIDGET_CONFIG);
    log.mockRestore();
  });

  it("throws on a database error (the page shows its error state)", async () => {
    await expect(loadStoredConfig(owner(fail("XX000", "boom")).client, ID)).rejects.toThrow(/widget config/);
  });
});
