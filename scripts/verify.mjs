import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { portableValue, runProcess, writeCommandEvidence } from "./lib/process.mjs";
import {
  loadAndValidateFragment,
  normalizeCase,
  summarize,
  validateSuiteExitCode,
  writeResultDocument,
} from "./lib/results.mjs";

const root = process.cwd();
const runId = randomUUID();
const verifyStartedAt = new Date().toISOString();
const runDirectory = path.join(root, `.tmp/verify-${runId}`);
const baselineEvidenceDirectory = path.join(root, "reports/evidence/runs/latest");
const baselineEvidencePath = path.join(baselineEvidenceDirectory, "baseline.json");
const compatibilityBaselinePath = path.join(root, "reports/evidence/commands/BASELINE-START.json");
const cases = [];
const sourceMetadata = {};

await mkdir(runDirectory, { recursive: true });

const baselineDefinitions = [
  { key: "gitHead", executable: "git", args: ["rev-parse", "HEAD"] },
  { key: "gitStatus", executable: "git", args: ["status", "--short"] },
  { key: "branch", executable: "git", args: ["branch", "--show-current"] },
  { key: "nodeVersion", executable: "node", args: ["--version"] },
  { key: "pnpmVersion", executable: "pnpm", args: ["--version"] },
  { key: "openapiVersion", executable: "pnpm", args: ["exec", "openapi", "--version"] },
];

const baselineCommands = [];
const baselineValues = {};
for (const definition of baselineDefinitions) {
  const actual = await runProcess({
    executable: definition.executable,
    args: definition.args,
    cwd: root,
    timeoutMs: 120_000,
    stage: `verify:baseline:${definition.key}`,
  });
  baselineValues[definition.key] = actual.exitCode === 0 ? actual.stdout.trim() : null;
  baselineCommands.push({
    command: `${definition.executable} ${definition.args.join(" ")}`,
    exitCode: actual.exitCode,
    signal: actual.signal,
    timedOut: actual.timedOut,
    stdout: portableValue(root, actual.stdout.trim()),
    stderr: portableValue(root, actual.stderr.trim()),
  });
}

const baseline = {
  schemaVersion: "1.0.0",
  runId,
  startedAt: verifyStartedAt,
  branch: baselineValues.branch,
  gitHead: baselineValues.gitHead,
  gitStatus: baselineValues.gitStatus === null
    ? null
    : baselineValues.gitStatus.split("\n").filter(Boolean).map((value) => portableValue(root, value)),
  nodeVersion: baselineValues.nodeVersion,
  pnpmVersion: baselineValues.pnpmVersion,
  openapiVersion: baselineValues.openapiVersion,
  commands: baselineCommands,
};
const serializedBaseline = `${JSON.stringify(baseline, null, 2)}\n`;
await mkdir(baselineEvidenceDirectory, { recursive: true });
await writeFile(path.join(runDirectory, "baseline.json"), serializedBaseline);
await writeFile(baselineEvidencePath, serializedBaseline);
await copyFile(baselineEvidencePath, compatibilityBaselinePath);

async function addHarnessFailure({
  id,
  feature,
  expected,
  actual,
  exitCode = 1,
  notes = "",
}) {
  const evidenceId = id.replace(/[^A-Za-z0-9_-]/g, "-");
  const evidencePath = `reports/evidence/commands/${evidenceId}.json`;
  await mkdir(path.dirname(path.join(root, evidencePath)), { recursive: true });
  await writeFile(path.join(root, evidencePath), `${JSON.stringify({
    id,
    runId,
    testHarnessCommit: baseline.gitHead,
    recordedAt: new Date().toISOString(),
    expected,
    actual: portableValue(root, actual),
    exitCode,
  }, null, 2)}\n`);
  cases.push(normalizeCase({
    id,
    suite: "harness",
    feature,
    command: "verify integrity validation",
    args: [],
    expected,
    actual: portableValue(root, actual),
    exitCode,
    status: "FAIL",
    evidence: [evidencePath],
    severity: "HARNESS",
    notes,
  }));
}

const baselineComplete =
  baseline.schemaVersion === "1.0.0" &&
  baseline.runId === runId &&
  Date.parse(baseline.startedAt) === Date.parse(verifyStartedAt) &&
  typeof baseline.branch === "string" &&
  typeof baseline.gitHead === "string" &&
  Array.isArray(baseline.gitStatus) &&
  baseline.commands.length === baselineDefinitions.length &&
  baseline.commands.every((item) => item.exitCode === 0 && !item.signal && !item.timedOut);

if (!baselineComplete) {
  await addHarnessFailure({
    id: "HARNESS-BASELINE-CAPTURE",
    feature: "verify baseline capture",
    expected: "all baseline commands succeed and produce a complete current-run baseline",
    actual: baseline,
  });
}

