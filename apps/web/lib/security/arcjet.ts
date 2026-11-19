import "server-only";

import arcjet, { detectPromptInjection, fixedWindow } from "@arcjet/next";

// The only file that reads ARCJET_KEY. With no key, protect() returns an ERROR decision
// instead of throwing, and the helpers in ./widget fail open (project.md §3).
const aj = arcjet({ key: process.env.ARCJET_KEY ?? "", rules: [] });

/** Rate limits count per public key + client IP (project.md §3, §6.6). */
const BY_KEY_AND_IP = ["ip.src", "publicKey"] as const;

export const WIDGET_CONFIG_LIMIT = 60;
export const WIDGET_CHAT_LIMIT = 20;

/** GET /api/widget/config: 60 per minute. Config is fetched once per page view. */
export const widgetConfigArcjet = aj.withRule(
  fixedWindow({ mode: "LIVE", window: "1m", max: WIDGET_CONFIG_LIMIT, characteristics: BY_KEY_AND_IP }),
);

/** POST /api/widget/chat: 20 messages per minute, plus prompt-injection detection. */
export const widgetChatArcjet = aj
  .withRule(fixedWindow({ mode: "LIVE", window: "1m", max: WIDGET_CHAT_LIMIT, characteristics: BY_KEY_AND_IP }))
  .withRule(detectPromptInjection({ mode: "LIVE" }));
