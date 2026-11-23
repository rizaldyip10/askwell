import "server-only";

import {
  DEFAULT_WIDGET_CONFIG,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type WidgetConfig,
} from "@askwell/shared";
import type { OwnerClient } from "../../../../../lib/supabase/owner";

/**
 * The project's stored widget config, read through the owner client (RLS: the owner's own
 * projects only). No row (shouldn't happen: create_project writes one) → the defaults.
 * Throws on a database error, which shows the page's error state.
 */
export async function loadStoredConfig(owner: OwnerClient, projectId: string): Promise<WidgetConfig> {
  const { data, error } = await owner
    .from("widget_configs")
    .select("button_color, position, label, animation, header_text, show_badge")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Loading the widget config failed: ${error.code}`);
  if (!data) {
    console.error("[customize] project has no widget_configs row", { projectId });
    return { ...DEFAULT_WIDGET_CONFIG };
  }
  return {
    buttonColor: data.button_color,
    // Check constraints keep these to the shared values; anything else falls back to the default.
    position: WIDGET_POSITIONS.find((p) => p === data.position) ?? DEFAULT_WIDGET_CONFIG.position,
    label: data.label,
    animation: WIDGET_ANIMATIONS.find((a) => a === data.animation) ?? DEFAULT_WIDGET_CONFIG.animation,
    headerText: data.header_text,
    showBadge: data.show_badge,
  };
}
