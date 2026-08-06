import { spawn } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requestedSuite = process.argv.includes("--suite")
  ? process.argv[process.argv.indexOf("--suite") + 1]
  : undefined;
const logRoot = path.join(root, "reports/logs");
await mkdir(logRoot, { recursive: true });
const results = [];
const freshInitRoot = path.join(root, `.tmp/init-json-${process.pid}`);
const freshCjsRoot = path.join(root, `.tmp/init-cjs-${process.pid}`);
const ambiguousRoot = path.join(root, `.tmp/ambiguous-${process.pid}`);
await mkdir(freshInitRoot, { recursive: true });
await mkdir(freshCjsRoot, { recursive: true });
await mkdir(ambiguousRoot, { recursive: true });
await writeFile(path.join(freshInitRoot, "package.json"), '{"name":"fresh-init-json","private":true,"type":"module"}\n');
await writeFile(path.join(freshCjsRoot, "package.json"), '{"name":"fresh-init-cjs","private":true,"type":"commonjs"}\n');
await writeFile(path.join(ambiguousRoot, "package.json"), '{"name":"ambiguous","private":true,"type":"module"}\n');
await writeFile(path.join(ambiguousRoot, "openapi.config.ts"), 'throw new Error("CONFIG_TS_EXECUTED"); export default {};\n');
await writeFile(path.join(ambiguousRoot, "openapi.config.js"), 'throw new Error("CONFIG_JS_EXECUTED"); export default {};\n');
await mkdir(path.join(root, ".tmp/real-output"), { recursive: true });
if (!existsSync(path.join(root, ".tmp/symlink-output"))) {
  await symlink("real-output", path.join(root, ".tmp/symlink-output"));
}

function relativeEvidence(id) {
  return `reports/logs/${id}`;
}

