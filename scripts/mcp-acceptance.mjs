import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const executable = path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js");
const config = path.join(root, "mcp.config.ts");
const output = path.join(root, "scenarios/mcp/generated");
const results = [];
const calls = {};

function record(id, feature, pass, actual, evidence = "reports/snapshots/mcp-calls.json") {
  results.push({
    id,
    feature,
    command: "official MCP SDK over stdio",
    expected: "documented MCP contract",
    actual,
    exitCode: 0,
    status: pass ? "PASS" : "FAIL",
    evidence,
    notes: "",
  });
}

function toolData(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (text) return JSON.parse(text);
  return result;
}

async function connect(extraArgs) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, "--workspace-root", root, "--log-level", "silent", ...extraArgs],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client({ name: "openapi-to-acceptance", version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function call(client, name, args) {
  const value = toolData(await client.callTool({ name, arguments: args }));
  calls[`${name}-${Object.keys(calls).length + 1}`] = value;
  return value;
}

await mkdir(path.join(root, "reports/snapshots"), { recursive: true });

const noConfig = await connect([]);
try {
  const listed = await noConfig.client.listTools();
  calls.noConfigTools = listed.tools;
  const names = listed.tools.map((tool) => tool.name);
  record("MCP-001", "No-config tool set", names.length === 3 && names.join(",") === "openapi_validate,openapi_inspect,openapi_diff", names.join(", "));

  const validate = await call(noConfig.client, "openapi_validate", { source: "fixtures/openapi30/main.yaml" });
  record("MCP-002", "Validate over stdio", validate.success === true, JSON.stringify(validate.diagnosticSummary));

  const inspect = await call(noConfig.client, "openapi_inspect", { source: "fixtures/openapi31/schema.json", includeOperations: true });
  record("MCP-003", "Inspect over stdio", inspect.success === true && inspect.inspection?.operationCount === 1, JSON.stringify(inspect.inspection));

  const diff = await call(noConfig.client, "openapi_diff", { before: "fixtures/diff/old.yaml", after: "fixtures/diff/new.yaml" });
  record("MCP-004", "Diff over stdio", diff.success === true && diff.breaking === true, `breaking=${diff.breaking}`);

  const privateNetwork = await call(noConfig.client, "openapi_validate", { source: "http://127.0.0.1:9/openapi.yaml" });
  record("SEC-001", "Private network denied by default", privateNetwork.success === false, JSON.stringify(privateNetwork.diagnostics));

  const fileScheme = await call(noConfig.client, "openapi_validate", { source: `file://${path.join(root, "fixtures/openapi30/main.yaml")}` });
  record("SEC-002", "file URL denied", fileScheme.success === false, JSON.stringify(fileScheme.diagnostics));

  const outside = await call(noConfig.client, "openapi_validate", { source: "/etc/passwd" });
  record("SEC-003", "Workspace-external local input denied", outside.success === false, JSON.stringify(outside.diagnostics));
} finally {
  await noConfig.transport.close();
}

let operationKeys = [];
const readOnly = await connect(["--config", config]);
try {
  const listed = await readOnly.client.listTools();
  calls.readOnlyTools = listed.tools;
  const names = listed.tools.map((tool) => tool.name);
  record("MCP-005", "Read-only configured tool set", names.length === 8 && !names.some((name) => name.includes("prepare") || name.includes("apply")), names.join(", "));

  const targets = await call(readOnly.client, "openapi_list_targets", {});
  record("MCP-006", "Target listing", targets.success === true && targets.targets?.[0]?.name === "mcp-api", JSON.stringify(targets.targets));

  const search = await call(readOnly.client, "openapi_search_operations", { target: "mcp-api", query: "user", limit: 50 });
  operationKeys = search.items?.map((item) => item.operationKey) ?? [];
  record("MCP-007", "Operation search and bound", search.success === true && search.items.length <= 50 && operationKeys.length === 2, operationKeys.join(", "));

  const operation = await call(readOnly.client, "openapi_get_operation", { target: "mcp-api", operationKey: "getUser", detail: "contract" });
  record("MCP-008", "Exact operation contract", operation.success === true && operation.operation?.operationKey === "getUser", JSON.stringify(operation.operation));

  const missing = await call(readOnly.client, "openapi_get_operation", { target: "mcp-api", operationKey: "doesNotExist" });
  record("MCP-009", "Unknown operationKey rejected", missing.success === false, JSON.stringify(missing.diagnostics));

  const fullDryRun = await call(readOnly.client, "openapi_generate_dry_run", { targets: ["mcp-api"], scope: { type: "full" } });
  record("MCP-010", "Full dry-run", fullDryRun.success === true, JSON.stringify(fullDryRun.summary));

  const scoped = await call(readOnly.client, "openapi_generate_dry_run", { targets: ["mcp-api"], scope: { type: "operations", operationKeys: ["getUser"] } });
  record("MCP-011", "Operation-scoped dry-run", scoped.success === true && scoped.projection?.operationCount === 1, JSON.stringify(scoped.projection));

  const check = await call(readOnly.client, "openapi_check_generation", { targets: ["mcp-api"] });
  record("MCP-012", "Generation check", typeof check.success === "boolean", JSON.stringify(check.summary));
} finally {
  await readOnly.transport.close();
}

let restartCredential;
const writable = await connect(["--config", config, "--allow-write"]);
try {
  const listed = await writable.client.listTools();
  calls.writeTools = listed.tools;
  const names = listed.tools.map((tool) => tool.name);
  record("MCP-013", "Write-enabled tool set", names.length === 10 && names.at(-2) === "openapi_prepare_generation" && names.at(-1) === "openapi_apply_generation", names.join(", "));

  const beforeNames = existsSync(output) ? readdirSync(output).sort() : [];
  const prepareAdd = await call(writable.client, "openapi_prepare_generation", {
    targets: ["mcp-api"],
    selection: { type: "add", operationKeys: ["createUser"] },
  });
  const afterPrepareNames = existsSync(output) ? readdirSync(output).sort() : [];
  record("MCP-014", "Selective Prepare does not write", prepareAdd.success === true && JSON.stringify(beforeNames) === JSON.stringify(afterPrepareNames), JSON.stringify(afterPrepareNames));

  const credential = {
    planId: prepareAdd.plan.planId,
    token: prepareAdd.plan.token,
    approvedPlanHash: prepareAdd.plan.planHash,
  };
  const applyAdd = await call(writable.client, "openapi_apply_generation", credential);
  record("MCP-015", "Apply exact plan credential", applyAdd.success === true && applyAdd.applied === true, JSON.stringify(applyAdd.summary));
  await writeFile(path.join(output, "handwritten.txt"), "This unmanaged file must survive selective replace.\n");

  const replay = await call(writable.client, "openapi_apply_generation", credential);
  record("MCP-016", "Token replay rejected", replay.success === false, JSON.stringify(replay.diagnostics));

  const prepareSecond = await call(writable.client, "openapi_prepare_generation", {
    targets: ["mcp-api"],
    selection: { type: "add", operationKeys: ["getUser"] },
  });
  const applySecond = await call(writable.client, "openapi_apply_generation", {
    planId: prepareSecond.plan.planId,
    token: prepareSecond.plan.token,
    approvedPlanHash: prepareSecond.plan.planHash,
  });
  record("MCP-017", "Persistent selection add", applySecond.success === true && applySecond.selectedOperationCount === 2, JSON.stringify(applySecond));

  const prepareReplace = await call(writable.client, "openapi_prepare_generation", {
    targets: ["mcp-api"],
    selection: { type: "replace", operationKeys: ["getUser"] },
  });
  const applyReplace = await call(writable.client, "openapi_apply_generation", {
    planId: prepareReplace.plan.planId,
    token: prepareReplace.plan.token,
    approvedPlanHash: prepareReplace.plan.planHash,
  });
  const createRemoved = !existsSync(path.join(output, "users/create-user.types.ts"));
  const handPreserved = existsSync(path.join(output, "handwritten.txt"));
  record("MCP-018", "Selection replace removes only managed files", applyReplace.success === true && createRemoved && handPreserved, `removed=${createRemoved}, handPreserved=${handPreserved}`);

  const prepareRestart = await call(writable.client, "openapi_prepare_generation", { targets: ["mcp-api"] });
  restartCredential = {
    planId: prepareRestart.plan.planId,
    token: prepareRestart.plan.token,
    approvedPlanHash: prepareRestart.plan.planHash,
  };

  const driftPlan = await call(writable.client, "openapi_prepare_generation", { targets: ["mcp-api"] });
  const driftFile = path.join(output, "users/get-user.types.ts");
  await appendFile(driftFile, "\n// output drift after Prepare\n");
  const driftApply = await call(writable.client, "openapi_apply_generation", {
    planId: driftPlan.plan.planId,
    token: driftPlan.plan.token,
    approvedPlanHash: driftPlan.plan.planHash,
  });
  record("MCP-019", "Output drift invalidates plan", driftApply.success === false, JSON.stringify(driftApply.diagnostics));
} finally {
  await writable.transport.close();
}

const restarted = await connect(["--config", config, "--allow-write"]);
try {
  const invalidAfterRestart = await call(restarted.client, "openapi_apply_generation", restartCredential);
  record("MCP-020", "Token invalid after restart", invalidAfterRestart.success === false, JSON.stringify(invalidAfterRestart.diagnostics));

  const cleanupPlan = await call(restarted.client, "openapi_prepare_generation", {
    targets: ["mcp-api"],
    selection: { type: "replace", operationKeys: ["getUser"] },
  });
  const cleanupApply = await call(restarted.client, "openapi_apply_generation", {
    planId: cleanupPlan.plan.planId,
    token: cleanupPlan.plan.token,
    approvedPlanHash: cleanupPlan.plan.planHash,
  });
  record("MCP-021", "Transactional cleanup after rejected drift", cleanupApply.success === true && cleanupApply.applied === true, JSON.stringify(cleanupApply.summary));
} finally {
  await restarted.transport.close();
}

await writeFile(path.join(root, "reports/snapshots/mcp-calls.json"), `${JSON.stringify(calls, null, 2)}\n`);
await writeFile(path.join(root, "reports/snapshots/mcp-tools.json"), `${JSON.stringify({
  noConfig: calls.noConfigTools,
  readOnly: calls.readOnlyTools,
  write: calls.writeTools,
}, null, 2)}\n`);
await writeFile(path.join(root, "reports/mcp-results.json"), `${JSON.stringify(results, null, 2)}\n`);

const failed = results.filter((result) => result.status === "FAIL");
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
