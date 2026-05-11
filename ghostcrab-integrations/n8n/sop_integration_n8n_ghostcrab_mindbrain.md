<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# GhostCrab MCP integration — Personal (SQLite) in an n8n node

Technical summary for integrating GhostCrab MCP (`Perso` mode with SQLite) into an n8n node.

***

## Two integration modes in n8n

n8n supports MCP through two native nodes since v1.x: **MCP Server Trigger** (expose a workflow as an MCP tool) and **MCP Client Tool** (n8n consumes an external MCP server) [^1_1]. For GhostCrab in `Perso/SQLite` mode, use the latter: n8n is the **client** querying your GhostCrab server.

***

## Prerequisites

- Self-hosted n8n (cloud or local) — native MCP nodes ship in n8n v1.x [^1_2]
- Community package `n8n-nodes-mcp` if you need **STDIO** mode (local command-line transport) in addition to SSE [^1_3]
- Environment variable enabled for community tool usage :

```
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

[^1_3]

***

## Option A — GhostCrab via SSE (recommended)

When GhostCrab runs as an HTTP/SSE server (standard for MCP exposed on the network) :

1. **In n8n**, add an **MCP Client Tool** node (native node, AI/Agents category) [^1_2]
2. Set `SSE Endpoint` → your GhostCrab server URL, e.g. `http://localhost:3000/sse`
3. `Authentication` → Bearer token or None per your GhostCrab config
4. `Tools to Include` → **All** to expose all ontology resources, or **Selected** to filter (e.g. only `query_facts`, `add_triple`) [^1_2]
5. Connect this node as a **tool sub-node** to an **AI Agent** node
```
[AI Agent] ──tool──> [MCP Client Tool → GhostCrab SSE]
```


***

## Option B — GhostCrab via STDIO (local process)

When GhostCrab runs as a local CLI process (STDIO transport), use the community package `n8n-nodes-mcp` [^1_4] :

1. **Settings → Community Nodes** → install `n8n-nodes-mcp` [^1_5]
2. Create a credential of type `MCP Client (STDIO)`
3. Configure:
    - **Command**: path to GhostCrab executable, e.g. `/usr/local/bin/ghostcrab-mcp`
    - **Arguments**: `--db /path/to/perso.sqlite` (or GhostCrab-specific flags)
4. In the workflow, add an **MCP Client** node (from the community package), run `List available tools` first to validate, then `Execute a tool` [^1_3]

***

## Wiring into an n8n AI Agent workflow

Standard pattern exposing GhostCrab to an n8n agent :

```
[Chat Trigger]
      │
[AI Agent]
      ├──tool──> [MCP Client Tool (GhostCrab)]   ← query SQLite ontology
      ├──tool──> [another n8n tool]
      └──llm───> [Claude / GPT]
```

The **MCP Client Tool** node surfaces automatically as an available tool for the agent [^1_2]. The agent discovers GhostCrab tools (e.g. `search_concepts`, `add_relation`, etc.) and invokes them from conversational context.

***

## Native SQLite MCP pattern in n8n (alternative)

Official n8n template **"Build your own SQLite MCP server"** [^1_6] exposes SQLite directly (SELECT/INSERT/UPDATE) via MCP Server Trigger. Use it to test without GhostCrab, or combine: n8n exposes raw SQLite; GhostCrab adds the ontology layer on top.

***

## Watchouts

- **Network reachability**: MCP Client Tool requires the GhostCrab SSE endpoint to be reachable from the n8n process (localhost is fine if everything runs on one machine) [^1_1]
- **STDIO vs SSE**: STDIO is simpler for local/dev; SSE fits multi-agent or remote deployment [^1_3]
- **SSE timeouts**: set n8n-side timeouts to avoid hanging SSE connections if GhostCrab is slow on complex graph queries [^1_1]
- **Tool schemas**: polish JSON Schema descriptions on GhostCrab tools — n8n passes them straight to the LLM so the agent knows what to call [^1_1]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://www.leanware.co/insights/n8n-mcp-integration

[^1_2]: https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/

[^1_3]: https://blog.elest.io/no-code-mcp-setup-with-n8n/

[^1_4]: https://github.com/nerding-io/n8n-nodes-mcp

[^1_5]: https://www.youtube.com/watch?v=kLgu-lQp5DY

[^1_6]: https://n8n.io/workflows/3632-build-your-own-sqlite-mcp-server/

[^1_7]: https://www.leanware.co/insights/n8n-nodes-mcp-guide

[^1_8]: https://generect.com/blog/n8n-mcp/

[^1_9]: https://www.youtube.com/watch?v=NUb73ErUCsA

[^1_10]: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/

[^1_11]: https://github.com/DangerBlack/n8n-node-sqlite3

[^1_12]: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpClient/

[^1_13]: https://globifye.com/🚀-build-your-own-sqlite-mcp-server/

[^1_14]: https://www.npmjs.com/package/n8n-nodes-mcp

[^1_15]: https://www.youtube.com/watch?v=7rUAk6aIarQ

