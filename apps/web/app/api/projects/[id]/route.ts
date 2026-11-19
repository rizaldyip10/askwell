// PATCH /api/projects/:id (rename), DELETE /api/projects/:id (project.md §6.3, §8 Owner).
// Both go through the owner client: RLS lets an owner rename (name only) and delete only
// their own projects, so "not theirs" and "missing" both come back as no row → 404.

import {
  idParamsSchema,
  renameProjectRequestSchema,
  type DeleteProjectResponse,
  type RenameProjectResponse,
} from "@askwell/shared";
import {
  apiError,
  currentUserId,
  internalError,
  notFound,
  readJson,
  unauthorized,
} from "../../../../lib/projects/http";
import { toProject } from "../../../../lib/projects/to-project";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

async function parseId(context: Context): Promise<string | null> {
  const parsed = idParamsSchema.safeParse(await context.params);
  return parsed.success ? parsed.data.id : null;
}

const invalidId = () => apiError(400, "validation_error", "Invalid project id");

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const id = await parseId(context);
  if (!id) return invalidId();

  const parsed = renameProjectRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  try {
    const { data, error } = await createOwnerClient()
      .from("projects")
      .update({ name: parsed.data.name })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message, { cause: error });
    if (!data) return notFound();

    const body: RenameProjectResponse = { project: toProject(data) };
    return Response.json(body);
  } catch (error) {
    console.error("[projects] rename failed", { userId, id, error });
    return internalError();
  }
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const id = await parseId(context);
  if (!id) return invalidId();

  try {
    // The widget config, knowledge and conversations cascade.
    const { data, error } = await createOwnerClient().from("projects").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message, { cause: error });
    if (data.length === 0) return notFound();

    const body: DeleteProjectResponse = { ok: true };
    return Response.json(body);
  } catch (error) {
    console.error("[projects] delete failed", { userId, id, error });
    return internalError();
  }
}
