#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const demoDir = path.join(repoRoot, "shared", "demo-profiles");

function readProfile(fileName) {
  const filePath = path.join(demoDir, fileName);
  const entries = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const profile = entries.find((entry) => entry.kind === "profile");
  const kinds = countKinds(entries);

  return {
    id: profile.profile_id,
    title: profile.title,
    description: profile.description,
    tags: profile.tags,
    recommended_entrypoints: profile.recommended_entrypoints,
    file: path.relative(repoRoot, filePath),
    entry_count: entries.length,
    kinds,
    seeded_summary: summarizeKinds(kinds)
  };
}

function countKinds(entries) {
  const counts = {
    remember: 0,
    learn_node: 0,
    learn_edge: 0,
    projection: 0
  };

  for (const entry of entries) {
    if (entry.kind in counts) {
      counts[entry.kind] += 1;
    }
  }

  return counts;
}

function summarizeKinds(kinds) {
  return [
    `${kinds.remember} fact record(s)`,
    `${kinds.learn_node} graph node(s)`,
    `${kinds.learn_edge} graph edge(s)`,
    `${kinds.projection} projection(s)`
  ];
}

function loadProfiles() {
  return fs
    .readdirSync(demoDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map(readProfile);
}

function printList(profiles) {
  console.log("Available demo projects:\n");
  for (const profile of profiles) {
    console.log(`${profile.id}`);
    console.log(`  objective: ${profile.description}`);
    console.log(`  best fit: ${profile.recommended_entrypoints.join(", ")}`);
    console.log(`  seeds: ${profile.seeded_summary.join(", ")}`);
    console.log(`  file: ${profile.file}\n`);
  }
}

function printDetail(profile) {
  console.log(`${profile.id}`);
  console.log(`title: ${profile.title}`);
  console.log(`objective: ${profile.description}`);
  console.log(`tags: ${profile.tags.join(", ")}`);
  console.log(`best fit: ${profile.recommended_entrypoints.join(", ")}`);
  console.log(`file: ${profile.file}`);
  console.log("seeds:");
  for (const line of profile.seeded_summary) {
    console.log(`  - ${line}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");

  const profiles = loadProfiles();
  const selectedId = positional[0] ?? null;
  const selectedProfile = selectedId
    ? profiles.find((profile) => profile.id === selectedId)
    : null;

  if (selectedId && !selectedProfile) {
    console.error(
      `Unknown demo profile: ${selectedId}. Available: ${profiles.map((item) => item.id).join(", ")}`
    );
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(selectedProfile ?? profiles, null, 2));
    return;
  }

  if (selectedProfile) {
    printDetail(selectedProfile);
    return;
  }

  printList(profiles);
}

main();
