import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import {
  changedFields,
  NO_CHANGES,
  previewConfig,
  submitConfig,
  UPGRADE_TO_SAVE,
  validateChanges,
  type SaveFn,
} from "./form-state";

const SAVED: WidgetConfig = { ...DEFAULT_WIDGET_CONFIG };
const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

describe("changedFields", () => {
  it("is empty when nothing changed", () => {
    expect(changedFields(SAVED, { ...SAVED })).toEqual({});
  });

  it("has only the changed fields", () => {
    expect(changedFields(SAVED, { ...SAVED, buttonColor: "#e11d48", position: "top-left" })).toEqual({
      buttonColor: "#e11d48",
      position: "top-left",
    });
    expect(changedFields(SAVED, { ...SAVED, showBadge: false })).toEqual({ showBadge: false });
  });

  it("ignores color case and surrounding spaces in text (the server trims)", () => {
    expect(changedFields({ ...SAVED, buttonColor: "#0A0A0A" }, { ...SAVED, buttonColor: "#0a0a0a" })).toEqual({});
    expect(changedFields(SAVED, { ...SAVED, label: `  ${SAVED.label} ` })).toEqual({});
  });
});

describe("validateChanges", () => {
  it("accepts valid changes and trims text, like the server", () => {
    expect(validateChanges({ label: "  Help  " })).toEqual({ ok: true, request: { label: "Help" } });
  });

  it("names the bad fields", () => {
    const result = validateChanges({ buttonColor: "#12", label: "   ", headerText: "x".repeat(61) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["buttonColor", "headerText", "label"]);
  });
});

describe("previewConfig", () => {
  it("follows the draft", () => {
    const draft = { ...SAVED, buttonColor: "#e11d48", position: "top-left" as const, label: "Talk", headerText: "Hey" };
    expect(previewConfig(draft, SAVED)).toEqual(draft);
  });

  it("keeps the last good color and text while the owner is mid-edit", () => {
    expect(previewConfig({ ...SAVED, buttonColor: "#e1", label: " ", headerText: "" }, SAVED)).toEqual(SAVED);
  });
});

describe("submitConfig", () => {
  const okSave = (config: WidgetConfig): SaveFn => vi.fn(async () => ({ ok: true as const, data: { config } }));

  it("Pro: sends only the changed fields, trimmed, and returns the saved config", async () => {
    const after = { ...SAVED, buttonColor: "#e11d48", label: "Talk to us" };
    const save = okSave(after);
    const result = await submitConfig(ID, SAVED, { ...SAVED, buttonColor: "#e11d48", label: " Talk to us " }, save);
    expect(save).toHaveBeenCalledWith(ID, { buttonColor: "#e11d48", label: "Talk to us" });
    expect(result).toEqual({ kind: "saved", config: after });
  });

  it("Reset to defaults sends only what differs from the saved look", async () => {
    const saved = { ...SAVED, buttonColor: "#e11d48", position: "top-left" as const };
    const save = okSave(SAVED);
    await submitConfig(ID, saved, { ...DEFAULT_WIDGET_CONFIG }, save);
    expect(save).toHaveBeenCalledWith(ID, { buttonColor: DEFAULT_WIDGET_CONFIG.buttonColor, position: DEFAULT_WIDGET_CONFIG.position });
  });

  it("Free: a forced save reaches the server, and its 402 reads 'upgrade to save'", async () => {
    const save: SaveFn = vi.fn(async () => ({
      ok: false as const,
      status: 402,
      code: "payment_required" as const,
      message: "Customizing the widget needs the Pro plan.",
    }));
    const result = await submitConfig(ID, SAVED, { ...SAVED, buttonColor: "#e11d48" }, save);
    expect(save).toHaveBeenCalledOnce();
    expect(result).toEqual({ kind: "error", message: UPGRADE_TO_SAVE, upgrade: true });
    expect(UPGRADE_TO_SAVE).toBe("Pro feature: upgrade to save.");
  });

  it("shows other errors as the server says them", async () => {
    const save: SaveFn = vi.fn(async () => ({ ok: false as const, status: 500, code: "internal" as const, message: "Something went wrong. Try again." }));
    expect(await submitConfig(ID, SAVED, { ...SAVED, label: "Hi" }, save)).toEqual({
      kind: "error",
      message: "Something went wrong. Try again.",
      upgrade: false,
    });
  });

  it("sends nothing when the form is invalid or unchanged", async () => {
    const save: SaveFn = vi.fn();
    expect((await submitConfig(ID, SAVED, { ...SAVED, buttonColor: "red" }, save)).kind).toBe("invalid");
    expect(await submitConfig(ID, SAVED, { ...SAVED }, save)).toEqual({ kind: "unchanged" });
    expect(save).not.toHaveBeenCalled();
    expect(NO_CHANGES).toBeTruthy();
  });
});
