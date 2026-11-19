// POST /api/projects/:id/knowledge: paste text → process (project.md §6.4, §8 Owner).
//
// reserve_knowledge_source inserts the source as `processing`, which is the claim
// processSource needs, so no extra claim step. Processing runs in after(), once the 201 is
// sent.

import { pasteKnowledgeRequestSchema, type PasteKnowledgeResponse } from "@askwell/shared";
import { after } from "next/server";
import { processSource } from "../../../../../lib/knowledge";
import {
  checkOwnedProjectRequest,
  knowledgeLimit,
  knowledgeLimitError,
  removeKnowledgeFiles,
  reserveKnowledgeSource,
  toKnowledgeSource,
} from "../../../../../lib/knowledge/routes";
import { readOwnerPlan } from "../../../../../lib/projects/create-project";
import { internalError, notFound } from "../../../../../lib/projects/http";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../lib/supabase/service";

// Literal (Next.js reads it statically); equals KNOWLEDGE_MAX_DURATION_SECONDS.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const checked = await checkOwnedProjectRequest(request, context, pasteKnowledgeRequestSchema);
    if (checked instanceof Response) return checked;
    const { userId, projectId, body } = checked;

    const plan = await readOwnerPlan(createOwnerClient(), userId);
    const limit = knowledgeLimit(plan);
    const service = createServiceClient();
    const reserved = await reserveKnowledgeSource(service, {
      projectId,
      title: body.title,
      type: "text",
      storageKey: null,
      status: "processing",
      maxSources: limit,
    });
    if (!reserved.ok) return reserved.reason === "knowledge_limit" ? knowledgeLimitError(limit) : notFound();

    const source = reserved.source;
    after(async () => {
      await removeKnowledgeFiles(service, reserved.reclaimedKeys, "paste");
      await processSource({ sourceId: source.id, projectId, type: "text", text: body.text });
    });

    const response: PasteKnowledgeResponse = { source: toKnowledgeSource(source) };
    return Response.json(response, { status: 201 });
  } catch (error) {
    console.error("[knowledge] paste failed", { error: error instanceof Error ? error.message : String(error) });
    return internalError();
  }
}
