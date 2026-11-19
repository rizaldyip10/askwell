import "server-only";

import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import type { ProjectRow } from "./to-project";

/**
 * The signed-in owner's project with this id, or null if it doesn't exist or isn't theirs.
 * Reads through the owner client, so RLS does the scoping (project.md §9 "Tenant leak").
 * Every later service-client write on a project runs only after this check.
 */
export async function getOwnedProject(projectId: string, client?: OwnerClient): Promise<ProjectRow | null> {
  const db = client ?? createOwnerClient();
  const { data, error } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw new Error(`getOwnedProject: ${error.message}`, { cause: error });
  return data;
}
