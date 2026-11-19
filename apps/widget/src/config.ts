import { WIDGET_ANIMATIONS, WIDGET_POSITIONS, type WidgetConfig } from "@askwell/shared/widget";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** Checks a `GET /api/widget/config` body by hand: the loader may not ship zod. */
export function parseConfigResponse(body: unknown): WidgetConfig | null {
  if (typeof body !== "object" || body === null) return null;
  const c = (body as { config?: unknown }).config;
  if (typeof c !== "object" || c === null) return null;
  const r = c as Record<string, unknown>;
  if (
    typeof r.buttonColor !== "string" ||
    !HEX_COLOR.test(r.buttonColor) ||
    !includes(WIDGET_POSITIONS, r.position) ||
    !includes(WIDGET_ANIMATIONS, r.animation) ||
    typeof r.label !== "string" ||
    typeof r.headerText !== "string" ||
    typeof r.showBadge !== "boolean"
  ) {
    return null;
  }
  return {
    buttonColor: r.buttonColor,
    position: r.position,
    animation: r.animation,
    label: r.label,
    headerText: r.headerText,
    showBadge: r.showBadge,
  };
}

/** The project's widget config, or null on any failure (one console.warn, nothing renders). */
export async function fetchConfig(
  appOrigin: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WidgetConfig | null> {
  try {
    const res = await fetchImpl(`${appOrigin}/api/widget/config?key=${encodeURIComponent(key)}`, {
      credentials: "omit",
    });
    const config = res.ok ? parseConfigResponse(await res.json()) : null;
    if (!config) console.warn("[askwell] Widget config unavailable; the chat button is hidden.");
    return config;
  } catch {
    console.warn("[askwell] Widget config unavailable; the chat button is hidden.");
    return null;
  }
}
