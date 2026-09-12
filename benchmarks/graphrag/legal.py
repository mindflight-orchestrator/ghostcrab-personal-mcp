"""Frozen legal evidence and context selection protocol, not legal advice."""
from common import require, sha256

VARIANTS = ('technical_raw', 'technical_context', 'legal_context', 'legal_descriptors', 'legal_graph')


PARAMETERS = {'chunk_characters': 1200, 'context_max_bytes': 60000,
              'context_budget_utf8_bytes': 6000, 'graph_seed_count': 2,
              'vector_weight': 0.5, 'rrf_k': 60, 'context_model': 'ornith-1.5:35b',
              'embedding_model': 'nomic-embed-text:latest', 'temperature': 0,
              'num_predict': 512, 'num_ctx': 32768}


def overlap(a, b):
    return a['document_id'] == b['document_id'] and max(a['start'], b['start']) < min(a['end'], b['end'])


def members(bundle):
    return [bundle[k] for k in ('source', 'quotation', 'target')]


def validate_corpus(corpus):
    require(corpus['split'] == 'dev' and not corpus['independent_test_available'], 'pilot is development only')
    docs = {d['id']: d for d in corpus['documents']}
    require(len(docs) == len(corpus['documents']), 'duplicate document')
    for doc in docs.values():
        require(sha256(doc['text'].encode()) == doc['text_sha256'], 'canonical text hash mismatch')
        previous = 0
        for unit in doc['units']:
            require(previous <= unit['start'] < unit['end'] <= len(doc['text']), 'invalid unit span')
            previous = unit['end']
        require(len({u['eid'] for u in doc['units']}) == len(doc['units']), 'duplicate unit')
    def valid_span(ref):
        require(ref['document_id'] in docs, 'unknown evidence document')
        units = docs[ref['document_id']]['units']
        require({k: ref[k] for k in ('eid', 'start', 'end')} in units, 'unknown or altered evidence span')
    for bundle in corpus['bundles']:
        require(bundle['predicate'] == 'cites' and bundle['assertion_status'] == 'explicit_reference', 'invalid citation predicate')
        require(bundle['historical_applicability_verified'] is False, 'historical applicability is not established')
        for ref in members(bundle):
            valid_span(ref)
        require(bundle['source']['document_id'] == bundle['quotation']['document_id'], 'quotation must belong to citation source')
        target = docs[bundle['target']['document_id']]
        require(bundle['target_expression_uri'] == target['expression'], 'wrong target expression')
    require(len({q['id'] for q in corpus['questions']}) == len(corpus['questions']), 'duplicate question')
    for question in corpus['questions']:
        require(question['split'] == 'dev', 'mixed evaluation splits')
        for ref in question['required_spans']:
            valid_span(ref)


def chunks(documents, legal, size=PARAMETERS['chunk_characters']):
    require(size > 0, 'chunk size must be positive')
    result = []
    for doc in documents:
        intervals = [(u['start'], u['end']) for u in doc['units']] if legal else [(0, len(doc['text']))]
        index = 0
        for begin, end in intervals:
            for start in range(begin, end, size):
                stop = min(start + size, end)
                result.append({'id': f"{'legal' if legal else 'technical'}:{doc['id']}:{index:04d}",
                               'document_id': doc['id'], 'start': start, 'end': stop,
                               'index': index, 'text': doc['text'][start:stop]})
                index += 1
    return result


def serialize(selected):
    return '\n\n'.join(f'[{p["id"]}]\n{p["content"]}' for p in selected)


def select(ranking, passages, budget, bundles=()):
    require(budget > 0, 'context budget must be positive')
    by_id = {p['id']: p for p in passages}
    selected, selected_ids, events = [], set(), []
    rank_ids = [r['id'] for r in ranking]
    require(len(rank_ids) == len(set(rank_ids)) and set(rank_ids) <= set(by_id), 'invalid ranking')
    bundle_candidates = []
    for bundle in bundles:
        refs = members(bundle)
        candidates = [by_id[pid] for pid in rank_ids if any(overlap(by_id[pid], ref) for ref in refs)]
        require(evidence_coverage(candidates, refs)['complete'], 'incomplete graph proof bundle')
        bundle_candidates.append((bundle, candidates))
    for row in ranking:
        passage = by_id[row['id']]
        if passage['id'] in selected_ids:
            continue
        group = [passage]
        event = None
        for bundle, candidates in bundle_candidates:
            if passage['id'] in rank_ids[:PARAMETERS['graph_seed_count']] and any(overlap(passage, ref) for ref in members(bundle)):
                group = [p for p in candidates if p['id'] not in selected_ids]
                event = {'bundle_id': bundle['id'], 'seed': passage['id']}
                break
        fits = len(serialize(selected + group).encode()) <= budget
        if event:
            events.append({**event, 'accepted': fits, 'candidate_ids': [p['id'] for p in group]})
        if not fits:
            # Keep ordinary retrieval available; no partial graph bundle inserted.
            group = [passage]
        if len(serialize(selected + group).encode()) <= budget:
            selected.extend(group)
            selected_ids.update(p['id'] for p in group)
    return {'selected_ids': [p['id'] for p in selected], 'context_utf8_bytes': len(serialize(selected).encode()),
            'graph_events': events}


def evidence_coverage(passages, refs):
    if not refs:
        return {'complete': None, 'mean_span_coverage': None, 'per_span': [], 'abstention_evaluated': False}
    coverage = []
    for ref in refs:
        intervals = sorted((max(p['start'], ref['start']), min(p['end'], ref['end']))
                           for p in passages if overlap(p, ref))
        count, cursor = 0, ref['start']
        for begin, end in intervals:
            count += max(0, end - max(cursor, begin))
            cursor = max(cursor, end)
        coverage.append(count/(ref['end']-ref['start']))
    return {'complete': all(c == 1 for c in coverage), 'mean_span_coverage': sum(coverage)/len(coverage),
            'per_span': coverage, 'abstention_evaluated': False}


def node_id(ref):
    return ref['document_id'] + '#' + ref['eid']