async function run(command, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn("zsh", ["-lc", command], {
      cwd: options.cwd ?? root,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

function json(value) {
  try { return JSON.parse(value); } catch { return undefined; }
}

async function commandCase(definition) {
  if (requestedSuite && definition.suite !== requestedSuite) return;
  const actual = await run(definition.command, definition);
  await writeFile(path.join(logRoot, `${definition.id}.stdout.log`), actual.stdout);
  await writeFile(path.join(logRoot, `${definition.id}.stderr.log`), actual.stderr);
  const assertion = definition.assert
    ? await definition.assert(actual)
    : actual.exitCode === (definition.expectedExit ?? 0);
  results.push({
    id: definition.id,
    feature: definition.feature,
    command: definition.command,
    expected: definition.expected,
    actual: definition.describe ? definition.describe(actual) : `exit ${actual.exitCode}`,
    exitCode: actual.exitCode,
    status: assertion ? "PASS" : "FAIL",
    evidence: `${relativeEvidence(definition.id)}.{stdout,stderr}.log`,
    notes: definition.notes ?? "",
  });
}

async function staticCase(definition) {
  if (requestedSuite && definition.suite !== requestedSuite) return;
  const actual = await definition.check();
  results.push({
    id: definition.id,
    feature: definition.feature,
    command: definition.command,
    expected: definition.expected,
    actual: actual.message,
    exitCode: 0,
    status: actual.pass ? "PASS" : "FAIL",
    evidence: definition.evidence,
    notes: definition.notes ?? "",
  });
}

const commandCases = [
  { id: "PUB-001", suite: "cli", feature: "Actual installed version", command: "node -p \"JSON.parse(require('fs').readFileSync('node_modules/openapi-to/package.json')).version\"", expected: "4.0.0-rc.3", assert: (r) => r.exitCode === 0 && r.stdout.trim() === "4.0.0-rc.3" },
  { id: "CLI-001", suite: "cli", feature: "openapi help", command: "pnpm exec openapi --help", expected: "help succeeds", expectedExit: 0 },
  { id: "CLI-002", suite: "cli", feature: "openapi-to help", command: "pnpm exec openapi-to --help", expected: "alias help succeeds", expectedExit: 0 },
  { id: "CLI-003", suite: "cli", feature: "ESM import", command: "node --input-type=module -e \"import('openapi-to').then(m=>{if(typeof m.defineConfig!=='function')process.exit(1)})\"", expected: "aggregate ESM exports work", expectedExit: 0 },
  { id: "CLI-004", suite: "cli", feature: "CommonJS require", command: "node src/import-cjs.cjs", expected: "aggregate CJS exports work", expectedExit: 0 },
  { id: "CLI-005", suite: "cli", feature: "Published type declarations", command: "pnpm exec tsc -p tsconfig.api.json", expected: "types compile strictly", expectedExit: 0 },
  { id: "INIT-003", suite: "cli", feature: "fresh init JSON stdout contract", command: "../../node_modules/.bin/openapi init --json", cwd: freshInitRoot, expected: "one parseable JSON document on stdout", assert: (r) => r.exitCode === 0 && json(r.stdout) !== undefined, describe: (r) => `exit ${r.exitCode}; JSON.parse(stdout)=${json(r.stdout) !== undefined}` },
  { id: "INIT-002", suite: "cli", feature: "CommonJS init extension", command: "../../node_modules/.bin/openapi init --json", cwd: freshCjsRoot, expected: "openapi.config.js using require/module.exports", assert: async (r) => r.exitCode === 0 && existsSync(path.join(freshCjsRoot, "openapi.config.js")) && (await readFile(path.join(freshCjsRoot, "openapi.config.js"), "utf8")).includes("module.exports") },
  { id: "INIT-003B", suite: "cli", feature: "repeat init JSON error contract", command: "../../node_modules/.bin/openapi init --json", cwd: freshInitRoot, expected: "one parseable JSON error document on stdout", assert: (r) => r.exitCode === 1 && json(r.stdout)?.success === false },
  { id: "INIT-004", suite: "cli", feature: "Default init template can generate", command: "pnpm exec openapi generate --config init-template.config.ts --dry-run --json", expected: "default initialized config completes dry-run", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "CFG-002", suite: "cli", feature: "Ambiguous config fail-before-execute", command: "../../node_modules/.bin/openapi generate --dry-run --json", cwd: ambiguousRoot, expected: "OPENAPI_CONFIG_AMBIGUOUS without executing either config", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "OPENAPI_CONFIG_AMBIGUOUS" && !r.stderr.includes("CONFIG_TS_EXECUTED") && !r.stderr.includes("CONFIG_JS_EXECUTED") },
  { id: "CFG-003", suite: "cli", feature: "Nested config discovery", command: "../../node_modules/.bin/openapi generate --dry-run --target swr-api --json", cwd: path.join(root, "scenarios/generators"), expected: "find root config upward", assert: (r) => r.exitCode === 0 && json(r.stdout)?.servers?.[0]?.name === "swr-api" },
  { id: "INSPECT-001", suite: "cli", feature: "Inspect byte stability", command: "node scripts/inspect-stability.mjs", expected: "two outputs byte-identical", assert: (r) => r.exitCode === 0 && json(r.stdout)?.byteStable === true },
  { id: "VAL-001", suite: "cli", feature: "Swagger 2 validation", command: "pnpm exec openapi validate fixtures/swagger2/petstore.json --json", expected: "success JSON and conversion diagnostic", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "VAL-002", suite: "cli", feature: "OpenAPI 3.0 validation", command: "pnpm exec openapi validate fixtures/openapi30/main.yaml --json", expected: "success JSON", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "VAL-003", suite: "cli", feature: "OpenAPI 3.1 validation", command: "pnpm exec openapi validate fixtures/openapi31/schema.json --json", expected: "success JSON", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "VAL-003B", suite: "cli", feature: "YML extension", command: "pnpm exec openapi validate fixtures/openapi30/minimal.yml --json", expected: "success JSON", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "VAL-003C", suite: "cli", feature: "Content/extension mismatch", command: "pnpm exec openapi validate fixtures/openapi30/mismatch.json --json", expected: "content sniffing succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "VAL-004", suite: "cli", feature: "OpenAPI 3.2 compatible read", command: "pnpm exec openapi validate fixtures/openapi32/partial.yaml --json", expected: "success with compatibility warning", assert: (r) => r.exitCode === 0 && json(r.stdout)?.diagnostics?.some((d) => d.code === "OPENAPI_32_COMPATIBILITY") },
  { id: "VAL-005", suite: "cli", feature: "External/cyclic refs", command: "pnpm exec openapi validate fixtures/external-refs/root.yaml --json", expected: "success with cycle warning", assert: (r) => r.exitCode === 0 && json(r.stdout)?.diagnostics?.some((d) => d.code === "OPENAPI_REF_CYCLE") },
  { id: "VAL-006", suite: "cli", feature: "Missing ref classification", command: "pnpm exec openapi validate fixtures/external-refs/missing.yaml --json", expected: "input exit 4 and parseable JSON", assert: (r) => r.exitCode === 4 && json(r.stdout)?.success === false },
  { id: "VAL-007", suite: "cli", feature: "Invalid document classification", command: "pnpm exec openapi validate fixtures/invalid/not-openapi.yaml --json", expected: "parse/validation exit 3", assert: (r) => r.exitCode === 3 && json(r.stdout)?.success === false },
  { id: "DIFF-001", suite: "cli", feature: "Breaking diff exit", command: "pnpm exec openapi diff fixtures/diff/old.yaml fixtures/diff/new.yaml --fail-on-breaking --json", expected: "exit 7 and breaking=true", assert: (r) => r.exitCode === 7 && json(r.stdout)?.breaking === true },
  { id: "CFG-001", suite: "cli", feature: "Unknown target", command: "pnpm exec openapi generate --config multi-target.config.ts --target missing-service --dry-run --json", expected: "config exit 2", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_TARGET_UNKNOWN" },
  { id: "SEC-CLI-001", suite: "security", feature: "Private remote denied", command: "pnpm exec openapi validate http://127.0.0.1:9/openapi.yaml --json", expected: "input exit 4, blocked before connect", assert: (r) => r.exitCode === 4 && json(r.stdout)?.diagnostics?.[0]?.code === "REMOTE_SOURCE_BLOCKED" },
  { id: "SEC-CLI-002", suite: "security", feature: "Non-HTTP protocol denied", command: "pnpm exec openapi validate ftp://example.com/openapi.yaml --json", expected: "input exit 4", assert: (r) => r.exitCode === 4 && json(r.stdout)?.diagnostics?.[0]?.code === "REMOTE_SOURCE_BLOCKED" },
  { id: "SEC-CLI-003", suite: "security", feature: "Output escape denied", command: "pnpm exec openapi generate --config escape.config.ts --dry-run --json", expected: "config exit 2", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_PATH_OUTSIDE_WORKSPACE" },
  { id: "SEC-CLI-004", suite: "security", feature: "Overlapping output denied", command: "pnpm exec openapi generate --config overlap.config.ts --dry-run --json", expected: "config exit 2", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_OVERLAP" },
  { id: "SEC-CLI-005", suite: "security", feature: "Symlink output denied", command: "pnpm exec openapi generate --config symlink.config.ts --dry-run --json", expected: "config exit 2", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_SYMLINK" },
  { id: "SEC-CLI-006", suite: "security", feature: "Windows device path denied", command: "pnpm exec openapi generate --config windows-device.config.ts --dry-run --json", expected: "config exit 2", assert: (r) => r.exitCode === 2 && json(r.stdout)?.diagnostics?.[0]?.code === "CONFIG_OUTPUT_PATH_NOT_PORTABLE" },
  { id: "GEN-001", suite: "generators", feature: "TS Type generation", command: "pnpm exec openapi generate --config ts-type.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "GEN-002", suite: "generators", feature: "TS Request generation", command: "pnpm exec openapi generate --config ts-request.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "GEN-003", suite: "generators", feature: "Zod generation", command: "pnpm exec openapi generate --config zod.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "GEN-004", suite: "generators", feature: "SWR generation", command: "pnpm exec openapi generate --config openapi.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "GEN-005", suite: "generators", feature: "Vue Query generation", command: "pnpm exec openapi generate --config vue-query.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "GEN-006", suite: "generators", feature: "MSW generation", command: "pnpm exec openapi generate --config msw.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  ...["ts-type", "ts-request", "zod", "swr", "vue-query", "msw"].map((name, index) => ({
    id: `TSC-00${index + 1}`, suite: "generators", feature: `${name} strict compilation`,
    command: `pnpm exec tsc -p scenarios/generators/tsconfig.${name}.json`,
    expected: "strict compile with skipLibCheck=false", expectedExit: 0,
  })),
  { id: "GEN-007", suite: "generators", feature: "OpenAPI 3.1 booleans/ref sibling", command: "pnpm exec openapi generate --config oas31.config.ts --json", expected: "generation succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "TSC-007", suite: "generators", feature: "OpenAPI 3.1 strict compilation", command: "pnpm exec tsc -p scenarios/generators/tsconfig.oas31.json", expected: "strict compile", expectedExit: 0 },
  { id: "ZOD-001", suite: "regression", feature: "Zod positive/negative runtime", command: "node --experimental-strip-types scripts/zod-runtime.mjs", expected: "positive accepted and negative rejected", expectedExit: 0 },
  { id: "LIFE-001", suite: "generators", feature: "Dry-run no write", command: "pnpm exec openapi generate --config lifecycle.config.ts --dry-run --json", expected: "dry-run succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.mode === "dry-run" },
  { id: "LIFE-002", suite: "generators", feature: "Check current output", command: "LIFECYCLE_INPUT=fixtures/regression/lifecycle-v2.yaml pnpm exec openapi generate --config lifecycle.config.ts --check --json", expected: "current output succeeds", assert: (r) => r.exitCode === 0 && json(r.stdout)?.success === true },
  { id: "LIFE-003", suite: "generators", feature: "Managed output base", command: "pnpm exec openapi generate --config managed.config.ts --json", expected: "writes below .openapi-to with ownership manifest", assert: (r) => r.exitCode === 0 && existsSync(path.join(root, ".openapi-to/acceptance-managed/.openapi-to-manifest.json")) },
  { id: "MULTI-001", suite: "generators", feature: "Default all targets", command: "pnpm exec openapi generate --config multi-target.config.ts --dry-run --json", expected: "three targets in config order", assert: (r) => r.exitCode === 0 && json(r.stdout)?.servers?.map((s) => s.name).join(",") === "user-service,order-service,payment-service" },
  { id: "MULTI-002", suite: "generators", feature: "Repeated target dedupe/order", command: "pnpm exec openapi generate --config multi-target.config.ts --target payment-service --target user-service --target payment-service --dry-run --json", expected: "dedupe and config order", assert: (r) => r.exitCode === 0 && json(r.stdout)?.servers?.map((s) => s.name).join(",") === "user-service,payment-service" },
  { id: "MCP-SUITE", suite: "mcp", feature: "Official SDK stdio suite", command: "node scripts/mcp-acceptance.mjs", expected: "all 3/8/10 and controlled-write cases pass", expectedExit: 0 },
  { id: "SEC-REMOTE", suite: "security", feature: "Cross-origin header stripping", command: "node scripts/remote-security.mjs", expected: "header stripped and logs redacted", assert: (r) => r.exitCode === 0 && json(r.stdout)?.crossOriginHeadersCleared === true && json(r.stdout)?.logsRedacted === true },
];

for (const definition of commandCases) await commandCase(definition);

await staticCase({
  id: "PUB-002", suite: "cli", feature: "Three package bins", command: "inspect node_modules/.bin", expected: "openapi, openapi-to, openapi-to-mcp exist",
  evidence: "node_modules/openapi-to/package.json",
  check: async () => {
    const names = ["openapi", "openapi-to", "openapi-to-mcp"];
    const missing = names.filter((name) => !existsSync(path.join(root, "node_modules/.bin", name)));
    return { pass: missing.length === 0, message: missing.length ? `missing ${missing.join(", ")}` : names.join(", ") };
  },
});
await staticCase({
  id: "PUB-003", suite: "cli", feature: "Lockfile registry-only resolution", command: "scan pnpm-lock.yaml", expected: "no workspace/file/link/absolute upstream path",
  evidence: "pnpm-lock.yaml",
  check: async () => {
    const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
    const bad = /(?:specifier|version|resolution|tarball):[^\n]*(?:workspace:|file:|link:)|\/Users\/vc\/code\/openapi-to(?:\/|$)/.test(lock);
    return { pass: !bad, message: bad ? "local resolution found" : "registry-only resolution" };
  },
});
await staticCase({
  id: "INIT-001", suite: "cli", feature: "ESM init extension", command: "inspect init output", expected: "openapi.config.ts and managed ignore rule",
  evidence: "reports/logs/INIT-003.stdout.log",
  check: async () => {
    const pass = existsSync(path.join(freshInitRoot, "openapi.config.ts")) &&
      (await readFile(path.join(freshInitRoot, ".gitignore"), "utf8")).includes("/.openapi-to/");
    return { pass, message: pass ? "openapi.config.ts + /.openapi-to/" : "incorrect ESM init output" };
  },
});
await staticCase({
  id: "REG-001", suite: "regression", feature: "Optional inline object enum identifier", command: "review generated user.model.ts", expected: "declared identifier equals referenced identifier",
  evidence: "scenarios/generators/generated/ts-type/types/models/user.model.ts",
  check: async () => {
    const text = await readFile(path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts"), "utf8");
    const pass = !text.includes("UseroptionalInlineModeEnumValue");
    return { pass, message: pass ? "identifier consistent" : "references undefined UseroptionalInlineModeEnumValue" };
  },
});
await staticCase({
  id: "REG-002", suite: "regression", feature: "Optional non-required ref", command: "review generated TS and Zod", expected: "TS ? and Zod .optional()",
  evidence: "scenarios/generators/generated/zod/zod/models/user.schema.ts",
  check: async () => {
    const ts = await readFile(path.join(root, "scenarios/generators/generated/ts-type/types/models/user.model.ts"), "utf8");
    const zod = await readFile(path.join(root, "scenarios/generators/generated/zod/zod/models/user.schema.ts"), "utf8");
    const pass = ts.includes("address?: AddressModel") && zod.includes('"address": addressSchema.optional()');
    return { pass, message: pass ? "optional in TS and Zod" : "required/optional mismatch" };
  },
});
await staticCase({
  id: "SEM-001", suite: "generators", feature: "Parameter required semantics", command: "review get-user types/service", expected: "path/header required; query/cookie optional and request carries all",
  evidence: "scenarios/generators/generated/ts-request/users/get-user.service.ts",
  check: async () => {
    const types = await readFile(path.join(root, "scenarios/generators/generated/ts-request/users/get-user.types.ts"), "utf8");
    const service = await readFile(path.join(root, "scenarios/generators/generated/ts-request/users/get-user.service.ts"), "utf8");
    const typesCorrect = types.includes("userId: string") && types.includes('"X-Tenant": string') && types.includes("verbose?: boolean") && types.includes("session?: string");
    const requestCarriesAll = service.includes("GetUserHeaderParams") && service.includes("GetUserCookieParams");
    return { pass: typesCorrect && requestCarriesAll, message: typesCorrect && !requestCarriesAll ? "types correct; request function drops header/cookie arguments" : "parameter semantics checked" };
  },
});

if (!requestedSuite || requestedSuite === "skills") {
  const codexHome = path.join(root, `.tmp/codex-home-verify-${process.pid}`);
  const skillCases = [
    { id: "SKILL-001", feature: "Skills dry-run", command: "pnpm exec openapi skills install --host codex --dry-run --json", expected: "no writes and exact two skills", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 0 && json(r.stdout)?.skills?.join(",") === "openapi-to-generate,openapi-to-setup" },
    { id: "SKILL-002", feature: "Skills install", command: "pnpm exec openapi skills install --host codex --json", expected: "installs two packaged skills", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 0 && json(r.stdout)?.installed?.length === 2 },
    { id: "SKILL-003", feature: "No overwrite", command: "pnpm exec openapi skills install --host codex --json", expected: "existing destinations rejected", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 1 && json(r.stdout)?.diagnostics?.[0]?.code === "SKILLS_DESTINATION_CONFLICT" },
    { id: "SKILL-004", feature: "Unsupported host", command: "pnpm exec openapi skills install --host unknown --json", expected: "unsupported Host rejected", env: { CODEX_HOME: codexHome }, assert: (r) => r.exitCode === 1 && json(r.stdout)?.diagnostics?.[0]?.code === "SKILLS_HOST_UNSUPPORTED" },
  ];
  for (const item of skillCases) await commandCase({ ...item, suite: "skills" });
}

const summary = {
  total: results.length,
  pass: results.filter((item) => item.status === "PASS").length,
  fail: results.filter((item) => item.status === "FAIL").length,
  blocked: results.filter((item) => item.status === "BLOCKED").length,
  skipped: results.filter((item) => item.status === "SKIPPED").length,
};
await writeFile(path.join(root, "reports/results.json"), `${JSON.stringify({ summary, cases: results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.fail === 0 ? 0 : 1;
