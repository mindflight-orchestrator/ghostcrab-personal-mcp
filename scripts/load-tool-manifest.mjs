import { buildToolCatalog } from "../dist/tools/catalog.js";
import { registerAllTools } from "../dist/tools/register-all.js";
import {
  EXPECTED_TOOL_NAMES,
  diffToolNames,
  getExpectedToolManifest
} from "../dist/tools/tool-manifest.js";
import {
  listRegisteredTools
} from "../dist/tools/registry.js";

export function loadToolManifestFromDist() {
  registerAllTools();

  const tools = listRegisteredTools();
  const registered = tools.map((tool) => tool.name).sort();
  const diff = diffToolNames(registered);

  return {
    manifest: getExpectedToolManifest(),
    catalog: buildToolCatalog(tools).sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    registered,
    expected_names: EXPECTED_TOOL_NAMES,
    missing: diff.missing,
    extra: diff.extra
  };
}
