import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { portableValue, runProcess } from "./lib/process.mjs";
import { createDocument, writeResultDocument } from "./lib/results.mjs";

const root = process.cwd();
const fragments = [
  {
    id: "acceptance",
    script: "scripts/acceptance.mjs",
    output: ".tmp/results-acceptance-all.json",
  },
  {
    id: "typescript-matrix",
    script: "scripts/typescript-matrix.mjs",
    output: ".tmp/results-typescript-matrix.json",
  },
  {
    id: "lifecycle",
    script: "scripts/lifecycle.mjs",
    output: ".tmp/results-lifecycle.json",
  },
];
const cases = [];
const sourceMetadata = {};

for (const fragment of fragments) {
  const actual = await runProcess({
    executable: process.execPath,
    args: [fragment.script, "--output", fragment.output],
    cwd: root,
    timeoutMs: 15 * 60_000,
    stage: `verify:${fragment.id}`,
  });
  if (actual.stdout) process.stdout.write(actual.stdout);
  if (actual.stderr) process.stderr.write(actual.stderr);
  try {
    const document = JSON.parse(await readFile(path.join(root, fragment.output), "utf8"));
    cases.push(...document.cases);
    sourceMetadata[fragment.id] = {
      exitCode: actual.exitCode,
      generatedAt: document.generatedAt,
      summary: document.summary,
      matrix: document.matrix,
      compilerOptions: document.compilerOptions,
      compilerDifferences: document.compilerDifferences,
      dependencies: document.dependencies,
    };
  } catch (error) {
    cases.push({
      id: `HARNESS-${fragment.id.toUpperCase()}`,
      suite: "harness",
      feature: `${fragment.id} result production`,
      command: portableValue(root, actual.command),
      args: portableValue(root, actual.args),
      expected: "suite produces a readable result fragment",
      actual: `${error.name}: ${error.message}`,
      exitCode: actual.exitCode,
      status: "FAIL",
      evidence: [],
      rootCauseId: `HARNESS-${fragment.id.toUpperCase()}`,
      rootCauseIds: [`HARNESS-${fragment.id.toUpperCase()}`],
      severity: "HARNESS",
      notes: portableValue(root, actual.diagnostic),
    });
  }
}

const head = await runProcess({
  executable: "git",
  args: ["rev-parse", "HEAD"],
  cwd: root,
  stage: "verify:git-head",
});
const document = createDocument(cases, {
  source: "verify",
  testHarnessCommit: head.exitCode === 0 ? head.stdout.trim() : null,
  sources: sourceMetadata,
});
await writeResultDocument(root, "reports/results.json", cases, {
  source: document.source,
  testHarnessCommit: document.testHarnessCommit,
  sources: document.sources,
});

const testFailed = document.summary.fail > 0;
const report = await runProcess({
  executable: process.execPath,
  args: ["scripts/report.mjs"],
  cwd: root,
  timeoutMs: 5 * 60_000,
  stage: "verify:report",
});
if (report.stdout) process.stdout.write(report.stdout);
if (report.stderr) process.stderr.write(report.stderr);

console.log(JSON.stringify({
  testExitCode: testFailed ? 1 : 0,
  reportExitCode: report.exitCode,
  finalExitCode: testFailed || report.exitCode !== 0 ? 1 : 0,
}, null, 2));
process.exitCode = testFailed || report.exitCode !== 0 ? 1 : 0;
