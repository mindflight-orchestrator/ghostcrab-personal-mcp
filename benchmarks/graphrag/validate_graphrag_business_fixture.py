#!/usr/bin/env python3
"""Validate the pilot's data and evidence contracts; never score a RAG system."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parent / 'fixtures/graphrag-business-v1'
DATA_FILES = ('corpus.jsonl', 'questions.dev.jsonl', 'questions.test.jsonl', 'judgments.jsonl')


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def text(value: object, label: str) -> None:
    require(isinstance(value, str) and bool(value.strip()), f'{label}: expected non-empty text')


def iso_date(value: object, label: str) -> date:
    text(value, label)
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f'{label}: invalid ISO date') from exc
    require(parsed.isoformat() == value, f'{label}: expected YYYY-MM-DD')
    return parsed


def string_list(value: object, label: str, allow_empty: bool = False) -> None:
    require(isinstance(value, list), f'{label}: expected list')
    require(allow_empty or bool(value), f'{label}: empty list')
    for item in value:
        text(item, label)
    require(len(value) == len(set(value)), f'{label}: duplicate value')


def keyed(rows: list, label: str) -> dict:
    result = {}
    for row in rows:
        require(isinstance(row, dict), f'{label}: expected object')
        text(row.get('id'), f'{label}.id')
        require(row['id'] not in result, f'{label}: duplicate id {row["id"]}')
        result[row['id']] = row
    return result


def validate_content(manifest: dict, documents: list, splits: dict, judgments: list) -> dict:
    require(manifest.get('schema_version') == 'graphrag-business-v1', 'unsupported schema_version')
    require(manifest.get('benchmark_status') == 'not_run', 'fixture manifest must not claim benchmark results')
    workspaces = manifest['split_workspaces']
    require(set(workspaces) == {'dev', 'test'}, 'expected dev and test workspace assignments')
    for split, values in workspaces.items():
        string_list(values, f'{split} workspaces')
    require(not set(workspaces['dev']) & set(workspaces['test']), 'workspace leakage between splits')
    all_workspaces = set(workspaces['dev'] + workspaces['test'])
    principals = manifest['principals']
    require(isinstance(principals, dict) and bool(principals), 'missing principals')
    for principal, roles in principals.items():
        text(principal, 'principal')
        string_list(roles, f'{principal} roles')
    all_roles = {role for roles in principals.values() for role in roles}
    string_list(manifest['categories'], 'categories')
    categories = set(manifest['categories'])

    docs = keyed(documents, 'document')
    passages = {}
    for doc_id, doc in docs.items():
        require(set(doc) == {'id', 'workspace_id', 'title', 'published_at', 'visibility', 'passages'}, f'{doc_id}: unexpected document fields')
        require(doc['workspace_id'] in all_workspaces, f'{doc_id}: unknown workspace')
        text(doc['title'], f'{doc_id}.title')
        iso_date(doc['published_at'], f'{doc_id}.published_at')
        string_list(doc['visibility'], f'{doc_id}.visibility')
        require(set(doc['visibility']) <= all_roles, f'{doc_id}: unknown visibility role')
        require(isinstance(doc['passages'], list) and bool(doc['passages']), f'{doc_id}: no passages')
        for passage_id, passage in keyed(doc['passages'], 'passage').items():
            require(set(passage) == {'id', 'text'}, f'{passage_id}: unexpected passage fields')
            require(passage_id not in passages, f'duplicate passage id {passage_id}')
            text(passage['text'], f'{passage_id}.text')
            passages[passage_id] = doc

    queries = {}
    coverage = {}
    for split in ('dev', 'test'):
        coverage[split] = Counter()
        for query_id, query in keyed(splits[split], 'question').items():
            require(query_id not in queries, f'duplicate question id {query_id} across splits')
            require(set(query) == {'id', 'category', 'question', 'context'}, f'{query_id}: unexpected question fields (possible gold leakage)')
            text(query['question'], f'{query_id}.question')
            require(query['category'] in categories, f'{query_id}: unknown category')
            context = query['context']
            require(set(context) == {'workspace_id', 'principal', 'known_at', 'business_at'}, f'{query_id}: unexpected context fields')
            require(context['workspace_id'] in workspaces[split], f'{query_id}: wrong split workspace')
            require(context['principal'] in principals, f'{query_id}: unknown principal')
            iso_date(context['known_at'], f'{query_id}.known_at')
            iso_date(context['business_at'], f'{query_id}.business_at')
            coverage[split][query['category']] += 1
            queries[query_id] = query
        require(set(coverage[split]) == categories, f'{split}: missing category coverage')

    gold = keyed(judgments, 'judgment')
    require(set(gold) == set(queries), 'judgments must cover exactly the question ids')
    for query_id, judgment in gold.items():
        require(set(judgment) == {'id', 'status', 'reference_answer', 'required_claims', 'forbidden_claims', 'response_requirements'}, f'{query_id}: unexpected judgment fields')
        status = judgment['status']
        require(status in {'answered', 'insufficient_evidence', 'conflicting_evidence'}, f'{query_id}: invalid status')
        text(judgment['reference_answer'], f'{query_id}.reference_answer')
        string_list(judgment['forbidden_claims'], f'{query_id}.forbidden_claims')
        string_list(judgment['response_requirements'], f'{query_id}.response_requirements', allow_empty=True)
        claims = judgment['required_claims']
        require(isinstance(claims, list), f'{query_id}: claims must be a list')
        require(status == 'insufficient_evidence' or bool(claims), f'{query_id}: positive/conflicting answer needs supported claims')
        context = queries[query_id]['context']
        cited_docs = set()
        for claim in claims:
            require(isinstance(claim, dict) and set(claim) == {'text', 'evidence_sets'}, f'{query_id}: invalid claim fields')
            text(claim['text'], f'{query_id}.claim')
            alternatives = claim['evidence_sets']
            require(isinstance(alternatives, list) and bool(alternatives), f'{query_id}: no evidence alternatives')
            for refs in alternatives:
                string_list(refs, f'{query_id}.evidence_set')
                for ref in refs:
                    require(ref in passages, f'{query_id}: unknown evidence {ref}')
                    doc = passages[ref]
                    require(doc['workspace_id'] == context['workspace_id'], f'{query_id}: cross-workspace evidence {ref}')
                    require(bool(set(doc['visibility']) & set(principals[context['principal']])), f'{query_id}: unauthorized evidence {ref}')
                    require(doc['published_at'] <= context['known_at'], f'{query_id}: future evidence {ref}')
                    cited_docs.add(doc['id'])
        if status == 'conflicting_evidence':
            require(len(cited_docs) >= 2, f'{query_id}: conflict needs at least two source documents')

    counts = {'documents': len(docs), 'passages': len(passages), 'dev': len(splits['dev']), 'test': len(splits['test']), 'judgments': len(gold)}
    require(manifest['counts'] == counts, 'manifest counts do not match data')
    return {'kind': 'fixture_validation', 'counts': counts, 'categories': coverage, 'system_benchmark_run': False}


def validate_bundle(root: Path) -> dict:
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    require(set(manifest['sha256']) == set(DATA_FILES), 'manifest must hash exactly the four data files')
    data = {}
    for name in DATA_FILES:
        raw = (root / name).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == manifest['sha256'][name], f'{name}: SHA256 mismatch')
        data[name] = [json.loads(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
    return validate_content(manifest, data['corpus.jsonl'], {'dev': data['questions.dev.jsonl'], 'test': data['questions.test.jsonl']}, data['judgments.jsonl'])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    try:
        result = validate_bundle(args.root)
    except (ValueError, KeyError, TypeError, AttributeError, OSError) as exc:
        parser.exit(1, f'Fixture validation failed: {exc}\n')
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
