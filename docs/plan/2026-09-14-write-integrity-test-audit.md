# Write integrity and test effectiveness

## Objective

Audit Personal's write operations against observable data guarantees, then harden
the highest-risk gaps exposed by the `ghostcrab_learn` metadata-loss incident.
The existing local fix and its eight SQLite regression cases are the starting
point. No publication, production data mutation, or vendored engine edits are
part of this work.

## Baseline

The default suite after the learn fix passed 836 tests and skipped 15. A fresh V8
run including all `src/**/*.ts` measured 66.55% lines and 55.27% branches.
This measures TypeScript execution by the default suite, not SQL semantics,
native Zig coverage, or every MCP integration scenario.

## Delivery

1. Inventory every catalogued write/model tool and the separate Personal memory
   write operations. Map storage ownership, intended invariants, concrete test
   evidence, and unverified scenarios in a validation report.
2. Require SQLite for the dedicated integrity gate; remove silent success from
   the relevant existing SQLite tests. Keep explicit skips in unsupported local
   environments, with failures when the integrity gate requires prerequisites.
3. Add real-database tests for graph rollback, workspace isolation, and composed
   operations. Generate operation sequences against an independent state model.
4. Add a focused mutation-testing pilot for graph writes. Review survivors and
   distinguish assertion gaps, equivalent mutations, and unsupported SQL/native
   mutation coverage. Keep runtime bounded to the audited code and tests.
5. Add a coverage baseline gate including unimported source files, with separate
   thresholds for critical audited modules. Wire the integrity checks into CI
   and the release validation dependency chain.
6. Validate a business sequence through a disposable native backend and MCP,
   then run the relevant complete tests, typecheck, lint, and build. Record
   commands, counts, limitations, and prioritized remaining work.

## Acceptance

- Removing the existing-node guard must fail a preservation assertion.
- Failure after partial graph writes must leave no committed partial state.
- Same external node names in different workspaces must remain independent.
- Generated sequences must preserve explicitly written metadata after links.
- Missing required SQLite/native prerequisites must fail the relevant gate.
- The report must not label mocks, code inspection, or skipped tests as runtime
  proof, nor describe a mutation score as a guarantee of correctness.

## Status

Completed locally. The audit inventories all 30 catalogued write/model tools and
the separate memory service, fixes the reproduced workspace cleanup atomicity
failure, and adds SQLite/model-based/mutation/native gates. Final measured
evidence and explicit remaining risks are recorded in
`reports/validation/write-integrity-20260914/README.md` and `evidence.json`.
