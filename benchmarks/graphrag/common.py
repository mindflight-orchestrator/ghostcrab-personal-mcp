"""Adapted pure reference helpers from pg_mindbrain research, see SOURCE.json."""
from collections import Counter
import hashlib, json, math, statistics
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]

def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True)


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]


def allowed(passage, context, principals):
    return (passage['workspace_id'] == context['workspace_id']
            and passage['published_at'] <= context['known_at']
            and bool(set(passage['visibility']) & set(principals[context['principal']])))


def flatten(documents):
    result = []
    for doc in documents:
        for passage in doc['passages']:
            result.append({
                'id': passage['id'], 'document_id': doc['id'],
                'workspace_id': doc['workspace_id'], 'published_at': doc['published_at'],
                'visibility': doc['visibility'], 'title': doc['title'], 'text': passage['text'],
                'content': doc['title'] + '\n' + passage['text'],
            })
    return sorted(result, key=lambda p: p['id'])


def validate_vectors(vectors, expected_count, dimension=None):
    require(isinstance(vectors, list) and len(vectors) == expected_count, 'embedding count mismatch')
    for vector in vectors:
        require(isinstance(vector, list) and bool(vector), 'empty embedding')
        if dimension is None:
            dimension = len(vector)
        require(len(vector) == dimension, 'embedding dimension mismatch')
        require(all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in vector), 'non-finite or invalid embedding')
        require(sum(x*x for x in vector) > 0, 'zero embedding')
    return dimension


def cosine_rank(visible, vectors, query_vector):
    qnorm = math.sqrt(sum(x*x for x in query_vector))
    result = []
    for passage in visible:
        vector = vectors[passage['id']]
        require(len(vector) == len(query_vector), 'cosine dimension mismatch')
        score = sum(x*y for x,y in zip(vector, query_vector))/(qnorm*math.sqrt(sum(x*x for x in vector)))
        result.append({'id': passage['id'], 'score': score})
    return sorted(result, key=lambda row: (-row['score'], row['id']))


def rrf(lexical, semantic, weight, k=60):
    scores = Counter()
    for ranking, multiplier in ((lexical, 1-weight), (semantic, weight)):
        for rank, row in enumerate(ranking, 1):
            scores[row['id']] += multiplier/(k+rank)
    return [{'id': pid, 'score': score} for pid,score in sorted(scores.items(), key=lambda item: (-item[1],item[0]))]


def check_ranking(ranking, visible_ids):
    ids = [row['id'] for row in ranking]
    require(len(ids) == len(set(ids)), 'adapter returned duplicate passage ids')
    require(set(ids) <= set(visible_ids), 'adapter exposed an unknown, unauthorized or future passage')
    require(all(isinstance(row['score'], (float,int)) and math.isfinite(row['score']) for row in ranking), 'adapter returned an invalid score')


def evidence_metrics(ranking, judgment):
    retrieved = {row['id'] for row in ranking}
    claims = judgment['required_claims']
    if not claims:
        return {'claim_coverage': None, 'mean_claim_evidence_recall': None, 'annotated_passage_precision': None, 'all_claims_covered': None, 'generation_evaluated': False}
    covered, fractional, annotated = [], [], set()
    for claim in claims:
        alternatives = [set(refs) for refs in claim['evidence_sets']]
        require(all(alternatives), 'empty evidence set')
        covered.append(any(refs <= retrieved for refs in alternatives))
        fractional.append(max(len(refs & retrieved)/len(refs) for refs in alternatives))
        annotated.update(set.union(*alternatives))
    return {'claim_coverage': sum(covered)/len(covered), 'mean_claim_evidence_recall': statistics.mean(fractional), 'annotated_passage_precision': len(retrieved & annotated)/len(retrieved) if retrieved else 0.0, 'all_claims_covered': all(covered), 'generation_evaluated': False}
