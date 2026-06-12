// Detects openspec changes that are fully completed but not yet archived.
//
// Rule: a change is "stale" when its directory sits directly under
// openspec/changes/ (not under changes/archive/) AND its tasks.md contains at
// least one completed task (`- [x]`) and zero open tasks (`- [ ]`).
// Capability presence in openspec/specs/ is intentionally NOT used as a
// signal: capabilities are shared across changes and pre-exist them.
//
// Modes:
//   node scripts/check-openspec-archived.js            report stale changes, exit 0
//   node scripts/check-openspec-archived.js --strict   exit 1 when stale changes exist
//
// CI runs --strict: a fully completed change must be archived (and its delta
// specs merged into openspec/specs/) before the branch can go green.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesDir = join(repoRoot, "openspec", "changes");
const strict = process.argv.slice(2).includes("--strict");

const CHECKBOX_PATTERN = /^\s*[-*]\s*\[( |x|X)\]/;

function countTaskBoxes(tasksPath) {
  const counts = { done: 0, open: 0 };
  const text = readFileSync(tasksPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = CHECKBOX_PATTERN.exec(line);
    if (!match) {
      continue;
    }
    if (match[1] === " ") {
      counts.open += 1;
    } else {
      counts.done += 1;
    }
  }
  return counts;
}

function findStaleChanges() {
  if (!existsSync(changesDir)) {
    return [];
  }
  const stale = [];
  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "archive") {
      continue;
    }
    const tasksPath = join(changesDir, entry.name, "tasks.md");
    if (!existsSync(tasksPath)) {
      continue;
    }
    const { done, open } = countTaskBoxes(tasksPath);
    if (done > 0 && open === 0) {
      stale.push({ name: entry.name, done });
    }
  }
  return stale.sort((a, b) => a.name.localeCompare(b.name));
}

const staleChanges = findStaleChanges();

if (staleChanges.length === 0) {
  console.log("check-openspec-archived: no fully completed unarchived changes found.");
  process.exit(0);
}

const heading = strict
  ? "check-openspec-archived: FAIL — fully completed changes must be archived:"
  : "check-openspec-archived: WARNING — fully completed changes pending archive:";
console.log(heading);
for (const change of staleChanges) {
  console.log(`  - ${change.name} (${change.done}/${change.done} tasks complete)`);
}
console.log(
  strict
    ? "Archive them under openspec/changes/archive/ to unblock."
    : "Run with --strict to make this a hard failure once archiving is done."
);
process.exit(strict ? 1 : 0);
