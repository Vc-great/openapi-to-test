import http from "node:http";
import path from "node:path";
import process from "node:process";
import { runProcess } from "./lib/process.mjs";

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
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

const destination = http.createServer((request, response) => {
  receivedHeaders = request.headers;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(document);
});
const redirect = http.createServer((_request, response) => {
  response.writeHead(302, { location: `http://127.0.0.1:${destination.address().port}/openapi.json` });
  response.end();
});

try {
  const destinationPort = await listen(destination);
  const redirectPort = await listen(redirect);
  const child = await runProcess({
    executable: process.execPath,
    args: [path.join(root, "node_modules/openapi-to/bin/openapi.js"), "generate", "--config", "remote.config.ts", "--dry-run", "--json"],
    cwd: root,
    env: {
      ACCEPTANCE_REMOTE_URL: `http://127.0.0.1:${redirectPort}/redirect`,
      ACCEPTANCE_REMOTE_SECRET: secret,
    },
    stage: "remote-security",
  });
  let parsed;
  try { parsed = JSON.parse(child.stdout); } catch {}
  const leakedToRedirectTarget =
    receivedHeaders.authorization === secret ||
    receivedHeaders["x-consumer-secret"] === secret;
  const leakedToLogs = child.stdout.includes(secret) || child.stderr.includes(secret);
  const result = {
    exitCode: child.exitCode,
    success: parsed?.success === true,
    redirectedRequestReached: Object.keys(receivedHeaders).length > 0,
    crossOriginHeadersCleared: !leakedToRedirectTarget,
    logsRedacted: !leakedToLogs,
    receivedHeaderNames: Object.keys(receivedHeaders).sort(),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = child.exitCode === 0 && result.crossOriginHeadersCleared && result.logsRedacted ? 0 : 1;
} catch (error) {
  if (error?.code === "EPERM" && error?.syscall === "listen") {
    console.log(JSON.stringify({
      blocked: true,
      reason: "host policy denied loopback listen",
      code: error.code,
    }, null, 2));
    process.exitCode = 77;
  } else {
    throw error;
  }
} finally {
  await close(destination);
  await close(redirect);
}
