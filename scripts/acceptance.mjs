import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseJson, portableValue, runProcess, writeCommandEvidence, writeFailureEvidence } from "./lib/process.mjs";
import { resultIdentity, summarize, writeResultDocument } from "./lib/results.mjs";

const root = process.cwd();
const identity = resultIdentity();
const valueAfter = (flag) => process.argv.includes(flag)
  ? process.argv[process.argv.indexOf(flag) + 1]
  : undefined;
const requestedSuite = valueAfter("--suite");
const output = valueAfter("--output") ??
  `.tmp/verify-${identity.runId}/acceptance${requestedSuite ? `-${requestedSuite}` : ""}.json`;
const results = [];
const openapiBin = path.join(root, "node_modules/openapi-to/bin/openapi.js");
const currentTsc = path.join(root, "node_modules/typescript-current/bin/tsc");
const freshInitRoot = path.join(root, `.tmp/init-json-${process.pid}`);
const freshCjsRoot = path.join(root, `.tmp/init-cjs-${process.pid}`);
const ambiguousRoot = path.join(root, `.tmp/ambiguous-${process.pid}`);
const generatedEvidenceRoot = path.join(root, "reports/evidence/generated-minimal");

for (const directory of [freshInitRoot, freshCjsRoot, ambiguousRoot, generatedEvidenceRoot]) {
  await mkdir(directory, { recursive: true });
}
await writeFile(path.join(freshInitRoot, "package.json"), '{"name":"fresh-init-json","private":true,"type":"module"}\n');
await writeFile(path.join(freshCjsRoot, "package.json"), '{"name":"fresh-init-cjs","private":true,"type":"commonjs"}\n');
await writeFile(path.join(ambiguousRoot, "package.json"), '{"name":"ambiguous","private":true,"type":"module"}\n');
await writeFile(path.join(ambiguousRoot, "openapi.config.ts"), 'throw new Error("CONFIG_TS_EXECUTED"); export default {};\n');
await writeFile(path.join(ambiguousRoot, "openapi.config.js"), 'throw new Error("CONFIG_JS_EXECUTED"); export default {};\n');
await mkdir(path.join(root, ".tmp/real-output"), { recursive: true });
let symlinkReady = existsSync(path.join(root, ".tmp/symlink-output"));
if (!symlinkReady) {
  try {
    await symlink("real-output", path.join(root, ".tmp/symlink-output"), "dir");
    symlinkReady = true;
  } catch {
    symlinkReady = false;
  }
}

const nodeCommand = (script, args = []) => ({
  executable: process.execPath,
  args: [script, ...args],
});
const openapiCommand = (...args) => nodeCommand(openapiBin, args);
const selected = (definition) => !requestedSuite || definition.suite === requestedSuite;

async function commandCase(definition) {
  if (!selected(definition)) return;
  const actual = await runProcess({
    executable: definition.executable,
    args: definition.args,
    cwd: definition.cwd ?? root,
    env: definition.env,
    timeoutMs: definition.timeoutMs,
    stage: definition.id,
  });
  const commandEvidence = await writeCommandEvidence(root, definition.id, actual);
  const assertion = definition.assert
    ? await definition.assert(actual)
    : actual.exitCode === (definition.expectedExit ?? 0);
  const status = definition.statusFor?.(actual) ?? definition.status ?? (assertion ? "PASS" : "FAIL");
  const evidence = [commandEvidence];
  if (["FAIL", "BLOCKED"].includes(status)) evidence.push(...await writeFailureEvidence(root, definition.id, actual));
  const failureRootCauseId = definition.rootCauseId ?? `HARNESS-${definition.id}`;
  results.push({
    id: definition.id,
    suite: definition.suite,
    feature: definition.feature,
    command: portableValue(root, actual.command),
    args: portableValue(root, definition.args),
    expected: definition.expected,
    actual: definition.describe ? definition.describe(actual) : `exit ${actual.exitCode}`,
    exitCode: actual.exitCode,
    status,
    evidence,
    rootCauseId: status === "FAIL" ? failureRootCauseId : undefined,
    rootCauseIds: status === "FAIL" ? (definition.rootCauseIds ?? [failureRootCauseId]) : undefined,
    severity: status === "FAIL" ? (definition.severity ?? "HARNESS") : undefined,
    notes: definition.notes ?? "",
  });
}

