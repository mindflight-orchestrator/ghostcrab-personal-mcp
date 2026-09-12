#!/usr/bin/env python3
"""Replay development retrieval on Personal. No generation, publication or provider calls."""
from collections import defaultdict
from datetime import datetime, timezone
import argparse
import gzip
from pathlib import Path
import statistics
import subprocess

from common import REPO, allowed, evidence_metrics, flatten, json_text, load_jsonl, require, sha256
import eli_temporal
import graph
from import_inputs import ROOT, load_inputs, read, verify_fixture, write
import legal
import mixed
from native import DEFAULT_BINARY, Native


def save_trace(out, name, value):
    (out / f'{name}.json.gz').write_bytes(gzip.compress((json_text(value) + '\n').encode(), mtime=0))


def business(inputs, out, binary):
    fixture = ROOT / 'fixtures/graphrag-business-v1'
    manifest = read(fixture / 'manifest.json')
    passages = flatten(load_jsonl(fixture / 'corpus.jsonl'))
    questions = load_jsonl(fixture / 'questions.dev.jsonl')
    require(all(q['context']['workspace_id'] in manifest['split_workspaces']['dev'] for q in questions), 'held-out question')
    frozen = read(inputs / 'business.json.gz')
    groups = defaultdict(list)
    for q in questions:
        groups[json_text(q['context'])].append(q)
    traces, runtimes = [], []
    for group in groups.values():
        context = group[0]['context']
        visible = [p for p in passages if allowed(p, context, manifest['principals'])]
        vectors = {p['id']: frozen['documents'][p['id']] for p in visible}
        topology = graph.build_graph(visible)
        with Native(binary, out / f'business-runtime-{len(runtimes):02}.json') as db:
            db.prepare(visible, vectors, context['workspace_id'])
            db.store_graph([n['id'] for n in topology['nodes']], topology['edges'])
            db.begin_reads()
            for question in group:
                retrieval = db.retrieve(question['question'], frozen['queries'][question['id']])
                baseline = retrieval['hybrid']['ranking'][:8]
                variants = {mode: {'ranking': retrieval[mode]['ranking'][:8]} for mode in ('lexical', 'vector', 'hybrid')}
                variants['full_context'] = {'ranking': [{'id': p['id'], 'score': 1} for p in visible]}
                variants['document_graph'] = graph.expand(visible, topology, question['question'], baseline, 'document_graph')
                anchors = sorted(n['id'] for n in topology['nodes'] if graph.mentions(n['name'], question['question']))
                traversal = {}
                for direction in ('outbound', 'both'):
                    paths = [db.traverse(anchor, direction) for anchor in anchors]
                    candidates = mixed.candidates_from_paths([r for p in paths for r in p['rows']], topology['edges'])
                    combined = mixed.combined_candidates(visible, baseline, candidates)
                    variants[f'entity_graph_{direction}'] = mixed.select(visible, baseline, combined, 'mixed_reserved')
                    if direction == 'both':
                        variants['mixed_rrf'] = mixed.select(visible, baseline, combined, 'mixed_rrf')
                    traversal[direction] = {'paths': paths, 'candidates': combined}
                traces.append({'question_id': question['id'], 'context': context, 'visible_ids': [p['id'] for p in visible],
                               'retrieval': retrieval, 'variants': variants, 'traversal': traversal})
            db.end_reads()
        runtimes.append(db.receipt)
        print(f'business: {len(traces)}/{len(questions)} questions', flush=True)
    # Persist retrieval before loading gold judgments.
    save_trace(out, 'business-retrieval', traces)
    judgments = {j['id']: j for j in load_jsonl(fixture / 'judgments.jsonl')}
    metrics = [{ 'question_id': t['question_id'], 'variants': {
        mode: evidence_metrics(result['ranking'], judgments[t['question_id']]) for mode, result in t['variants'].items()}}
        for t in traces]
    write(out / 'business-metrics.json', metrics)
    summary = {}
    for mode in metrics[0]['variants']:
        scored = [t['variants'][mode] for t in metrics if t['variants'][mode]['claim_coverage'] is not None]
        summary[mode] = {'scored_questions': len(scored), 'complete': sum(t['all_claims_covered'] for t in scored),
                         'mean_claim_coverage': statistics.mean(t['claim_coverage'] for t in scored)}
    return summary, runtimes


