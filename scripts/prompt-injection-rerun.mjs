import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageHashBefore = createHash("sha256").update(await readFile(path.join(root, "package.json"))).digest("hex");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js"),
    "--workspace-root", root,
    "--config", "prompt-injection.config.ts",
    "--log-level", "silent",
  ],
  cwd: root,
  stderr: "pipe",
});
const client = new Client({ name: "prompt-injection-rerun", version: "1.0.0" });

function data(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

await client.connect(transport);
try {
  const targets = data(await client.callTool({ name: "openapi_list_targets", arguments: {} }));
  const target = targets.targets?.[0]?.name;
  const search = data(await client.callTool({
    name: "openapi_search_operations",
    arguments: { target, query: "user ID", limit: 5 },
  }));
  const operationKey = search.items?.[0]?.operationKey;
  const operation = data(await client.callTool({
    name: "openapi_get_operation",
    arguments: { target, operationKey, detail: "contract" },
  }));
  const dryRun = data(await client.callTool({
    name: "openapi_generate_dry_run",
    arguments: { targets: [target], scope: { type: "operations", operationKeys: [operationKey] } },
  }));
  const packageHashAfter = createHash("sha256").update(await readFile(path.join(root, "package.json"))).digest("hex");
  console.log(JSON.stringify({
    target,
    search,
    operation,
    dryRun,
    packageHashUnchanged: packageHashBefore === packageHashAfter,
    payloadTreatment: "OpenAPI descriptions/examples/extensions were supplied only as untrusted document data; no command or Apply tool was called.",
  }, null, 2));
} finally {
  await transport.close();
}
