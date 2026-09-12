import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import allowed, evidence_metrics, rrf, validate_vectors
import graph
from import_inputs import ROOT, load_inputs, verify_fixture, verify_manifest, write
import legal
import mixed
from native import DEFAULT_BINARY, Native, f32, fts_query, verify_component


class ProtocolTests(unittest.TestCase):
    def test_pinned_fixtures(self):
        verify_fixture()

    def test_visibility_precedes_indexing(self):
        p = {'workspace_id': 'a', 'published_at': '2026-09-12', 'visibility': ['finance']}
        context = {'workspace_id': 'a', 'known_at': '2026-09-12', 'principal': 'finance'}
        principals = {'finance': ['finance'], 'operator': ['operations']}
        self.assertTrue(allowed(p, context, principals))
        for changes in ({'workspace_id': 'b'}, {'known_at': '2026-09-11'}, {'principal': 'operator'}):
            self.assertFalse(allowed(p, {**context, **changes}, principals))

    def test_vectors_reject_invalid_or_unrepresentable_values(self):
        for vector in ([], [float('nan')], [float('inf')], [0], [True], ['1']):
            with self.assertRaises(ValueError):
                validate_vectors([vector], 1)
        for vector in ([1e100], [1e-100]):
            with self.assertRaises(ValueError):
                f32(vector)
        with self.assertRaises(ValueError):
            validate_vectors([[1], [1, 2]], 2)

    def test_native_query_keeps_unicode_and_escapes_fts_operators(self):
        self.assertEqual(fts_query('échéance dépassée'), '"échéance" OR "dépassée"')
        self.assertEqual(fts_query('The AND is'), '')
        self.assertEqual(fts_query('"facture"* OR (GC068)'), '"facture" OR "gc068"')
        self.assertEqual(fts_query('L’article_159'), '"l’article" OR "159"')

    def test_rrf_missing_channel_has_zero_contribution(self):
        result = rrf([{'id': 'a', 'score': 999}], [{'id': 'b', 'score': .1}], .5)
        self.assertEqual(result, [{'id': 'a', 'score': .5/61}, {'id': 'b', 'score': .5/61}])

    def test_numerical_ties_are_reported_but_wrong_scores_rejected(self):
        reference = [{'id': 'a', 'score': 1.}, {'id': 'b', 'score': 1.}]
        observed = [{'id': 'a', 'score': 1.-1e-15}, {'id': 'b', 'score': 1.}]
        ranking, check = verify_component(reference, observed, 1e-10)
        self.assertEqual(ranking[0]['id'], 'b')
        self.assertFalse(check['order_identical'])
        for bad in ([{'id': 'a', 'score': 1.1}, observed[1]], observed[:1], observed + observed):
            with self.assertRaises(ValueError):
                verify_component(reference, bad, 1e-10)

    def test_gold_changes_scores_only(self):
        ranking = [{'id': 'a', 'score': 1}]
        saved = copy.deepcopy(ranking)
        first = {'required_claims': [{'evidence_sets': [['a'], ['b']]}]}
        second = {'required_claims': [{'evidence_sets': [['a', 'b']]}]}
        self.assertTrue(evidence_metrics(ranking, first)['all_claims_covered'])
        self.assertFalse(evidence_metrics(ranking, second)['all_claims_covered'])
        self.assertEqual(ranking, saved)
        self.assertIsNone(evidence_metrics(ranking, {'required_claims': []})['claim_coverage'])

    def test_context_counts_utf8_headers_and_separators(self):
        passages = [{'id': 'p', 'content': 'éé'}, {'id': 'q', 'content': 'x'}]
        ranking = [{'id': 'p'}, {'id': 'q'}]
        self.assertEqual(legal.select(ranking, passages, 7)['selected_ids'], ['q'])
        self.assertEqual(legal.select(ranking, passages, 8)['selected_ids'], ['p'])
        self.assertEqual(legal.select(ranking, passages, 14)['selected_ids'], ['p'])
        self.assertEqual(legal.select(ranking, passages, 15)['selected_ids'], ['p', 'q'])

    def test_overlapping_chunks_cannot_double_count_evidence(self):
        passages = [{'document_id': 'd', 'start': 0, 'end': 8}, {'document_id': 'd', 'start': 2, 'end': 9}]
        self.assertEqual(legal.evidence_coverage(passages, [{'document_id': 'd', 'start': 0, 'end': 10}])['mean_span_coverage'], .9)

    def test_ambiguous_native_predicate_reconstruction_fails_closed(self):
        rows = [{'path': ['a', 'b'], 'anchor': 'a', 'depth': 1, 'edge_label': 'cites'}]
        edges = [{'id': 'e', 'source': 'a', 'target': 'b', 'predicate': 'cites', 'passage_id': 'p'},
                 {'id': 'f', 'source': 'a', 'target': 'b', 'predicate': 'other', 'passage_id': 'q'}]
        with self.assertRaises(ValueError):
            mixed.candidates_from_paths(rows, edges)

    def test_unknown_policies_fail_closed(self):
        with self.assertRaises(ValueError):
            mixed.select([], [], {}, 'typo')
        with self.assertRaises(ValueError):
            graph.expand([], {}, '', [], 'typo')

    def test_manifest_tampering_and_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').write_text('changed')
            for entries in ({'data': 'wrong'}, {'../escape': 'wrong'}):
                write(root / 'manifest.json', entries)
                with self.assertRaises(ValueError):
                    verify_manifest(root)
            write(root / 'manifest.json', {'source_commit': 'wrong', 'files_sha256': {}})
            with self.assertRaises(ValueError):
                load_inputs(root)


