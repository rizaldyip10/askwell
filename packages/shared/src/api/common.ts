import { z } from "zod";

export const PUBLIC_KEY_PREFIX = "pk_";
/** `pk_` followed by 16–64 random URL-safe alphanumeric characters. */
export const PUBLIC_KEY_PATTERN = /^pk_[A-Za-z0-9]{16,64}$/;
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
