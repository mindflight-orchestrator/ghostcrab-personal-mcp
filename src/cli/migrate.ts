import { resolveGhostcrabConfig } from "../config/env.js";

async function main(): Promise<void> {
  const config = resolveGhostcrabConfig();
  console.error(
    `[ghostcrab] SQLite mode is backed by the MindBrain backend at ${config.mindbrainUrl}; schema bootstrap is handled by the backend, so migrate is a no-op here.`
  );
  console.error(
    `[ghostcrab] To bootstrap the schema, ensure ghostcrab-backend is running (it applies the schema on startup).`
  );
}

void main().catch((error) => {
  console.error(
    `[ghostcrab] Error: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
