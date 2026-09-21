import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js"),
    "--workspace-root", root,
    "--config", "public-remote.config.ts",
    "--log-level", "silent",
  ],
  cwd: root,
  stderr: "pipe",
});
const client = new Client({ name: "public-remote-rerun", version: "1.0.0" });

function data(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

await client.connect(transport);
try {
  const targets = data(await client.callTool({ name: "openapi_list_targets", arguments: {} }));
  const target = targets.targets?.[0]?.name;
  const search = target
    ? data(await client.callTool({
      name: "openapi_search_operations",
      arguments: { target, query: "pet", limit: 10 },
    }))
    : null;
  const operationKey = search?.items?.[0]?.operationKey;
  const operation = operationKey
    ? data(await client.callTool({
      name: "openapi_get_operation",
      arguments: { target, operationKey, detail: "contract" },
    }))
    : null;
  const dryRun = operationKey
    ? data(await client.callTool({
      name: "openapi_generate_dry_run",
      arguments: { targets: [target], scope: { type: "operations", operationKeys: [operationKey] } },
    }))
    : null;
  console.log(JSON.stringify({ targets, search, operation, dryRun }, null, 2));
} finally {
  await transport.close();
}
