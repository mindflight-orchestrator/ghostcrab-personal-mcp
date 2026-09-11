import { afterEach, describe, expect, it, vi } from "vitest";
import { packTool } from "../../src/tools/pragma/pack.js";
import { createToolContext } from "../helpers/tool-context.js";
import type { DatabaseClient } from "../../src/db/client.js";
describe("exact Pack compatibility boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    {},
    { rows: [] },
    {
      selection_mode: "exact",
      rows: [{ id: "p", scope: "other", status: "active", content: "wrong" }]
    }
  ])(
    "refuses an old or malformed native response without permissive SQL fallback",
    async (response) => {
      const query = vi.fn(async () => {
        throw Error("SQL fallback must not execute");
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(response))
      );
      const context = createToolContext({
        query,
        close: async () => {},
        ping: async () => true,
        transaction: async () => {
          throw Error("No transaction expected");
        }
      } as DatabaseClient);
      const result = await packTool.handler(
        {
          query: "human question",
          scope: "default:plan",
          selection_mode: "exact"
        },
        context
      );
      expect(result).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "exact_selection_unavailable" } }
      });
      expect(query).not.toHaveBeenCalled();
    }
  );
});
