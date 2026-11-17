import { z } from "zod";

export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "plan_limit",
  "payment_required",
  "quota_exceeded",
  "rate_limited",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
