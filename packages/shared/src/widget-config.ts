// Plan-applied widget config (project.md §5, §6.8). The server calls this; clients never decide.

import type { WidgetConfig } from "./domain";
import { PLAN_LIMITS, type Plan } from "./plans";
import { DEFAULT_WIDGET_CONFIG } from "./widget";

/** The config a project's widget shows on `plan`. Without `customWidget`, the defaults with the plan's badge rule. */
export function applyPlanToWidgetConfig(stored: WidgetConfig, plan: Plan): WidgetConfig {
  const limits = PLAN_LIMITS[plan];
  if (!limits.customWidget) return { ...DEFAULT_WIDGET_CONFIG, showBadge: limits.showBadge };
  return { ...stored };
}
