"""Owned native HTTP runtime; fixture writes and measured reads are separate."""
from collections import deque
from contextlib import contextmanager
import math
import os
from pathlib import Path
import re
import socket
import sqlite3
import struct
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

from common import REPO, check_ranking, cosine_rank, json_text, require, rrf, sha256, validate_vectors
from import_inputs import write

DEFAULT_BINARY = REPO / 'cmd/backend/zig-out/bin/ghostcrab-backend'
STOP = set('a an and are as at be by for from has have he in is it its of on or that the this to was were will with'.split())


def f32(vector):
    try:
        result = list(struct.unpack('<' + 'f' * len(vector), struct.pack('<' + 'f' * len(vector), *vector)))
    except (OverflowError, struct.error) as exc:
        raise ValueError('vector is outside float32 storage range') from exc
    validate_vectors([result], 1)
    return result


def fts_query(query):
    # Reproduce native byte-level segmentation and ASCII-only case folding.
    words = re.findall(rb'[A-Za-z0-9\x80-\xff]+', query.encode())
    return ' OR '.join('"' + w.lower().decode() + '"' for w in words if w.lower().decode() not in STOP)


def verify_component(reference, reported, tolerance):
    expected = {r['id']: r['score'] for r in reference}
    require(len(expected) == len(reference) and len({r['id'] for r in reported}) == len(reported), 'duplicate channel candidate')
    require(set(expected) == {r['id'] for r in reported}, 'incomplete channel candidates')
    errors = [abs(r['score'] - expected[r['id']]) for r in reported]
    require(all(math.isfinite(error) and error <= tolerance for error in errors), 'component/reference score mismatch')
    # Independent component scores are checked first. Use reported raw scores
    # only to preserve sub-tolerance float ties in the independent RRF oracle.
    ordered = sorted(reported, key=lambda r: (-r['score'], r['id']))
    return ordered, {'max_absolute_error': max(errors, default=0),
                     'order_identical': [r['id'] for r in ordered] == [r['id'] for r in reference]}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('native endpoint redirect refused')


