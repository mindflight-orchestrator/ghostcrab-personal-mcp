export function workspaceNotFoundMessage(workspaceId: string): string {
  return (
    `Workspace '${workspaceId}' does not exist in this database. ` +
    `Call ghostcrab_workspace_list to see valid workspace_ids. ` +
    `Do not open the SQLite file directly — use MCP tools only.`
  );
}
