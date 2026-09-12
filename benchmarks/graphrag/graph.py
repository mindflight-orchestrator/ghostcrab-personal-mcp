"""Corpus-specific reference graph extraction; no gold inputs."""
from collections import deque
import re
from common import require, json_text, check_ranking

VARIANTS = ('hybrid_archive', 'document_graph', 'entity_graph_bidirectional', 'entity_graph_directed')

SCHEMA = {
    'id': 'maintenance-pilot-v1',
    'relations': {
        'provided_by': ['Contract', 'Organization'],
        'contract_site': ['Contract', 'Site'],
        'covered_by': ['Equipment', 'Contract'],
        'equipment_site': ['Equipment', 'Site'],
        'member_of': ['Organization', 'Group'],
        'escalation_contact': ['Group', 'Person'],
    },
}


PARAMETERS = {'top_k': 8, 'protected_seeds': 4, 'max_entity_hops': 4,
              'entity_anchors': 'exact_names_in_question',
              'candidate_order': 'hop_distance_then_archive_rank_then_passage_id',
              'document_priority': 5}


def mentions(name, text):
    return re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', text, re.IGNORECASE) is not None


def build_graph(passages):
    """Parse only supported affirmative forms. Unsupported text stays searchable."""
    nodes, edges = {}, []

    def add(passage, predicate, source, target, quote):
        source_type, target_type = SCHEMA['relations'][predicate]
        ids = []
        for kind, name in ((source_type, source), (target_type, target)):
            key = json_text([passage['workspace_id'], SCHEMA['id'], kind, name])
            nodes[key] = {'id': key, 'workspace_id': passage['workspace_id'],
                          'ontology_id': SCHEMA['id'], 'type': kind, 'name': name}
            ids.append(key)
        edges.append({'id': f'edge_{len(edges):04d}', 'source': ids[0], 'target': ids[1],
                      'predicate': predicate, 'passage_id': passage['id'], 'quote': quote})

    for p in sorted(passages, key=lambda row: row['id']):
        text = p['text']
        # Full register-row prefix; no rule recognizes a contract id in isolation.
        m = re.match(r'^(C-\d+) : fournisseur ([^;]+) ; site ([^;]+) ; catégorie ', text)
        if m:
            add(p, 'provided_by', m[1], m[2], m[0])
            add(p, 'contract_site', m[1], m[3], m[0])
        m = re.match(r'^(?:L’ascenseur|La ventilation) (E-\d+) du site (\w+) est couverte? exclusivement par le contrat (C-\d+) ', text)
        if m:
            add(p, 'covered_by', m[1], m[3], m[0])
            add(p, 'equipment_site', m[1], m[2], m[0])
        for m in re.finditer(r'(?:^|\. )(?:Dans [^,]+, )?(\w+) (?:est une filiale du groupe|appartient au groupe) (\w+)', text):
            add(p, 'member_of', m[1], m[2], m[0])
        # The pronoun form is accepted only alongside the explicit contact form.
        m = re.match(r'^Le contact d’escalade du groupe (\w+) est ([^.]+)\.', text)
        if m:
            add(p, 'escalation_contact', m[1], m[2], m[0])
            for other in re.finditer(r'Celui du groupe (\w+) est ([^.]+)\.', text):
                add(p, 'escalation_contact', other[1], other[2], other[0])
    graph = {'schema': SCHEMA, 'nodes': list(nodes.values()), 'edges': edges}
    validate_graph(graph, passages)
    return graph


