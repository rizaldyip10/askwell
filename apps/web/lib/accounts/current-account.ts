import "server-only";

import { auth } from "@clerk/nextjs/server";
import { ensureAccount } from "./ensure-account";

export type AccountStatus = "ready" | "error";

/**
 * For the dashboard layout: reads the signed-in user from Clerk on the server
 * (redirects to sign-in if there is none) and makes sure their `accounts` row exists.
 * Returns "error" instead of throwing, so the layout can show its error state; the
 * error is logged on the server.
 */
export async function ensureSignedInAccount(): Promise<AccountStatus> {
  const { userId } = await auth.protect();
  try {
    await ensureAccount(userId);
    return "ready";
  } catch (error) {
    console.error("[accounts] ensureAccount failed", { userId, error });
    return "error";
  }
}