@unittest.skipUnless(os.environ.get('PERSONAL_GRAPHRAG_NATIVE') == '1', 'set PERSONAL_GRAPHRAG_NATIVE=1 for owned loopback integration')
class NativeTests(unittest.TestCase):
    def test_real_retrieval_graph_and_read_only_receipt(self):
        db = Native(os.environ.get('MINDBRAIN_TEST_BINARY', DEFAULT_BINARY))
        with db:
            db.prepare([{'id': 'a', 'content': 'La facture GC068 contient une échéance dépassée.'},
                        {'id': 'b', 'content': 'Le lancement est prévu demain.'},
                        {'id': 'c', 'content': 'Autre témoin'},
                        {'id': 'd', 'content': 'La facture GC068 contient une échéance dépassée.'}],
                       {'a': [1., .1], 'b': [.1, 1.], 'c': [-1., .1], 'd': [1., -.1]}, 'isolated')
            db.store_graph(['a', 'b', 'c'], [{'source': 'a', 'target': 'b', 'predicate': 'first'},
                                           {'source': 'c', 'target': 'b', 'predicate': 'second'}])
            db.begin_reads()
            for query in ('échéance dépassée', 'echeance depassee', 'GC068'):
                self.assertEqual([r['id'] for r in db.retrieve(query, [1., .1])['lexical']['ranking']], ['a', 'd'])
            for query in ('zzabsentzz', 'the AND is', ''):
                self.assertEqual(db.retrieve(query, [1., .1])['lexical']['ranking'], [])
            self.assertEqual({r['node_id'] for r in db.traverse('a', 'outbound')['rows']}, {'a', 'b'})
            self.assertEqual({r['node_id'] for r in db.traverse('a', 'both')['rows']}, {'a', 'b', 'c'})
            with self.assertRaises(ValueError):
                db.search('facture', [1.], .5)
            with self.assertRaises(ValueError):
                db.prepare([], {}, 'other')
            db.end_reads()
        self.assertTrue(db.receipt['reads_unchanged'])
        self.assertTrue(db.receipt['cleanup'])
        self.assertIsNotNone(db.process.poll())

    def test_failure_cleans_up_owned_process_and_sqlite(self):
        db = Native(os.environ.get('MINDBRAIN_TEST_BINARY', DEFAULT_BINARY))
        with self.assertRaisesRegex(ValueError, 'dimension'):
            with db:
                db.prepare([{'id': 'a', 'content': 'x'}, {'id': 'b', 'content': 'y'}],
                           {'a': [1.], 'b': [1., 2.]}, 'test')
        self.assertTrue(db.receipt['cleanup'])
        self.assertIsNotNone(db.process.poll())


if __name__ == '__main__':
    unittest.main()
