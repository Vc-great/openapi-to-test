import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const document = await readFile(path.join(root, "fixtures/openapi30/main.yaml"), "utf8");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function data(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

async function run(config, targetQuery) {
  if (targetQuery) process.env.ACCEPTANCE_CONTROLLED_REMOTE_URL = targetQuery;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(root, "node_modules/openapi-to/bin/openapi-to-mcp.js"),
      "--workspace-root", root,
      "--config", config,
      "--log-level", "silent",
      ...(targetQuery ? ["--allow-private-network", "--allow-host", "127.0.0.1"] : []),
    ],
    cwd: root,
    stderr: "pipe",
    env: { ...process.env, ACCEPTANCE_CONTROLLED_REMOTE_URL: targetQuery },
  });
  const client = new Client({ name: "controlled-remote-rerun", version: "1.0.0" });
  await client.connect(transport);
  try {
    const targets = data(await client.callTool({ name: "openapi_list_targets", arguments: {} }));
    const target = targets.targets?.[0]?.name;
    const search = data(await client.callTool({
      name: "openapi_search_operations",
      arguments: { target, query: "user ID", limit: 10 },
    }));
    const operationKey = search.items?.[0]?.operationKey;
    if (!operationKey) return { targets, search, operation: null, dryRun: null };
    const operation = data(await client.callTool({
      name: "openapi_get_operation",
      arguments: { target, operationKey, detail: "contract" },
    }));
    const dryRun = data(await client.callTool({
      name: "openapi_generate_dry_run",
      arguments: {
        targets: [target],
        scope: { type: "operations", operationKeys: [operationKey] },
        includePreview: true,
      },
    }));
    return { targets, search, operation, dryRun };
  } finally {
    await transport.close();
  }
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/yaml" });
  response.end(document);
});

try {
  const port = await listen(server);
  const remote = await run("controlled-remote.config.ts", `http://127.0.0.1:${port}/openapi.yaml`);
  const local = await run("openapi.config.ts", "");
  const localTarget = local.targets.targets?.[0]?.name;
  const remoteTarget = remote.targets.targets?.[0]?.name;
  const localArtifacts = local.dryRun.servers?.[0]?.manifest?.artifacts?.map((item) => item.path).sort() ?? [];
  const remoteArtifacts = remote.dryRun?.servers?.[0]?.manifest?.artifacts?.map((item) => item.path).sort() ?? [];
  const comparison = {
    operationCount: [local.targets.targets?.[0]?.operationCount, remote.targets.targets?.[0]?.operationCount],
    schemaCount: [local.targets.targets?.[0]?.schemaCount, remote.targets.targets?.[0]?.schemaCount],
    search: [local.search.items?.map((item) => item.operationKey), remote.search.items?.map((item) => item.operationKey)],
    operation: [local.operation?.operation?.operationKey, remote.operation?.operation?.operationKey],
    projection: [local.dryRun?.projection, remote.dryRun?.projection],
    artifactPathsEqual: JSON.stringify(localArtifacts) === JSON.stringify(remoteArtifacts),
    artifactPaths: { local: localArtifacts, controlledRemote: remoteArtifacts },
  };
  console.log(JSON.stringify({
    source: "same fixture over local file and test-owned HTTP server",
    localTarget,
    remoteTarget,
    comparison,
    localDiagnostics: local.dryRun?.diagnosticSummary,
    remoteDiagnostics: remote.dryRun?.diagnosticSummary,
    localTruncation: local.dryRun?.truncated,
    remoteTruncation: remote.dryRun?.truncated,
    remoteRaw: remote,
  }, null, 2));
} finally {
  await close(server);
}
