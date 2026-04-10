const args = process.argv.slice(2);

if (args.includes("--no-telemetry")) {
  process.env.MCP_TELEMETRY = "0";
}

const argsForRouting = args.filter((arg) => arg !== "--no-telemetry");
const firstArg = argsForRouting[0];

if (!firstArg || firstArg === "serve") {
  const { startMcpServer } = await import("./server.js");
  await startMcpServer();
} else {
  const { runCli } = await import("./cli/runner.js");
  await runCli(args);
}