class LegalGraph:
    def __init__(self, db, bundles):
        self.db, self.bundles = db, bundles
        nodes, edges = set(), []
        for bundle in bundles:
            a, b, c = [legal.node_id(r) for r in legal.members(bundle)]
            nodes.update((a, b, c))
            for source, target, predicate in [(a, b, 'quotes'), (b, c, 'cites')]:
                edges.append({'source': source, 'target': target, 'predicate': predicate, 'bundle': bundle})
        db.store_graph(sorted(nodes), edges)

    def candidates(self, ranking, passages):
        by_id = {p['id']: p for p in passages}
        selected, traces = {}, []
        for row in ranking[:legal.PARAMETERS['graph_seed_count']]:
            for bundle in self.bundles:
                anchors = [legal.node_id(ref) for ref in legal.members(bundle) if legal.overlap(by_id[row['id']], ref)]
                for anchor in anchors:
                    trace = self.db.traverse(anchor, 'both', 2)
                    reachable = {r['node_id'] for r in trace['rows']}
                    require({legal.node_id(ref) for ref in legal.members(bundle)} <= reachable, 'native proof bundle incomplete')
                    selected[bundle['id']] = bundle
                    traces.append({'seed': row['id'], 'bundle_id': bundle['id'], **trace})
        return list(selected.values()), traces


def legal_arm(name, passages, vectors, queries, corpus, out, binary):
    # Gold spans remain outside retrieval and graph candidate construction.
    questions = [{k: q[k] for k in ('id', 'query')} for q in corpus['questions']]
    raw = [{**p, 'content': p['text']} for p in passages]
    with Native(binary, out / (name + '-runtime.json')) as db:
        db.prepare(passages, vectors, 'legal-pilot')
        topology = LegalGraph(db, corpus['bundles'])
        db.begin_reads()
        traces = []
        for question in questions:
            result = db.retrieve(question['query'], queries[question['id']])
            variants = {}
            for mode in ('lexical', 'vector', 'hybrid'):
                ranking = result[mode]['ranking']
                variants[mode] = legal.select(ranking, raw, 6000)
            bundles, graph_trace = topology.candidates(result['hybrid']['ranking'], passages)
            variants['hybrid_graph'] = legal.select(result['hybrid']['ranking'], raw, 6000, bundles)
            variants['hybrid_enriched_secondary'] = legal.select(result['hybrid']['ranking'], passages, 6000)
            traces.append({'question_id': question['id'], 'retrieval': result, 'variants': variants, 'graph_trace': graph_trace})
        db.end_reads()
    save_trace(out, name + '-retrieval', traces)
    by_id = {p['id']: p for p in passages}
    gold = {q['id']: q['required_spans'] for q in corpus['questions']}
    metrics = [{'question_id': t['question_id'], 'variants': {
        mode: legal.evidence_coverage([by_id[pid] for pid in selection['selected_ids']], gold[t['question_id']])
        for mode, selection in t['variants'].items()}} for t in traces]
    write(out / (name + '-metrics.json'), metrics)
    summary = {}
    for mode in metrics[0]['variants']:
        scored = [t['variants'][mode] for t in metrics if t['variants'][mode]['complete'] is not None]
        summary[mode] = {'scored_questions': len(scored), 'complete': sum(t['complete'] for t in scored),
                         'mean_span_coverage': statistics.mean(t['mean_span_coverage'] for t in scored)}
    print(f'{name}: {len(questions)} questions', flush=True)
    return summary, db.receipt, [t['variants']['lexical'] for t in traces]


