// Owner widget config route (project.md §6.8, §8 Owner). Pro only: Free gets 402.

import { z } from "zod";
import type { WidgetConfig } from "../domain";
import { WIDGET_ANIMATIONS, WIDGET_POSITIONS } from "../enums";
import { WIDGET_HEADER_TEXT_MAX_LENGTH, WIDGET_LABEL_MAX_LENGTH } from "../limits";
import { hexColorSchema } from "./common";

/** PATCH /api/projects/:id/config. Every field optional, at least one required. */
export const updateWidgetConfigRequestSchema = z
  .strictObject({
    buttonColor: hexColorSchema,
    position: z.enum(WIDGET_POSITIONS),
    label: z.string().trim().min(1).max(WIDGET_LABEL_MAX_LENGTH),
    animation: z.enum(WIDGET_ANIMATIONS),
    headerText: z.string().trim().min(1).max(WIDGET_HEADER_TEXT_MAX_LENGTH),
    showBadge: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field");
export type UpdateWidgetConfigRequest = z.infer<typeof updateWidgetConfigRequestSchema>;
export type UpdateWidgetConfigResponse = { config: WidgetConfig };
