/** Personal memory over the MindBrain SQL session API. No PostgreSQL dependency. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseClient, Queryable } from "../db/client.js";

export const KINDS = [
  "preference",
  "fact",
  "decision",
  "observation",
  "checkpoint",
  "procedure"
] as const;
const identifier = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[\p{L}\p{N}:_./-]+$/u);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  });
export const MemoryInput = z
  .object({
    operation: z.enum([
      "status",
      "recall",
      "get",
      "remember",
      "update",
      "forget"
    ]),
    record_id: identifier.optional(),
    content: z.string().trim().min(1).max(12000).optional(),
    kind: z.enum(KINDS).optional(),
    project: identifier.optional(),
    query: z.string().max(2048).default(""),
    kinds: z.array(z.enum(KINDS)).max(6).optional(),
    limit: z.number().int().min(1).max(12).default(10),
    expected_version: z.number().int().positive().optional(),
    idempotency_key: z.string().min(12).max(200).optional(),
    candidate: z.boolean().optional(),
    valid_until: date.nullable().optional(),
    related_record_ids: z.array(identifier).max(8).optional(),
    source: z
      .object({
        session_id: z.string().min(1).max(200),
        source_id: z.string().min(1).max(200),
        message_id: z.string().max(200).optional()
      })
      .strict()
      .optional(),
    history: z.boolean().default(false),
    purge: z.boolean().default(false)
  })
  .strict();
export type MemoryRequest = z.input<typeof MemoryInput>;
export type MemoryBinding = {
  workspace: string;
  actor: string;
  writable: boolean;
};

type Fact = {
  id: string;
  content: string;
  facets_json: string;
  version: number;
  valid_until_unix: number | null;
  valid_from_unix: number | null;
  updated_at: string;
  source_ref: string;
  doc_id: number;
  supersedes: string | null;
};
const FAMILY = "agent:memory";
const RECEIPT = "agent:memory-receipt";
const CURRENT =
  "(valid_from_unix IS NULL OR valid_from_unix <= unixepoch()) AND (valid_until_unix IS NULL OR valid_until_unix > unixepoch())";
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        )
      : value
  );
const hash = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
export class MemoryError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function bindingFromEnvironment(env: NodeJS.ProcessEnv): MemoryBinding {
  const actor = env.MINDBRAIN_MEMORY_ACTOR,
    tenant = env.MINDBRAIN_MEMORY_TENANT;
  if (!actor || !/^[a-f0-9]{64}$/.test(actor) || !tenant || tenant.length > 180)
    throw new MemoryError("identity_required");
  return {
    workspace: `memory-${hash({ tenant, actor }).slice(0, 40)}`,
    actor,
    writable: env.MINDBRAIN_MEMORY_WRITE === "true"
  };
}
type MemoryFacets = {
  record_id?: string;
  kind?: (typeof KINDS)[number];
  project?: string;
  state?: string;
  related_record_ids?: string[];
  source?: { session_id: string; source_id: string };
  request_hash?: string;
  [key: string]: unknown;
};
const facets = (row: Fact): MemoryFacets => JSON.parse(row.facets_json);
function view(row: Fact) {
  const f = facets(row);
  return {
    id: row.id,
    record_id: f.record_id,
    content: row.content,
    kind: f.kind,
    project: f.project,
    state: f.state,
    version: row.version,
    valid_from: row.valid_from_unix,
    valid_until: row.valid_until_unix,
    source: f.source,
    updated_at: row.updated_at,
    related_record_ids: f.related_record_ids ?? []
  };
}
export class MemoryStore {
  constructor(
    private db: DatabaseClient,
    private binding: MemoryBinding
  ) {}
  async execute(raw: unknown): Promise<Record<string, unknown>> {
    const input = MemoryInput.parse(raw);
    return this.db.transaction(async (q) => {
      // The server supplies a strict SQL-session client: no nontransactional fallback.
      if (input.operation === "status") {
        await q.query("SELECT id FROM agent_facts LIMIT 0");
        await q.query("SELECT rowid FROM search_fts LIMIT 0");
        return {
          status: "ok",
          backend: "mindbrain-personal",
          contract_version: "personal-memory/v1",
          writable: this.binding.writable,
          capabilities: [
            "bm25",
            "exact_filters",
            "related_facts",
            "version_check",
            "idempotency",
            "retract",
            "purge_facts"
          ],
          embeddings: false
        };
      }
      if (input.operation === "recall") return this.recall(q, input);
      if (!input.record_id) throw new MemoryError("record_id_required");
      if (input.operation === "get") {
        const rows = await q.query<Fact>(
          `SELECT * FROM agent_facts WHERE workspace_id=? AND schema_id=?
          AND json_extract(facets_json,'$.record_id')=? AND (? OR (json_extract(facets_json,'$.state') IN ('accepted','candidate') AND ${CURRENT}))
          ORDER BY version DESC, updated_at DESC LIMIT 50`,
          [this.binding.workspace, FAMILY, input.record_id, input.history]
        );
        return {
          status: rows.length ? "ok" : "empty",
          results: rows.map(view)
        };
      }
      if (!this.binding.writable) throw new MemoryError("write_forbidden");
      if (!input.idempotency_key || !input.source)
        throw new MemoryError("mutation_identity_required");
      // Session provenance is not the operation identity: the same retry after restart stays the same operation.
      const { source: _source, ...intent } = input;
      const digest = hash(intent),
        receiptRef = `memory:receipt:${hash(input.idempotency_key)}`;
      const [receipt] = await q.query<Fact>(
        "SELECT * FROM agent_facts WHERE workspace_id=? AND source_ref=? AND schema_id=?",
        [this.binding.workspace, receiptRef, RECEIPT]
      );
      if (receipt) {
        if (facets(receipt).request_hash !== digest)
          throw new MemoryError("idempotency_conflict");
        return { ...JSON.parse(receipt.content), replayed: true };
      }
      const ref = `memory:record:${input.record_id}`;
      const [current] = await q.query<Fact>(
        "SELECT * FROM agent_facts WHERE workspace_id=? AND schema_id=? AND source_ref=?",
        [this.binding.workspace, FAMILY, ref]
      );
      if (input.operation === "remember" && current)
        throw new MemoryError("record_exists");
      if (
        input.operation !== "remember" &&
        (!current || current.version !== input.expected_version)
      )
        throw new MemoryError(
          current ? "version_conflict" : "record_not_found"
        );
      if (input.operation !== "forget" && !input.content)
        throw new MemoryError("content_required");
      const old = current ? facets(current) : {};
      if (input.operation === "update" && old.state === "retracted")
        throw new MemoryError("record_retracted");
      // Keep a monotonic version after purge/recreation: stale pre-purge edits cannot win (ABA).
      const [prior] = await q.query<{ version: number | null }>(
        "SELECT MAX(CAST(json_extract(content,'$.version') AS INTEGER)) AS version FROM agent_facts WHERE workspace_id=? AND schema_id=? AND json_extract(content,'$.record_id')=?",
        [this.binding.workspace, RECEIPT, input.record_id]
      );
      const version = Math.max(current?.version ?? 0, prior?.version ?? 0) + 1,
        kind = input.kind ?? old.kind ?? "fact";
      const f = {
        ...old,
        record_id: input.record_id,
        kind,
        project: input.project ?? old.project ?? "general",
        state:
          input.operation === "forget"
            ? "retracted"
            : (input.candidate ?? old.state === "candidate") ||
                kind === "observation"
              ? "candidate"
              : "accepted",
        source: input.source,
        related_record_ids:
          input.related_record_ids ?? old.related_record_ids ?? []
      };
      if (input.related_record_ids?.includes(input.record_id))
        throw new MemoryError("self_relation");
      for (const id of input.related_record_ids ?? []) {
        const [found] = await q.query(
          `SELECT id FROM agent_facts WHERE workspace_id=? AND schema_id=? AND source_ref=? AND json_extract(facets_json,'$.state')='accepted' AND ${CURRENT}`,
          [this.binding.workspace, FAMILY, `memory:record:${id}`]
        );
        if (!found) throw new MemoryError("related_record_unavailable");
      }
      await q.query(
        "INSERT OR IGNORE INTO workspaces(id,workspace_id,label,created_by) VALUES(?,?,?,?)",
        [
          this.binding.workspace,
          this.binding.workspace,
          "Agent memory",
          this.binding.actor
        ]
      );
      const now = Math.floor(Date.now() / 1000);
      let archivedId: string | null = null;
      if (current && !(input.operation === "forget" && input.purge)) {
        archivedId = randomUUID();
        await this.insert(
          q,
          archivedId,
          `${ref}:version:${current.version}`,
          current.content,
          { ...old, state: "archived", archived_state: old.state },
          current.version,
          current.valid_from_unix,
          now,
          current.supersedes
        );
      }
      if (input.operation === "forget" && input.purge) {
        // Purge all versions and their search/vector copies, but never claim transcript erasure.
        const versions = await q.query<Fact>(
          "SELECT * FROM agent_facts WHERE workspace_id=? AND schema_id=? AND json_extract(facets_json,'$.record_id')=?",
          [this.binding.workspace, FAMILY, input.record_id]
        );
        for (const row of versions) await this.clearIndex(q, row.doc_id);
        await q.query(
          "DELETE FROM agent_facts WHERE workspace_id=? AND schema_id=? AND json_extract(facets_json,'$.record_id')=?",
          [this.binding.workspace, FAMILY, input.record_id]
        );
        const linked = await q.query<Fact>(
          "SELECT * FROM agent_facts WHERE workspace_id=? AND schema_id=? AND EXISTS(SELECT 1 FROM json_each(facets_json,'$.related_record_ids') WHERE value=?)",
          [this.binding.workspace, FAMILY, input.record_id]
        );
        for (const row of linked) {
          const data = facets(row);
          data.related_record_ids = (data.related_record_ids ?? []).filter(
            (id: string) => id !== input.record_id
          );
          await q.query(
            "UPDATE agent_facts SET facets=?, facets_json=? WHERE id=?",
            [JSON.stringify(data), JSON.stringify(data), row.id]
          );
        }
      } else {
        const until =
          input.operation === "forget"
            ? now
            : input.valid_until !== undefined
              ? input.valid_until === null
                ? null
                : Date.parse(input.valid_until) / 1000
              : (current?.valid_until_unix ?? null);
        if (current) {
          await this.clearIndex(q, current.doc_id);
          await q.query(
            `UPDATE agent_facts SET content=?,facets=?,facets_json=?,version=?,supersedes=?,updated_at=CURRENT_TIMESTAMP,
            updated_at_unix=?,valid_until_unix=?,embedding=NULL,embedding_blob=NULL WHERE id=? AND version=?`,
            [
              input.content ?? current.content,
              JSON.stringify(f),
              JSON.stringify(f),
              version,
              archivedId,
              now,
              until,
              current.id,
              current.version
            ]
          );
        } else
          await this.insert(
            q,
            randomUUID(),
            ref,
            input.content!,
            f,
            version,
            now,
            until,
            null
          );
        const [written] = await q.query<Fact>(
          "SELECT * FROM agent_facts WHERE workspace_id=? AND source_ref=?",
          [this.binding.workspace, ref]
        );
        if (
          !written ||
          written.version !== version ||
          facets(written).state !== f.state
        )
          throw new MemoryError("write_verification_failed");
        if (f.state === "accepted") await this.index(q, written);
      }
      const result = {
        status:
          input.operation === "forget"
            ? input.purge
              ? "purged"
              : "retracted"
            : "committed",
        record_id: input.record_id,
        version,
        receipt_id: receiptRef,
        replayed: false
      };
      await this.insert(
        q,
        randomUUID(),
        receiptRef,
        JSON.stringify(result),
        { request_hash: digest },
        1,
        now,
        null,
        null,
        RECEIPT
      );
      return result;
    });
  }
  private async insert(
    q: Queryable,
    id: string,
    ref: string,
    content: string,
    f: Record<string, unknown>,
    version: number,
    from: number | null,
    until: number | null,
    supersedes: string | null,
    schema = FAMILY
  ) {
    await q.query(
      `INSERT INTO agent_facts(id,workspace_id,schema_id,source_ref,content,facets,facets_json,created_by,version,valid_from_unix,valid_until_unix,supersedes,created_at_unix,updated_at_unix)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())`,
      [
        id,
        this.binding.workspace,
        schema,
        ref,
        content,
        JSON.stringify(f),
        JSON.stringify(f),
        this.binding.actor,
        version,
        from,
        until,
        supersedes
      ]
    );
  }
  private async clearIndex(q: Queryable, doc: number) {
    await q.query(
      "DELETE FROM search_fts WHERE rowid IN (SELECT fts_rowid FROM search_fts_docs WHERE table_id=1 AND doc_id=?)",
      [doc]
    );
    await q.query(
      "DELETE FROM search_embeddings WHERE table_id=1 AND doc_id=?",
      [doc]
    );
    await q.query("DELETE FROM search_fts_docs WHERE table_id=1 AND doc_id=?", [
      doc
    ]);
    await q.query(
      "DELETE FROM search_documents WHERE table_id=1 AND doc_id=?",
      [doc]
    );
  }
  private async index(q: Queryable, row: Fact) {
    await q.query(
      "INSERT OR REPLACE INTO search_documents(table_id,doc_id,content,language) VALUES(1,?,?,'auto')",
      [row.doc_id, row.content]
    );
    await q.query(
      "INSERT OR IGNORE INTO search_fts_docs(table_id,doc_id) VALUES(1,?)",
      [row.doc_id]
    );
    await q.query(
      "INSERT INTO search_fts(rowid,content) SELECT fts_rowid,? FROM search_fts_docs WHERE table_id=1 AND doc_id=?",
      [row.content, row.doc_id]
    );
  }
  private async recall(q: Queryable, input: z.output<typeof MemoryInput>) {
    const kinds =
      input.kinds ??
      KINDS.filter((k) => k !== "checkpoint" && k !== "observation");
    // Unicode tokenization and quoted terms: model input cannot become FTS syntax.
    const tokens = input.query.match(/[\p{L}\p{N}_]+/gu) ?? [];
    const expression = tokens
      .slice(0, 64)
      .map((t) => `"${t}"`)
      .join(" OR ");
    const filters = `f.workspace_id=? AND f.schema_id=? AND json_extract(f.facets_json,'$.state')='accepted' AND ${CURRENT}
      AND (? IS NULL OR json_extract(f.facets_json,'$.project')=?) AND json_extract(f.facets_json,'$.kind') IN (SELECT value FROM json_each(?))`;
    const params = [
      this.binding.workspace,
      FAMILY,
      input.project ?? null,
      input.project ?? null,
      JSON.stringify(kinds)
    ];
    let rows: Fact[];
    if (input.query.trim() && !expression) rows = [];
    else if (expression)
      rows = await q.query<Fact>(
        `SELECT f.* FROM search_fts JOIN search_fts_docs d ON d.fts_rowid=search_fts.rowid AND d.table_id=1
      JOIN agent_facts f ON f.doc_id=d.doc_id WHERE search_fts MATCH ? AND ${filters} ORDER BY bm25(search_fts),f.updated_at DESC,f.id LIMIT 40`,
        [expression, ...params]
      );
    else
      rows = await q.query<Fact>(
        `SELECT f.* FROM agent_facts f WHERE ${filters} ORDER BY f.updated_at_unix DESC,f.id LIMIT 40`,
        params
      );
    const selected = rows.slice(0, input.limit).map((r) => ({
      ...view(r),
      reason: expression ? "bm25_and_filters" : "exact_filters"
    }));
    const links = [
      ...new Set(
        rows.slice(0, 4).flatMap((r) => facets(r).related_record_ids ?? [])
      )
    ].slice(0, 16);
    for (const id of links) {
      if (selected.length >= input.limit) break;
      const [r] = await q.query<Fact>(
        `SELECT f.* FROM agent_facts f WHERE ${filters} AND f.source_ref=?`,
        [...params, `memory:record:${id}`]
      );
      if (r && !selected.some((s) => s.id === r.id))
        selected.push({ ...view(r), reason: "related_to_recalled_fact" });
    }
    let budget = 7600;
    const results = selected.flatMap((r) => {
      const content = r.content.slice(0, 1600),
        entry = { ...r, content, truncated: content.length < r.content.length };
      const cost = JSON.stringify(entry).length;
      if (cost > budget) return [];
      budget -= cost;
      return [entry];
    });
    return {
      status: results.length ? "ok" : "empty",
      results,
      search_mode: "bm25_and_facets",
      embeddings: false
    };
  }
}
