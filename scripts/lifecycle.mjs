import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseJson, portableValue, runProcess, writeCommandEvidence, writeFailureEvidence } from "./lib/process.mjs";
import { summarize, writeResultDocument } from "./lib/results.mjs";

const root = process.cwd();
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : ".tmp/results-lifecycle.json";
const openapiBin = path.join(root, "node_modules/openapi-to/bin/openapi.js");
const relativeOutputDir = `.tmp/lifecycle-${process.pid}`;
const outputDir = path.join(root, relativeOutputDir);
const hashesPath = path.join(root, "reports/evidence/hashes/lifecycle.json");
const results = [];
const hashEvidence = {};

await mkdir(path.dirname(hashesPath), { recursive: true });
await rm(outputDir, { recursive: true, force: true });

async function hashFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function hashTree(directory) {
  if (!existsSync(directory)) return null;
  const entries = [];
  async function visit(current) {
    for (const name of (await readdir(current)).sort()) {
      const absolute = path.join(current, name);
      const info = await stat(absolute);
      if (info.isDirectory()) await visit(absolute);
      else entries.push({
        path: path.relative(directory, absolute).split(path.sep).join("/"),
        sha256: await hashFile(absolute),
      });
    }
  }
  await visit(directory);
  return {
    entries,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

async function runLifecycle(id, args, input, assert, expected) {
  const actual = await runProcess({
    executable: process.execPath,
    args: [openapiBin, ...args],
    cwd: root,
    env: {
      LIFECYCLE_INPUT: input,
      LIFECYCLE_OUTPUT_DIR: relativeOutputDir,
    },
    stage: id,
  });
  const commandEvidence = await writeCommandEvidence(root, id, actual, {
    input,
    outputDir: relativeOutputDir,
  });
  let assertion;
  let assertionMessage;
  try {
    const outcome = await assert(actual);
    assertion = typeof outcome === "object" ? outcome.pass : outcome;
    assertionMessage = typeof outcome === "object" ? outcome.message : undefined;
  } catch (error) {
    assertion = false;
    assertionMessage = `${error.name}: ${error.message}`;
  }
  const status = assertion ? "PASS" : "FAIL";
  const evidence = [commandEvidence, "reports/evidence/hashes/lifecycle.json"];
  if (status === "FAIL") evidence.push(...await writeFailureEvidence(root, id, actual));
  results.push({
    id,
    suite: "lifecycle",
    feature: expected,
    command: portableValue(root, actual.command),
    args: portableValue(root, actual.args),
    expected,
    actual: assertionMessage ?? `exit ${actual.exitCode}`,
    exitCode: actual.exitCode,
    status,
    evidence,
    rootCauseId: status === "FAIL" ? `HARNESS-${id}` : undefined,
    rootCauseIds: status === "FAIL" ? [`HARNESS-${id}`] : undefined,
    severity: status === "FAIL" ? "HARNESS" : undefined,
    notes: "",
  });
}

try {
  await runLifecycle(
    "LIFE-001",
    ["generate", "--config", "lifecycle.config.ts", "--dry-run", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => {
      hashEvidence["LIFE-001"] = { outputExistsAfterDryRun: existsSync(outputDir) };
      return {
        pass: actual.exitCode === 0 && parseJson(actual.stdout)?.mode === "dry-run" && !existsSync(outputDir),
        message: `exit ${actual.exitCode}; outputExists=${existsSync(outputDir)}`,
      };
    },
    "dry-run does not write formal output",
  );

  await runLifecycle(
    "LIFE-003",
    ["generate", "--config", "lifecycle.config.ts", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => {
      const expectedFiles = [
        ".openapi-to-manifest.json",
        "life/keep-operation.types.ts",
        "life/remove-operation.types.ts",
        "types/models/keep.model.ts",
        "types/models/remove.model.ts",
      ];
      const present = expectedFiles.every((file) => existsSync(path.join(outputDir, file)));
      hashEvidence["LIFE-003"] = { expectedFiles, present, tree: await hashTree(outputDir) };
      if (present) await writeFile(path.join(outputDir, "handwritten.txt"), "hand-written sentinel\n");
      return {
        pass: actual.exitCode === 0 && parseJson(actual.stdout)?.success === true && present,
        message: `exit ${actual.exitCode}; managedFilesPresent=${present}`,
      };
    },
    "managed output and ownership manifest are correct",
  );

  await runLifecycle(
    "LIFE-002",
    ["generate", "--config", "lifecycle.config.ts", "--check", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => ({
      pass: actual.exitCode === 0 && parseJson(actual.stdout)?.success === true,
      message: `exit ${actual.exitCode}; success=${parseJson(actual.stdout)?.success === true}`,
    }),
    "check succeeds for current output",
  );

  const stableBefore = await hashTree(outputDir);
  await runLifecycle(
    "LIFE-004",
    ["generate", "--config", "lifecycle.config.ts", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => {
      const after = await hashTree(outputDir);
      hashEvidence["LIFE-004"] = { before: stableBefore, after };
      return {
        pass: actual.exitCode === 0 && stableBefore?.sha256 === after?.sha256,
        message: `exit ${actual.exitCode}; byteStable=${stableBefore?.sha256 === after?.sha256}`,
      };
    },
    "second generation is byte-stable",
  );

  const driftFile = path.join(outputDir, "types/models/keep.model.ts");
  const controlledOriginal = await readFile(driftFile);
  await writeFile(driftFile, `${controlledOriginal.toString()}\n// controlled acceptance drift\n`);
  const driftHash = await hashFile(driftFile);
  await runLifecycle(
    "LIFE-005",
    ["generate", "--config", "lifecycle.config.ts", "--check", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => {
      hashEvidence["LIFE-005"] = { driftFile: "types/models/keep.model.ts", driftHash };
      return {
        pass: actual.exitCode === 6 && parseJson(actual.stdout)?.success === false,
        message: `exit ${actual.exitCode}; expected drift exit=6`,
      };
    },
    "artificial drift makes check return exit 6",
  );

  await runLifecycle(
    "LIFE-006",
    ["generate", "--config", "lifecycle.config.ts", "--check", "--json"],
    "fixtures/regression/lifecycle-v1.yaml",
    async (actual) => {
      const afterCheckHash = await hashFile(driftFile);
      hashEvidence["LIFE-006"] = { before: driftHash, after: afterCheckHash };
      return {
        pass: actual.exitCode === 6 && afterCheckHash === driftHash,
        message: `exit ${actual.exitCode}; driftUnchanged=${afterCheckHash === driftHash}`,
      };
    },
    "check does not automatically repair drift",
  );
  await writeFile(driftFile, controlledOriginal);

  const handwrittenBefore = await hashFile(path.join(outputDir, "handwritten.txt"));
  await runLifecycle(
    "LIFE-007",
    ["generate", "--config", "lifecycle.config.ts", "--json"],
    "fixtures/regression/lifecycle-v2.yaml",
    async (actual) => {
      const removed = [
        "life/remove-operation.types.ts",
        "types/models/remove.model.ts",
      ].every((file) => !existsSync(path.join(outputDir, file)));
      hashEvidence["LIFE-007"] = { managedStaleFilesRemoved: removed, tree: await hashTree(outputDir) };
      return {
        pass: actual.exitCode === 0 && removed,
        message: `exit ${actual.exitCode}; managedStaleFilesRemoved=${removed}`,
      };
    },
    "clean removes stale managed files",
  );

  await runLifecycle(
    "LIFE-008",
    ["generate", "--config", "lifecycle.config.ts", "--check", "--json"],
    "fixtures/regression/lifecycle-v2.yaml",
    async (actual) => {
      const handwrittenFile = path.join(outputDir, "handwritten.txt");
      const preserved = existsSync(handwrittenFile) && await hashFile(handwrittenFile) === handwrittenBefore;
      hashEvidence["LIFE-008"] = { handwrittenPreserved: preserved, sha256: handwrittenBefore };
      return {
        pass: actual.exitCode === 0 && preserved,
        message: `exit ${actual.exitCode}; handwrittenPreserved=${preserved}`,
      };
    },
    "clean preserves handwritten files",
  );

  const manifestFile = path.join(outputDir, ".openapi-to-manifest.json");
  const manifestBefore = await hashFile(manifestFile);
  await runLifecycle(
    "LIFE-009",
    ["generate", "--config", "lifecycle.config.ts", "--json"],
    "fixtures/regression/lifecycle-v2.yaml",
    async (actual) => {
      const manifestAfter = await hashFile(manifestFile);
      hashEvidence["LIFE-009"] = { before: manifestBefore, after: manifestAfter };
      return {
        pass: actual.exitCode === 0 && manifestBefore === manifestAfter,
        message: `exit ${actual.exitCode}; manifestByteStable=${manifestBefore === manifestAfter}`,
      };
    },
    "ownership manifest is byte-stable",
  );
} finally {
  await writeFile(hashesPath, `${JSON.stringify(hashEvidence, null, 2)}\n`);
  await rm(outputDir, { recursive: true, force: true });
}

await writeResultDocument(root, output, results, { source: "lifecycle" });
const summary = summarize(results);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.fail === 0 ? 0 : 1;
