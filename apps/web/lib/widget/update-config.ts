import "server-only";

import type { UpdateWidgetConfigRequest, WidgetConfig } from "@askwell/shared";
import type { ServiceClient } from "../supabase/service";
import { toWidgetConfig, WIDGET_CONFIG_COLUMNS, type WidgetConfigRow } from "./config";

/** The request's fields as widget_configs columns. Only the fields that were sent. */
export function toWidgetConfigUpdate(request: UpdateWidgetConfigRequest): Partial<WidgetConfigRow> {
  const update: Partial<WidgetConfigRow> = {};
  if (request.buttonColor !== undefined) update.button_color = request.buttonColor;
  if (request.position !== undefined) update.position = request.position;
  if (request.label !== undefined) update.label = request.label;
  if (request.animation !== undefined) update.animation = request.animation;
  if (request.headerText !== undefined) update.header_text = request.headerText;
  if (request.showBadge !== undefined) update.show_badge = request.showBadge;
  return update;
}

/**
 * Writes a project's widget config with the service client (owners have no write grant on
 * widget_configs, project.md §7). Call it only after the route has checked ownership and
 * the plan. Returns the stored config, or null if the project has no config row. Throws on a
 * database error.
 */
export async function updateWidgetConfig(
  service: ServiceClient,
  projectId: string,
  request: UpdateWidgetConfigRequest,
): Promise<WidgetConfig | null> {
  const { data, error } = await service
    .from("widget_configs")
    .update(toWidgetConfigUpdate(request))
    .eq("project_id", projectId)
    .select(WIDGET_CONFIG_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`updateWidgetConfig: ${error.message}`, { cause: error });
  return data ? toWidgetConfig(data) : null;
}
