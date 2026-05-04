import { z } from "zod";
import { randomUUID } from "node:crypto";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const ProjectInput = z.object({
  activity_family: z.string().trim().min(1).optional(),
  agent_id: z.string().trim().min(1).default("agent:self"),
  content: z.string().trim().min(1),
  provisional: z.boolean().default(true),
  proj_type: z
    .enum(["FACT", "GOAL", "STEP", "CONSTRAINT"])
    .default("STEP"),
  scope: z.string().trim().min(1),
  status: z.enum(["active", "resolved", "expired", "blocking"]).default("active"),
  weight: z.coerce.number().min(0).max(1).default(0.7)
});

function buildSourceType(input: z.infer<typeof ProjectInput>): string {
  const mode = input.provisional ? "provisional" : "curated";
  return input.activity_family ? `${mode}:${input.activity_family}` : mode;
}

export const projectTool: ToolHandler = {
  definition: {
    name: "ghostcrab_project",
    description:
      "Model. Create or refresh compact provisional projections and working scopes after the user request is clear enough to model, without freezing a schema. Do not initialize a provisional scope on the first fuzzy onboarding turn. Prefer one compact projection over many overlapping projections.",
    inputSchema: {
      type: "object",
      required: ["scope", "content"],
      properties: {
        scope: { type: "string" },
        content: { type: "string" },
        proj_type: {
          type: "string",
          enum: ["FACT", "GOAL", "STEP", "CONSTRAINT"],
          default: "STEP"
        },
        status: {
          type: "string",
          enum: ["active", "resolved", "expired", "blocking"],
          default: "active"
        },
        weight: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.7
        },
        activity_family: { type: "string" },
        agent_id: {
          type: "string",
          default: "agent:self"
        },
        provisional: {
          type: "boolean",
          default: true
        }
      }
    }
  },
  async handler(args, context) {
    const input = ProjectInput.parse(args);
    const sourceType = buildSourceType(input);

    const payload = await context.database.transaction(async (database) => {
      if (database.kind === "sqlite") {
        const [existing] = await database.query<{ id: string }>(
          `
            SELECT id
            FROM mb_pragma.projections
            WHERE agent_id = ?
              AND scope = ?
              AND proj_type = ?
              AND content = ?
            LIMIT 1
          `,
          [input.agent_id, input.scope, input.proj_type, input.content]
        );

        if (existing) {
          await database.query(
            `
              UPDATE mb_pragma.projections
              SET weight = ?,
                  status = ?,
                  source_type = ?,
                  expires_at_unix = NULL
              WHERE id = ?
            `,
            [input.weight, input.status, sourceType, existing.id]
          );

          return {
            created: false,
            id: existing.id,
            updated: true
          };
        }

        const id = randomUUID();
        await database.query(
          `
            INSERT INTO mb_pragma.projections (
              id,
              agent_id,
              scope,
              proj_type,
              content,
              weight,
              source_type,
              status,
              created_at_unix
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            input.agent_id,
            input.scope,
            input.proj_type,
            input.content,
            input.weight,
            sourceType,
            input.status,
            Math.floor(Date.now() / 1000)
          ]
        );

        return {
          created: true,
          id,
          updated: false
        };
      }

      const [existing] = await database.query<{
        id: string;
      }>(
        `
          SELECT id
          FROM mb_pragma.projections
          WHERE agent_id = $1
            AND scope = $2
            AND proj_type = $3
            AND content = $4
          LIMIT 1
        `,
        [input.agent_id, input.scope, input.proj_type, input.content]
      );

      if (existing) {
        await database.query(
          `
            UPDATE mb_pragma.projections
            SET weight = $2,
                status = $3,
                source_type = $4,
                expires_at = NULL
            WHERE id = $1
          `,
          [existing.id, input.weight, input.status, sourceType]
        );

        return {
          created: false,
          id: existing.id,
          updated: true
        };
      }

      const [created] = await database.query<{ id: string }>(
        `
          INSERT INTO mb_pragma.projections (
            agent_id,
            scope,
            proj_type,
            content,
            weight,
            source_type,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [
          input.agent_id,
          input.scope,
          input.proj_type,
          input.content,
          input.weight,
          sourceType,
          input.status
        ]
      );

      if (!created?.id) {
        throw new Error(
          "INSERT returned no row — possible constraint violation"
        );
      }

      return {
        created: true,
        id: created.id,
        updated: false
      };
    });

    return createToolSuccessResult("ghostcrab_project", {
      activity_family: input.activity_family ?? null,
      agent_id: input.agent_id,
      provisional: input.provisional,
      projection_id: payload.id,
      scope: input.scope,
      source_type: sourceType,
      stored: true,
      updated: payload.updated
    });
  }
};

registerTool(projectTool);
