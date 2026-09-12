# Native knowledge / B1 qualification — 12 September 2026

**Passed for a synthetic real-import fixture and the installed Linux x64 archives.**
The client's exact B1 SQLite, authoritative source and import manifest were not
found in the supplied `../mindbrain-perso` directory. No client proxy application
was identified there. This receipt does not certify that unavailable installation
or claim that its proxy has been edited.

## Exact candidate

- GhostCrab implementation on `main`: `2f4329077c645786aa5ef68acb3919c5dda3f3ee`, version `0.6.9`.
- Native source on `../mindbrain-perso/main`: `bf9e9b5e049bf8a677093cd4f32b63fb2ae18af3`, runtime `1.9.0`.
- `vendor/mindbrain` pins that native commit. Engine changes were authored and tested in the source repository.
- Backend SHA256: `7ecb4b2f6916f4606bd262804731d857a072435cea4ef0e6937deee1eefcbff5`.
- Packaged import CLI SHA256: `41f335b857278903b8bd6b7cb1ddc1fa0d53adb09e8851f329eb2dad3bc42242`.
- [Archive hashes and installed dist fingerprints](artifacts.json).
- [Complete installed MCP receipt](installed-receipt.json).
- [Pack / French / combined compatibility receipt](pack-compatibility.json).
- [Public MCP contract and proxy allowlist](../../../docs/reference/native-knowledge.md).

Both archives reside in `/tmp/b1-local-archives`. The qualified installation is
`/tmp/b1-qualified-install-bqn29_2r`. Only Linux x64 was rebuilt and runtime-tested
for this extension. No remote push, tag creation/update or npm publication occurred.

## Business witnesses

The original question, including accents and punctuation, is preserved:

> Quand l'ordonnance de référé a-t-elle été remise au greffe par mise à disposition ?

Native-required BM25, with embeddings disabled, retrieves the original imported
fact `facet_fddd89606d1d2643b15cc66e79c38f09`, version 1, source reference
`assertion:asrt_884ffc127f6a`. Schema/facet filters apply before `limit:1`.
The returned qualified reference resolves the actual imported graph identity.

The direct-support read follows inbound `SUPPORTS`, then inbound
`CONTAINS_PASSAGE`. It returns the actual edges and `evidence_ref:null`.
The verified synthetic excerpt is `le 13.04.2023 à 16 heures.`; its SHA256 is
`1b260557524b56a395f875421c80654ee99b68e5e674c3e82ca502ca4c9f4912`.
This excerpt was explicitly imported as native source text, not reconstructed from
an external ledger or inferred from a hash.

A separate versioned enrichment imports `evidence:derived-v1` with derivation
provenance. Its declared path uses `HAS_EVIDENCE`, `CITES_PASSAGE`, and
`CONTAINS_PASSAGE`, preserving the direct-support path. Pagination returns that
real Evidence object. Reimport in `ignore-duplicates` mode adds no nodes or claims.
The command also runs administrative schema initialization and graph reindexing;
its recorded changes to timestamps/derived rows are preparation writes, not reads.

The real MCP controls cover absent IDs, wrong workspace/ontology, ambiguous names,
an unrelated lexical query, a wrong excerpt hash, a missing source snapshot, and
an invalidated cursor. Separate upsert insert/update phases prove that the current
fact keeps its identity, becomes searchable immediately, and loses obsolete terms.
Native tests additionally cover numeric-string identities, wrong kinds, scoped
idempotent reconciliation, transaction rollback, inactive history, UTF-8 byte and
Unicode-codepoint boundaries, source versions and natural-key collision rejection.

## SQLite effects and transport

All **17 business read calls** preserve every table and the SQLite schema digest.
Each call records its before/after digest and `changed_tables:[]`. Native engine
transport observations contain only the dedicated retrieval/evidence endpoints
and capability probes for those calls. The test client uses MCP `tools/list` and
`tools/call`; it does not reconstruct results with SQL or native HTTP.

Administrative preparation uses the native structured importer and graph reindexer.
It never writes FTS or derived graph rows directly. Diagnostic SQLite connections
are read-only. Import, native startup, MCP startup, upsert mutations and enrichment
are recorded as separate phases. Native startup changes `workspaces`; MCP startup
changes no tables in this prepared fixture. The Pack compatibility receipt records
its own preparation/startup effects and zero changes for its subsequent reads.

## Validation

| Surface | Result |
| --- | --- |
| `zig build test --summary all` in native source | 454/454 passed |
| `pnpm test` | 803 passed, 15 skipped; 92 passing files |
| Vitest integration/e2e on owned backend and fresh SQLite | 104/104 passed |
| TypeScript build/typecheck | Passed |
| ESLint on changed code/test files | Passed |
| Real MCP installed candidate | 17 business reads passed; zero SQLite changes |
| Exact Pack / French / resolved combined-value seed replay | Passed |
| Installed read permission preset | Evidence allowed; reindex requires write approval |
| Installed CLI/backend/document smoke | Passed |

The integration harness used a random loopback port and an owned disposable
backend. The installed runtime and dist hashes match the compiled checkout.
`npm install --offline` installed both archives from local files. npm's local
`allow-scripts` policy deferred automatic postinstall; binary preparation and the
CLI/backend/document smoke were invoked explicitly. Global PATH/configuration and
upgrade hooks were not exercised by this isolated qualification.

## Replay

```sh
node scripts/verify-native-knowledge.mjs \
  --root /tmp/b1-qualified-install-bqn29_2r/node_modules/@mindflight/ghostcrab-personal-mcp \
  --binary /tmp/b1-qualified-install-bqn29_2r/node_modules/@mindflight/ghostcrab-personal-mcp-linux-x64/bin/ghostcrab-backend \
  --importer /tmp/b1-qualified-install-bqn29_2r/node_modules/@mindflight/ghostcrab-personal-mcp-linux-x64/bin/ghostcrab-document \
  --output /tmp/b1-new-receipt.json
```

Every run creates a new temporary SQLite and its CSV/mapping inputs. The completed
run's directory is recorded in `installed-receipt.json`. Qualifying the exact client
case still requires its seed, authoritative source/version and mapping; adapting
its deployed proxy requires identifying that source checkout. The implemented MCP
contract supplies the required interface without introducing a new proxy gateway.
