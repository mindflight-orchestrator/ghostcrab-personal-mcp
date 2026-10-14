/** Business graph CRUD on existing model types; never invokes learn scaffolding. */
import { z } from "zod";
import { canonicalJsonHash } from "../../db/canonical-json.js";
import { createDatabaseClient, type Queryable } from "../../db/client.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const Identity = z
  .object({
    workspace_id: z.string().trim().min(1),
    node_type: z.string().trim().min(1),
    id: z.string().trim().min(1).max(300)
  })
  .strict();
const Mutable = {
  label: z.string().trim().min(1).max(4096).optional(),
  properties: z.record(z.string(), z.unknown()).default({})
};
const inputs = {
  get: Identity,
  create: Identity.extend({ ...Mutable, label: Mutable.label.unwrap() }),
  update: Identity.extend({
    ...Mutable,
    expected_version: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  delete: Identity.extend({
    expected_version: z.string().regex(/^[a-f0-9]{64}$/)
  })
};
const reserved = new Set(["node_type", "workspace_id", "schema_id", "label"]);
type Row = {
  entity_id: number;
  workspace_id: string;
  entity_type: string;
  name: string;
  metadata_json: string;
  ontology_id: string | null;
};
const scope =
  "workspace_id = ? AND (CASE WHEN entity_type='entity' THEN COALESCE(json_extract(metadata_json,'$.node_type'),entity_type) ELSE entity_type END)=?";
function metadata(row: Row): Record<string, unknown> {
  return JSON.parse(row.metadata_json);
}
function node(row: Row) {
  const data = metadata(row);
  const properties = Object.fromEntries(
    Object.entries(data).filter(([key]) => !reserved.has(key))
  );
  const value = {
    id: String(row.entity_id),
    node_type:
      row.entity_type === "entity"
        ? String(data.node_type ?? row.entity_type)
        : row.entity_type,
    label: typeof data.label === "string" ? data.label : row.name,
    properties
  };
  return { ...value, version: canonicalJsonHash(value) };
}
function numeric(id: string) {
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 4294967295)
    throw new Error("invalid_id");
  return Number(id);
}
async function read(
  db: Queryable,
  input: { workspace_id: string; node_type: string; id: string }
) {
  const [row] = await db.query<Row>(
    `SELECT g.entity_id,g.workspace_id,g.entity_type,g.name,g.metadata_json,
    (SELECT ontology_id FROM entities_raw r WHERE r.workspace_id=g.workspace_id AND r.entity_id=g.entity_id) AS ontology_id
    FROM graph_entity g WHERE ${scope} AND entity_id=? AND deprecated_at IS NULL`,
    [input.workspace_id, input.node_type, numeric(input.id)]
  );
  return row ?? null;
}
function requireProperties(properties: Record<string, unknown>) {
  if (Object.keys(properties).some((key) => reserved.has(key)))
    throw new Error("reserved_property");
}
const schemas = {
  workspace_id: { type: "string", minLength: 1 },
  node_type: { type: "string", minLength: 1 },
  id: { type: "string", minLength: 1 },
  label: { type: "string", minLength: 1 },
  properties: { type: "object" },
  expected_version: { type: "string", pattern: "^[a-f0-9]{64}$" }
};
const codes = new Set([
  "version_conflict",
  "not_found",
  "type_not_found",
  "id_exists",
  "raw_identity_missing",
  "foreign_relation",
  "invalid_id",
  "reserved_property"
]);
for (const action of ["get", "create", "update", "delete"] as const) {
  const name = `ghostcrab_graph_record_${action}`;
  const allowed =
    action === "get"
      ? ["workspace_id", "node_type", "id"]
      : action === "delete"
        ? ["workspace_id", "node_type", "id", "expected_version"]
        : action === "create"
          ? ["workspace_id", "node_type", "id", "label", "properties"]
          : Object.keys(schemas);
  const tool: ToolHandler = {
    definition: {
      name,
      description: `${action === "get" ? "Read" : "Write"}. ${action} one existing application graph type, scoped to exact workspace and node type. No ontology or workspace changes. Version is an opaque content fingerprint.`,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          allowed.map((key) => [key, schemas[key as keyof typeof schemas]])
        ),
        required:
          action === "create"
            ? ["workspace_id", "node_type", "id", "label"]
            : action === "get"
              ? ["workspace_id", "node_type", "id"]
              : ["workspace_id", "node_type", "id", "expected_version"],
        additionalProperties: false
      }
    },
    async handler(args, context) {
      try {
        const input = inputs[action].parse(args);
        if (action === "get") {
          const row = await read(context.database, input);
          return createToolSuccessResult(name, {
            workspace_id: input.workspace_id,
            node_type: input.node_type,
            found: row !== null,
            node: row ? node(row) : null
          });
        }
        if ("properties" in input)
          requireProperties(input.properties as Record<string, unknown>);
        const database = createDatabaseClient(resolveGhostcrabConfig(), {
          requireTransactions: true
        });
        const result = await database.transaction(async (tx) => {
          if (action === "create") {
            const created = inputs.create.parse(input);
            let [template] = await tx.query<Row>(
              `SELECT g.entity_id,g.workspace_id,g.entity_type,g.name,g.metadata_json,r.ontology_id
              FROM graph_entity g JOIN entities_raw r ON r.entity_id=g.entity_id AND r.workspace_id=g.workspace_id
              JOIN ontologies o ON o.ontology_id=r.ontology_id AND o.workspace_id=g.workspace_id
              WHERE ${scope.replace(/\b(workspace_id|entity_type|metadata_json)\b/g, "g.$1")} AND g.deprecated_at IS NULL ORDER BY g.entity_id LIMIT 1`,
              [created.workspace_id, created.node_type]
            );
            if (!template) {
              const [declared] = await tx.query<{
                entity_type: string;
                ontology_id: string;
              }>(
                `SELECT t.entity_type,t.ontology_id FROM ontology_entity_types t JOIN ontologies o ON o.ontology_id=t.ontology_id WHERE o.workspace_id=? AND t.entity_type=? ORDER BY t.ontology_id LIMIT 1`,
                [created.workspace_id, created.node_type]
              );
              if (!declared) throw new Error("type_not_found");
              template = {
                entity_id: 0,
                workspace_id: created.workspace_id,
                entity_type: declared.entity_type,
                name: "",
                metadata_json: "{}",
                ontology_id: declared.ontology_id
              };
            }
            const [existing] = await tx.query(
              `SELECT entity_id FROM entities_raw WHERE workspace_id=? AND (external_id=? OR name=?)
              UNION ALL SELECT entity_id FROM graph_entity WHERE workspace_id=? AND name=? LIMIT 1`,
              [
                created.workspace_id,
                created.id,
                created.id,
                created.workspace_id,
                created.id
              ]
            );
            if (existing) throw new Error("id_exists");
            const [allocation] = await tx.query<{ id: number }>(
              `SELECT MAX(COALESCE((SELECT MAX(entity_id) FROM graph_entity),0),
                COALESCE((SELECT MAX(entity_id) FROM entities_raw),0),
                COALESCE((SELECT seq FROM sqlite_sequence WHERE name='entities_raw'),0))+1 AS id`
            );
            const id = Number(allocation.id);
            if (!Number.isInteger(id) || id > 4294967295)
              throw new Error("invalid_id");
            const data = {
              ...created.properties,
              label: created.label,
              ...(template.entity_type === "entity"
                ? { node_type: created.node_type }
                : {})
            };
            const encoded = JSON.stringify(data);
            await tx.query(
              `INSERT INTO entities_raw(workspace_id,ontology_id,entity_id,external_id,entity_type,name,metadata_json) VALUES(?,?,?,?,?,?,?)`,
              [
                created.workspace_id,
                template.ontology_id,
                id,
                created.id,
                template.entity_type,
                created.id,
                encoded
              ]
            );
            await tx.query(
              `INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name,metadata_json) VALUES(?,?,?,?,?)`,
              [
                id,
                created.workspace_id,
                template.entity_type,
                created.id,
                encoded
              ]
            );
            await tx.query(
              `INSERT INTO entity_aliases_raw(workspace_id,entity_id,term) VALUES(?,?,?)`,
              [created.workspace_id, id, created.label]
            );
            await tx.query(
              `INSERT INTO graph_entity_alias(entity_id,term) VALUES(?,?)`,
              [id, created.label]
            );
            await tx.query(
              `INSERT INTO graph_entity_degree(entity_id,name,entity_type,confidence,out_degree,in_degree,total_degree) VALUES(?,?,?,1,0,0,0)`,
              [id, created.id, template.entity_type]
            );
            return {
              created: true,
              node: node((await read(tx, { ...created, id: String(id) }))!)
            };
          }
          const row = await read(tx, input);
          if (!row) {
            if (action === "delete") return { deleted: false, found: false };
            throw new Error("not_found");
          }
          const before = node(row);
          if (
            before.version !==
            ("expected_version" in input ? input.expected_version : "")
          )
            throw new Error("version_conflict");
          if (!row.ontology_id) throw new Error("raw_identity_missing");
          if (action === "update") {
            const update = inputs.update.parse(input);
            const data = { ...metadata(row), ...update.properties };
            if (update.label !== undefined) data.label = update.label;
            const encoded = JSON.stringify(data);
            await tx.query(
              `UPDATE graph_entity SET metadata_json=? WHERE workspace_id=? AND entity_id=?`,
              [encoded, input.workspace_id, row.entity_id]
            );
            await tx.query(
              `UPDATE entities_raw SET metadata_json=? WHERE workspace_id=? AND entity_id=?`,
              [encoded, input.workspace_id, row.entity_id]
            );
            if (update.label !== undefined) {
              await tx.query(
                `DELETE FROM graph_entity_alias WHERE entity_id=? AND term=?`,
                [row.entity_id, before.label]
              );
              await tx.query(
                `DELETE FROM entity_aliases_raw WHERE workspace_id=? AND entity_id=? AND term=?`,
                [input.workspace_id, row.entity_id, before.label]
              );
              await tx.query(
                `INSERT OR IGNORE INTO graph_entity_alias(entity_id,term) VALUES(?,?)`,
                [row.entity_id, update.label]
              );
              await tx.query(
                `INSERT OR IGNORE INTO entity_aliases_raw(workspace_id,entity_id,term) VALUES(?,?,?)`,
                [input.workspace_id, row.entity_id, update.label]
              );
            }
            return { updated: true, node: node((await read(tx, input))!) };
          }
          const id = row.entity_id,
            ws = input.workspace_id;
          const [foreign] = await tx.query(
            `SELECT relation_id FROM graph_relation WHERE (source_id=? OR target_id=?) AND workspace_id<>?
            UNION ALL SELECT relation_id FROM relations_raw WHERE (source_entity_id=? OR target_entity_id=?) AND workspace_id<>? LIMIT 1`,
            [id, id, ws, id, id, ws]
          );
          if (foreign) throw new Error("foreign_relation");
          for (const table of [
            "graph_relation_property",
            "relation_properties_raw"
          ]) {
            const relation =
              table === "graph_relation_property"
                ? `SELECT relation_id FROM graph_relation WHERE workspace_id=? AND (source_id=? OR target_id=?)`
                : `SELECT relation_id FROM relations_raw WHERE workspace_id=? AND (source_entity_id=? OR target_entity_id=?)`;
            await tx.query(
              `DELETE FROM ${table} WHERE relation_id IN (${relation})`,
              [ws, id, id]
            );
          }
          await tx.query(
            `DELETE FROM graph_relation WHERE workspace_id=? AND (source_id=? OR target_id=?)`,
            [ws, id, id]
          );
          await tx.query(
            `DELETE FROM relations_raw WHERE workspace_id=? AND (source_entity_id=? OR target_entity_id=?)`,
            [ws, id, id]
          );
          for (const table of [
            "graph_entity_alias",
            "graph_entity_document",
            "graph_lj_in",
            "graph_lj_out",
            "graph_entity_degree"
          ])
            await tx.query(`DELETE FROM ${table} WHERE entity_id=?`, [id]);
          for (const table of [
            "graph_entity_chunk",
            "entity_aliases_raw",
            "entity_documents_raw",
            "entity_chunks_raw"
          ])
            await tx.query(
              `DELETE FROM ${table} WHERE workspace_id=? AND entity_id=?`,
              [ws, id]
            );
          for (const table of ["graph_rule_evaluations", "graph_rule_events"])
            await tx.query(
              `DELETE FROM ${table} WHERE workspace_id=? AND subject_entity_id=?`,
              [ws, id]
            );
          await tx.query(
            `DELETE FROM graph_entity WHERE workspace_id=? AND entity_id=?`,
            [ws, id]
          );
          await tx.query(
            `DELETE FROM entities_raw WHERE workspace_id=? AND entity_id=?`,
            [ws, id]
          );
          if (!tx.rebuildBusinessAdjacency)
            throw new Error("Native adjacency transaction required");
          await tx.rebuildBusinessAdjacency(ws);
          return { deleted: true, found: true, id: String(id) };
        });
        return createToolSuccessResult(name, {
          workspace_id: input.workspace_id,
          node_type: input.node_type,
          ...result
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        return codes.has(code)
          ? createToolErrorResult(name, code, code)
          : createToolErrorFromException(name, error);
      }
    }
  };
  registerTool(tool);
}
