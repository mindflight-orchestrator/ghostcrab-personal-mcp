# GhostCrab CrewAI Prototype

Local prototype for connecting CrewAI agents to GhostCrab Personal through MCP stdio.

## Prerequisites

- GhostCrab Personal CLI: `npm install -g @mindflight/ghostcrab-personal-mcp`
  so `gcp` is available on `PATH`.
- CrewAI tools with MCP support: `pip install "crewai-tools>=0.42.0"`.
- MCP Python package: `pip install mcp`.

## Path B (Start Here)

```python
from crewai_tools import MCPServerAdapter
from ghostcrab_crewai import ghostcrab_stdio_server_params

with MCPServerAdapter(ghostcrab_stdio_server_params()) as ghostcrab_tools:
    agent.tools = ghostcrab_tools
```

This starts GhostCrab Personal with `gcp brain up` and exposes the available `ghostcrab_*` tools to CrewAI.

## Path A (StorageBackend)

Deferred for this prototype. Current CrewAI `StorageBackend` implementations receive `MemoryRecord` batches and search by `query_embedding`, while GhostCrab Personal search is faceted/textual from a query string. A backend that pretends these APIs are equivalent would be misleading.

## Limits

- Prototype only; not packaged for PyPI.
- Stdio is the default and only implemented transport.
- CrewAI and `crewai-tools>=0.42.0` remain optional user-installed dependencies.
- GhostCrab Pro PostgreSQL may support richer hybrid search, but this prototype is Personal-first.

## Examples

- `examples/crew_with_mcp_tools.py`: Path B CrewAI `MCPServerAdapter` example.
