import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { learnTool } from "../../src/tools/dgraph/learn.js";
import { workspaceDeleteTool } from "../../src/tools/workspace/delete.js";
import { workspaceResetTool } from "../../src/tools/workspace/reset.js";
import {
  createRealSqlite,
  loadSqliteDatabase
} from "../helpers/real-sqlite.js";
import { createToolContext } from "../helpers/tool-context.js";

describe.skipIf(!loadSqliteDatabase())(
  "workspace write integrity on real SQLite",
  () => {
    let fixture: ReturnType<typeof createRealSqlite>;
    let context: ReturnType<typeof createToolContext>;
    const tables = [
      "workspaces",
      "ontologies",
      "graph_entity",
      "graph_entity_alias",
      "graph_relation",
      "entities_raw",
      "relations_raw"
    ];
    const snapshot = () =>
      Object.fromEntries(
        tables.map((table) => [
          table,
          fixture.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
        ])
      );
    const operations = [
      { name: "reset", tool: workspaceResetTool, mode: undefined },
      { name: "hard delete", tool: workspaceDeleteTool, mode: "hard" },
      { name: "soft delete", tool: workspaceDeleteTool, mode: "soft" }
    ];
    beforeEach(async () => {
      fixture = createRealSqlite();
      context = createToolContext(fixture.database);
      for (const workspace_id of ["target-ws", "other-ws"]) {
        await learnTool.handler(
          {
            workspace_id,
            node: {
              id: "n1",
              node_type: "Session",
              label: "Preserve",
              properties: { scenario_id: workspace_id }
            }
          },
          context
        );
        await learnTool.handler(
          {
            workspace_id,
            edge: { source: "n1", target: "n2", label: "REUSES" }
          },
          context
        );
      }
    });
    afterEach(() => fixture?.sqlite.close());

    it.each(operations)(
      "$name refuses protected, missing and unconfirmed targets without writes",
      async ({ tool, mode }) => {
        const before = snapshot();
        for (const [workspace_id, code] of [
          ["default", "protected_workspace"],
          ["missing-ws", "workspace_not_found"]
        ]) {
          const result = await tool.handler(
            { workspace_id, confirm: true, mode },
            context
          );
          expect(result.structuredContent).toMatchObject({
            ok: false,
            tool: tool.definition.name,
            error: { code }
          });
          expect(snapshot()).toEqual(before);
        }
        await expect(
          tool.handler(
            { workspace_id: "target-ws", confirm: false, mode },
            context
          )
        ).rejects.toThrow();
        expect(snapshot()).toEqual(before);
      }
    );

    it.each(operations)(
      "$name rolls back all earlier deletions on failure",
      async ({ tool, mode }) => {
        const before = snapshot();
        fixture.sqlite
          .exec(`CREATE TEMP TRIGGER reject_delete BEFORE DELETE ON graph_entity
      BEGIN SELECT RAISE(ABORT, 'injected cleanup failure'); END`);
        await expect(
          tool.handler(
            { workspace_id: "target-ws", confirm: true, mode },
            context
          )
        ).rejects.toThrow("injected cleanup failure");
        expect(snapshot()).toEqual(before);
      }
    );

    it.each(operations.slice(1))(
      "$name rolls back cleanup when the final workspace change fails",
      async ({ tool, mode }) => {
        const before = snapshot();
        fixture.sqlite
          .exec(`CREATE TEMP TRIGGER reject_workspace BEFORE ${mode === "hard" ? "DELETE" : "UPDATE"} ON workspaces
      BEGIN SELECT RAISE(ABORT, 'injected workspace failure'); END`);
        await expect(
          tool.handler(
            { workspace_id: "target-ws", confirm: true, mode },
            context
          )
        ).rejects.toThrow("injected workspace failure");
        expect(snapshot()).toEqual(before);
      }
    );

    it.each(operations)(
      "$name only clears the requested workspace",
      async ({ tool, mode }) => {
        const before = snapshot();
        const result = await tool.handler(
          { workspace_id: "target-ws", confirm: true, mode },
          context
        );
        expect(result.structuredContent).toMatchObject({
          ok: true,
          tool: tool.definition.name,
          workspace_id: "target-ws"
        });
        if (tool === workspaceResetTool)
          expect(result.structuredContent).toMatchObject({ reset: true });
        else
          expect(result.structuredContent).toMatchObject(
            mode === "soft"
              ? { deleted: false, archived: true, mode: "soft" }
              : {
                  deleted: true,
                  archived: false,
                  mode: "hard",
                  workspace_rows_deleted: 1
                }
          );
        const after = snapshot();
        for (const table of tables.filter(
          (table) => table !== "graph_entity_alias"
        )) {
          expect(
            after[table].filter((row) => row.workspace_id === "other-ws")
          ).toEqual(
            before[table].filter((row) => row.workspace_id === "other-ws")
          );
          if (table !== "workspaces")
            expect(
              after[table].filter((row) => row.workspace_id === "target-ws")
            ).toHaveLength(0);
        }
        const remaining = after.workspaces.find(
          (row) => row.id === "target-ws"
        );
        if (mode === "hard") expect(remaining).toBeUndefined();
        else if (mode === "soft") expect(remaining?.status).toBe("archived");
        else
          expect(remaining).toEqual(
            before.workspaces.find((row) => row.id === "target-ws")
          );
      }
    );
  }
);