const expectedCommit = baseline.gitHead ?? "BASELINE-UNAVAILABLE";
const fragments = [
  {
    id: "acceptance",
    source: "acceptance",
    script: "scripts/acceptance.mjs",
    output: path.join(runDirectory, "acceptance.json"),
  },
  {
    id: "typescript-matrix",
    source: "typescript-matrix",
    script: "scripts/typescript-matrix.mjs",
    output: path.join(runDirectory, "typescript-matrix.json"),
  },
  {
    id: "lifecycle",
    source: "lifecycle",
    script: "scripts/lifecycle.mjs",
    output: path.join(runDirectory, "lifecycle.json"),
  },
];

for (const definition of fragments) {
  const actual = await runProcess({
    executable: process.execPath,
    args: [
      definition.script,
      "--run-id", runId,
      "--test-harness-commit", expectedCommit,
      "--verify-started-at", verifyStartedAt,
      "--output", definition.output,
    ],
    cwd: root,
    timeoutMs: 15 * 60_000,
    stage: `verify:${definition.id}`,
  });
  if (actual.stdout) process.stdout.write(actual.stdout);
  if (actual.stderr) process.stderr.write(actual.stderr);

  const metadata = {
    runId,
    testHarnessCommit: expectedCommit,
    source: definition.source,
    output: portableValue(root, definition.output),
    exitCode: actual.exitCode,
    signal: actual.signal,
    timedOut: actual.timedOut,
    fragmentIdentityValid: false,
    exitCodeConsistent: false,
  };
  sourceMetadata[definition.id] = metadata;

  if (actual.timedOut) {
    await addHarnessFailure({
      id: `HARNESS-${definition.id.toUpperCase()}-TIMEOUT`,
      feature: `${definition.id} suite timeout`,
      expected: "suite completes before timeout",
      actual: actual.diagnostic,
      exitCode: actual.exitCode,
    });
  }
  if (actual.signal) {
    await addHarnessFailure({
      id: `HARNESS-${definition.id.toUpperCase()}-SIGNAL`,
      feature: `${definition.id} suite signal termination`,
      expected: "suite exits normally without a signal",
      actual: actual.diagnostic,
      exitCode: actual.exitCode,
    });
  }

  let fragment;
  try {
    fragment = await loadAndValidateFragment({
      file: definition.output,
      expectedRunId: runId,
      expectedCommit,
      expectedSource: definition.source,
      verifyStartedAt,
    });
    metadata.fragmentIdentityValid = true;
  } catch (error) {
    const suffix = String(error.code ?? "FRAGMENT_INVALID")
      .replace(/^FRAGMENT_/, "")
      .replaceAll("_", "-");
    await addHarnessFailure({
      id: `HARNESS-${definition.id.toUpperCase()}-FRAGMENT-${suffix}`,
      feature: `${definition.id} fragment integrity`,
      expected: "fragment identity, timestamp, cases, and summary match the current verify run",
      actual: `${error.code ?? error.name}: ${error.message}`,
      exitCode: actual.exitCode,
    });
    continue;
  }

  cases.push(...fragment.cases.map(normalizeCase));
  Object.assign(metadata, {
    generatedAt: fragment.generatedAt,
    startedAt: fragment.startedAt,
    summary: fragment.summary,
    matrix: fragment.matrix,
    compilerOptions: fragment.compilerOptions,
    compilerDifferences: fragment.compilerDifferences,
    dependencies: fragment.dependencies,
  });

  if (!actual.timedOut && !actual.signal) {
    try {
      validateSuiteExitCode({ summary: fragment.summary, exitCode: actual.exitCode });
      metadata.exitCodeConsistent = true;
    } catch (error) {
      await addHarnessFailure({
        id: `HARNESS-${definition.id.toUpperCase()}-EXIT-MISMATCH`,
        feature: `${definition.id} suite exit/result consistency`,
        expected: "summary.fail > 0 exits 1; summary.fail === 0 exits 0",
        actual: error.message,
        exitCode: actual.exitCode,
      });
    }
  }
}

const allFailuresHaveRootCauses = cases
  .filter((item) => item.status === "FAIL")
  .every((item) => item.rootCauseId && Array.isArray(item.rootCauseIds) && item.rootCauseIds.length > 0);
const fragmentIdentityComplete = fragments.every((item) => sourceMetadata[item.id]?.fragmentIdentityValid === true);
const suiteExitCodesConsistent = fragments.every((item) => sourceMetadata[item.id]?.exitCodeConsistent === true);
const testHarnessCommitMatchesBaseline = fragments.every((item) =>
  sourceMetadata[item.id]?.testHarnessCommit === baseline.gitHead
);
const versionCases = cases.filter((item) => item.id.startsWith("TS-VERSION-"));
const compilerVersionsComplete = versionCases.length === 3 &&
  versionCases.every((item) => item.status === "PASS" && item.requestedVersion === item.actualVersion);
