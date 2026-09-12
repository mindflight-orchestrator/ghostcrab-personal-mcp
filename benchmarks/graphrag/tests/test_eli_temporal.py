"""Temporal boundaries and failure injection, independently of source extraction."""
import copy
import json
from pathlib import Path
import random
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import eli_temporal as t

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/eli-temporal-v1'


class TemporalTests(unittest.TestCase):
    def setUp(self):
        self.corpus = json.loads((FIXTURE / 'corpus.json').read_text())
        self.gold = json.loads((FIXTURE / 'gold.json').read_text())
        self.cases = {c['id']: c for c in self.corpus['cases']}

    def pair(self, name='replacement', label='boundary'):
        return self.cases[name], next(q['query'] for q in self.gold['questions']
                                      if q['id'] == name + '-' + label)

    def unknown(self, case, query, reason):
        result = t.resolve(case, query)
        self.assertEqual((result['status'], result['text'], result['reason']),
                         ('indeterminate', None, reason))

    def test_all_independent_gold_answers_and_evidence(self):
        result = t.evaluate(self.corpus, self.gold)
        self.assertEqual(result['total'], 31)
        self.assertEqual(result['passed'], result['total'], result)

    def test_empty_partial_or_uncovered_gold_cannot_report_success(self):
        for mutation in ('empty', 'partial', 'uncovered'):
            gold = copy.deepcopy(self.gold)
            if mutation == 'empty':
                gold['questions'] = []
            elif mutation == 'partial':
                gold['questions'][0]['expected'] = {}
            else:
                gold['questions'] = [q for q in gold['questions'] if q['case'] != 'replacement']
            with self.assertRaises(ValueError):
                t.evaluate(self.corpus, gold)

    def test_changing_gold_changes_score_but_not_resolver_output(self):
        original = t.evaluate(self.corpus, self.gold)
        self.gold['questions'][0]['expected']['text'] = 'An invented answer'
        altered = t.evaluate(self.corpus, self.gold)
        self.assertEqual(altered['passed'], original['passed'] - 1)
        self.assertEqual([r['actual'] for r in altered['results']],
                         [r['actual'] for r in original['results']])

    def test_ingestion_order_and_identical_duplicate_records(self):
        for seed in range(5):
            corpus = copy.deepcopy(self.corpus)
            rng = random.Random(seed)
            for case in corpus['cases']:
                for field in ('documents', 'impacts', 'coverage'):
                    if case[field]:
                        case[field].append(copy.deepcopy(case[field][0]))
                    rng.shuffle(case[field])
            result = t.evaluate(corpus, self.gold)
            self.assertEqual(result['passed'], result['total'])

    def test_conflicting_duplicates_are_rejected(self):
        case, query = self.pair()
        duplicate = copy.deepcopy(case['documents'][0])
        duplicate['units']['art1.p1'] = 'Contradiction'
        case['documents'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'conflicting duplicate'):
            t.resolve(case, query)

    def test_removed_edge_or_forged_extra_edge_breaks_inventory(self):
        for mode in ('removed', 'extra'):
            with self.subTest(mode=mode):
                case, query = copy.deepcopy(self.pair())
                if mode == 'removed':
                    case['impacts'].clear()
                else:
                    extra = copy.deepcopy(case['impacts'][0])
                    extra['id'] += ':extra'
                    case['impacts'].append(extra)
                self.unknown(case, query, 'inventory_mismatch')

    def test_no_completeness_assumption_for_empty_graph(self):
        case, query = self.pair()
        case['coverage'].clear()
        self.unknown(case, query, 'coverage_missing')

    def test_conflicting_coverage_fails(self):
        case, query = self.pair()
        extra = copy.deepcopy(case['coverage'][-1])
        extra['through'] = '2021-01-01'
        case['coverage'].append(extra)
        self.unknown(case, query, 'coverage_conflict')

    def test_wrong_relation_type_does_not_silently_keep_old_rule(self):
        for name, label, kind in [('replacement', 'boundary', 'cites'),
                                  ('citation', 'recent-is-not-amendment', 'amendment')]:
            with self.subTest(name=name):
                case, query = self.pair(name, label)
                case['impacts'][0]['kind'] = kind
                self.unknown(case, query, 'relation_source_mismatch')

    def test_known_date_cannot_precede_source_publication(self):
        case, query = self.pair()
        case['impacts'][0]['known_from'] = '2019-12-01'
        with self.assertRaisesRegex(ValueError, 'known before source'):
            t.resolve(case, query)

    def test_missing_predecessor_even_if_inventory_is_consistent(self):
        case, query = self.pair('successive', 'second')
        first = case['impacts'].pop(0)['id']
        for coverage in case['coverage']:
            coverage['impacts'] = [i for i in coverage['impacts'] if i != first]
        self.unknown(case, query, 'predecessor_missing')

    def test_cycle_or_reversed_effective_order(self):
        for cycle in (True, False):
            case, query = copy.deepcopy(self.pair('successive', 'second'))
            if cycle:
                case['impacts'][0]['requires'] = [case['impacts'][1]['id']]
            else:
                case['impacts'][0]['effective'] = '2020-05-02'
                query['at'] = '2020-06-01'
            self.unknown(case, query, 'cycle_or_effect_order')

    def test_same_day_impacts_require_explicit_order(self):
        case, query = self.pair('successive', 'second')
        case['impacts'][1]['effective'] = case['impacts'][0]['effective']
        self.assertEqual(t.resolve(case, query)['text'], 'Le délai est de 60 jours.')
        case['impacts'][1]['requires'] = []
        self.unknown(case, query, 'concurrent_impacts')

    def test_patch_does_not_apply_to_different_prior_text(self):
        case, query = self.pair()
        case['documents'][0]['units']['art1.p1'] = 'Le délai est de 90 jours.'
        self.unknown(case, query, 'patch_precondition_failed')

    def test_patch_requires_unique_word_anchor(self):
        case, query = self.pair('text-operations', 'words')
        for text in ('Deux fois : 30 et 30.', 'Aucun délai.'):
            case['documents'][0]['units']['art1.p1'] = text
            self.unknown(case, query, 'patch_anchor_ambiguous')

    def test_no_implicit_resurrection_after_repeal(self):
        case, query = self.pair('successive', 'second')
        case['impacts'][0].update(operation='repeal', new='')
        self.unknown(case, query, 'patch_after_repeal')

    def test_unreviewed_ambiguous_and_empty_targets(self):
        for targets in ([], ['art1.p1', 'art1.p2']):
            case, query = copy.deepcopy(self.pair())
            case['impacts'][0]['targets'] = targets
            self.unknown(case, query, 'target_ambiguous')

    def test_identity_language_and_missing_subdivision_fail_closed(self):
        for field, value in [('work', t.PREFIX + 'missing'), ('language', 'deu'),
                             ('unit', 'art999')]:
            case, query = copy.deepcopy(self.pair())
            query[field] = value
            self.unknown(case, query, 'base_or_target_unresolved')

    def test_unknown_date_never_defaults_to_publication_date(self):
        case, query = self.pair()
        case['impacts'][0]['effective'] = None
        self.unknown(case, query, 'effective_date_unknown')

    def test_malformed_date_operation_or_review_flag_is_rejected(self):
        for field, value in [('effective', '2020-02-30'), ('operation', 'summarize'),
                             ('reviewed', 'false'), ('targets', 'art1.p1')]:
            case, query = copy.deepcopy(self.pair())
            case['impacts'][0][field] = value
            with self.assertRaises(ValueError):
                t.resolve(case, query)

    def test_no_gold_or_official_identity_in_resolver_inputs(self):
        case, query = self.pair()
        case['expected'] = 'answer'
        with self.assertRaisesRegex(ValueError, 'gold must be separate'):
            t.resolve(case, query)
        del case['expected']
        case['documents'][0]['id'] = 'https://example.com/fake-official-law'
        with self.assertRaisesRegex(ValueError, 'synthetic URN'):
            t.resolve(case, query)


if __name__ == '__main__':
    unittest.main()
