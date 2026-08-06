import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const executable = path.join(process.cwd(), "node_modules/.bin/openapi");
function inspect() {
  return new Promise((resolve) => {
    const child = spawn(executable, ["inspect", "fixtures/openapi30/main.yaml", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
const first = await inspect();
const second = await inspect();
const result = {
  byteStable: first.stdout === second.stdout,
  firstExit: first.exitCode,
  secondExit: second.exitCode,
  stderrEmpty: first.stderr.length === 0 && second.stderr.length === 0,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.byteStable && first.exitCode === 0 && second.exitCode === 0 ? 0 : 1;
