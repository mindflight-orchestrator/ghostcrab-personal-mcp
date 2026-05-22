import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bundlePath = join(
  import.meta.dirname,
  "../../examples/immeuble-demo/bundle.json"
);

describe("immeuble-demo bundle", () => {
  it("matches the audit reference shape and counts", () => {
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      kind: string;
      scope: { workspace_id: string };
      entities_raw: unknown[];
      relations_raw: unknown[];
      ontologies: Array<{ ontology_id: string }>;
    };

    expect(bundle.kind).toBe("ghostcrab_backup_bundle");
    expect(bundle.scope.workspace_id).toBe("immeuble-demo");
    expect(bundle.entities_raw).toHaveLength(32);
    expect(bundle.relations_raw).toHaveLength(33);
    expect(bundle.ontologies[0]?.ontology_id).toBe("immeuble-demo::core");
  });
});