class Native:
    def __init__(self, binary=DEFAULT_BINARY, receipt_path=None):
        self.binary = Path(binary).resolve()
        self.receipt_path = receipt_path
        self.process = self.directory = self.log = None
        self.receipt = {'cleanup': False, 'reads': 0}

    def __enter__(self):
        require(self.binary.is_file(), 'native binary missing; run npm run backend:build')
        try:
            self.directory = tempfile.TemporaryDirectory(prefix='personal-graphrag-')
            self.root = Path(self.directory.name)
            self.db_path = self.root / 'benchmark.sqlite'
            with socket.socket() as reservation:
                reservation.bind(('127.0.0.1', 0))
                port = reservation.getsockname()[1]
            self.url = f'http://127.0.0.1:{port}'
            self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            self.log = (self.root / 'backend.log').open('wb')
            env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'GHOSTCRAB_BOOTSTRAP_SEED': '0',
                   'GHOSTCRAB_ENV_PATH': str(self.root / 'absent.env'),
                   'GHOSTCRAB_CONFIG_PATH': str(self.root / 'absent.yaml'),
                   'GHOSTCRAB_EMBEDDINGS_MODE': 'disabled', 'MCP_TELEMETRY': '0'}
            self.process = subprocess.Popen([str(self.binary), '--addr', f'127.0.0.1:{port}', '--db', str(self.db_path)],
                                            cwd=self.root, env=env, stdin=subprocess.DEVNULL, stdout=self.log, stderr=self.log)
            deadline = time.monotonic() + 20
            while True:
                require(self.process.poll() is None, 'native backend exited during startup')
                try:
                    health = self.request('/health')
                    break
                except (OSError, TimeoutError):
                    require(time.monotonic() < deadline, 'native backend startup timeout')
                    time.sleep(0.05)
            self.receipt.update(binary=str(self.binary), binary_sha256=sha256(self.binary.read_bytes()),
                                health=health, capabilities=self.request('/api/mindbrain/capabilities'),
                                sqlite_reference_version=sqlite3.sqlite_version,
                                directory=str(self.root), startup=self.digest())
            return self
        except BaseException:
            self.close()
            raise

    def request(self, path, payload=None):
        request = urllib.request.Request(self.url + path,
            data=None if payload is None else json_text(payload).encode(), headers={'Content-Type': 'application/json'})
        with self.opener.open(request, timeout=20) as response:
            import json
            return json.load(response)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def digest(self):
        with self.connect() as db:
            # Logical digest includes all tables, indexes and FTS shadow state.
            return sha256('\n'.join(db.iterdump()).encode())

    def prepare(self, passages, vectors, workspace):
        require(not hasattr(self, 'passages'), 'use a fresh native database for each snapshot')
        passages = sorted(passages, key=lambda p: p['id'])
        require(0 < len(passages) <= 1000, 'fixture exceeds complete candidate pool limit')
        require(len({p['id'] for p in passages}) == len(passages), 'duplicate passage identity')
        require(set(vectors) == {p['id'] for p in passages}, 'vector/passage identity mismatch')
        validate_vectors([vectors[p['id']] for p in passages], len(passages))
        self.vectors = {key: f32(value) for key, value in vectors.items()}
        self.passages, self.workspace = passages, workspace
        self.ids = {i: p['id'] for i, p in enumerate(passages, 1)}
        started = time.perf_counter()
        with self.connect() as db:
            require(db.execute('SELECT count(*) FROM search_documents').fetchone()[0] == 0, 'database is not empty')
            schema = db.execute("SELECT sql FROM sqlite_master WHERE name='search_fts'").fetchone()[0]
            require(schema.lower().endswith('using fts5(content)'), 'native FTS tokenizer/schema changed')
            for doc_id, passage in enumerate(passages, 1):
                pid, content = passage['id'], passage['content']
                db.execute('INSERT INTO agent_facts(id,schema_id,content,workspace_id,doc_id) VALUES(?,?,?,?,?)',
                           (pid, 'benchmark', content, workspace, doc_id))
                db.execute('INSERT INTO search_documents(table_id,doc_id,content) VALUES(1,?,?)', (doc_id, content))
                db.execute('INSERT INTO search_fts_docs(fts_rowid,table_id,doc_id) VALUES(?,1,?)', (doc_id, doc_id))
                db.execute('INSERT INTO search_fts(rowid,content) VALUES(?,?)', (doc_id, content))
                vector = self.vectors[pid]
                db.execute('INSERT INTO search_embeddings VALUES(1,?,?,?)',
                           (doc_id, len(vector), struct.pack('<' + 'f' * len(vector), *vector)))
        self.receipt.update(indexed=len(passages), dimension=len(next(iter(self.vectors.values()))),
                            fts_schema=schema, fixture_import='Python SQLite transaction into canonical native tables',
                            preparation_ms=(time.perf_counter()-started)*1000)

    def search(self, query, vector, weight):
        if vector:
            validate_vectors([vector], 1, self.receipt['dimension'])
            f32(vector)
        started = time.perf_counter()
        raw = self.request('/api/mindbrain/ghostcrab/search', {'workspace_id': self.workspace,
            'table_id': 1, 'query': query, 'embedding': vector, 'vector_weight': weight, 'limit': len(self.ids)})
        self.receipt['reads'] += 1
        ranking = [{'id': self.ids[r['doc_id']], 'score': r['combined_score']} for r in raw['matches']]
        check_ranking(ranking, self.ids.values())
        require(raw['query'] == query and raw['workspace_id'] == self.workspace, 'native request context changed')
        return {'ranking': ranking, 'native': raw, 'wall_ms': (time.perf_counter()-started)*1000}

    def retrieve(self, query, vector):
        lexical = self.search(query, [], 0)
        semantic = self.search('', vector, 1)
        hybrid = self.search(query, vector, 0.5)
        expression = fts_query(query)
        with self.connect() as db:
            rows = db.execute('SELECT rowid,-bm25(search_fts) FROM search_fts WHERE search_fts MATCH ? ORDER BY bm25(search_fts),rowid',
                              (expression,)).fetchall() if expression else []
        lex_reference, lex_check = verify_component(
            [{'id': self.ids[doc], 'score': score} for doc, score in rows],
            [{'id': self.ids[r['doc_id']], 'score': r['bm25_score']} for r in lexical['native']['matches']], 1e-10)
        ref_cosine = cosine_rank(self.passages, self.vectors, f32(vector))
        vec_reference, vec_check = verify_component(ref_cosine,
            [{'id': self.ids[r['doc_id']], 'score': r['vector_score']} for r in semantic['native']['matches']], 2e-6)
        for name, result, lex, vec, weight in [('lexical', lexical, lex_reference, [], 0),
                ('vector', semantic, [], vec_reference, 1),
                ('hybrid', hybrid, lex_reference, vec_reference, 0.5)]:
            expected = rrf(lex, vec, weight)
            require([r['id'] for r in expected] == [r['id'] for r in result['ranking']], f'{name} RRF order mismatch')
            require(all(abs(a['score']-b['score']) < 1e-12 for a, b in zip(expected, result['ranking'])), f'{name} RRF score mismatch')
        return {'lexical': lexical, 'vector': semantic, 'hybrid': hybrid,
                'verification': {'fts_expression': expression, 'rrf_parity': True,
                                 'bm25': lex_check, 'cosine': vec_check}}

    def store_graph(self, nodes, edges):
        require(not hasattr(self, 'nodes'), 'graph already imported')
        self.nodes, self.edges = nodes, edges
        ids = {name: i for i, name in enumerate(nodes, 1)}
        require(len(ids) == len(nodes), 'duplicate graph node')
        with self.connect() as db:
            for name, number in ids.items():
                db.execute('INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name) VALUES(?,?,?,?)',
                           (number, self.workspace, 'benchmark', name))
            for i, edge in enumerate(edges, 1):
                db.execute('INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id,metadata_json) VALUES(?,?,?,?,?,?)',
                           (i, self.workspace, edge['predicate'], ids[edge['source']], ids[edge['target']], json_text(edge)))
            import json
            stored = [json.loads(r[0]) for r in db.execute('SELECT metadata_json FROM graph_relation ORDER BY relation_id')]
            require(stored == edges, 'stored graph provenance differs')
        self.receipt['graph'] = {'nodes': len(nodes), 'edges': len(edges), 'provenance_sha256': sha256(json_text(stored).encode())}

    def traverse(self, anchor, direction='both', depth=4):
        require(anchor in self.nodes and direction in ('both', 'outbound'), 'invalid traversal')
        calls = []
        def call(start, way, hops):
            params = {'workspace_id': self.workspace, 'start': start, 'direction': way, 'depth': hops}
            raw = self.request('/api/mindbrain/traverse?' + urllib.parse.urlencode(params))
            self.receipt['reads'] += 1
            calls.append({'request': params, 'response': raw})
            return raw['rows']
        if direction == 'outbound':
            rows = call(anchor, direction, depth)
        else:
            # Personal has no HTTP direction=both. Compose real one-hop reads,
            # preserving every response; this is explicitly an adapter policy.
            discovered = {}
            frontier = deque([(anchor, [anchor])])
            while frontier:
                node, path = frontier.popleft()
                for way in ('outbound', 'inbound'):
                    for row in call(node, way, 1):
                        target = row['node_id']
                        if row['depth'] == 0:
                            if node == anchor:
                                discovered.setdefault(node, row)
                            continue
                        if target not in discovered:
                            next_path = path + [target]
                            discovered[target] = {**row, 'depth': len(next_path)-1, 'path': next_path}
                            if len(next_path)-1 < depth:
                                frontier.append((target, next_path))
            rows = list(discovered.values())
        distance, queue = {anchor: 0}, deque([anchor])
        while queue:
            node = queue.popleft()
            if distance[node] == depth:
                continue
            for e in self.edges:
                target = e['target'] if e['source'] == node else e['source'] if direction == 'both' and e['target'] == node else None
                if target is not None and target not in distance:
                    distance[target] = distance[node] + 1
                    queue.append(target)
        require({r['node_id']: r['depth'] for r in rows} == distance, 'native graph reachability/distance mismatch')
        for row in rows:
            path = row['path']
            require(path[0] == anchor and path[-1] == row['node_id'] and len(path) == row['depth']+1, 'invalid native graph path')
            for a, b in zip(path, path[1:]):
                require(any((e['source'], e['target']) == (a, b) or
                            direction == 'both' and (e['source'], e['target']) == (b, a) for e in self.edges), 'unproven path step')
        return {'rows': [{'anchor': anchor, **r} for r in rows], 'calls': calls,
                'execution': 'native_outbound' if direction == 'outbound' else 'adapter_bfs_native_inbound_outbound'}

    def begin_reads(self):
        self.receipt['after_preparation'] = self.digest()

    def end_reads(self):
        self.receipt['after_reads'] = self.digest()
        self.receipt['reads_unchanged'] = self.receipt['after_preparation'] == self.receipt['after_reads']
        require(self.receipt['reads_unchanged'], 'measured reads changed SQLite contents')

    def close(self):
        if self.process:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)
            self.receipt['exit_code'] = self.process.returncode
        if self.log:
            self.log.close()
        if self.directory:
            self.directory.cleanup()
            self.receipt['cleanup'] = not self.root.exists()
        if self.receipt_path:
            write(self.receipt_path, self.receipt)

    def __exit__(self, *args):
        self.close()
