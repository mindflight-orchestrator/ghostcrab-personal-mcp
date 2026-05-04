#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const profilesDir = path.join(repoRoot, "shared", "demo-profiles");
const aggregatePath = path.join(repoRoot, "shared", "bootstrap_seed.jsonl");
const profileFiles = [
  "codebase-intelligence.jsonl",
  "compliance-audit.jsonl",
  "crm-pipeline.jsonl",
  "incident-response.jsonl",
  "knowledge-base.jsonl",
  "project-delivery.jsonl",
  "software-delivery.jsonl"
];

const missingFiles = profileFiles.filter((name) => !fs.existsSync(path.join(profilesDir, name)));

if (missingFiles.length > 0) {
  throw new Error(`Missing demo profile file(s): ${missingFiles.join(", ")}`);
}

const chunks = profileFiles.map((name) =>
  fs.readFileSync(path.join(profilesDir, name), "utf8").trim()
);

const output = `${chunks.join("\n")}\n`;
fs.writeFileSync(aggregatePath, output, "utf8");

console.log(
  `Wrote ${path.relative(repoRoot, aggregatePath)} from ${profileFiles.length} profile file(s).`
);
