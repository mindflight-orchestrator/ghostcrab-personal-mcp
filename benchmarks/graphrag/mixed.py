"""Frozen mixed retrieval policies and native provenance reconstruction."""
from collections import defaultdict
from common import require, rrf, check_ranking

VARIANTS = ('hybrid_archive', 'mixed_reserved', 'mixed_rrf')

PARAMETERS = {'top_k': 8, 'protected_seeds': 4, 'max_hops': 4, 'rrf_k': 60,
              'graph_weight': 0.5, 'document_priority': 5,
              'candidate_order': 'distance_then_archive_rank_then_id'}


def candidate_key(candidate):
    return (candidate['distance'], candidate['anchor'],
            tuple(step['edge_id'] for step in candidate['path']))


def candidates_from_paths(rows, edges):
    """Reattach native paths to stored edge provenance without guessing predicates."""
    by_pair = defaultdict(list)
    for edge in edges:
        by_pair[edge['source'], edge['target']].append(edge)
    for group in by_pair.values():
        group.sort(key=lambda e: e['id'])
    candidates = {}
    for row in rows:
        names = row['path']
        require(row['depth'] == len(names)-1 and names[0] == row['anchor'], 'invalid native path')
        path = []
        for index, (source, target) in enumerate(zip(names, names[1:])):
            forward = by_pair.get((source, target))
            backward = by_pair.get((target, source))
            require(bool(forward) != bool(backward), 'ambiguous or missing native edge')
            group, direction = (forward, 'out') if forward else (backward, 'in')
            # Multiple source passages for the same fact are preserved. At an
            # intermediate step the earliest edge matches the reference BFS.
            final = index == len(names)-2
            if final:
                require(all(e['predicate'] == row['edge_label'] for e in group), 'native predicate mismatch')
            for edge in group if final else group[:1]:
                step = {'edge_id': edge['id'], 'traversal': direction, 'from': source,
                        'to': target, 'passage_id': edge['passage_id']}
                if final:
                    candidate = {'distance': len(names)-1, 'origin': 'entity_path',
                                 'anchor': row['anchor'], 'path': path+[step]}
                    previous = candidates.get(edge['passage_id'])
                    if previous is None or candidate_key(candidate) < candidate_key(previous):
                        candidates[edge['passage_id']] = candidate
                else:
                    path.append(step)
    return candidates


def combined_candidates(passages, baseline, entity_candidates):
    by_id = {p['id']: p for p in passages}
    check_ranking(baseline, by_id)
    candidates = {}
    for row in baseline[:PARAMETERS['protected_seeds']]:
        seed = row['id']
        for passage in passages:
            if passage['id'] != seed and passage['document_id'] == by_id[seed]['document_id']:
                candidates.setdefault(passage['id'], {'distance': PARAMETERS['document_priority'],
                    'origin': 'same_document', 'seed': seed, 'document_id': passage['document_id']})
    candidates.update(entity_candidates)
    require(set(candidates) <= set(by_id), 'unauthorized graph candidate')
    return candidates


def select(passages, baseline, candidates, variant):
    require(variant in VARIANTS, 'unknown mixed policy')
    by_id = {p['id']: p for p in passages}
    check_ranking(baseline, by_id)
    require(set(candidates) <= set(by_id), 'unauthorized mixed candidate')
    ranks = {r['id']: i for i,r in enumerate(baseline)}
    limit = PARAMETERS['top_k']
    order = sorted(candidates, key=lambda pid: (candidates[pid]['distance'], ranks.get(pid, limit), pid))
    graph_rank = [{'id': pid, 'score': 1/(i+1)} for i,pid in enumerate(order)]
    if variant == 'hybrid_archive':
        ranking = baseline
    elif variant == 'mixed_reserved':
        ids = list(dict.fromkeys([r['id'] for r in baseline[:PARAMETERS['protected_seeds']]] + order + list(ranks)))[:limit]
        ranking = [{'id': pid, 'score': 1/(i+1)} for i,pid in enumerate(ids)]
    else:
        ranking = rrf(baseline, graph_rank, PARAMETERS['graph_weight'], PARAMETERS['rrf_k'])[:limit]
    check_ranking(ranking, by_id)
    ids = [r['id'] for r in ranking]
    return {'ranking': ranking, 'graph_ranking': graph_rank,
            'context_characters': sum(len(by_id[pid]['content']) for pid in ids),
            'passages': [{k: by_id[pid][k] for k in ('id','document_id','title','text')} for pid in ids],
            'added_ids': sorted(set(ids)-set(ranks)), 'removed_ids': sorted(set(ranks)-set(ids))}
