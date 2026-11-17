// Owner project routes (project.md §6.3, §8 Owner).

import { z } from "zod";
import type { Project } from "../domain";
import { PROJECT_NAME_MAX_LENGTH } from "../limits";
import type { OkResponse } from "./common";

export const projectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

/** GET /api/projects */
export type ListProjectsResponse = { projects: Project[] };

/** POST /api/projects */
export const createProjectRequestSchema = z.strictObject({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateProjectResponse = { project: Project };

/** PATCH /api/projects/:id (rename) */
export const renameProjectRequestSchema = z.strictObject({ name: projectNameSchema });
export type RenameProjectRequest = z.infer<typeof renameProjectRequestSchema>;
export type RenameProjectResponse = { project: Project };

/** DELETE /api/projects/:id */
export type DeleteProjectResponse = OkResponse;
