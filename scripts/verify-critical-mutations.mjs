import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// SQL string mutations preserve placeholders: a binding error is not a proof
// that workspace/type isolation is tested. Each mutant must fail its named test.
const graph = "src/tools/dgraph/business-records.ts";
const records = "src/tools/facets/records.ts";
const graphTest = "tests/tools/business-graph-sqlite.test.ts";
const recordTest = "tests/tools/records-sqlite.test.ts";
const mutations = [
  [
    "graph-workspace-scope",
    graph,
    '"workspace_id = ? AND (CASE',
    '"? IS NOT NULL AND (CASE',
    graphTest,
    "gets only exact business workspace/type/id"
  ],
  [
    "graph-type-scope",
    graph,
    "ELSE entity_type END)=?",
    "ELSE entity_type END) IS NOT NULL AND ? IS NOT NULL",
    graphTest,
    "gets only exact business workspace/type/id"
  ],
  [
    "fact-workspace-scope",
    records,
    "FROM agent_facts WHERE workspace_id = ?",
    "FROM agent_facts WHERE ? IS NOT NULL",
    recordTest,
    "reads only an exact scoped row"
  ],
  [
    "fact-schema-scope",
    records,
    "AND schema_id = ? AND id = ?",
    "AND ? IS NOT NULL AND id = ?",
    recordTest,
    "reads only an exact scoped row"
  ],
  [
    "graph-transaction",
    graph,
    "database.transaction(async (tx) =>",
    "((operation) => operation(database))(async (tx) =>",
    graphTest,
    "rolls back a create if a later alias write fails"
  ],
  [
    "graph-version",
    graph,
    "before.version !==",
    "before.version ===",
    graphTest,
    "updates raw and runtime metadata"
  ],
  [
    "foreign-relation-refusal",
    graph,
    'if (foreign) throw new Error("foreign_relation");',
    "void foreign;",
    graphTest,
    "refuses a deletion with a foreign relation"
  ],
  [
    "transactional-adjacency",
    graph,
    "await tx.rebuildBusinessAdjacency(ws);",
    "void ws;",
    graphTest,
    "deletes raw/runtime rows and aliases"
  ],
  [
    "identity-no-reuse",
    graph,
    "COALESCE((SELECT seq FROM sqlite_sequence WHERE name='entities_raw'),0)",
    "0",
    graphTest,
    "does not recycle deleted record identities"
  ],
  [
    "fact-version",
    "src/tools/facets/upsert.ts",
    "input.expected_version !== undefined &&",
    "false &&",
    recordTest,
    "rejects a stale edit before archive"
  ]
];

const root = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), "ghostcrab-critical-mutations-"));
const receipts = [];
try {
  for (const path of [
    "src",
    "tests",
    "package.json",
    "tsconfig.json",
    "vitest.integrity.config.ts"
  ])
    cpSync(resolve(root, path), join(sandbox, path), { recursive: true });
  mkdirSync(join(sandbox, "vendor/mindbrain/sql"), { recursive: true });
  cpSync(
    resolve(root, "vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"),
    join(sandbox, "vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql")
  );
  symlinkSync(
    resolve(root, "node_modules"),
    join(sandbox, "node_modules"),
    "dir"
  );
  function run(label, testFiles) {
    const reportPath = join(sandbox, `${label}.json`);
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        "vitest.integrity.config.ts",
        "--reporter=json",
        `--outputFile=${reportPath}`,
        ...testFiles
      ],
      {
        cwd: sandbox,
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, GHOSTCRAB_TEST_REQUIRE_SQLITE: "1" }
      }
    );
    if (result.error || result.signal)
      throw new Error(`${label}: runner failed`, { cause: result.error });
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      throw new Error(
        `${label}: no test report: ${result.stderr.slice(-4000)}`
      );
    }
    if (
      !report.numTotalTests ||
      report.numPendingTests ||
      report.numRuntimeErrorTestSuites
    )
      throw new Error(`${label}: incomplete test execution`);
    return { report, exitCode: result.status };
  }
  const baseline = run("baseline", [graphTest, recordTest]);
  if (baseline.exitCode !== 0 || baseline.report.numFailedTests)
    throw new Error("Critical mutation baseline failed");
  console.log(`Baseline: ${baseline.report.numPassedTests} tests passed`);
  for (const [
    id,
    file,
    original,
    replacement,
    testFile,
    expectedTest
  ] of mutations) {
    const path = join(sandbox, file);
    const source = readFileSync(path, "utf8");
    if (source.split(original).length !== 2)
      throw new Error(`${id}: source anchor changed or is ambiguous`);
    try {
      writeFileSync(path, source.replace(original, replacement));
      const { report, exitCode } = run(id, [testFile]);
      const failedTests = report.testResults
        .flatMap((suite) => suite.assertionResults)
        .filter((test) => test.status === "failed");
      if (
        exitCode !== 1 ||
        !failedTests.some((test) => test.fullName.includes(expectedTest))
      )
        throw new Error(
          `${id}: mutation survived or expected invariant did not fail`
        );
      receipts.push({
        id,
        file,
        original,
        replacement,
        detectedBy: failedTests.map((test) => test.fullName)
      });
      console.log(`Detected: ${id} (${expectedTest})`);
    } finally {
      writeFileSync(path, source);
    }
  }
  mkdirSync(resolve(root, "reports/mutation"), { recursive: true });
  writeFileSync(
    resolve(root, "reports/mutation/critical.json"),
    JSON.stringify(
      { baselineTests: baseline.report.numPassedTests, mutations: receipts },
      null,
      2
    ) + "\n"
  );
  console.log(
    `Critical mutations: ${receipts.length}/${mutations.length} detected`
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
