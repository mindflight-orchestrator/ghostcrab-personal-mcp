import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { businessQueryRegisterProposalTool } from "../../src/tools/business-query-learning/register-proposal.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(): DatabaseClient {
  const query: DatabaseClient["query"] = async (sql) => {
    if (sql.includes("ORDER BY updated_at_unix")) return [{ id: "stored" }];
    return [];
  };
  return {
    query,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = { query };
      return operation(queryable);
    }
  };
}

describe("ghostcrab_business_query_register embeddings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the numeric vector so MindBrain indexes the proposal for native search", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            id: "stored",
            doc_id: 17,
            created: true,
            updated: false
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await businessQueryRegisterProposalTool.handler(
      {
        workspace_id: "default",
        accepted_by: "test",
        proposal: {
          proposal_id: "proposal-1",
          capability: {
            capability_id: "capability-1",
            workspace_id: "default",
            business_question: "Which native facts match this request?"
          }
        }
      },
      createToolContext(createMockDatabase(), {
        embeddingsMode: "fake",
        embeddingDimensions: 8
      })
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ embedding_stored: true });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.embedding_blob).toEqual(expect.stringMatching(/^\[/));
    expect(body.embedding).toEqual(
      expect.arrayContaining([expect.any(Number)])
    );
    expect(body.embedding as number[]).toHaveLength(8);
  });
});
