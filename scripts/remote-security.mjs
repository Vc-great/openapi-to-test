import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const secret = "acceptance-secret-must-not-leak";
let receivedHeaders = {};

const document = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Redirected", version: "1.0.0" },
  paths: {
    "/remote": {
      get: {
        operationId: "getRemote",
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

const destination = http.createServer((request, response) => {
  receivedHeaders = request.headers;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(document);
});
const destinationPort = await listen(destination);

const redirect = http.createServer((_request, response) => {
  response.writeHead(302, { location: `http://127.0.0.1:${destinationPort}/openapi.json` });
  response.end();
});
const redirectPort = await listen(redirect);

const child = spawn(path.join(root, "node_modules/.bin/openapi"), [
  "generate", "--config", "remote.config.ts", "--dry-run", "--json",
], {
  cwd: root,
  env: {
    ...process.env,
    ACCEPTANCE_REMOTE_URL: `http://127.0.0.1:${redirectPort}/redirect`,
    ACCEPTANCE_REMOTE_SECRET: secret,
    NO_UPDATE_NOTIFIER: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const exitCode = await new Promise((resolve) => child.on("close", resolve));
await new Promise((resolve) => destination.close(resolve));
await new Promise((resolve) => redirect.close(resolve));

let parsed;
try { parsed = JSON.parse(stdout); } catch {}
const leakedToRedirectTarget =
  receivedHeaders.authorization === secret ||
  receivedHeaders["x-consumer-secret"] === secret;
const leakedToLogs = stdout.includes(secret) || stderr.includes(secret);

const result = {
  exitCode,
  success: parsed?.success === true,
  redirectedRequestReached: Object.keys(receivedHeaders).length > 0,
  crossOriginHeadersCleared: !leakedToRedirectTarget,
  logsRedacted: !leakedToLogs,
  receivedHeaderNames: Object.keys(receivedHeaders).sort(),
  stdout,
  stderr,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode === 0 && result.crossOriginHeadersCleared && result.logsRedacted ? 0 : 1;
