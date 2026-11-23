// GET /api/projects, POST /api/projects (project.md §6.3, §8 Owner).

import {
  createProjectRequestSchema,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import { ensureAccount } from "../../../lib/accounts/ensure-account";
import { trackProjectCreated } from "../../../lib/analytics/owner-events";
import { createProjectForOwner, readOwnerPlan } from "../../../lib/projects/create-project";
import { apiError, currentUserId, internalError, readJson, unauthorized } from "../../../lib/projects/http";
import { toProject } from "../../../lib/projects/to-project";
import { createOwnerClient } from "../../../lib/supabase/owner";

export async function GET(): Promise<Response> {
  if (!(await currentUserId())) return unauthorized();

  try {
    // Owner client: RLS returns only this owner's projects. No manual owner filter (§9).
    const { data, error } = await createOwnerClient()
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message, { cause: error });

    const body: ListProjectsResponse = { projects: data.map(toProject) };
    return Response.json(body);
  } catch (error) {
    console.error("[projects] list failed", error);
    return internalError();
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const parsed = createProjectRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  try {
    // The API can be called before the dashboard layout ever ran.
    await ensureAccount(userId);
    const plan = await readOwnerPlan(createOwnerClient(), userId);
    const result = await createProjectForOwner(userId, parsed.data.name, plan);

    if (!result.ok) {
      const projects = result.limit === 1 ? "1 project" : `${result.limit} projects`;
      return apiError(403, "plan_limit", `Your plan allows ${projects}. Upgrade to add more.`);
    }

    trackProjectCreated(userId, result.project.id, plan);
    const body: CreateProjectResponse = { project: toProject(result.project) };
    return Response.json(body, { status: 201 });
  } catch (error) {
    console.error("[projects] create failed", { userId, error });
    return internalError();
  }
}
