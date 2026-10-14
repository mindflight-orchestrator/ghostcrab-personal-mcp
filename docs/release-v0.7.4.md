# GhostCrab Personal v0.7.4

Corrective release for the registry installation failure discovered after v0.7.3.

`npm install @mindflight/ghostcrab-personal-mcp` could receive SIGTERM from its
own postinstall upgrade routine. The old process matcher treated any command
containing the package name as a running GhostCrab server, including npm itself
behind the postinstall shell.

The upgrade now preserves its complete ancestor chain and matches the executable
or Node entrypoint rather than package names in arbitrary arguments. Actual
backend/MCP launch commands remain eligible for shutdown; package managers,
installation scripts, setup commands and unknown wrappers remain running.
Quoted Windows paths and common Node runtime flags are covered.

Validation: 934 tests passed, 16 optional skips; 39 installer-upgrade tests,
including 25 new regression cases. The local installation smoke now passes named
`@mindflight/...@file:` specs to npm, reproducing the relevant registry command
shape. It is required by the Linux native release job. CLI, authorization, tool
verification, bootstrap and Cursor setup all pass without disabling the upgrade.

The MindBrain pin and all twelve native binaries are unchanged from v0.7.3.
No database schema change or MCP contract change is introduced.

Evidence: [installer validation](../reports/validation/installer-v0.7.4/README.md).
Local archive hashes: [artifact manifest](release-v0.7.4-artifacts.json).