const evidenceTargets = cases
  .filter((item) => ["FAIL", "KNOWN_LIMITATION"].includes(item.status))
  .flatMap((item) => item.evidence ?? []);
const missingEvidence = [...new Set(evidenceTargets)]
  .filter((relativePath) => !existsSync(path.join(root, relativePath)));
const evidenceCompleteness = {
  complete: false,
  missingEvidence,
  fragmentIdentityComplete,
  suiteExitCodesConsistent,
  allFailuresHaveRootCauses,
  baselineComplete,
  compilerVersionsComplete,
  testHarnessCommitMatchesBaseline,
};
evidenceCompleteness.complete = Object.entries(evidenceCompleteness)
  .filter(([key]) => !["complete", "missingEvidence"].includes(key))
  .every(([, value]) => value === true) &&
  missingEvidence.length === 0;

if (!evidenceCompleteness.complete) {
  await addHarnessFailure({
    id: "HARNESS-EVIDENCE-COMPLETENESS",
    feature: "verify evidence completeness",
    expected: "all completeness checks are true and missingEvidence is empty",
    actual: evidenceCompleteness,
  });
}

const resultsMetadata = {
  source: "verify",
  runId,
  verifyStartedAt,
  startedAt: verifyStartedAt,
  testHarnessCommit: baseline.gitHead,
  baseline: {
    branch: baseline.branch,
    gitHead: baseline.gitHead,
    gitStatus: baseline.gitStatus,
    startedAt: baseline.startedAt,
    evidence: "reports/evidence/runs/latest/baseline.json",
  },
  sources: sourceMetadata,
  evidenceCompleteness,
};
let resultWrite = await writeResultDocument(root, "reports/results.json", cases, resultsMetadata);

let report = await runProcess({
  executable: process.execPath,
  args: ["scripts/report.mjs"],
  cwd: root,
  timeoutMs: 5 * 60_000,
  stage: "verify:report",
});
if (report.stdout) process.stdout.write(report.stdout);
if (report.stderr) process.stderr.write(report.stderr);
const initialReportExitCode = report.exitCode;

if (report.timedOut || report.signal || report.exitCode !== 0) {
  const reportEvidence = await writeCommandEvidence(root, "HARNESS-REPORT-GENERATION", report);
  cases.push(normalizeCase({
    id: "HARNESS-REPORT-GENERATION",
    suite: "harness",
    feature: "result-driven report generation",
    command: portableValue(root, report.command),
    args: portableValue(root, report.args),
    expected: "report completes without timeout/signal and exits 0",
    actual: portableValue(root, report.diagnostic),
    exitCode: report.exitCode,
    status: "FAIL",
    evidence: [reportEvidence],
    severity: "HARNESS",
    notes: "",
  }));
  evidenceCompleteness.complete = false;
  resultWrite = await writeResultDocument(root, "reports/results.json", cases, resultsMetadata);
  report = await runProcess({
    executable: process.execPath,
    args: ["scripts/report.mjs"],
    cwd: root,
    timeoutMs: 5 * 60_000,
    stage: "verify:report-retry",
  });
  if (report.stdout) process.stdout.write(report.stdout);
  if (report.stderr) process.stderr.write(report.stderr);
}

const finalSummary = summarize(resultWrite.document.cases);
const finalExitCode = finalSummary.fail > 0 || report.exitCode !== 0 ? 1 : 0;
const verifyMetadata = {
  schemaVersion: "1.0.0",
  runId,
  verifyStartedAt,
  generatedAt: new Date().toISOString(),
  testHarnessCommit: baseline.gitHead,
  suites: Object.fromEntries(Object.entries(sourceMetadata).map(([key, value]) => [key, {
    exitCode: value.exitCode,
    signal: value.signal,
    timedOut: value.timedOut,
    fragmentIdentityValid: value.fragmentIdentityValid,
    exitCodeConsistent: value.exitCodeConsistent,
  }])),
  report: {
    initialExitCode: initialReportExitCode,
    finalExitCode: report.exitCode,
    signal: report.signal,
    timedOut: report.timedOut,
  },
  resultExitCode: finalSummary.fail > 0 ? 1 : 0,
  finalExitCode,
};
await writeFile(path.join(runDirectory, "verify-metadata.json"), `${JSON.stringify(verifyMetadata, null, 2)}\n`);

console.log(JSON.stringify(verifyMetadata, null, 2));
process.exitCode = finalExitCode;
