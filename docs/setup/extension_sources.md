# PostgreSQL extension sources

GhostCrab ships Zig-built PostgreSQL extensions under `extensions/` in this repository. Each directory is the canonical **vendored** copy used for local development and CI.

## Upstream GitHub repositories

| Directory | Repository |
|-----------|------------|
| `extensions/pg_facets` | [mindflight-orchestrator/pg_facets](https://github.com/mindflight-orchestrator/pg_facets) |
| `extensions/pg_dgraph` | [mindflight-orchestrator/pg_dgraph](https://github.com/mindflight-orchestrator/pg_dgraph) |
| `extensions/pg_pragma` | [mindflight-orchestrator/pg_pragma](https://github.com/mindflight-orchestrator/pg_pragma) |

## Private repository access

If a repository is private, configure Git authentication **on your machine only** (credential helper, SSH deploy key, or personal access token). **Never commit tokens, passwords, or `.netrc` entries** into this repository.

Example (HTTPS with token in the environment — illustrative only):

```bash
git config --global url."https://${GITHUB_TOKEN}@github.com/mindflight-orchestrator/".insteadOf "https://github.com/mindflight-orchestrator/"
```

Prefer SSH remotes when possible.

## Optional: submodules instead of vendored trees

This repo currently tracks extension files as normal tree content. To replace a directory with an official submodule (same path), use a **maintenance window** and align with your Git hosting policies:

1. Remove the tracked directory from the index (keep a backup):  
   `git rm -r extensions/pg_facets`
2. Add the submodule:  
   `git submodule add https://github.com/mindflight-orchestrator/pg_facets.git extensions/pg_facets`
3. Repeat for `pg_dgraph` and `pg_pragma` as needed.
4. Commit `.gitmodules` and submodule pointers; document pins in [docs/Postgresql/docker_image_build.md](../Postgresql/docker_image_build.md).

Until that migration, pull updates from upstream by syncing the vendored directories with the corresponding GitHub default branch (or release tags) and re-run tests.

## Related

- Native image build pins: [docs/Postgresql/docker_image_build.md](../Postgresql/docker_image_build.md)
- Dual-mode roadmap (SQL-first + native): [docs/ROADMAP-V2.md](../ROADMAP-V2.md)
