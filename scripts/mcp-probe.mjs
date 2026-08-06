import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const executable = path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js");

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

const modes = [
  ["no-config", []],
  ["read-only", ["--config", path.join(root, "mcp.config.ts")]],
  ["allow-write", ["--config", path.join(root, "mcp.config.ts"), "--allow-write"]],
];

const result = {};
for (const [name, args] of modes) {
  const { client, transport } = await connect(args);
  try {
    result[name] = await client.listTools();
  } finally {
    await transport.close();
  }
}
console.log(JSON.stringify(result, null, 2));
