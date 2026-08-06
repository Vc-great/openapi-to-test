import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { portableValue, runProcess, writeCommandEvidence, writeFailureEvidence } from "./lib/process.mjs";
import { resultIdentity, summarize, writeResultDocument } from "./lib/results.mjs";

const root = process.cwd();
const identity = resultIdentity();
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0
  ? process.argv[outputIndex + 1]
  : `.tmp/verify-${identity.runId}/typescript-matrix.json`;
const openapiBin = path.join(root, "node_modules/openapi-to/bin/openapi.js");
const evidenceGenerated = path.join(root, "reports/evidence/generated-minimal");
const evidenceHashes = path.join(root, "reports/evidence/hashes");
const results = [];

await mkdir(evidenceGenerated, { recursive: true });
await mkdir(evidenceHashes, { recursive: true });

const compilers = [
  { key: "TS56", tier: "legacy", packageName: "typescript-legacy", requestedVersion: "5.6.2" },
  { key: "TS6", tier: "baseline", packageName: "typescript-baseline", requestedVersion: "6.0.3" },
  { key: "TS7", tier: "current", packageName: "typescript-current", requestedVersion: "7.0.2" },
].map((compiler) => ({
  ...compiler,
  entry: path.join(root, `node_modules/${compiler.packageName}/bin/tsc`),
}));

const fullScenarios = [
  { key: "TS-TYPE", plugin: "pluginTSType", config: "scenarios/generators/tsconfig.ts-type.json" },
  { key: "TS-REQUEST", plugin: "pluginTSRequest", config: "scenarios/generators/tsconfig.ts-request.json" },
  { key: "ZOD", plugin: "pluginZod", config: "scenarios/generators/tsconfig.zod.json" },
  { key: "SWR", plugin: "pluginSWR", config: "scenarios/generators/tsconfig.swr.json" },
  { key: "VUE-QUERY", plugin: "pluginVueQuery", config: "scenarios/generators/tsconfig.vue-query.json" },
  { key: "MSW", plugin: "pluginMSW", config: "scenarios/generators/tsconfig.msw.json" },
  { key: "OAS31", plugin: "OpenAPI 3.1 fixture", config: "scenarios/generators/tsconfig.oas31.json" },
];

const strictOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: false,
  noEmit: true,
};

async function recordCommand(definition, extra = {}) {
  const actual = await runProcess({
    executable: definition.executable,
    args: definition.args,
    cwd: root,
    env: definition.env,
    timeoutMs: definition.timeoutMs,
    stage: definition.id,
  });
  const commandEvidence = await writeCommandEvidence(root, definition.id, actual, extra);
  const pass = definition.assert ? definition.assert(actual) : actual.exitCode === 0;
  const status = pass ? "PASS" : "FAIL";
  const evidence = [commandEvidence];
  if (status === "FAIL") evidence.push(...await writeFailureEvidence(root, definition.id, actual));
  const item = {
    id: definition.id,
    suite: "typescript-matrix",
    feature: definition.feature,
    plugin: definition.plugin,
    compilerTier: definition.compilerTier,
    requestedVersion: definition.requestedVersion,
    actualVersion: definition.actualVersion,
    command: portableValue(root, actual.command),
    args: portableValue(root, actual.args),
    expected: definition.expected,
    actual: definition.describe ? definition.describe(actual) : `exit ${actual.exitCode}`,
    exitCode: actual.exitCode,
    status,
    evidence,
    rootCauseId: status === "FAIL" ? definition.rootCauseId : undefined,
    rootCauseIds: status === "FAIL" ? definition.rootCauseIds : undefined,
    severity: status === "FAIL" ? definition.severity : undefined,
    notes: definition.notes ?? "",
  };
  results.push(item);
  return { actual, item };
}

const generationDefinitions = [
  { id: "GEN-ISO-SWR", config: "swr-minimal.config.ts", feature: "Generate minimal SWR isolation fixture" },
  { id: "GEN-ISO-MSW", config: "msw-minimal.config.ts", feature: "Generate minimal MSW schema-less isolation fixture" },
  { id: "GEN-ISO-TS-REQUEST", config: "ts-request-boundary.config.ts", feature: "Generate TS Request header/cookie boundary fixture" },
];
for (const definition of generationDefinitions) {
  await recordCommand({
    ...definition,
    executable: process.execPath,
    args: [openapiBin, "generate", "--config", definition.config, "--json"],
    expected: "minimal generation succeeds",
  });
}

