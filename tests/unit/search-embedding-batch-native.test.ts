/** Native contract test for the TypeScript orchestration to Zig batch boundary. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../src/config/env.js";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../src/db/client.js";
import { runStandaloneSearchEmbeddingBatchUpsert } from "../../src/db/standalone-mindbrain.js";

const binary = process.env.MINDBRAIN_TEST_BINARY;

describe.skipIf(!binary)("native embedding batch boundary", () => {
  let child: ChildProcess;
  let database: DatabaseClient;
  let directory: string;
  let url: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "embedding-batch-native-"));
    const net = createServer();
    await new Promise<void>((resolve) => net.listen(0, "127.0.0.1", resolve));
    const port = (net.address() as { port: number }).port;
    await new Promise<void>((resolve) => net.close(() => resolve()));
    url = `http://127.0.0.1:${port}`;
    child = spawn(
      binary!,
      ["--db", join(directory, "batch.sqlite"), "--addr", `127.0.0.1:${port}`],
      { stdio: "ignore" }
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(url + "/health")).ok) break;
      } catch {
        // The test-owned Zig backend is still binding its socket.
      }
      if (attempt === 99)
        throw new Error("Native embedding test backend did not start");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    database = createDatabaseClient({
      ...resolveGhostcrabConfig(),
      mindbrainUrl: url,
      mindbrainHttpTimeoutMs: 5_000
    });
  }, 15_000);

  afterAll(async () => {
    await database?.close();
    if (child?.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("persists one provider batch through the Zig transaction", async () => {
    await database.query(
      "INSERT INTO search_documents(table_id,doc_id,content,language) VALUES (1,101,'one','english'),(1,102,'two','english')"
    );

    await expect(
      runStandaloneSearchEmbeddingBatchUpsert({
        mindbrainUrl: url,
        items: [
          { tableId: 1, docId: 101, embedding: [0.1, 0.2, 0.3] },
          { tableId: 1, docId: 102, embedding: [0.3, 0.2, 0.1] }
        ]
      })
    ).resolves.toEqual({ ok: true, processed: 2, dimensions: 3 });

    expect(
      await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM search_embeddings WHERE table_id=1"
      )
    ).toEqual([{ count: 2 }]);
  });
});
