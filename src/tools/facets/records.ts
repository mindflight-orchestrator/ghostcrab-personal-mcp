import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { safeParseFacetJson } from "../../db/fact-store.js";
import { activeFactWindowSql } from "../../db/temporal.js";
import { runStandaloneFactDelete } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const RecordGetInput = z
  .object({
    workspace_id: z.string().trim().min(1),
    schema_id: z.string().trim().min(1),
    id: z.string().trim().min(1)
  })
  .strict();

export const RecordDeleteInput = RecordGetInput.extend({
  expected_version: z.number().int().positive()
});

const identityProperties = {
  workspace_id: { type: "string", minLength: 1 },
  schema_id: { type: "string", minLength: 1 },
  id: {
    type: "string",
    minLength: 1,
    description: "Exact opaque row id returned by remember or upsert."
  }
};

export const recordGetTool: ToolHandler = {
  definition: {
    name: "ghostcrab_record_get",
    description:
      "Read. Get one fact record by exact workspace, schema and row id, including its version and validity. Returns found:false for an absent or differently scoped record; does not infer absence from ranked search.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "schema_id", "id"],
      properties: identityProperties,
      additionalProperties: false
    }
  },
  async handler(args, context) {
    const input = RecordGetInput.parse(args);
    const [record] = await context.database.query<Record<string, unknown>>(
      `SELECT id, workspace_id, schema_id, content, facets_json, version,
              created_by, created_at_unix, updated_at_unix, valid_from_unix,
              valid_until_unix, source_ref, supersedes,
              CASE WHEN ${activeFactWindowSql("")} THEN 1 ELSE 0 END AS active
       FROM agent_facts WHERE workspace_id = ? AND schema_id = ? AND id = ?`,
      [input.workspace_id, input.schema_id, input.id]
    );
    const row: Record<string, unknown> | null = record
      ? {
          ...record,
          facets: safeParseFacetJson(String(record.facets_json)),
          active: record.active === 1
        }
      : null;
    if (row) delete row.facets_json;
    return createToolSuccessResult("ghostcrab_record_get", {
      ...input,
      found: row !== null,
      row
    });
  }
};

export const recordDeleteTool: ToolHandler = {
  definition: {
    name: "ghostcrab_record_delete",
    description:
      "Write. Permanently delete one exact fact row and its native search/vector artifacts after checking expected_version. Prior closed history rows remain history. Never deletes a workspace, schema or ontology. An absent scoped row returns deleted:false; a stale version returns version_conflict.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "schema_id", "id", "expected_version"],
      properties: {
        ...identityProperties,
        expected_version: { type: "integer", minimum: 1 }
      },
      additionalProperties: false
    }
  },
  async handler(args) {
    const input = RecordDeleteInput.parse(args);
    const config = resolveGhostcrabConfig();
    try {
      const result = await runStandaloneFactDelete({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        ...input
      });
      return createToolSuccessResult("ghostcrab_record_delete", {
        ...input,
        ...result
      });
    } catch (error) {
      const cause =
        error instanceof Error
          ? (error.cause as { body?: string } | undefined)
          : undefined;
      if (typeof cause?.body === "string") {
        try {
          const code = JSON.parse(cause.body)?.error?.code;
          if (code === "version_conflict")
            return createToolErrorResult(
              "ghostcrab_record_delete",
              "The record version changed; read it again before deleting.",
              code
            );
        } catch {
          /* Preserve the original transport/backend error. */
        }
      }
      return createToolErrorFromException("ghostcrab_record_delete", error);
    }
  }
};

registerTool(recordGetTool);
registerTool(recordDeleteTool);
