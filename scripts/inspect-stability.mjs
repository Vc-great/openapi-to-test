import path from "node:path";
import process from "node:process";
import { runProcess } from "./lib/process.mjs";

const root = process.cwd();
const openapiBin = path.join(root, "node_modules/openapi-to/bin/openapi.js");

async function inspect(stage) {
  return await runProcess({
    executable: process.execPath,
    args: [openapiBin, "inspect", "fixtures/openapi30/main.yaml", "--json"],
    cwd: root,
    stage,
  });
}

const first = await inspect("inspect-stability:first");
const second = await inspect("inspect-stability:second");
const result = {
  byteStable: first.stdout === second.stdout,
  firstExit: first.exitCode,
  secondExit: second.exitCode,
  stderrEmpty: first.stderr.length === 0 && second.stderr.length === 0,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.byteStable && first.exitCode === 0 && second.exitCode === 0 ? 0 : 1;
