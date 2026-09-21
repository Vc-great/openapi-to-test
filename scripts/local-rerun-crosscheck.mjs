import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const executable = path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js");
const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const snapshot = async (dir) => {
  try {
    const entries = [];
    const visit = async (current) => {
      for (const name of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(current, name.name);
        if (name.isDirectory()) await visit(full);
        else entries.push([path.relative(root, full), await digest(full)]);
      }
    };
    await visit(dir);
    return entries;
  } catch { return []; }
};
const data = (result) => {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
};

const generated = path.join(root, "server");
const before = { git: null, generated: await snapshot(generated) };
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [executable, "--workspace-root", root, "--config", "openapi.config.ts", "--log-level", "silent"],
  cwd: root,
  stderr: "pipe",
});
const client = new Client({ name: "local-rerun-crosscheck", version: "1.0.0" });
await client.connect(transport);
try {
  const listed = await client.listTools();
  const targets = data(await client.callTool({ name: "openapi_list_targets", arguments: {} }));
  const target = targets.targets?.[0]?.name;
  const search = data(await client.callTool({ name: "openapi_search_operations", arguments: { target, query: "user", methods: ["GET"], limit: 10 } }));
  const operationKey = search.items?.[0]?.operationKey;
  const operation = operationKey ? data(await client.callTool({ name: "openapi_get_operation", arguments: { target, operationKey, detail: "contract" } })) : null;
  const dryRun = operationKey ? data(await client.callTool({ name: "openapi_generate_dry_run", arguments: {
    targets: [target],
    scope: { type: "operations", operationKeys: [operationKey] },
    includePreview: true,
  } })) : null;
  const after = { generated: await snapshot(generated) };
  const contract = operation?.operation ?? {};
  const previewArtifacts = dryRun?.servers?.flatMap((server) => server.manifest?.artifacts ?? []) ?? [];
  console.log(JSON.stringify({
    toolNames: listed.tools.map((tool) => tool.name),
    dryRunSchema: listed.tools.find((tool) => tool.name === "openapi_generate_dry_run")?.inputSchema,
    targets,
    search,
    contract: {
      operationKey: contract.operationKey,
      method: contract.method,
      path: contract.path,
      parameters: contract.parameters,
      responses: contract.responses?.map((response) => ({ status: response.status, description: response.description, success: response.success })),
      diagnostics: operation?.diagnostics,
      truncated: operation?.truncated,
    },
    dryRun: dryRun && {
      success: dryRun.success,
      scope: dryRun.scope,
      projection: dryRun.projection,
      artifactCount: previewArtifacts.length,
      artifacts: previewArtifacts.map((artifact) => ({ path: artifact.path, status: artifact.status, bytes: artifact.bytes, hasPreview: typeof artifact.preview === "string", previewTruncated: artifact.previewTruncated })),
      summary: dryRun.servers?.map((server) => ({ name: server.name, summary: server.summary, manifestHash: server.manifest?.hash })),
      diagnosticSummary: dryRun.diagnosticSummary,
      diagnostics: dryRun.diagnostics,
      truncated: dryRun.truncated,
    },
    noWrite: JSON.stringify(before.generated) === JSON.stringify(after.generated),
  }, null, 2));
} finally {
  await transport.close();
}
