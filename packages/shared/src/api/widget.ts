// Public widget routes (project.md §8 Public). Any origin, rate limited.

import { z } from "zod";
import type { WidgetConfig } from "../domain";
import { MESSAGE_MAX_LENGTH } from "../limits";
import { idSchema, publicKeySchema } from "./common";

/** GET /api/widget/config?key=pk_... */
export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
/** Plan-applied: Free gets the defaults and the badge. */
export type WidgetConfigResponse = { config: WidgetConfig };

/** POST /api/widget/chat */
export const widgetChatRequestSchema = z.strictObject({
  key: publicKeySchema,
  visitorId: idSchema,
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;
export type WidgetChatResponse = { conversationId: string; reply: string };
