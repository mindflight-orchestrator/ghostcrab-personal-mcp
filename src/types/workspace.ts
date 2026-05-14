import { z } from "zod";

/**
 * Workspace identifier constraints: lowercase alphanum + hyphens, 2–64 chars.
 * Must start with a letter to remain valid for legacy workspace schema slugs.
 */
export const WORKSPACE_ID_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$|^[a-z][a-z0-9]$/;

export const WorkspaceIdSchema = z
  .string()
  .regex(WORKSPACE_ID_REGEX, "workspace_id must be lowercase alphanum+hyphens, 2–64 chars, start with a letter");

export const WorkspaceStatusSchema = z.enum(["active", "archived"]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export interface Workspace {
  id: string;
  label: string;
  pg_schema: string;
  description: string | null;
  created_by: string | null;
  status: WorkspaceStatus;
  created_at: string;
}

export interface WorkspaceStats extends Workspace {
  facets_count: number;
  entities_count: number;
}

export interface PendingMigration {
  id: string;
  workspace_id: string;
  sql: string;
  sync_spec: Record<string, unknown> | null;
  rationale: string | null;
  preview_trigger: string | null;
  status: "pending" | "approved" | "executed" | "rejected";
  proposed_by: string | null;
  approved_by: string | null;
  proposed_at: string;
  approved_at: string | null;
  executed_at: string | null;
}

export const CreateWorkspaceInputSchema = z.object({
  id: WorkspaceIdSchema,
  label: z.string().min(1).max(200),
  description: z.string().optional(),
  created_by: z.string().optional()
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;

export const ListWorkspacesInputSchema = z.object({
  status: WorkspaceStatusSchema.optional()
});

export type ListWorkspacesInput = z.infer<typeof ListWorkspacesInputSchema>;