def run_legal(inputs, out, binary, embeddings=False):
    data = read(inputs / 'legal.json.gz')
    corpus = read(ROOT / 'fixtures/graphrag-legal-v2/corpus.json')
    legal.validate_corpus(corpus)
    summaries, runtimes, control = {}, [], None
    if embeddings:
        passages = data['variants']['legal_descriptors']['passages']
        arms = {'nomic-local-768': {**data['variants']['legal_descriptors']['vectors'], **data['queries']},
                **read(inputs / 'models.json.gz')}
        views = [(name, passages, {p['id']: mapped[p['id']] for p in passages},
                  {q['id']: mapped[q['id']] for q in corpus['questions']}) for name, mapped in arms.items()]
    else:
        views = [(name, value['passages'], value['vectors'], data['queries']) for name, value in sorted(data['variants'].items())]
    for name, passages, vectors, queries in views:
        for p in passages:
            doc = next(d for d in corpus['documents'] if d['id'] == p['document_id'])
            require(doc['text'][p['start']:p['end']] == p['text'], 'frozen passage source span changed')
        summary, runtime, lexical = legal_arm(name.replace(':', '-'), passages, vectors, queries, corpus, out, binary)
        if embeddings:
            require(control is None or lexical == control, 'lexical control changed across embedding arms')
            control = lexical
        summaries[name] = summary
        runtimes.append({'arm': name, **runtime})
    return summaries, runtimes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('suite', choices=('business', 'legal', 'embeddings', 'temporal', 'all'))
    parser.add_argument('--inputs', type=Path, default=ROOT / 'inputs')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--binary', type=Path, default=DEFAULT_BINARY)
    args = parser.parse_args()
    verify_fixture()
    manifest = None if args.suite == 'temporal' else load_inputs(args.inputs)
    args.out.mkdir(parents=True, exist_ok=False)
    receipt = {'schema': 'personal-graphrag-v1', 'status': 'running', 'suite': args.suite,
               'started_at': datetime.now(timezone.utc).isoformat(), 'source': read(ROOT / 'SOURCE.json'),
               'checkout_commit': subprocess.check_output(['git', '-C', str(REPO), 'rev-parse', 'HEAD'], text=True).strip(),
               'vendor_commit': subprocess.check_output(['git', '-C', str(REPO / 'vendor/mindbrain'), 'rev-parse', 'HEAD'], text=True).strip(),
               'package_version': read(REPO / 'package.json')['version'], 'input_manifest': manifest,
               'code_sha256': {str(p.relative_to(ROOT)): sha256(p.read_bytes()) for p in sorted(ROOT.glob('*.py'))},
               'native_source_sha256': {name: sha256((REPO / 'vendor/mindbrain' / name).read_bytes()) for name in
                    ('sql/sqlite_mindbrain--1.0.0.sql', 'src/standalone/search_sqlite.zig', 'src/standalone/hybrid_search.zig')},
               'protocol': {'split': 'dev', 'generation_evaluated': False, 'product_acl_evaluated': False,
                            'external_graphrag_evaluated': False, 'candidate_pool': 'all visible passages, at most 1000',
                            'lexical_reference': 'SQLite FTS5 unicode61, native query preparation, SQL score reference',
                            'rrf_k': 60, 'vector_weight': 0.5, 'business_top_k': 8, 'legal_source_budget_utf8_bytes': 6000,
                            'bidirectional_graph': 'adapter BFS over native inbound/outbound HTTP calls'},
               'summaries': {}, 'runtimes': {}}
    write(args.out / 'receipt.json', receipt)
    try:
        for suite in ('business', 'legal', 'embeddings', 'temporal') if args.suite == 'all' else (args.suite,):
            if suite == 'temporal':
                fixture = ROOT / 'fixtures/eli-temporal-v1'
                result = eli_temporal.evaluate(read(fixture / 'corpus.json'), read(fixture / 'gold.json'))
                require(result['passed'] == result['total'], 'temporal reference gold mismatch')
                write(args.out / 'temporal-reference.json', result)
                receipt['summaries'][suite] = {'total': result['total'], 'passed': result['passed'], 'native_execution': False}
            else:
                summary, runtime = business(args.inputs, args.out, args.binary) if suite == 'business' else run_legal(
                    args.inputs, args.out, args.binary, suite == 'embeddings')
                receipt['summaries'][suite], receipt['runtimes'][suite] = summary, runtime
            write(args.out / 'receipt.json', receipt)
        receipt['status'] = 'passed'
    except BaseException as exc:
        receipt['status'], receipt['error'] = 'failed', f'{type(exc).__name__}: {exc}'
        raise
    finally:
        receipt['finished_at'] = datetime.now(timezone.utc).isoformat()
        receipt['artifacts_sha256'] = {p.name: sha256(p.read_bytes()) for p in sorted(args.out.iterdir()) if p.name != 'receipt.json'}
        write(args.out / 'receipt.json', receipt)
    print(f'Passed: {args.out / "receipt.json"}')


if __name__ == '__main__':
    main()
