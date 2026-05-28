# Immeuble MCP lab reconstruction playbook

> English version — version française : [`../immeuble-mcp-reconstruction-playbook.md`](../immeuble-mcp-reconstruction-playbook.md)

Agent workflow to reconstruct the syndic domain from raw documents.

**Canonical location:** [`examples/immeuble/mcp-lab/`](../../../examples/immeuble/mcp-lab/)

| Resource | Path |
|----------|------|
| Entry point | [`mcp-lab/README.md`](../../../examples/immeuble/mcp-lab/README.md) |
| Prompts 00–06 | [`mcp-lab/prompts/`](../../../examples/immeuble/mcp-lab/prompts/) |
| Success criteria | [`mcp-lab/success-criteria.yaml`](../../../examples/immeuble/mcp-lab/success-criteria.yaml) |
| Hub (3 tracks) | [`examples/immeuble/README.md`](../../../examples/immeuble/README.md) |

Mock CI: `node scripts/import-immeuble-demo-llm.mjs --mode mock --reset`

The mock validates the comparison pipeline but **does not persist** the extracted graph in `immeuble-demo-llm`. For SQLite parity (MCP queries on the lab workspace), manually load a partial bundle or run the pipeline in `--mode live`.

Pedagogical detail: [How GhostCrab MCP achieves it](how-ghostcrab-mcp-achieves-it.md)