const actualVersions = new Map();
for (const compiler of compilers) {
  const { actual, item } = await recordCommand({
    id: `TS-VERSION-${compiler.key}`,
    feature: `TypeScript ${compiler.tier} actual version`,
    compilerTier: compiler.tier,
    requestedVersion: compiler.requestedVersion,
    actualVersion: undefined,
    executable: process.execPath,
    args: [compiler.entry, "--version"],
    expected: `Version ${compiler.requestedVersion}`,
    assert: (result) => result.exitCode === 0 && result.stdout.trim() === `Version ${compiler.requestedVersion}`,
    describe: (result) => result.stdout.trim() || `exit ${result.exitCode}`,
  }, { requestedVersion: compiler.requestedVersion });
  const actualVersion = actual.stdout.trim().replace(/^Version\s+/, "");
  actualVersions.set(compiler.key, actualVersion);
  item.actualVersion = actualVersion;
}

function classifyFullFailure(plugin, outputText) {
  const rootCauseIds = [];
  if (/UseroptionalInlineModeEnumValue|TS2552/.test(outputText)) {
    rootCauseIds.push("BUG-INLINE-ENUM-CASING");
  }
  if (plugin === "pluginSWR" && /TS7006|implicitly has an 'any' type/.test(outputText)) {
    rootCauseIds.push("BUG-SWR-IMPLICIT-ANY");
  }
  if (plugin === "pluginMSW" && /get-schema-less-media\.handler|TS2345/.test(outputText)) {
    rootCauseIds.push("BUG-MSW-SCHEMALESS-JSON");
  }
  return rootCauseIds;
}

for (const compiler of compilers) {
  for (const scenario of fullScenarios) {
    const id = `TSC-${scenario.key}-${compiler.key}`;
    const run = await runProcess({
      executable: process.execPath,
      args: [compiler.entry, "-p", scenario.config],
      cwd: root,
      stage: id,
    });
    const commandEvidence = await writeCommandEvidence(root, id, run, {
      requestedVersion: compiler.requestedVersion,
      actualVersion: actualVersions.get(compiler.key),
      compilerOptions: strictOptions,
    });
    const status = run.exitCode === 0 ? "PASS" : "FAIL";
    const rootCauseIds = status === "FAIL"
      ? classifyFullFailure(scenario.plugin, `${run.stdout}\n${run.stderr}`)
      : [];
    if (status === "FAIL" && rootCauseIds.length === 0) {
      rootCauseIds.push(`COMPAT-${scenario.key}-${compiler.key}`);
    }
    const evidence = [commandEvidence];
    if (status === "FAIL") evidence.push(...await writeFailureEvidence(root, id, run));
    results.push({
      id,
      suite: "typescript-matrix",
      feature: `${scenario.plugin} full fixture strict compilation`,
      plugin: scenario.plugin,
      compilerTier: compiler.tier,
      requestedVersion: compiler.requestedVersion,
      actualVersion: actualVersions.get(compiler.key),
      command: portableValue(root, run.command),
      args: portableValue(root, run.args),
      expected: "strict compilation succeeds",
      actual: `exit ${run.exitCode}`,
      exitCode: run.exitCode,
      status,
      evidence,
      rootCauseId: rootCauseIds[0],
      rootCauseIds,
      severity: status === "FAIL" ? (rootCauseIds[0]?.startsWith("COMPAT-") ? "P2" : "P1") : undefined,
      rootCauseSeverities: status === "FAIL" ? {
        "BUG-INLINE-ENUM-CASING": "P1",
        "BUG-SWR-IMPLICIT-ANY": "P1",
        "BUG-MSW-SCHEMALESS-JSON": "P2",
      } : undefined,
      notes: "Full fixture is retained; rootCauseIds separate shared from plugin-specific failures.",
    });
  }
}

