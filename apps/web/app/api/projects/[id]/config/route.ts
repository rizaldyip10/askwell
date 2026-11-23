// PATCH /api/projects/:id/config (project.md §6.8, §8 Owner). Pro only: Free gets 402.
// Order matters (§7, §9): session → body → ownership (owner client, RLS) → plan read on the
// server → write with the service client. The client's view of the plan is never trusted.

import {
  applyPlanToWidgetConfig,
  idParamsSchema,
  PLAN_LIMITS,
  updateWidgetConfigRequestSchema,
  type UpdateWidgetConfigResponse,
} from "@askwell/shared";
import { readOwnerPlan } from "../../../../../lib/projects/create-project";
import {
  apiError,
  currentUserId,
  internalError,
  notFound,
  readJson,
  unauthorized,
} from "../../../../../lib/projects/http";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../lib/supabase/service";
import { updateWidgetConfig } from "../../../../../lib/widget/update-config";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const id = idParamsSchema.safeParse(await context.params);
  if (!id.success) return apiError(400, "validation_error", "Invalid project id");
  const projectId = id.data.id;

  const parsed = updateWidgetConfigRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  try {
    const owner = createOwnerClient();

    // 1. Ownership: RLS returns the row only for the owner's own project.
    const { data: project, error } = await owner.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) throw new Error(error.message, { cause: error });
    if (!project) return notFound();

    // 2. The plan, read on the server.
    const plan = await readOwnerPlan(owner, userId);
    if (!PLAN_LIMITS[plan].customWidget) {
      return apiError(402, "payment_required", "Customizing the widget needs the Pro plan.");
    }

    // 3. Both checks passed: write with the service client.
    const saved = await updateWidgetConfig(createServiceClient(), projectId, parsed.data);
    if (!saved) throw new Error("project has no widget_configs row");

    const body: UpdateWidgetConfigResponse = { config: applyPlanToWidgetConfig(saved, plan) };
    return Response.json(body);
  } catch (error) {
    console.error("[projects] widget config update failed", { userId, projectId, error });
    return internalError();
  }
}
