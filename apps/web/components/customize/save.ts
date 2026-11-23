// Client call for PATCH /api/projects/:id/config (P5B-T03). Never throws.

import type { UpdateWidgetConfigRequest, UpdateWidgetConfigResponse } from "@askwell/shared";
import { requestJson, type ApiResult } from "../projects/api";

export function saveWidgetConfig(
  projectId: string,
  request: UpdateWidgetConfigRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<UpdateWidgetConfigResponse>> {
  return requestJson<UpdateWidgetConfigResponse>(
    "PATCH",
    `/api/projects/${encodeURIComponent(projectId)}/config`,
    request,
    fetchImpl,
  );
}