async function staticCase(definition) {
  if (!selected(definition)) return;
  const actual = await definition.check();
  const status = actual.pass ? (definition.status ?? "PASS") : "FAIL";
  results.push({
    id: definition.id,
    suite: definition.suite,
    feature: definition.feature,
    command: definition.command,
    args: [],
    expected: definition.expected,
    actual: actual.message,
    exitCode: 0,
    status,
    evidence: definition.evidence,
    rootCauseId: status === "FAIL" ? (definition.rootCauseId ?? `HARNESS-${definition.id}`) : undefined,
    rootCauseIds: status === "FAIL" ? (definition.rootCauseIds ?? [definition.rootCauseId ?? `HARNESS-${definition.id}`]) : undefined,
    severity: status === "FAIL" ? (definition.severity ?? "HARNESS") : undefined,
    notes: definition.notes ?? "",
  });
}

const commandCases = [
  { id: "PUB-001", suite: "cli", feature: "Actual installed version", ...nodeCommand("-p", ["JSON.parse(require('fs').readFileSync('node_modules/openapi-to/package.json')).version"]), expected: "4.0.0-rc.3", assert: (r) => r.exitCode === 0 && r.stdout.trim() === "4.0.0-rc.3" },
  { id: "CLI-001", suite: "cli", feature: "openapi help", ...openapiCommand("--help"), expected: "help succeeds" },
  { id: "CLI-002", suite: "cli", feature: "openapi-to alias entry", ...openapiCommand("--help"), expected: "shared alias entry succeeds" },
  { id: "CLI-003", suite: "cli", feature: "ESM import", ...nodeCommand("--input-type=module", ["-e", "import('openapi-to').then(m=>{if(typeof m.defineConfig!=='function')process.exit(1)})"]), expected: "aggregate ESM exports work" },
  { id: "CLI-004", suite: "cli", feature: "CommonJS require", ...nodeCommand("src/import-cjs.cjs"), expected: "aggregate CJS exports work" },
  { id: "CLI-005", suite: "cli", feature: "Published type declarations", ...nodeCommand(currentTsc, ["-p", "tsconfig.api.json"]), expected: "types compile strictly" },
  { id: "INIT-003", suite: "cli", feature: "fresh init JSON stdout contract", ...openapiCommand("init", "--json"), cwd: freshInitRoot, expected: "one parseable JSON document on stdout", assert: (r) => r.exitCode === 0 && parseJson(r.stdout) !== undefined, describe: (r) => `exit ${r.exitCode}; JSON.parse(stdout)=${parseJson(r.stdout) !== undefined}`, rootCauseId: "BUG-INIT-JSON-STDOUT", severity: "P3" },
  { id: "INIT-002", suite: "cli", feature: "CommonJS init extension", ...openapiCommand("init", "--json"), cwd: freshCjsRoot, expected: "openapi.config.js using require/module.exports", assert: async (r) => r.exitCode === 0 && existsSync(path.join(freshCjsRoot, "openapi.config.js")) && (await readFile(path.join(freshCjsRoot, "openapi.config.js"), "utf8")).includes("module.exports") },
  { id: "INIT-003B", suite: "cli", feature: "repeat init JSON error contract", ...openapiCommand("init", "--json"), cwd: freshInitRoot, expected: "one parseable JSON error document on stdout", assert: (r) => r.exitCode === 1 && parseJson(r.stdout)?.success === false },
  { id: "INIT-004", suite: "cli", feature: "Default init template can generate", ...openapiCommand("generate", "--config", "init-template.config.ts", "--dry-run", "--json"), expected: "default initialized config completes dry-run", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true, rootCauseId: "BUG-INIT-PLUGIN-ARTIFACT-CONFLICT", severity: "P1" },
  { id: "CFG-002", suite: "cli", feature: "Ambiguous config fail-before-execute", ...openapiCommand("generate", "--dry-run", "--json"), cwd: ambiguousRoot, expected: "OPENAPI_CONFIG_AMBIGUOUS without executing either config", assert: (r) => r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "OPENAPI_CONFIG_AMBIGUOUS" && !r.stderr.includes("CONFIG_TS_EXECUTED") && !r.stderr.includes("CONFIG_JS_EXECUTED") },
  { id: "CFG-003", suite: "cli", feature: "Nested config discovery", ...openapiCommand("generate", "--dry-run", "--target", "swr-api", "--json"), cwd: path.join(root, "scenarios/generators"), expected: "find root config upward", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.servers?.[0]?.name === "swr-api" },
  { id: "INSPECT-001", suite: "cli", feature: "Inspect byte stability", ...nodeCommand("scripts/inspect-stability.mjs"), expected: "two outputs byte-identical", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.byteStable === true },
  { id: "VAL-001", suite: "cli", feature: "Swagger 2 validation", ...openapiCommand("validate", "fixtures/swagger2/petstore.json", "--json"), expected: "success JSON and conversion diagnostic", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "VAL-002", suite: "cli", feature: "OpenAPI 3.0 validation", ...openapiCommand("validate", "fixtures/openapi30/main.yaml", "--json"), expected: "success JSON", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "VAL-003", suite: "cli", feature: "OpenAPI 3.1 validation", ...openapiCommand("validate", "fixtures/openapi31/schema.json", "--json"), expected: "success JSON", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "VAL-003B", suite: "cli", feature: "YML extension", ...openapiCommand("validate", "fixtures/openapi30/minimal.yml", "--json"), expected: "success JSON", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "VAL-003C", suite: "cli", feature: "Content/extension mismatch", ...openapiCommand("validate", "fixtures/openapi30/mismatch.json", "--json"), expected: "content sniffing succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "VAL-004", suite: "cli", feature: "OpenAPI 3.2 compatible read", ...openapiCommand("validate", "fixtures/openapi32/partial.yaml", "--json"), expected: "success with compatibility warning", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.diagnostics?.some((d) => d.code === "OPENAPI_32_COMPATIBILITY") },
  { id: "VAL-005", suite: "cli", feature: "External/cyclic refs", ...openapiCommand("validate", "fixtures/external-refs/root.yaml", "--json"), expected: "success with cycle warning", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.diagnostics?.some((d) => d.code === "OPENAPI_REF_CYCLE") },
  { id: "VAL-006", suite: "cli", feature: "Missing ref classification", ...openapiCommand("validate", "fixtures/external-refs/missing.yaml", "--json"), expected: "input exit 4 and parseable JSON", assert: (r) => r.exitCode === 4 && parseJson(r.stdout)?.success === false },
  { id: "VAL-007", suite: "cli", feature: "Invalid document classification", ...openapiCommand("validate", "fixtures/invalid/not-openapi.yaml", "--json"), expected: "parse/validation exit 3", assert: (r) => r.exitCode === 3 && parseJson(r.stdout)?.success === false },
  { id: "DIFF-001", suite: "cli", feature: "Breaking diff exit", ...openapiCommand("diff", "fixtures/diff/old.yaml", "fixtures/diff/new.yaml", "--fail-on-breaking", "--json"), expected: "exit 7 and breaking=true", assert: (r) => r.exitCode === 7 && parseJson(r.stdout)?.breaking === true },
  { id: "CFG-001", suite: "cli", feature: "Unknown target", ...openapiCommand("generate", "--config", "multi-target.config.ts", "--target", "missing-service", "--dry-run", "--json"), expected: "config exit 2", assert: (r) => r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_TARGET_UNKNOWN" },
  { id: "SEC-CLI-001", suite: "security", feature: "Private remote denied", ...openapiCommand("validate", "http://127.0.0.1:9/openapi.yaml", "--json"), expected: "input exit 4, blocked before connect", assert: (r) => r.exitCode === 4 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "REMOTE_SOURCE_BLOCKED" },
  { id: "SEC-CLI-002", suite: "security", feature: "Non-HTTP protocol denied", ...openapiCommand("validate", "ftp://example.com/openapi.yaml", "--json"), expected: "input exit 4", assert: (r) => r.exitCode === 4 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "REMOTE_SOURCE_BLOCKED" },
  { id: "SEC-CLI-003", suite: "security", feature: "Output escape denied", ...openapiCommand("generate", "--config", "escape.config.ts", "--dry-run", "--json"), expected: "config exit 2", assert: (r) => r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_PATH_OUTSIDE_WORKSPACE" },
  { id: "SEC-CLI-004", suite: "security", feature: "Overlapping output denied", ...openapiCommand("generate", "--config", "overlap.config.ts", "--dry-run", "--json"), expected: "config exit 2", assert: (r) => r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_OVERLAP" },
  { id: "SEC-CLI-005", suite: "security", feature: "Symlink output denied", ...openapiCommand("generate", "--config", "symlink.config.ts", "--dry-run", "--json"), expected: "config exit 2", assert: (r) => symlinkReady && r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_SYMLINK", notes: symlinkReady ? "" : "Host could not create a directory symlink." },
  { id: "SEC-CLI-006", suite: "security", feature: "Windows device path denied", ...openapiCommand("generate", "--config", "windows-device.config.ts", "--dry-run", "--json"), expected: "config exit 2", assert: (r) => r.exitCode === 2 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_PATH_NOT_PORTABLE" },
  { id: "GEN-001", suite: "generators", feature: "TS Type generation", ...openapiCommand("generate", "--config", "ts-type.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-002", suite: "generators", feature: "TS Request generation", ...openapiCommand("generate", "--config", "ts-request.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-003", suite: "generators", feature: "Zod generation", ...openapiCommand("generate", "--config", "zod.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-004", suite: "generators", feature: "SWR generation", ...openapiCommand("generate", "--config", "swr.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-005", suite: "generators", feature: "Vue Query generation", ...openapiCommand("generate", "--config", "vue-query.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-006", suite: "generators", feature: "MSW generation", ...openapiCommand("generate", "--config", "msw.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "GEN-007", suite: "generators", feature: "OpenAPI 3.1 booleans/ref sibling", ...openapiCommand("generate", "--config", "oas31.config.ts", "--json"), expected: "generation succeeds", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.success === true },
  { id: "ZOD-001", suite: "regression", feature: "Zod positive/negative runtime", ...nodeCommand("--experimental-strip-types", ["scripts/zod-runtime.mjs"]), expected: "positive accepted and negative rejected" },
  { id: "MULTI-001", suite: "generators", feature: "Default all targets", ...openapiCommand("generate", "--config", "multi-target.config.ts", "--dry-run", "--json"), expected: "three targets in config order", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.servers?.map((s) => s.name).join(",") === "user-service,order-service,payment-service" },
  { id: "MULTI-002", suite: "generators", feature: "Repeated target dedupe/order", ...openapiCommand("generate", "--config", "multi-target.config.ts", "--target", "payment-service", "--target", "user-service", "--target", "payment-service", "--dry-run", "--json"), expected: "dedupe and config order", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.servers?.map((s) => s.name).join(",") === "user-service,payment-service" },
  { id: "MCP-SUITE", suite: "mcp", feature: "Official SDK stdio suite", ...nodeCommand("scripts/mcp-acceptance.mjs"), expected: "all 3/8/10 and controlled-write cases pass", timeoutMs: 180_000 },
  { id: "SEC-REMOTE", suite: "security", feature: "Cross-origin header stripping", ...nodeCommand("scripts/remote-security.mjs"), expected: "header stripped and logs redacted", assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.crossOriginHeadersCleared === true && parseJson(r.stdout)?.logsRedacted === true, statusFor: (r) => r.exitCode === 77 && parseJson(r.stdout)?.blocked === true ? "BLOCKED" : undefined },
];

for (const definition of commandCases) await commandCase(definition);

await staticCase({
  id: "PUB-002", suite: "cli", feature: "Three package bins", command: "inspect node_modules/openapi-to/package.json and node_modules/.bin", expected: "openapi, openapi-to, openapi-to-mcp exist",
  evidence: ["package.json", "pnpm-lock.yaml"],
  check: async () => {
    const names = ["openapi", "openapi-to", "openapi-to-mcp"];
    const missing = names.filter((name) => !existsSync(path.join(root, "node_modules/.bin", process.platform === "win32" ? `${name}.cmd` : name)));
    return { pass: missing.length === 0, message: missing.length ? `missing ${missing.join(", ")}` : names.join(", ") };
  },
});
await staticCase({
  id: "PUB-003", suite: "cli", feature: "Lockfile registry-only resolution", command: "scan pnpm-lock.yaml", expected: "no workspace/file/link/absolute upstream path",
  evidence: ["pnpm-lock.yaml"],
  check: async () => {
    const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
    const bad = /(?:specifier|version|resolution|tarball):[^\n]*(?:workspace:|file:|link:)|\/Users\/vc\/code\/openapi-to(?:\/|$)/.test(lock);
    return { pass: !bad, message: bad ? "local resolution found" : "registry-only resolution" };
  },
});
await staticCase({
  id: "INIT-001", suite: "cli", feature: "ESM init extension", command: "inspect init output", expected: "openapi.config.ts and managed ignore rule",
  evidence: ["reports/evidence/commands/INIT-003.json"],
  check: async () => {
    const pass = existsSync(path.join(freshInitRoot, "openapi.config.ts")) &&
      (await readFile(path.join(freshInitRoot, ".gitignore"), "utf8")).includes("/.openapi-to/");
    return { pass, message: pass ? "openapi.config.ts + /.openapi-to/" : "incorrect ESM init output" };
  },
});

if ((!requestedSuite || requestedSuite === "regression") && existsSync(path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts"))) {
  await cp(
    path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts"),
    path.join(generatedEvidenceRoot, "inline-enum-user.model.ts"),
  );
}
await staticCase({
  id: "REG-001", suite: "regression", feature: "Optional inline object enum identifier", command: "review generated user.model.ts", expected: "declared identifier equals referenced identifier",
  evidence: ["reports/evidence/generated-minimal/inline-enum-user.model.ts"],
  rootCauseId: "BUG-INLINE-ENUM-CASING", severity: "P1",
  check: async () => {
    const file = path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts");
    if (!existsSync(file)) return { pass: false, message: "generated prerequisite is missing" };
    const text = await readFile(file, "utf8");
    const pass = !text.includes("UseroptionalInlineModeEnumValue");
    return { pass, message: pass ? "identifier consistent" : "references undefined UseroptionalInlineModeEnumValue" };
  },
});
await staticCase({
  id: "REG-002", suite: "regression", feature: "Optional non-required ref", command: "review generated TS and Zod", expected: "TS ? and Zod .optional()",
  evidence: ["reports/evidence/generated-minimal/inline-enum-user.model.ts"],
  check: async () => {
    const tsFile = path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts");
    const zodFile = path.join(root, "scenarios/generators/generated/zod/zod/models/user.schema.ts");
    if (!existsSync(tsFile) || !existsSync(zodFile)) return { pass: false, message: "generated prerequisites are missing" };
    const ts = await readFile(tsFile, "utf8");
    const zod = await readFile(zodFile, "utf8");
    const pass = ts.includes("address?: AddressModel") && zod.includes('"address": addressSchema.optional()');
    return { pass, message: pass ? "optional in TS and Zod" : "required/optional mismatch" };
  },
});

if ((!requestedSuite || requestedSuite === "generators") && existsSync(path.join(root, "scenarios/generators/generated/ts-request/users/get-user.service.ts"))) {
  await cp(path.join(root, "scenarios/generators/generated/ts-request/users/get-user.service.ts"), path.join(generatedEvidenceRoot, "request-config-boundary.service.ts"));
  await cp(path.join(root, "scenarios/generators/generated/ts-request/users/get-user.types.ts"), path.join(generatedEvidenceRoot, "request-config-boundary.types.ts"));
  await cp(path.join(root, "scenarios/generators/consumers/ts-request.ts"), path.join(generatedEvidenceRoot, "request-config-boundary.consumer.ts"));
}
await staticCase({
  id: "SEM-001", suite: "generators", feature: "TS Request header/cookie configuration boundary", command: "review generated types, service signature, and strict consumer", expected: "types generated; requestConfig accepts Axios client configuration; no independent header/cookie arguments",
  status: "KNOWN_LIMITATION",
  evidence: [
    "reports/evidence/generated-minimal/request-config-boundary.types.ts",
    "reports/evidence/generated-minimal/request-config-boundary.service.ts",
    "reports/evidence/generated-minimal/request-config-boundary.consumer.ts",
    "reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS56.json",
    "reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS6.json",
    "reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS7.json",
  ],
  notes: "No automatic Cookie serialization or complete header merge precedence is promised.",
  check: async () => {
    const typesFile = path.join(root, "scenarios/generators/generated/ts-request/users/get-user.types.ts");
    const serviceFile = path.join(root, "scenarios/generators/generated/ts-request/users/get-user.service.ts");
    const consumerFile = path.join(root, "scenarios/generators/consumers/ts-request.ts");
    if (![typesFile, serviceFile, consumerFile].every(existsSync)) return { pass: false, message: "generated prerequisites are missing" };
    const types = await readFile(typesFile, "utf8");
    const service = await readFile(serviceFile, "utf8");
    const consumer = await readFile(consumerFile, "utf8");
    const typesGenerated = types.includes("GetUserHeaderParams") && types.includes("GetUserCookieParams");
    const requestConfigExists = service.includes("requestConfig?: Partial<AxiosRequestConfig");
    const configCapabilities = ["headers:", "withCredentials:", "withXSRFToken:"].every((needle) => consumer.includes(needle));
    const noIndependentArguments = !service.includes("GetUserHeaderParams") && !service.includes("GetUserCookieParams");
    return {
      pass: typesGenerated && requestConfigExists && configCapabilities && noIndependentArguments,
      message: `types=${typesGenerated}; requestConfig=${requestConfigExists}; axiosConfigConsumer=${configCapabilities}; independentHeaderCookieArgs=${!noIndependentArguments}`,
    };
  },
});
await staticCase({
  id: "HARNESS-001", suite: "regression", feature: "Cross-platform structured process runner", command: "inspect scripts/lib/process.mjs", expected: "executable/args split, shell=false, PATH/PATHEXT resolution, timeout and separated output",
  evidence: ["scripts/lib/process.mjs"],
  check: async () => {
    const runner = await readFile(path.join(root, "scripts/lib/process.mjs"), "utf8");
    const pass = runner.includes("shell: false") &&
      runner.includes("PATHEXT") &&
      runner.includes("ComSpec") &&
      runner.includes("timeoutMs") &&
      runner.includes('stdio: ["ignore", "pipe", "pipe"]') &&
      !runner.includes('spawn("zsh"');
    return {
      pass,
      message: pass ? "structured shell-free runner present" : "cross-platform runner requirements incomplete",
    };
  },
});

if (!requestedSuite || requestedSuite === "skills") {
  const codexHome = path.join(root, `.tmp/codex-home-verify-${process.pid}`);
  const skillCases = [
    { id: "SKILL-001", feature: "Skills dry-run", args: ["skills", "install", "--host", "codex", "--dry-run", "--json"], expected: "no writes and exact two skills", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.skills?.join(",") === "openapi-to-generate,openapi-to-setup" },
    { id: "SKILL-002", feature: "Skills install", args: ["skills", "install", "--host", "codex", "--json"], expected: "installs two packaged skills", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 0 && parseJson(r.stdout)?.installed?.length === 2 },
    { id: "SKILL-003", feature: "No overwrite", args: ["skills", "install", "--host", "codex", "--json"], expected: "existing destinations rejected", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 1 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "SKILLS_DESTINATION_CONFLICT" },
    { id: "SKILL-004", feature: "Unsupported host", args: ["skills", "install", "--host", "unknown", "--json"], expected: "unsupported Host rejected", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 1 && parseJson(r.stdout)?.diagnostics?.[0]?.code === "SKILLS_HOST_UNSUPPORTED" },
  ];
  for (const item of skillCases) {
    await commandCase({ ...item, suite: "skills", executable: process.execPath, args: [openapiBin, ...item.args] });
  }
}

await writeResultDocument(root, output, results, {
  source: "acceptance",
  suite: requestedSuite ?? "all",
  runId: identity.runId,
  testHarnessCommit: identity.testHarnessCommit,
  verifyStartedAt: identity.verifyStartedAt,
  startedAt: identity.startedAt,
});
const summary = summarize(results);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.fail === 0 ? 0 : 1;