def validate_graph(graph, passages):
    nodes = {n['id']: n for n in graph['nodes']}
    sources = {p['id']: p for p in passages}
    require(len(nodes) == len(graph['nodes']), 'duplicate graph node')
    require(len({e['id'] for e in graph['edges']}) == len(graph['edges']), 'duplicate graph edge')
    for edge in graph['edges']:
        require(edge['predicate'] in SCHEMA['relations'], 'unknown predicate')
        require(edge['source'] in nodes and edge['target'] in nodes, 'unknown endpoint')
        source, target = nodes[edge['source']], nodes[edge['target']]
        require([source['type'], target['type']] == SCHEMA['relations'][edge['predicate']], 'invalid endpoint types or direction')
        require(edge['passage_id'] in sources, 'missing or unauthorized provenance')
        passage = sources[edge['passage_id']]
        require(source['workspace_id'] == target['workspace_id'] == passage['workspace_id'], 'cross-workspace edge')
        require(source['ontology_id'] == target['ontology_id'] == SCHEMA['id'], 'cross-ontology edge')
        require(bool(edge['quote']) and edge['quote'] in passage['text'], 'quote absent from source')


def graph_candidates(graph, question, directed, max_hops):
    """Bounded BFS; traversing an inverse edge never asserts its inverse as fact."""
    nodes = {n['id']: n for n in graph['nodes']}
    anchors = sorted(nid for nid, node in nodes.items() if mentions(node['name'], question))
    adjacent = {nid: [] for nid in nodes}
    for edge in graph['edges']:
        adjacent[edge['source']].append((edge['target'], edge, 'out'))
        if not directed:
            adjacent[edge['target']].append((edge['source'], edge, 'in'))
    candidates = {}
    # Search each anchor independently so another query anchor cannot hide a path.
    for anchor in anchors:
        queue = deque([(anchor, [])])
        visited = {anchor}
        while queue:
            node, path = queue.popleft()
            if len(path) >= max_hops:
                continue
            for target, edge, direction in adjacent[node]:
                step = {'edge_id': edge['id'], 'traversal': direction,
                        'from': node, 'to': target, 'passage_id': edge['passage_id']}
                next_path = path + [step]
                candidate = {'distance': len(next_path), 'origin': 'entity_path',
                             'anchor': anchor, 'path': next_path}
                previous = candidates.get(edge['passage_id'])
                if previous is None or candidate['distance'] < previous['distance']:
                    candidates[edge['passage_id']] = candidate
                if target not in visited:
                    visited.add(target)
                    queue.append((target, next_path))
    return anchors, candidates


def expand(passages, graph, question, baseline, variant):
    require(variant in VARIANTS, 'unknown expansion variant')
    by_id = {p['id']: p for p in passages}
    check_ranking(baseline, by_id)
    limit, protected = PARAMETERS['top_k'], PARAMETERS['protected_seeds']
    seeds = [r['id'] for r in baseline[:protected]]
    ranks = {r['id']: i for i, r in enumerate(baseline)}
    candidates, anchors = {}, []
    if variant != 'hybrid_archive':
        for seed in seeds:
            for p in passages:
                if p['id'] != seed and p['document_id'] == by_id[seed]['document_id']:
                    candidates.setdefault(p['id'], {'distance': PARAMETERS['document_priority'],
                        'origin': 'same_document', 'seed': seed, 'document_id': p['document_id']})
        if variant.startswith('entity_graph_'):
            anchors, entity_candidates = graph_candidates(graph, question,
                variant == 'entity_graph_directed', PARAMETERS['max_entity_hops'])
            candidates.update(entity_candidates)
        ordered = sorted(candidates, key=lambda pid: (candidates[pid]['distance'], ranks.get(pid, limit), pid))
        ids = list(dict.fromkeys(seeds + ordered + [r['id'] for r in baseline]))[:limit]
    else:
        ids = [r['id'] for r in baseline]
    # Scores denote output positions, not calibrated relevance or truth.
    ranking = [{'id': pid, 'score': 1/(i+1)} for i, pid in enumerate(ids)]
    check_ranking(ranking, by_id)
    return {'ranking': ranking, 'anchors': anchors, 'protected_seeds': seeds,
            'candidate_reasons': candidates, 'context_characters': sum(len(by_id[pid]['content']) for pid in ids),
            'passages': [{k: by_id[pid][k] for k in ('id','document_id','title','text')} for pid in ids],
            'added_ids': sorted(set(ids)-set(ranks)), 'removed_ids': sorted(set(ranks)-set(ids))}
