#!/usr/bin/env python3
"""Import pinned, already generated vectors. No provider client or credentials."""
import argparse
import gzip
import json
import subprocess
from pathlib import Path

from common import json_text, require, sha256, validate_vectors

ROOT = Path(__file__).resolve().parent


def read(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def verify_manifest(root):
    manifest = read(root / 'manifest.json')
    for name, digest in manifest.items():
        require(Path(name).name == name, 'manifest must contain immediate files')
        require(sha256((root / name).read_bytes()) == digest, f'archive changed: {name}')
    return manifest


def verify_fixture():
    provenance = read(ROOT / 'SOURCE.json')
    for name, digest in provenance['files'].items():
        if name.startswith('test/fixtures/'):
            require(sha256((ROOT / name.removeprefix('test/')).read_bytes()) == digest,
                    f'fixture changed: {name}')
    return provenance


def import_inputs(source, out):
    provenance = verify_fixture()
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    require(commit == provenance['source_commit'], 'source checkout is not the pinned commit')
    require(not out.exists(), 'input directory already exists; choose a new directory')
    base = source / 'docs/benchmarks'
    sources = {}

    def frozen(path):
        relative = str(path.relative_to(source))
        raw = path.read_bytes()
        tracked = subprocess.check_output(['git', '-C', str(source), 'show', f'{commit}:{relative}'])
        require(raw == tracked, f'archive differs from pinned Git: {relative}')
        sources[relative] = sha256(raw)
        return read(path)

    business = frozen(base / 'graphrag-business-v1/dev-2026-09-12/embeddings.json')
    business_config = frozen(base / 'graphrag-business-v1/dev-2026-09-12/config.json')
    require(business['identity'] == business_config['embedding_identity'], 'business model mismatch')
    prepared = base / 'graphrag-legal-v2/prepared-2026-09-12-v2'
    verify_manifest(prepared)
    frozen(prepared / 'manifest.json')
    legal = frozen(prepared / 'prepared.json')
    legal_config = frozen(prepared / 'config.json')
    corpus = read(ROOT / 'fixtures/graphrag-legal-v2/corpus.json')
    require(legal_config['corpus_sha256'] == sha256((ROOT / 'fixtures/graphrag-legal-v2/corpus.json').read_bytes()),
            'legal corpus mismatch')
    passages = legal['variants']['legal_descriptors']['passages']
    texts = [p['content'] for p in passages] + [q['query'] for q in corpus['questions']]
    ids = [p['id'] for p in passages] + [q['id'] for q in corpus['questions']]
    require(len(ids) == len(set(ids)), 'duplicate input identity')
    models = {}
    for directory, local in [('local-models-2026-09-12', True), ('embeddings-2026-09-12', False)]:
        root = base / 'graphrag-legal-v2' / directory / 'prepared'
        manifest = verify_manifest(root)
        frozen(root / 'manifest.json')
        config = frozen(root / 'config.json')
        parent = config['parent'] if local else config
        require(parent['input_ids'] == ids and parent['content_sha256'] == sha256(json_text(texts).encode()),
                'embedding inputs changed')
        if local:
            frozen(root / 'identities.json')
        grouped = {}
        for name in sorted(manifest):
            if not name.endswith('.json.gz'):
                continue
            batch = frozen(root / name)
            arm = batch['model'] if local else f"{batch['model']}-{batch['dimension']}"
            previous = grouped.setdefault(arm, [])
            start = len(previous)
            chunk = texts[start:start + len(batch['vectors'])]
            if local:
                require(batch['input_ids'] == ids[start:start + len(chunk)], 'batch identities changed')
                formatted = []
                for index, value in enumerate(chunk, start):
                    query = index >= len(passages)
                    if batch['model'].startswith('qwen3') and query:
                        value = 'Instruct: ' + config['qwen_instruction'] + '\nQuery: ' + value
                    elif batch['model'].startswith('embeddinggemma'):
                        value = ('task: search result | query: ' if query else 'title: none | text: ') + value
                    formatted.append(value)
                payload = {'model': batch['model'], 'input': formatted, 'truncate': False, 'keep_alive': '5m'}
            else:
                payload = {'model': batch['model'], 'dimensions': batch['dimension'],
                           'encoding_format': 'float', 'input': chunk}
            require(batch['request_sha256'] == sha256(json_text(payload).encode()), 'batch request mismatch')
            require(batch['embedding_sha256'] == sha256(json_text(batch['vectors']).encode()), 'vector hash mismatch')
            previous.extend(batch['vectors'])
        for arm, vectors in grouped.items():
            validate_vectors(vectors, len(ids))
            models[arm] = dict(zip(ids, vectors))
    out.mkdir(parents=True)
    for name, data in [('business', business), ('legal', legal), ('models', models)]:
        (out / f'{name}.json.gz').write_bytes(gzip.compress((json_text(data) + '\n').encode(), mtime=0))
    write(out / 'manifest.json', {'source_commit': commit, 'source_files_sha256': sources,
                                'files_uncompressed_sha256': {p.name: sha256(gzip.decompress(p.read_bytes())) for p in sorted(out.iterdir())}})
    load_inputs(out)
    print(f'Imported frozen business/legal inputs and {len(models)} embedding arms into {out}')


def load_inputs(root):
    verify_fixture()
    lock = read(ROOT / 'INPUTS.lock.json')
    require(sha256((root / 'manifest.json').read_bytes()) == lock['manifest_sha256'], 'input manifest differs from pinned import')
    manifest = read(root / 'manifest.json')
    require(manifest['source_commit'] == read(ROOT / 'SOURCE.json')['source_commit'], 'input source mismatch')
    require(set(manifest['files_uncompressed_sha256']) == {'business.json.gz', 'legal.json.gz', 'models.json.gz'}, 'incomplete inputs')
    for name, digest in manifest['files_uncompressed_sha256'].items():
        require(sha256(gzip.decompress((root / name).read_bytes())) == digest, f'input changed: {name}')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'inputs')
    args = parser.parse_args()
    import_inputs(args.source.resolve(), args.out.resolve())
