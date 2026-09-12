# ELI temporal benchmark — synthetic curated facts

This development fixture tests a bounded temporal resolver separately from extraction
and retrieval. Every legislative identity starts with `urn:mindflight:test:legal:`.
These documents are fictional; their rules are not statements of Belgian law.

`corpus.json` contains 16 cases covering the 12 planned scenario families, with
separate incomplete-information variants. `gold.json` contains 31 independently
authored expected results and evidence references. The resolver receives only a
case and query parameters. Expected answers are never used to construct a graph,
select an applicable version, or generate replacement text. Both inputs and gold
were authored in this implementation; this is not an independently reviewed or
held-out evaluation set.

## Resolver contract

Inputs identify a work, source subdivision, language, applicability date and
knowledge date. A transitional rule can also require the date of the relevant
facts. The resolver returns the reconstructed subdivision or an explicit
`repealed`, `not_yet_applicable`, or `indeterminate` state, with source unit references.
Original rule and commencement-clause evidence is retained, together with the
relevant modifying clauses. Source units have content hashes in the RDF export.
These are local subdivision identifiers, not a claim of validated Akoma Ntoso XML.

Supported operations are exact subdivision replacement, unique text replacement,
insertion after a unique anchor, and repeal. Multiple modifications require valid
predecessors; conflicting simultaneous modifications require an explicit order.
Other alinéas are preserved. Publication, effect, knowledge and facts dates are
distinct. The system clock is never used as a hidden default.

Each fixture has dated **completeness assertions** listing known impact records
and their coverage horizon. These are deliberately supplied facts of the synthetic
world, not ELI properties, hidden gold answers, or evidence that a real archive is
complete. Missing coverage, an expired horizon, or a mismatch with the impact
inventory produces indeterminacy. Removing an edge is detectable only because
this independent inventory remains present. Consistently wrong annotations or an
unreported amendment outside the supplied inventory cannot be detected here.

The current resolver is a pure Python reference implementation over curated
records. It does not call an LLM, parse natural-language conditions, reconstruct
arbitrary legislation, select among several base consolidations, or query a native
pg_mindbrain graph. A query already identifies the right work and subdivision;
entity linking and retrieval remain upstream work to evaluate separately.

## ELI representation and validation

`ontology-lock.json` pins official source bytes and all six transitive imports:
ELI 1.4, ELI-I 1.0, ELI-DL 2, its bundled FRBRoo 2.4 draft and CIDOC CRM 6.2.1,
and SKOS. These are chosen research versions, not an assertion of the latest
available versions. ELI-I imports ELI-DL even though draft-legislation scenarios
are outside this benchmark. No ontology is activated in a running system.

The [official ELI reference page](https://op.europa.eu/fr/web/eu-vocabularies/eli)
provides the core ontology. The locked
[ELI-I distribution](https://interoperable-europe.ec.europa.eu/collection/eli-european-legislation-identifier/solution/eli-i/distribution/eli-i-complete-package)
and [ELI-DL distribution](https://interoperable-europe.ec.europa.eu/collection/eli-european-legislation-identifier/solution/eli-ontology-draft-legislation-eli-dl/distribution/eli-dl-v2-complete-distribution)
provide the extensions and bundled dependencies. Upstream files are downloaded
unchanged to a user-chosen cache; they are not vendored. Consult the upstream
distribution terms, including EUPL for the ELI-I package.

The RDF export uses real ELI/ELI-I terms for Work/Expression, subdivisions, source,
target, impact type and applicability date. Operational predicates, replacement
text, knowledge dates and transitional thresholds remain in the local namespace
`urn:mindflight:benchmark:eli-temporal:v1:`. Modification-type individuals are local
concepts, not invented terms in an official namespace. Candidates with unresolved
source, target or effect date remain `local:CandidateImpact` instead of validated
`eli-i:Impact` instances.

`profile.shacl.ttl` is a **local subset profile**, not the official ELI Validator
shape set or a complete OWL consistency check. Validation checks required fields,
cardinalities and datatypes, and rejects undeclared ELI/ELI-I terms. It neither
proves annotation truth nor implies applicability. A local candidate can conform
to its shape while the resolver correctly returns indeterminate.

The Turtle artifact is a standards-mapped inspection export, not the resolver's
input format: it does not serialize the complete operational coverage inventory
or incomplete candidate payloads. RDF round-trip verification proves serialization
preservation, not end-to-end execution from RDF or native graph-engine parity.

## Reproduce

From the repository root, use an isolated environment (Python 3.10+):

```sh
python3 -m venv /tmp/eli-temporal-venv
/tmp/eli-temporal-venv/bin/pip install -r test/fixtures/eli-temporal-v1/requirements.txt
/tmp/eli-temporal-venv/bin/python scripts/eli_temporal_benchmark.py fetch --ontology-cache /tmp/eli-temporal-ontologies
ELI_ONTOLOGY_CACHE=/tmp/eli-temporal-ontologies /tmp/eli-temporal-venv/bin/python -m unittest discover -s scripts/tests -p 'test_eli_temporal*.py' -v
/tmp/eli-temporal-venv/bin/python scripts/eli_temporal_benchmark.py evaluate --ontology-cache /tmp/eli-temporal-ontologies --output /tmp/eli-temporal-result
```

Only installation and explicit `fetch` need network access. Evaluation verifies
cached hashes and the complete import closure offline; altered cache files fail
without being overwritten. The report locks corpus, gold, shapes, ontology lock,
dependency versions and runner source hashes. The core resolver tests alone use
the Python standard library. Full RDF tests require the cache and dependencies;
they do not silently skip if prerequisites are missing.

Keep existing embedding and chunking experiments unchanged. Next steps are
qualification of real Belgian amendment chains, automatic extraction evaluation,
then fair RAG/metadata/graph/relational comparisons under equal information.
