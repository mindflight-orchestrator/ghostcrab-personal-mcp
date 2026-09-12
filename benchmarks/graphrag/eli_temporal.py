#!/usr/bin/env python3
"""Bounded temporal resolver for curated synthetic facts, not legal advice/extraction.

Inputs and gold answers are separate. Completeness is an explicit, time-stamped
fixture assertion, never inferred from absence of edges. No current system date.
"""
from __future__ import annotations

from datetime import date
import hashlib
import json

PREFIX = 'urn:mindflight:test:legal:'
OPERATIONS = {'replace', 'replace_text', 'insert_after', 'repeal'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def day(value):
    require(isinstance(value, str) and len(value) == 10, 'ISO date required')
    result = date.fromisoformat(value)
    require(result.isoformat() == value, 'canonical ISO date required')
    return result


def digest(value):
    return hashlib.sha256(value).hexdigest()


def unique(rows):
    """Identical repeated records are idempotent; conflicting identities fail."""
    result = {}
    for row in rows:
        key = row['id']
        require(key.startswith(PREFIX), 'synthetic URN required')
        require(key not in result or result[key] == row, 'conflicting duplicate identity')
        result[key] = row
    return result


def validate_case(case):
    require(case['synthetic'] is True, 'only synthetic fixtures supported')
    require('gold' not in case and 'expected' not in case, 'gold must be separate')
    docs, impacts = unique(case['documents']), unique(case['impacts'])
    for doc in docs.values():
        require(doc['work'].startswith(PREFIX), 'synthetic work required')
        require(doc['language'] in ('fra', 'nld'), 'unsupported language')
        require(day(doc['published']) <= day(doc['known_from']), 'known before publication')
        require(doc['kind'] in ('base', 'amending', 'citation'), 'unsupported document kind')
        require(bool(doc['units']), 'empty document')
        require(all(isinstance(k, str) and k and isinstance(v, str) and v
                    for k, v in doc['units'].items()), 'invalid source units')
        if doc['kind'] == 'base':
            day(doc['effective'])
            require(doc['timing_unit'] in doc['units'], 'missing base timing evidence')
    for impact in impacts.values():
        require(impact['kind'] in ('amendment', 'cites'), 'unsupported relation kind')
        require(impact['target_work'].startswith(PREFIX), 'synthetic target required')
        require(impact['language'] in ('fra', 'nld'), 'unsupported impact language')
        require(isinstance(impact['reviewed'], bool), 'review status must be boolean')
        require(isinstance(impact['targets'], list) and
                all(isinstance(t, str) and t for t in impact['targets']), 'invalid targets')
        day(impact['known_from'])
        if impact['effective'] is not None:
            day(impact['effective'])
        require(impact['operation'] in OPERATIONS or impact['kind'] == 'cites',
                'unsupported operation')
        if impact.get('facts_from') is not None:
            day(impact['facts_from'])
        require(isinstance(impact['requires'], list) and
                all(r.startswith(PREFIX) for r in impact['requires']), 'invalid predecessors')
        for field in ('old', 'new'):
            require(isinstance(impact[field], str), 'text patch must be a string')
        if impact['operation'] in ('replace_text', 'insert_after'):
            require(bool(impact['old']), 'empty patch anchor')
        source = docs.get(impact['source'])
        # Missing sources/targets are resolution failures, not invented facts.
        if source:
            require(impact['source_unit'] in source['units'], 'missing source unit')
            require(source['language'] == impact['language'], 'source language mismatch')
            require(day(source['known_from']) <= day(impact['known_from']),
                    'impact known before source')
    for coverage in case['coverage']:
        require(coverage['work'].startswith(PREFIX), 'synthetic coverage work required')
        require(coverage['language'] in ('fra', 'nld'), 'unsupported coverage language')
        day(coverage['known_from'])
        day(coverage['through'])
        require(isinstance(coverage['impacts'], list) and
                all(i.startswith(PREFIX) for i in coverage['impacts']), 'invalid inventory')
    return docs, impacts


def resolve(case, query):
    """Resolve a single identified subdivision; retrieval/entity linking is upstream."""
    docs, impacts = validate_case(case)
    at, known = day(query['at']), day(query['known_at'])
    facts = day(query['facts_date']) if query.get('facts_date') else None
    work, language, target = query['work'], query['language'], query['unit']
    proof = set()

    def answer(status, text=None, reason=None):
        return dict(status=status, text=text, reason=reason,
                    evidence=[dict(document=d, unit=u) for d, u in sorted(proof)])

    def unknown(reason):
        return answer('indeterminate', reason=reason)

    bases = [d for d in docs.values() if d['kind'] == 'base' and
             d['work'] == work and d['language'] == language and
             day(d['known_from']) <= known]
    if len(bases) != 1 or target not in bases[0]['units']:
        return unknown('base_or_target_unresolved')
    base = bases[0]
    proof.add((base['id'], target))
    proof.add((base['id'], base['timing_unit']))
    inventories = [c for c in case['coverage'] if c['work'] == work and
                   c['language'] == language and day(c['known_from']) <= known]
    if not inventories:
        return unknown('coverage_missing')
    latest = max(c['known_from'] for c in inventories)
    inventories = [c for c in inventories if c['known_from'] == latest]
    if any(c != inventories[0] for c in inventories):
        return unknown('coverage_conflict')
    coverage = inventories[0]
    if day(coverage['through']) < at:
        return unknown('coverage_expired')
    visible = {i['id']: i for i in impacts.values() if i['target_work'] == work and
               i['language'] == language and day(i['known_from']) <= known}
    if set(coverage['impacts']) != set(visible):
        return unknown('inventory_mismatch')

    applicable = {}
    for impact in visible.values():
        if impact['kind'] == 'cites':
            source = docs.get(impact['source'])
            if source and source['kind'] != 'citation':
                return unknown('relation_source_mismatch')
            continue
        if impact['targets'] and target not in impact['targets']:
            continue
        # An unknown date/target can affect any requested historical version.
        if impact['effective'] is None:
            return unknown('effective_date_unknown')
        if day(impact['effective']) > at:
            continue
        if not impact['reviewed']:
            return unknown('impact_unreviewed')
        if impact['targets'] != [target]:
            return unknown('target_ambiguous')
        source = docs.get(impact['source'])
        if source is None or day(source['known_from']) > known:
            return unknown('source_missing')
        if source['kind'] != 'amending':
            return unknown('relation_source_mismatch')
        proof.add((source['id'], impact['source_unit']))
        if impact.get('facts_from'):
            if facts is None:
                return unknown('facts_date_missing')
            if facts < day(impact['facts_from']):
                continue
        applicable[impact['id']] = impact

    if at < day(base['effective']):
        if applicable:
            return unknown('impact_precedes_base')
        return answer('not_yet_applicable')
    # All prerequisites must participate in this same subdivision's chain.
    if any(r not in applicable for i in applicable.values() for r in i['requires']):
        return unknown('predecessor_missing')
    text = base['units'][target]
    pending, applied = dict(applicable), set()
    while pending:
        earliest = min(i['effective'] for i in pending.values())
        ready = [i for i in pending.values() if i['effective'] == earliest and
                 set(i['requires']) <= applied]
        if not ready:
            return unknown('cycle_or_effect_order')
        if len(ready) != 1:
            return unknown('concurrent_impacts')
        impact = ready[0]
        if text is None:
            return unknown('patch_after_repeal')
        operation, old, new = impact['operation'], impact['old'], impact['new']
        if operation in ('replace', 'repeal'):
            if text != old:
                return unknown('patch_precondition_failed')
            text = new if operation == 'replace' else None
        else:
            if text.count(old) != 1:
                return unknown('patch_anchor_ambiguous')
            text = text.replace(old, new if operation == 'replace_text' else old + new, 1)
        applied.add(impact['id'])
        del pending[impact['id']]
    return answer('repealed' if text is None else 'applicable', text)


def evaluate(corpus, gold):
    cases = {c['id']: c for c in corpus['cases']}
    require(bool(cases) and bool(gold['questions']), 'empty evaluation')
    require(len(cases) == len(corpus['cases']), 'duplicate case')
    require(len({q['id'] for q in gold['questions']}) == len(gold['questions']),
            'duplicate question')
    require({q['case'] for q in gold['questions']} == set(cases), 'uncovered or unknown case')
    results = []
    for question in gold['questions']:
        # Only input facts and explicit query parameters cross this boundary.
        actual = resolve(cases[question['case']], question['query'])
        expected = question['expected']
        require(set(expected) == {'status', 'text', 'reason', 'evidence'}, 'incomplete gold')
        checks = {k: actual[k] == v for k, v in expected.items()}
        results.append(dict(id=question['id'], case=question['case'], actual=actual,
                            checks=checks, passed=all(checks.values())))
    return dict(total=len(results), passed=sum(r['passed'] for r in results), results=results)
