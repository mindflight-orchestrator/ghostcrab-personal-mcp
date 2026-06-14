#!/usr/bin/env python3
"""Generate immeuble-training draft/resolved bundles from the canonical immeuble bundle.

Source narrative stays in examples/immeuble/bundle/immeuble.bundle.json.
Outputs examples/immeuble/training/bundle.draft.json, bundle.resolved.json,
and training-manifest.yaml.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_BUNDLE = ROOT / "examples/immeuble/bundle/immeuble.bundle.json"
OUT_DIR = ROOT / "examples/immeuble/training"

SRC_WS = "immeuble"
SRC_ONTO = "immeuble::core"
SRC_COLL = "immeuble::docs"

DRAFT_WS = "immeuble-training-draft"
GOLDEN_WS = "immeuble-training-golden"
TRAINING_ONTO = "immeuble-training::core"
TRAINING_COLL = "immeuble-training::docs"

# Catalogued draft defects (relation_id from source bundle)
DRAFT_REMOVE_RELATION_IDS = {
    102,  # occupies -> Tilleuls A1 (E01)
    104,
    240,  # leases -> tenant units (E02)
    243,
    246,
    249,
    252,
}

GOLDEN_ID_OFFSET = 100_000

# Instance tables whose bigint ids must not collide across co-loaded workspaces.
INSTANCE_ID_TABLES: dict[str, list[str]] = {
    "entities_raw": ["entity_id"],
    "relations_raw": ["relation_id", "source_entity_id", "target_entity_id"],
    "entity_aliases_raw": ["entity_id"],
    "entity_documents_raw": ["entity_id"],
    "entity_chunks_raw": ["entity_id"],
    "relation_properties_raw": ["relation_id"],
}


def offset_instance_ids(bundle: dict, offset: int) -> None:
    for table, fields in INSTANCE_ID_TABLES.items():
        for row in bundle.get(table, []):
            for field in fields:
                val = row.get(field)
                if val is not None:
                    row[field] = int(val) + offset


# Resolved-only addition: Marie Lambert -> Syndic Horizon Gestion (pre-offset ids)
MARIE_ENTITY_ID = 210
SYNDIC_ORG_ENTITY_ID = 200
GOLDEN_MARIE_RELATION_ID = 90001


def remap_workspace(obj: dict, workspace_id: str) -> None:
    for key, value in list(obj.items()):
        if key == "workspace_id" and value == SRC_WS:
            obj[key] = workspace_id
        elif key == "ontology_id" and value == SRC_ONTO:
            obj[key] = TRAINING_ONTO
        elif key == "default_ontology_id" and value == SRC_ONTO:
            obj[key] = TRAINING_ONTO
        elif key == "collection_id" and value == SRC_COLL:
            obj[key] = TRAINING_COLL
        elif isinstance(value, dict):
            remap_workspace(value, workspace_id)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    remap_workspace(item, workspace_id)


def remap_doc_nanoids(bundle: dict, workspace_id: str) -> None:
    prefix = workspace_id.replace("_", "-")
    for doc in bundle.get("documents_raw", []):
        nanoid = doc.get("doc_nanoid")
        if isinstance(nanoid, str) and nanoid.startswith("immeuble-doc-"):
            doc["doc_nanoid"] = nanoid.replace("immeuble", prefix, 1)


def clone_bundle(workspace_id: str) -> dict:
    bundle = copy.deepcopy(json.loads(SOURCE_BUNDLE.read_text()))
    bundle["scope"]["workspace_id"] = workspace_id
    remap_workspace(bundle, workspace_id)
    remap_doc_nanoids(bundle, workspace_id)
    for ws in bundle.get("workspaces", []):
        if ws.get("workspace_id") == workspace_id:
            ws["label"] = (
                "Immeuble training draft"
                if workspace_id == DRAFT_WS
                else "Immeuble training golden"
            )
            ws["description"] = (
                "Exercise base graph with catalogued syndic gaps (E01–E03)."
                if workspace_id == DRAFT_WS
                else "Resolved graph after applying training fixes."
            )
    return bundle


def apply_draft_defects(bundle: dict) -> None:
    rels = bundle.get("relations_raw", [])
    bundle["relations_raw"] = [
        r for r in rels if r.get("relation_id") not in DRAFT_REMOVE_RELATION_IDS
    ]


def restore_catalogued_relations(bundle: dict, source: dict) -> None:
    """Re-add relations removed in draft (E01/E02) for the resolved golden graph."""
    by_id = {r.get("relation_id"): r for r in source.get("relations_raw", [])}
    existing = {r.get("relation_id") for r in bundle.get("relations_raw", [])}
    for rel_id in DRAFT_REMOVE_RELATION_IDS:
        row = by_id.get(rel_id)
        if row is None or rel_id in existing:
            continue
        restored = copy.deepcopy(row)
        remap_workspace(restored, bundle["scope"]["workspace_id"])
        bundle["relations_raw"].append(restored)


def apply_golden_fixes(bundle: dict) -> None:
    bundle["relations_raw"].append(
        {
            "workspace_id": GOLDEN_WS,
            "ontology_id": TRAINING_ONTO,
            "relation_id": GOLDEN_MARIE_RELATION_ID,
            "edge_type": "represents",
            "source_entity_id": MARIE_ENTITY_ID,
            "target_entity_id": SYNDIC_ORG_ENTITY_ID,
            "valid_from": None,
            "valid_to": None,
            "confidence": 1,
            "metadata_json": '{"role":"comptable","training_fix":"E03"}',
        }
    )


def write_manifest(draft: dict, golden: dict) -> None:
    manifest = {
        "version": 1,
        "source_bundle": str(SOURCE_BUNDLE.relative_to(ROOT)),
        "ontology_id": TRAINING_ONTO,
        "workspaces": {
            "draft": DRAFT_WS,
            "golden": GOLDEN_WS,
        },
        "errors": [
            {
                "id": "E01",
                "label": "Missing occupies on owner-occupied Tilleuls A1",
                "rule_id": "occupied-unit-has-occupant",
                "entity_name": "Tilleuls Appartement A1",
                "removed_relation_ids": [102, 104],
            },
            {
                "id": "E02",
                "label": "Missing leases on tenant-occupied / owner-abroad units",
                "rule_id": "tenant-occupied-has-lease",
                "removed_relation_ids": [240, 243, 246, 249, 252],
            },
            {
                "id": "E03",
                "label": "Marie Lambert isolated (no graph relations)",
                "kind": "isolated_entity",
                "entity_name": "Marie Lambert",
                "golden_fix": {
                    "edge_type": "represents",
                    "source_entity_id": MARIE_ENTITY_ID + GOLDEN_ID_OFFSET,
                    "target_entity_id": SYNDIC_ORG_ENTITY_ID + GOLDEN_ID_OFFSET,
                    "relation_id": GOLDEN_MARIE_RELATION_ID + GOLDEN_ID_OFFSET,
                },
            },
        ],
        "modules": {
            "A1": {
                "rules": "gap-rules/L0-patrimoine.json",
                "workspace": "draft",
                "expect_summary": {"missing_required_relations": 0},
            },
            "A2": {
                "rules": "gap-rules/L2-syndic-filtered.json",
                "workspace": "draft",
                "expect_summary": {"missing_required_relations_min": 6},
                "expect_rule_ids": [
                    "occupied-unit-has-occupant",
                    "tenant-occupied-has-lease",
                ],
            },
            "A3": {
                "rules": "gap-rules/L2-syndic-filtered.json",
                "workspace": "golden",
                "expect_summary": {"missing_required_relations": 0},
            },
            "B1": {
                "rules": "gap-rules/L1-syndic-naive.json",
                "workspace": "golden",
                "expect_rule_ids": ["occupied-unit-has-occupant"],
                "expect_entity_name": "Érables Appartement A4",
            },
            "B2": {
                "rules": "gap-rules/L2-syndic-filtered.json",
                "workspace": "golden",
                "expect_summary": {"missing_required_relations": 0},
            },
        },
        "counts": {
            "draft": {
                "entities": len(draft.get("entities_raw", [])),
                "relations": len(draft.get("relations_raw", [])),
            },
            "golden": {
                "entities": len(golden.get("entities_raw", [])),
                "relations": len(golden.get("relations_raw", [])),
            },
        },
    }
    json_path = OUT_DIR / "training-manifest.json"
    json_path.write_text(json.dumps(manifest, indent=2) + "\n")
    yaml_path = OUT_DIR / "training-manifest.yaml"
    try:
        import yaml

        yaml_path.write_text(yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True))
    except ImportError:
        print(f"note: PyYAML missing; using {json_path} only", file=sys.stderr)


def ensure_document_symlinks() -> None:
    docs_dir = OUT_DIR / "documents"
    src_dir = ROOT / "examples/immeuble/sources/documents"
    if not src_dir.is_dir():
        return
    docs_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted(src_dir.glob("*.md")):
        dst = docs_dir / src.name
        if dst.exists() or dst.is_symlink():
            continue
        rel = Path("..") / "sources" / "documents" / src.name
        dst.symlink_to(rel)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    source = json.loads(SOURCE_BUNDLE.read_text())

    draft = clone_bundle(DRAFT_WS)
    apply_draft_defects(draft)

    golden = clone_bundle(GOLDEN_WS)
    apply_draft_defects(golden)
    restore_catalogued_relations(golden, source)
    apply_golden_fixes(golden)
    offset_instance_ids(golden, GOLDEN_ID_OFFSET)

    bundles_dir = OUT_DIR / "bundles"
    bundles_dir.mkdir(parents=True, exist_ok=True)
    (bundles_dir / "draft.json").write_text(json.dumps(draft, indent=2) + "\n")
    (bundles_dir / "resolved.json").write_text(json.dumps(golden, indent=2) + "\n")
    write_manifest(draft, golden)
    ensure_document_symlinks()

    print(f"Wrote {bundles_dir / 'draft.json'}")
    print(f"Wrote {bundles_dir / 'resolved.json'}")
    print(f"Wrote training manifest under {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
