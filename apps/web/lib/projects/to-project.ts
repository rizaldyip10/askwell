import type { Tables } from "@askwell/db";
import type { Project } from "@askwell/shared";

export type ProjectRow = Tables<"projects">;

/** Maps a `projects` row to the API's `Project` (camelCase). `owner_id` is not part of it. */
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}
