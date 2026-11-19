import "server-only";

import {
  idParamsSchema,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  PLAN_LIMITS,
  type KnowledgeFileType,
  type KnowledgeSource,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
  type Plan,
} from "@askwell/shared";
import { apiError, currentUserId, notFound, readJson, unauthorized } from "../projects/http";
import { getOwnedProject } from "../projects/owned-project";
import type { ServiceClient } from "../supabase/service";
import { KNOWLEDGE_BUCKET } from "./process";

// Shared pieces of the owner knowledge routes (project.md §6.4, §8 Owner).

/**
 * Vercel function limit for the routes that process in `after()`. 60 s is allowed on every
 * Vercel plan (Hobby included) with or without Fluid compute. Processing one source (download
 * ≤ 10 MB, extract, ≤ ~350 chunks in a few embedding requests) fits well within it.
 */
export const KNOWLEDGE_MAX_DURATION_SECONDS = 60;

/** The columns of a knowledge_sources row the routes read. */
export type KnowledgeSourceRow = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: string;
};

/** The API shape of a source row. */
export function toKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    type: oneOf(KNOWLEDGE_SOURCE_TYPES, row.type, "type"),
    status: oneOf(KNOWLEDGE_SOURCE_STATUSES, row.status, "status"),
    createdAt: row.created_at,
  };
}

function oneOf<T extends KnowledgeSourceType | KnowledgeSourceStatus>(values: readonly T[], value: string, what: string): T {
  const found = values.find((v) => v === value);
  if (!found) throw new Error(`knowledge_sources: unknown ${what} ${JSON.stringify(value)}`);
  return found;
}

/** Storage path for a new file: `{projectId}/{random uuid}.{ext}`. Never the user's file name. */
export function knowledgeStorageKey(projectId: string, type: KnowledgeFileType): string {
  return `${projectId}/${crypto.randomUUID()}.${type}`;
}

/** The plan's knowledge-source limit, from PLAN_LIMITS (the plan read on the server). */
export function knowledgeLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].knowledgeSources;
}

/** 403 plan_limit with an upgrade message. */
export function knowledgeLimitError(limit: number): Response {
  const sources = limit === 1 ? "1 knowledge source" : `${limit} knowledge sources`;
  return apiError(403, "plan_limit", `Your plan allows ${sources} per project. Upgrade to add more.`);
}

export const sourceNotFound = () => apiError(404, "not_found", "Knowledge source not found");

/** True if the bytes start with the PDF signature `%PDF-`. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Remove files from the knowledge bucket, best effort: a failure is logged, not thrown. Used
 * for the files of reclaimed stale reservations and of refused uploads.
 */
export async function removeKnowledgeFiles(service: ServiceClient, keys: string[], context: string): Promise<void> {
  if (keys.length === 0) return;
  try {
    const { error } = await service.storage.from(KNOWLEDGE_BUCKET).remove(keys);
    if (error) console.error(`[knowledge] ${context}: removing files failed`, { count: keys.length, error: error.name });
  } catch (error) {
    console.error(`[knowledge] ${context}: removing files failed`, {
      count: keys.length,
      error: error instanceof Error ? error.name : String(error),
    });
  }
}

/** The result of reserve_knowledge_source, as the routes use it. */
export type Reservation =
  | { ok: true; source: KnowledgeSourceRow; reclaimedKeys: string[] }
  | { ok: false; reason: "knowledge_limit" | "project_not_found" };

/**
 * Reserve a source with reserve_knowledge_source (service_role only; plan limit from the
 * plan read on the server). Throws on any error other than the limit or a missing project.
 */
export async function reserveKnowledgeSource(
  service: ServiceClient,
  args: {
    projectId: string;
    title: string;
    type: KnowledgeSourceType;
    storageKey: string | null;
    status: "processing" | "uploading";
    maxSources: number;
  },
): Promise<Reservation> {
  const { data, error } = await service.rpc("reserve_knowledge_source", {
    p_project_id: args.projectId,
    p_title: args.title,
    p_type: args.type,
    p_storage_key: args.storageKey,
    p_status: args.status,
    p_max_sources: args.maxSources,
  });
  if (error?.code === "P0001" && error.message === "knowledge_limit") return { ok: false, reason: "knowledge_limit" };
  if (error?.code === "P0002") return { ok: false, reason: "project_not_found" };
  if (error) throw new Error(`reserve_knowledge_source failed: ${error.code}`, { cause: error });

  const row = data?.[0];
  if (!row) throw new Error("reserve_knowledge_source returned no row");
  const { reclaimed_storage_keys: reclaimedKeys, ...source } = row;
  return { ok: true, source, reclaimedKeys };
}

type ProjectContext = { params: Promise<{ id: string }> };

/** The part of a zod schema these routes use (apps/web gets zod only through @askwell/shared). */
type BodySchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
};

/** What a project knowledge route has once the owner, body and project are checked. */
export type OwnedProjectRequest<T> = { userId: string; projectId: string; body: T };

/**
 * The common start of `/api/projects/[id]/knowledge/*` (§9): session → valid project id and
 * body → the project read through the owner client (RLS). Returns the error Response to
 * send, or the checked request. Service-client writes come only after this.
 */
export async function checkOwnedProjectRequest<T>(
  request: Request,
  context: ProjectContext,
  schema: BodySchema<T>,
): Promise<Response | OwnedProjectRequest<T>> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return apiError(400, "validation_error", "Invalid project id");

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  const project = await getOwnedProject(params.data.id);
  if (!project) return notFound();

  return { userId, projectId: project.id, body: parsed.data };
}
