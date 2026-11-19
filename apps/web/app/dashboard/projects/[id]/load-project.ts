import "server-only";

import { idSchema, type Project } from "@askwell/shared";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getOwnedProject } from "../../../../lib/projects/owned-project";
import { toProject } from "../../../../lib/projects/to-project";

/**
 * The signed-in owner's project for a `[id]` page, or the 404 page. A bad id, a missing project
 * and another owner's project all look the same. Cached per request, so the page and its
 * metadata share one query.
 */
export const loadOwnedProject = cache(async (id: string): Promise<Project> => {
  if (!idSchema.safeParse(id).success) notFound();
  const row = await getOwnedProject(id);
  if (!row) notFound();
  return toProject(row);
});
