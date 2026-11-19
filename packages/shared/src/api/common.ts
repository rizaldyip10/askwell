import { z } from "zod";
import { PUBLIC_KEY_PATTERN, PUBLIC_KEY_PREFIX } from "../widget";

// Defined in the zod-free widget module; re-exported here so existing imports keep working.
export { PUBLIC_KEY_PATTERN, PUBLIC_KEY_PREFIX };
export const publicKeySchema = z.string().regex(PUBLIC_KEY_PATTERN, "Invalid public key");

/** `#rrggbb` hex color. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, "Must be a hex color like #1a2b3c");

export const idSchema = z.uuid();

/** Route params for `/api/<resource>/:id`. */
export const idParamsSchema = z.object({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

/** Response for routes that only confirm success (deletes). */
export type OkResponse = { ok: true };
