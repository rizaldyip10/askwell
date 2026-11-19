import "server-only";

import {
  applyPlanToWidgetConfig,
  DEFAULT_WIDGET_CONFIG,
  PLANS,
  type Plan,
  type WidgetAnimation,
  type WidgetConfig,
  type WidgetPosition,
} from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

// Only the config columns and the owner's plan. Never the project's id, name or owner (§9).
const SELECT = "widget_configs(button_color, position, label, animation, header_text, show_badge), accounts(plan)";

function toPlan(value: string | undefined): Plan {
  // An unknown plan gets the most restricted one. The server decides the plan (§5).
  return PLANS.find((plan) => plan === value) ?? "free";
}

/**
 * The plan-applied widget config for a public key, or null when no project has that key.
 * A public lookup: the key only identifies a project and grants nothing else (project.md §9),
 * so the service client is correct here. Throws on a database error.
 */
export async function getWidgetConfigByKey(publicKey: string): Promise<WidgetConfig | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select(SELECT)
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) throw new Error(`getWidgetConfigByKey: ${error.message}`, { cause: error });
  if (!data) return null;

  const plan = toPlan(data.accounts?.plan);
  const row = data.widget_configs;
  if (!row) {
    // Every project gets its config row in the same transaction (create_project), so this
    // shouldn't happen. Show the defaults rather than no widget.
    console.error("[widget] project has no widget_configs row");
    return applyPlanToWidgetConfig(DEFAULT_WIDGET_CONFIG, plan);
  }

  const stored: WidgetConfig = {
    buttonColor: row.button_color,
    // Check constraints in the schema keep these to the shared enum values.
    position: row.position as WidgetPosition,
    label: row.label,
    animation: row.animation as WidgetAnimation,
    headerText: row.header_text,
    showBadge: row.show_badge,
  };
  return applyPlanToWidgetConfig(stored, plan);
}
