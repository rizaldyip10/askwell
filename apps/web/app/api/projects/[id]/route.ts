// PATCH /api/projects/:id (rename), DELETE /api/projects/:id (project.md §6.3, §8 Owner).
// Both go through the owner client: RLS lets an owner rename (name only) and delete only
// their own projects, so "not theirs" and "missing" both come back as no row → 404.
// DELETE also removes the project's knowledge files from Storage, which the row cascade
// can't reach (§6.4, §9 File upload).

import {
  idParamsSchema,
  renameProjectRequestSchema,
  type DeleteProjectResponse,
  type RenameProjectResponse,
} from "@askwell/shared";
import { removeKnowledgeFiles } from "../../../../lib/knowledge/routes";
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
import { createServiceClient } from "../../../../lib/supabase/service";

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
    const owner = createOwnerClient();

    // 1. The project's file keys, read through the owner client: RLS returns none for
    //    another owner's project. Pasted text has no file (null key).
    const { data: files, error: filesError } = await owner
      .from("knowledge_sources")
      .select("storage_key")
      .eq("project_id", id)
      .not("storage_key", "is", null);
    if (filesError) throw new Error(filesError.message, { cause: filesError });
    const keys = files.flatMap((f) => (f.storage_key ? [f.storage_key] : []));

    // 2. Delete the project. The widget config, knowledge rows and conversations cascade.
    const { data, error } = await owner.from("projects").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message, { cause: error });
    if (data.length === 0) return notFound();

    // 3. Only now, with ownership proven by the delete: remove the files (service client,
    //    one batch, best effort, via the shared knowledge helper). The project is gone either
    //    way, so a failure is logged (count only, never file names) and the delete still succeeds.
    if (keys.length > 0) await removeKnowledgeFiles(createServiceClient(), keys, "delete project");

    const body: DeleteProjectResponse = { ok: true };
    return Response.json(body);
  } catch (error) {
    console.error("[projects] delete failed", { userId, id, error });
    return internalError();
  }
}
