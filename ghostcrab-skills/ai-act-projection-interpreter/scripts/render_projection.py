#!/usr/bin/env python3
"""Render AI Act MindCLI projection JSON as concise Markdown."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def load_rows(path: Path) -> tuple[int, list[dict[str, Any]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("rows") or []
    if not isinstance(rows, list):
        rows = []
    return int(data.get("count") or len(rows)), rows


def citation(row: dict[str, Any]) -> str:
    return str(row.get("legal_basis") or row.get("source_ref") or row.get("source_article") or "source missing")


def quality(rows: list[dict[str, Any]], template: str) -> list[str]:
    issues: list[str] = []
    missing_source = sum(1 for row in rows if not (row.get("source_ref") or row.get("source_article")))
    missing_basis = sum(1 for row in rows if not row.get("legal_basis"))
    if missing_source:
        issues.append(f"{missing_source} row(s) without source_ref/source_article")
    if missing_basis:
        issues.append(f"{missing_basis} row(s) without legal_basis")
    if template == "ai_act_obligation_cascade":
        wrong = sum(1 for row in rows if row.get("legal_effect") != "obligation")
        if wrong:
            issues.append(f"{wrong} row(s) not tagged legal_effect=obligation")
    if template == "ai_act_exemption_surface":
        wrong = sum(1 for row in rows if row.get("legal_effect") not in {"exemption", "derogation"})
        if wrong:
            issues.append(f"{wrong} row(s) not tagged exemption/derogation")
    return issues


def render_obligations(count: int, rows: list[dict[str, Any]]) -> str:
    by_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_type[str(row.get("obligation_type") or "other")].append(row)
    effect_counts = Counter(str(row.get("legal_effect") or "missing") for row in rows)
    lines = [
        "# Provider High-Risk Obligations",
        "",
        f"The projection returns **{count}** applicable obligation rows.",
        "",
        "## Quality",
        "",
        f"- Legal effects: `{dict(effect_counts)}`",
        f"- Cited rows: {sum(1 for row in rows if row.get('source_ref'))}/{len(rows)}",
        "",
        "## Obligation Families",
        "",
    ]
    for key, group in sorted(by_type.items(), key=lambda item: (-len(item[1]), item[0])):
        lines.append(f"- `{key}`: {len(group)}")
    lines.extend(["", "## Checklist", ""])
    for key, group in sorted(by_type.items(), key=lambda item: item[0]):
        lines.extend([f"### {key.replace('_', ' ').title()}", ""])
        for row in group:
            deadline = f" Deadline: `{row.get('deadline')}`." if row.get("deadline") else ""
            lines.append(f"- {row.get('answer_item') or row.get('action')}")
            lines.append(f"  Source: {citation(row)}.{deadline}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_penalty(count: int, rows: list[dict[str, Any]]) -> str:
    lines = ["# Penalty Path", "", f"The projection returns **{count}** penalty row(s).", ""]
    for row in rows:
        amount = row.get("max_amount_eur")
        pct = row.get("max_percent_turnover")
        amount_text = f"EUR {amount:,.0f}".replace(",", " ") if isinstance(amount, (int, float)) else "amount not returned"
        pct_text = f"{pct}%" if pct is not None else "turnover percentage not returned"
        lines.append(f"- {row.get('answer_item')}: {amount_text} / {pct_text}.")
        lines.append(f"  Source: {citation(row)}.")
    return "\n".join(lines).rstrip() + "\n"


def render_exemptions(count: int, rows: list[dict[str, Any]]) -> str:
    lines = ["# Exemption Surface", "", f"The projection returns **{count}** explicit exemption/derogation row(s).", ""]
    if not rows:
        lines.append("No explicit exemption was returned for this selector.")
    for row in rows:
        lines.append(f"- {row.get('answer_item')}")
        lines.append(f"  Effect: `{row.get('legal_effect')}`, condition: `{row.get('conditionality_type')}`.")
        lines.append(f"  Source: {citation(row)}.")
    return "\n".join(lines).rstrip() + "\n"


def render_sector(count: int, rows: list[dict[str, Any]]) -> str:
    lines = ["# Sector Risk Profile", "", f"The projection returns **{count}** category row(s).", ""]
    for row in rows:
        lines.append(f"- {row.get('answer_item')} -> `{row.get('risk_level')}`")
        lines.append(f"  Source: {citation(row)}.")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True)
    parser.add_argument("--json", type=Path, required=True)
    args = parser.parse_args()

    count, rows = load_rows(args.json)
    if args.template == "ai_act_obligation_cascade":
        body = render_obligations(count, rows)
    elif args.template == "ai_act_penalty_path":
        body = render_penalty(count, rows)
    elif args.template == "ai_act_exemption_surface":
        body = render_exemptions(count, rows)
    elif args.template == "ai_act_sector_risk_profile":
        body = render_sector(count, rows)
    else:
        raise SystemExit(f"unsupported template: {args.template}")

    issues = quality(rows, args.template)
    print(body)
    print("## Projection Quality")
    if issues:
        for issue in issues:
            print(f"- WARNING: {issue}")
    else:
        print("- OK: required citation and semantic checks passed.")


if __name__ == "__main__":
    main()
