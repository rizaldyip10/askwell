import "server-only";

import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, PLANS, type Plan } from "@askwell/shared";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import type { OwnerClient } from "../supabase/owner";
import { generatePublicKey } from "./public-key";
import type { ProjectRow } from "./to-project";

export type CreateProjectResult =
  | { ok: true; project: ProjectRow }
  | { ok: false; reason: "plan_limit"; limit: number };

/** The owner's plan, read on the server through the owner client (RLS: their own row only). */
export async function readOwnerPlan(owner: OwnerClient, userId: string): Promise<Plan> {
  const { data, error } = await owner.from("accounts").select("plan").eq("clerk_user_id", userId).maybeSingle();
  if (error) throw new Error(`readOwnerPlan: ${error.message}`, { cause: error });
  // No row or an unknown value: the most restricted plan.
  return PLANS.find((plan) => plan === data?.plan) ?? "free";
}

/**
 * Creates a project with `create_project` (service_role only). The limit comes from
 * PLAN_LIMITS for the plan read on the server; the widget starts with DEFAULT_WIDGET_CONFIG.
 * Retries once with a new key if the generated public key clashes. Throws on anything else.
 */
export async function createProjectForOwner(
  userId: string,
  name: string,
  plan: Plan,
  service: ServiceClient = createServiceClient(),
): Promise<CreateProjectResult> {
  const limit = PLAN_LIMITS[plan].projects;
  const config = DEFAULT_WIDGET_CONFIG;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await service
      .rpc("create_project", {
        p_owner_id: userId,
        p_name: name,
        p_public_key: generatePublicKey(),
        p_max_projects: limit,
        p_button_color: config.buttonColor,
        p_position: config.position,
        p_label: config.label,
        p_animation: config.animation,
        p_header_text: config.headerText,
        p_show_badge: config.showBadge,
      })
      .single();

    if (!error && data) return { ok: true, project: data };
    if (error?.code === "P0001" && error.message === "plan_limit") return { ok: false, reason: "plan_limit", limit };
    if (error?.code === "23505" && attempt === 1) continue; // public_key clash: one retry
    throw new Error(`create_project failed: ${error?.code ?? "no data"} ${error?.message ?? ""}`.trim(), {
      cause: error,
    });
  }
  throw new Error("create_project failed: public key clashed twice");
}
