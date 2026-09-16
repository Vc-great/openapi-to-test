import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCurrentMainWorkspaceYaml } from "./openapi-to-main.mjs";

const CONFIG = JSON.parse(readFileSync(0, "utf8"));
const SOURCE_ROOT = path.resolve(CONFIG.sourceRoot);
const HELPER_PATH = path.join(SOURCE_ROOT, "scripts", "release", "pack-smoke-helpers.mjs");
const TEMPORARY_TARBALLS = path.resolve(CONFIG.temporaryTarballs);

function removeSensitiveEnvironment() {
  const sensitiveName = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASS(?:PHRASE)?|COOKIE|CREDENTIALS?|AUTH|KEY|JWT|BEARER)(?:_|$)|^(?:CODEX_HOME|OPENAI_API_KEY|NODE_OPTIONS|NODE_PATH|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH_COMMAND|PGPASSWORD|DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL)$/i;
  for (const key of Object.keys(process.env)) {
    if (sensitiveName.test(key)) {
      delete process.env[key];
      continue;
    }
    const value = process.env[key];
    if (typeof value === "string" && value.includes("://")) {
      try {
        const url = new URL(value);
        if (url.username || url.password) delete process.env[key];
      } catch {
        // Preserve non-URL values for tools that accept them.
      }
    }
  }
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    const value = process.env[key];
    if (!value) continue;
    try {
      const proxy = new URL(value);
      if (proxy.username || proxy.password) delete process.env[key];
    } catch {
      // Preserve proxy formats that are not URLs.
    }
  }
  process.env.GIT_TERMINAL_PROMPT = "0";
  process.env.GCM_INTERACTIVE = "Never";
  process.env.NO_UPDATE_NOTIFIER = "1";
  process.env.NPM_CONFIG_USERCONFIG = CONFIG.npmrc;
  process.env.npm_config_userconfig = CONFIG.npmrc;
  process.env.NPM_CONFIG_GLOBALCONFIG = CONFIG.npmrc;
  process.env.npm_config_globalconfig = CONFIG.npmrc;
  process.env.NPM_CONFIG_REGISTRY = "https://registry.npmjs.org/";
  process.env.npm_config_registry = "https://registry.npmjs.org/";
  process.env.COREPACK_NPM_REGISTRY = "https://registry.npmjs.org/";
}

function runPnpm(args, cwd) {
  let command = "corepack";
  let commandArgs = [CONFIG.packageManager, ...args];
  if (process.platform === "win32") {
    command = process.env.ComSpec ?? "cmd.exe";
    const quote = (value) => `"${String(value).replace(/%/g, "%%").replace(/"/g, '""')}"`;
    commandArgs = ["/d", "/s", "/c", ["corepack.cmd", ...commandArgs].map(quote).join(" ")];
  }
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    windowsHide: true,
  });
  if (result.error) {
    return { status: 1, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${result.error.message}` };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

async function main() {
  removeSensitiveEnvironment();
  const sourceRoot = path.resolve(SOURCE_ROOT);
  const helperPath = path.resolve(HELPER_PATH);
  if (path.relative(sourceRoot, helperPath) !== path.join("scripts", "release", "pack-smoke-helpers.mjs")) {
    throw new Error("Canonical helper path escaped the temporary source clone.");
  }
  const helperStat = await lstat(helperPath);
  if (!helperStat.isFile() || helperStat.isSymbolicLink()) {
    throw new Error("Canonical helper must be a regular file inside the temporary source clone.");
  }
  const [sourceRootRealPath, helperRealPath] = await Promise.all([realpath(sourceRoot), realpath(helperPath)]);
  const helperRelativePath = path.relative(sourceRootRealPath, helperRealPath);
  if (helperRelativePath === ".." || helperRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(helperRelativePath)) {
    throw new Error("Canonical helper real path escaped the temporary source clone.");
  }
  const canonical = await import(pathToFileURL(helperPath).href);
  if (
    typeof canonical.packReleasePackages !== "function"
    || typeof canonical.createPackedOverrides !== "function"
    || typeof canonical.createWorkspaceOverridesYaml !== "function"
    || !Array.isArray(canonical.releasePackageDirectories)
  ) {
    throw new Error("Source canonical pack helper API is incompatible.");
  }
  const packed = await canonical.packReleasePackages({
    repositoryRoot: sourceRoot,
    tarballDirectory: TEMPORARY_TARBALLS,
    pnpm(args, cwd) {
      const result = runPnpm(args, cwd);
      if (result.status !== 0) {
        const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
        throw new Error(`pnpm pack failed with exit code ${result.status}${details ? `\n${details}` : ""}`);
      }
      return result;
    },
  });
  const workspace = createCurrentMainWorkspaceYaml({
    packed,
    sourceHead: CONFIG.sourceHead,
    createPackedOverrides: canonical.createPackedOverrides,
    createWorkspaceOverridesYaml: canonical.createWorkspaceOverridesYaml,
  });
  const result = {
    packed,
    workspace,
    releasePackageCount: canonical.releasePackageDirectories.length,
  };
  process.stdout.write(`OPENAPI_TO_PACK_RESULT=${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