const isolatedRuns = [];
for (const compiler of compilers) {
  for (const isolated of [
    {
      key: "SWR-MIN",
      plugin: "pluginSWR",
      config: "scenarios/generators/tsconfig.swr-minimal.json",
      rootCauseId: "BUG-SWR-IMPLICIT-ANY",
      severity: "P1",
    },
    {
      key: "MSW-MIN",
      plugin: "pluginMSW",
      config: "scenarios/generators/tsconfig.msw-minimal.json",
      rootCauseId: "BUG-MSW-SCHEMALESS-JSON",
      severity: "P2",
    },
  ]) {
    const id = `TSC-${isolated.key}-${compiler.key}`;
    const { actual, item } = await recordCommand({
      id,
      feature: `${isolated.plugin} minimal isolation strict compilation`,
      plugin: isolated.plugin,
      compilerTier: compiler.tier,
      requestedVersion: compiler.requestedVersion,
      actualVersion: actualVersions.get(compiler.key),
      executable: process.execPath,
      args: [compiler.entry, "-p", isolated.config],
      expected: "strict compilation succeeds without the shared inline-enum fixture",
      rootCauseId: isolated.rootCauseId,
      rootCauseIds: [isolated.rootCauseId],
      severity: isolated.severity,
    }, {
      requestedVersion: compiler.requestedVersion,
      actualVersion: actualVersions.get(compiler.key),
      compilerOptions: strictOptions,
    });
    isolatedRuns.push({ ...isolated, compiler, actual, item });
  }
  await recordCommand({
    id: `TSC-TS-REQUEST-BOUNDARY-${compiler.key}`,
    feature: "pluginTSRequest requestConfig boundary strict compilation",
    plugin: "pluginTSRequest boundary",
    compilerTier: compiler.tier,
    requestedVersion: compiler.requestedVersion,
    actualVersion: actualVersions.get(compiler.key),
    executable: process.execPath,
    args: [compiler.entry, "-p", "scenarios/generators/tsconfig.ts-request-boundary.json"],
    expected: "Axios headers/withCredentials/withXSRFToken consumer compiles strictly",
  }, {
    requestedVersion: compiler.requestedVersion,
    actualVersion: actualVersions.get(compiler.key),
    compilerOptions: strictOptions,
  });
}

const swrIsolated = isolatedRuns.filter((run) => run.key === "SWR-MIN");
const swrFailures = swrIsolated.filter((run) => run.item.status === "FAIL");
if (swrFailures.length > 0 && swrFailures.length < compilers.length) {
  for (const run of swrFailures) {
    run.item.severity = run.compiler.key === "TS7" && swrFailures.length === 1 ? "P2" : "P1";
  }
}

const minimalFiles = [
  {
    source: "scenarios/generators/generated/swr-minimal/health/use-get-health.query.ts",
    target: "swr-implicit-any.query.ts",
  },
  {
    source: "scenarios/generators/generated/msw-minimal/minimal/get-schema-less.handler.ts",
    target: "msw-schema-less.handler.ts",
  },
  {
    source: "scenarios/generators/generated/ts-request-boundary/users/get-user.service.ts",
    target: "request-config-boundary.service.ts",
  },
  {
    source: "scenarios/generators/generated/ts-request-boundary/users/get-user.types.ts",
    target: "request-config-boundary.types.ts",
  },
  {
    source: "scenarios/generators/consumers/ts-request-boundary.ts",
    target: "request-config-boundary.consumer.ts",
  },
];
const hashes = [];
for (const file of minimalFiles) {
  const source = path.join(root, file.source);
  if (!existsSync(source)) continue;
  const target = path.join(evidenceGenerated, file.target);
  await cp(source, target);
  const content = await readFile(target);
  hashes.push({
    path: `reports/evidence/generated-minimal/${file.target}`,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}
await writeFile(path.join(evidenceHashes, "generated-minimal.sha256.json"), `${JSON.stringify(hashes, null, 2)}\n`);

const swrPackage = JSON.parse(await readFile(path.join(root, "node_modules/swr/package.json"), "utf8"));
await writeResultDocument(root, output, results, {
  source: "typescript-matrix",
  runId: identity.runId,
  testHarnessCommit: identity.testHarnessCommit,
  verifyStartedAt: identity.verifyStartedAt,
  startedAt: identity.startedAt,
  compilerOptions: strictOptions,
  compilerDifferences: [],
  dependencies: { swr: swrPackage.version },
  matrix: compilers.map((compiler) => ({
    tier: compiler.tier,
    requestedVersion: compiler.requestedVersion,
    actualVersion: actualVersions.get(compiler.key),
    command: portableValue(root, `${process.execPath} ${compiler.entry} --version`),
  })),
});
const summary = summarize(results);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.fail === 0 ? 0 : 1;
