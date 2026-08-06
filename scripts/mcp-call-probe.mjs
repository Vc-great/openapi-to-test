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
    "--config", path.join(root, "mcp.config.ts"),
    "--allow-write",
    "--log-level", "silent",
  ],
  cwd: root,
  stderr: "pipe",
});
const client = new Client({ name: "probe", version: "1.0.0" });
await client.connect(transport);

function data(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

try {
  const targets = data(await client.callTool({ name: "openapi_list_targets", arguments: {} }));
  const search = data(await client.callTool({ name: "openapi_search_operations", arguments: { target: "mcp-api", query: "user", limit: 8 } }));
  const prepared = data(await client.callTool({ name: "openapi_prepare_generation", arguments: {
    targets: ["mcp-api"],
    selection: { type: "add", operationKeys: ["createUser"] },
    includePreview: true,
  } }));
  console.log(JSON.stringify({ targets, search, prepared }, null, 2));
} finally {
  await transport.close();
}
