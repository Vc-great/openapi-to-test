import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProvenance,
  createSourceIsolationProfile,
  inspectSourceToolchain,
  isGeneratedWorkspaceYaml,
  isSafeTarballFilename,
  priorArtifactOwnsContent,
  readInstalledPackageManager,
  validatePriorArtifactProvenance,
  verifyInstalledPackageVersions,
  verifyLockfileLocalArtifacts,
  validateGeneratedWorkspaceYaml,
  workspaceSourceHead,
} from "./lib/openapi-to-main.mjs";

const REPOSITORY_URL = "https://github.com/openapi-to/openapi-to.git";
const REPOSITORY_LABEL = "openapi-to/openapi-to";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_FILE = path.join(ROOT, "pnpm-workspace.yaml");
const LOCK_FILE = path.join(ROOT, "pnpm-lock.yaml");
const ARTIFACT_ROOT = path.join(ROOT, ".openapi-to-local");
const LOG_TAIL_LIMIT = 8_000;

class TaskFailure extends Error {
  constructor(category, message) {
    super(message);
    this.name = "TaskFailure";
    this.category = category;
  }
}

function sanitizeChildEnvironment(extra = {}, { restricted = false } = {}) {
  const inheritedNames = [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
  ];
  const env = restricted
    ? Object.fromEntries(inheritedNames.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]))
    : { ...process.env };
  Object.assign(env, extra);
  const sensitiveName = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASS(?:PHRASE)?|COOKIE|CREDENTIALS?|AUTH|KEY|JWT|BEARER)(?:_|$)|^(?:CODEX_HOME|OPENAI_API_KEY|NODE_OPTIONS|NODE_PATH|GIT_ASKPASS|SSH_ASKPASS|GIT_SSH_COMMAND|PGPASSWORD|DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL)$/i;
  const removeNames = new Set([
    "SSH_AUTH_SOCK",
    "SSH_AGENT_PID",
    "GIT_CONFIG_PARAMETERS",
    "GIT_SSH",
    "GIT_SSH_VARIANT",
  ]);
  for (const key of Object.keys(env)) {
    if (sensitiveName.test(key) || removeNames.has(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/i.test(key)) {
      delete env[key];
      continue;
    }
    const value = env[key];
    if (typeof value === "string" && value.includes("://")) {
      try {
        const url = new URL(value);
        if (url.username || url.password) delete env[key];
      } catch {
        // Leave non-URL environment values to the consuming tool.
      }
    }
  }
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    const value = env[key];
    if (!value) continue;
    try {
      const proxy = new URL(value);
      if (proxy.username || proxy.password) delete env[key];
    } catch {
      // Keep non-URL proxy values for tools that accept them.
    }
  }
  env.GIT_TERMINAL_PROMPT = "0";
  env.GCM_INTERACTIVE = "Never";
  env.SSH_AUTH_SOCK = "";
  env.SSH_AGENT_PID = "";
  env.NO_UPDATE_NOTIFIER = "1";
  return env;
}

function run(command, args, cwd, {
  env,
  input,
  maxBuffer = 32 * 1024 * 1024,
  restrictedEnvironment = false,
  sandboxProfile,
} = {}) {
  let executable = command;
  let launchArgs = args;
  if (sandboxProfile) {
    if (process.platform !== "darwin") {
      return { status: 1, stdout: "", stderr: "OS-level source isolation is currently supported only on macOS." };
    }
    executable = "/usr/bin/sandbox-exec";
    launchArgs = ["-f", sandboxProfile, command, ...args];
  } else if (process.platform === "win32" && command === "corepack") {
    executable = process.env.ComSpec ?? "cmd.exe";
    const quote = (value) => `"${String(value).replace(/%/g, "%%").replace(/"/g, '""')}"`;
    launchArgs = ["/d", "/s", "/c", ["corepack.cmd", ...args].map(quote).join(" ")];
  }
  const result = spawnSync(executable, launchArgs, {
    cwd,
    encoding: "utf8",
    env: sanitizeChildEnvironment(env, { restricted: restrictedEnvironment }),
    input,
    maxBuffer,
    timeout: 30 * 60 * 1000,
    windowsHide: true,
  });
  if (result.error) {
    return { status: 1, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${result.error.message}` };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tail(value) {
  const text = String(value ?? "").trim();
  if (text.length <= LOG_TAIL_LIMIT) return text;
  return `…(前文省略)…\n${text.slice(-LOG_TAIL_LIMIT)}`;
}

function checked(command, args, cwd, category, label, options) {
  const result = run(command, args, cwd, options);
  if (result.status !== 0) {
    const details = [tail(result.stderr), tail(result.stdout)].filter(Boolean).join("\n");
    throw new TaskFailure(category, `${label} 失败，exit code ${result.status}${details ? `\n${details}` : ""}`);
  }
  return result;
}

function verifySourceIsolation(protectedReadDirectories, tempRoot, environment, sandboxProfile, protectedFiles, protectedWriteSubpaths, renameProbePath) {
  if (process.platform !== "darwin") {
    throw new TaskFailure("Source isolation failure", "当前实现要求 macOS sandbox-exec，以阻止 source build 读取主机 home。未在此平台执行 source code。");
  }
  const probeScript = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const denied = (error) => error.code === "EPERM" || error.code === "EACCES";',
    'const protectedReadCount = Number(process.argv[1]);',
    'const fileCount = Number(process.argv[2]);',
    'const subpathCount = Number(process.argv[3]);',
    'const root = process.argv[4];',
    'const renameTarget = process.argv[5];',
    'const protectedReads = process.argv.slice(6, 6 + protectedReadCount);',
    'const files = process.argv.slice(6 + protectedReadCount, 6 + protectedReadCount + fileCount);',
    'const blockedSubpaths = process.argv.slice(6 + protectedReadCount + fileCount, 6 + protectedReadCount + fileCount + subpathCount);',
    'for (const directory of protectedReads) { try { fs.readdirSync(directory); process.exit(2); } catch (error) { if (!denied(error)) process.exit(1); } }',
    'for (const filename of files) { try { const fd = fs.openSync(filename, "r+"); fs.closeSync(fd); process.exit(3); } catch (error) { if (!denied(error)) process.exit(1); } try { fs.unlinkSync(filename); process.exit(4); } catch (error) { if (!denied(error)) process.exit(1); } }',
    'const marker = path.join(root, ".isolation-write-probe"); fs.writeFileSync(marker, "ok"); fs.unlinkSync(marker);',
    'for (const directory of blockedSubpaths) { try { const marker = path.join(directory, ".isolation-write-probe"); fs.writeFileSync(marker, "ok"); fs.unlinkSync(marker); process.exit(6); } catch (error) { if (!denied(error)) process.exit(1); } }',
    'try { fs.renameSync(root, renameTarget); fs.renameSync(renameTarget, root); process.exit(5); } catch (error) { if (!denied(error)) process.exit(1); }',
    'process.exit(0);',
  ].join("\n");
  const probe = run(
    process.execPath,
    [
      "-e",
      probeScript,
      String(protectedReadDirectories.length),
      String(protectedFiles.length),
      String(protectedWriteSubpaths.length),
      tempRoot,
      renameProbePath,
      ...protectedReadDirectories,
      ...protectedFiles,
      ...protectedWriteSubpaths,
    ],
    tempRoot,
    { env: environment, restrictedEnvironment: true, sandboxProfile, maxBuffer: 1024 * 1024 },
  );
  if (probe.status !== 0) {
    const details = [tail(probe.stderr), tail(probe.stdout)].filter(Boolean).join("\n");
    throw new TaskFailure("Source isolation failure", `OS sandbox home/profile/temporary-root/output protection probe failed (exit ${probe.status}); source install/build was not started.${details ? `\n${details}` : ""}`);
  }
}

function corepackArgs(packageManager, args) {
  return [packageManager, ...args];
}

function stage(number, message) {
  console.log(`[${number}/7] ${message}`);
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function verifyTemporaryRoot(tempRoot, expectedIdentity) {
  const entry = await lstat(tempRoot);
  const [resolvedTempRoot, expectedParent] = await Promise.all([realpath(tempRoot), realpath(os.tmpdir())]);
  if (
    !entry.isDirectory()
    || entry.isSymbolicLink()
    || entry.dev !== expectedIdentity.dev
    || entry.ino !== expectedIdentity.ino
    || resolvedTempRoot !== tempRoot
    || !isPathInside(expectedParent, resolvedTempRoot)
    || !path.basename(resolvedTempRoot).startsWith("openapi-to-main-")
  ) {
    throw new TaskFailure("Source isolation failure", `temporary root identity or real path changed; refusing further path access: ${tempRoot}`);
  }
}

async function checkedSource(command, args, cwd, category, label, options, tempRoot, tempRootIdentity) {
  const result = checked(command, args, cwd, category, label, options);
  await verifyTemporaryRoot(tempRoot, tempRootIdentity);
  return result;
}

async function sha256File(filename) {
  const bytes = await readFile(filename);
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha512Integrity(filename) {
  const bytes = await readFile(filename);
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

async function writeProvenanceFile(destinationRoot, provenance) {
  const provenancePath = path.join(destinationRoot, "provenance.json");
  const temporaryPath = `${provenancePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, provenancePath);
}

async function ensureSafeDirectory(directory) {
  let entry;
  try {
    entry = await lstat(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(directory);
    entry = await lstat(directory);
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new TaskFailure("Artifact ownership conflict", `拒绝写入非普通目录或 symlink: ${directory}`);
  }
}

async function readPriorProvenance(directory, sourceHead) {
  const filename = path.join(directory, "provenance.json");
  try {
    const entry = await lstat(filename);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new TaskFailure("Artifact ownership conflict", `拒绝读取非普通 provenance 文件: ${filename}`);
    }
    const parsed = JSON.parse(await readFile(filename, "utf8"));
    if (parsed.source?.repository !== REPOSITORY_LABEL) {
      throw new TaskFailure("Artifact ownership conflict", `拒绝覆盖非本脚本 provenance: ${filename}`);
    }
    try {
      return validatePriorArtifactProvenance(parsed, sourceHead);
    } catch (error) {
      throw new TaskFailure("Artifact ownership conflict", `已有 provenance 无效，拒绝覆盖其 tarball: ${filename}: ${error.message}`);
    }
  } catch (error) {
    if (error instanceof TaskFailure) throw error;
    if (error.code === "ENOENT") return undefined;
    throw new TaskFailure("Artifact ownership conflict", `无法读取已有 provenance ${filename}: ${error.message}`);
  }
}

async function materializeArtifacts({
  packed,
  sourceHead,
  packageManager,
  nodeVersion,
  temporaryTarballs,
  tempRoot,
  priorConsumerOwnership,
}) {
  const destinationRoot = path.join(ARTIFACT_ROOT, sourceHead);
  const tarballRoot = path.join(destinationRoot, "tarballs");
  const temporaryTarballsStat = await lstat(temporaryTarballs);
  if (!temporaryTarballsStat.isDirectory() || temporaryTarballsStat.isSymbolicLink()) {
    throw new TaskFailure("Pack failure", "Canonical pack helper replaced the temporary tarball directory with a non-directory or symlink.");
  }
  const tempRootRealPath = await realpath(tempRoot);
  const temporaryTarballsRealPath = await realpath(temporaryTarballs);
  if (!isPathInside(tempRootRealPath, temporaryTarballsRealPath)) {
    throw new TaskFailure("Pack failure", "Temporary tarball directory escaped the script-owned temporary root.");
  }
  await ensureSafeDirectory(ARTIFACT_ROOT);
  await ensureSafeDirectory(destinationRoot);
  await ensureSafeDirectory(tarballRoot);
  const priorProvenance = await readPriorProvenance(destinationRoot, sourceHead);

  const packages = [];
  for (const item of packed) {
    const sourcePath = path.resolve(item.archive);
    const sourceRealPath = await realpath(sourcePath);
    if (!isPathInside(temporaryTarballsRealPath, sourceRealPath)) {
      throw new TaskFailure("Pack failure", `Canonical pack helper returned an archive outside its temporary output directory: ${item.name}`);
    }
    const sourceStat = await lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new TaskFailure("Pack failure", `Canonical pack helper returned a non-regular archive: ${item.name}`);
    }
    const targetPath = path.join(tarballRoot, item.filename);
    const fileStat = sourceStat;
    const integrity = await sha256File(sourcePath);
    let existingIntegrity;
    try {
      const existingStat = await lstat(targetPath);
      if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
        throw new TaskFailure("Artifact ownership conflict", `拒绝覆盖非普通 tarball 文件: ${targetPath}`);
      }
      existingIntegrity = await sha256File(targetPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (
      existingIntegrity
      && existingIntegrity !== integrity
      && !priorArtifactOwnsContent(priorProvenance, item.filename, existingIntegrity, sourceHead)
    ) {
      throw new TaskFailure("Artifact ownership conflict", `拒绝覆盖没有本脚本 provenance 的文件: ${targetPath}`);
    }
    if (existingIntegrity !== integrity) await copyFile(sourcePath, targetPath);
    packages.push({
      name: item.name,
      version: item.version,
      tarball: item.filename,
      path: `.openapi-to-local/${sourceHead}/tarballs/${item.filename}`,
      bytes: fileStat.size,
      sha256: integrity,
      integrity: await sha512Integrity(sourcePath),
      sourceHead,
    });
  }

  const provenance = createProvenance({
    sourceHead,
    packageManager,
    nodeVersion,
    packedAt: new Date().toISOString(),
    packages,
  });
  if (priorConsumerOwnership?.sourceHead && priorConsumerOwnership?.lockfileSha256) {
    provenance.consumer = priorConsumerOwnership;
  }
  await writeProvenanceFile(destinationRoot, provenance);
  return { provenance, destinationRoot };
}

async function verifyArtifactFiles({ destinationRoot, provenance, sourceHead, packed }) {
  if (provenance.source?.head !== sourceHead || provenance.packages.length !== packed.length) {
    throw new TaskFailure("Provenance verification failure", "provenance source identity or package count changed during install.");
  }
  for (const item of packed) {
    const recorded = provenance.packages.find(({ name }) => name === item.name);
    const expectedPath = `.openapi-to-local/${sourceHead}/tarballs/${item.filename}`;
    if (!recorded || recorded.version !== item.version || recorded.path !== expectedPath || recorded.sourceHead !== sourceHead) {
      throw new TaskFailure("Provenance verification failure", `provenance entry does not match canonical package: ${item.name}`);
    }
    const tarballPath = path.join(destinationRoot, "tarballs", item.filename);
    const tarballStat = await lstat(tarballPath);
    if (!tarballStat.isFile() || tarballStat.isSymbolicLink()) {
      throw new TaskFailure("Provenance verification failure", `packed artifact is not a regular file: ${tarballPath}`);
    }
    if (
      tarballStat.size !== recorded.bytes
      || await sha256File(tarballPath) !== recorded.sha256
      || await sha512Integrity(tarballPath) !== recorded.integrity
    ) {
      throw new TaskFailure("Provenance verification failure", `packed artifact hash or size changed: ${item.name}`);
    }
  }
}

async function writeWorkspaceYaml(contents) {
  const temporaryPath = `${WORKSPACE_FILE}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { flag: "wx" });
  await rename(temporaryPath, WORKSPACE_FILE);
}

function gitStatus(pathspec) {
  return checked("git", ["status", "--porcelain", "--", pathspec], ROOT, "Consumer workspace conflict", `检查 ${pathspec} 工作树状态`).stdout.trim();
}

async function preflightConsumerFiles() {
  let workspaceHead;
  let workspaceProvenance;
  try {
    const workspaceStat = await lstat(WORKSPACE_FILE);
    if (!workspaceStat.isFile() || workspaceStat.isSymbolicLink()) {
      throw new TaskFailure("Consumer workspace conflict", `pnpm-workspace.yaml 必须是普通文件：${WORKSPACE_FILE}`);
    }
  } catch (error) {
    if (error instanceof TaskFailure) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  try {
    const existingWorkspace = await readFile(WORKSPACE_FILE, "utf8");
    if (!isGeneratedWorkspaceYaml(existingWorkspace)) {
      throw new TaskFailure(
        "Consumer workspace conflict",
        `检测到非本脚本生成的 pnpm-workspace.yaml，未做覆盖：${WORKSPACE_FILE}`,
      );
    }
    const existingHead = workspaceSourceHead(existingWorkspace);
    const previousProvenance = await readPriorProvenance(path.join(ARTIFACT_ROOT, existingHead), existingHead);
    if (!previousProvenance) {
      throw new TaskFailure(
        "Consumer workspace conflict",
        "pnpm-workspace.yaml 带有生成标记，但对应 provenance 缺失；为保护 workspace settings，未覆盖。",
      );
    }
    workspaceHead = existingHead;
    workspaceProvenance = previousProvenance;
    try {
      validateGeneratedWorkspaceYaml(existingWorkspace, previousProvenance.packages);
    } catch (error) {
      throw new TaskFailure(
        "Consumer workspace conflict",
        `pnpm-workspace.yaml 已偏离此前生成的 local overrides 或含未知 settings，未覆盖：${error.message}`,
      );
    }
  } catch (error) {
    if (error instanceof TaskFailure) throw error;
    if (error.code !== "ENOENT") throw error;
  }

  try {
    const lockStat = await lstat(LOCK_FILE);
    if (!lockStat.isFile() || lockStat.isSymbolicLink()) {
      throw new TaskFailure("Consumer lockfile conflict", `pnpm-lock.yaml 必须是普通文件：${LOCK_FILE}`);
    }
  } catch (error) {
    if (error instanceof TaskFailure) throw error;
    if (error.code !== "ENOENT") throw error;
  }
  const status = gitStatus("pnpm-lock.yaml");
  if (!status) return workspaceProvenance?.consumer;
  const workspace = await readFile(WORKSPACE_FILE, "utf8").catch(() => "");
  const previousHead = workspaceSourceHead(workspace);
  const lock = await readFile(LOCK_FILE, "utf8").catch(() => "");
  const previousProvenance = workspaceHead === previousHead ? workspaceProvenance : undefined;
  const consumerSourceHead = previousProvenance?.consumer?.sourceHead;
  let lockHash;
  try {
    lockHash = await sha256File(LOCK_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    !previousHead
    || !consumerSourceHead
    || !/^[a-f0-9]{40,64}$/i.test(consumerSourceHead)
    || !previousProvenance?.consumer?.lockfileSha256
    || previousProvenance.consumer.lockfileSha256 !== lockHash
    || !lock.includes(`.openapi-to-local/${consumerSourceHead}/tarballs/`)
  ) {
    throw new TaskFailure(
      "Consumer lockfile conflict",
      "pnpm-lock.yaml 与此前成功安装记录不一致或缺少 ownership hash；为保护用户内容，已停止安装。",
    );
  }
  return previousProvenance.consumer;
}

async function prepare() {
  const priorConsumerOwnership = await preflightConsumerFiles();
  let tempRoot;
  let tempRootIdentity;
  let failure;
  let summary;
  try {
    const tempRootAlias = await mkdtemp(path.join(os.tmpdir(), "openapi-to-main-"));
    tempRoot = await realpath(tempRootAlias);
    const tempStat = await lstat(tempRoot);
    tempRootIdentity = { dev: tempStat.dev, ino: tempStat.ino };
    const renameProbePath = path.join(path.dirname(tempRoot), `${path.basename(tempRoot)}.rename-probe-${process.pid}`);
    try {
      await lstat(renameProbePath);
      throw new TaskFailure("Source isolation failure", `temporary-root rename probe target already exists: ${renameProbePath}`);
    } catch (error) {
      if (error instanceof TaskFailure) throw error;
      if (error.code !== "ENOENT") throw error;
    }
    const sourceRoot = path.join(tempRoot, "source");
    const emptyNpmrc = path.join(tempRoot, "empty.npmrc");
    const emptyGitConfig = path.join(tempRoot, "empty.gitconfig");
    const sourceHome = path.join(tempRoot, "source-home");
    const sourceSandboxProfile = path.join(tempRoot, "source.sandbox");
    const packSandboxProfile = path.join(tempRoot, "pack.sandbox");
    const sourceNpmCache = path.join(tempRoot, "npm-cache");
    const sourceCorepackHome = path.join(tempRoot, "corepack-home");
    const temporaryTarballs = path.join(tempRoot, "tarballs");
    const packRunner = path.join(tempRoot, "pack-current-main.mjs");
    const packUtility = path.join(tempRoot, "openapi-to-main.mjs");
    const aliasesForTempPath = (canonicalPath) => {
      const relative = path.relative(tempRoot, canonicalPath);
      return [canonicalPath, path.join(tempRootAlias, relative)];
    };
    const protectedTempRoots = [...new Set([
      tempRoot,
      tempRootAlias,
      ...aliasesForTempPath(temporaryTarballs),
    ])];
    const protectedWriteSubpaths = [...new Set(aliasesForTempPath(temporaryTarballs))];
    const protectedSourceFiles = [...new Set([
      ...aliasesForTempPath(sourceSandboxProfile),
      ...aliasesForTempPath(packSandboxProfile),
      ...aliasesForTempPath(emptyNpmrc),
      ...aliasesForTempPath(emptyGitConfig),
      ...aliasesForTempPath(packRunner),
      ...aliasesForTempPath(packUtility),
    ])];
    const homeDirectories = [...new Set([os.homedir(), await realpath(os.homedir())])];
    const consumerRootPaths = [...new Set([ROOT, await realpath(ROOT)])];
    const protectedReadDirectories = [...new Set([...homeDirectories, ...consumerRootPaths])];
    await mkdir(temporaryTarballs);
    await writeFile(packRunner, await readFile(path.join(ROOT, "scripts", "lib", "pack-current-main.mjs")), { flag: "wx" });
    await writeFile(packUtility, await readFile(path.join(ROOT, "scripts", "lib", "openapi-to-main.mjs")), { flag: "wx" });
    await writeFile(emptyNpmrc, "", { flag: "wx" });
    await writeFile(emptyGitConfig, "", { flag: "wx" });
    await mkdir(sourceHome);
    await writeFile(sourceSandboxProfile, createSourceIsolationProfile(
      homeDirectories[0],
      protectedSourceFiles,
      homeDirectories.slice(1),
      protectedTempRoots,
      protectedWriteSubpaths,
      consumerRootPaths,
    ), { flag: "wx" });
    await writeFile(packSandboxProfile, createSourceIsolationProfile(
      homeDirectories[0],
      protectedSourceFiles,
      homeDirectories.slice(1),
      protectedTempRoots,
      [],
      consumerRootPaths,
    ), { flag: "wx" });
    const packageManagerEnv = {
      NPM_CONFIG_USERCONFIG: emptyNpmrc,
      npm_config_userconfig: emptyNpmrc,
      NPM_CONFIG_GLOBALCONFIG: emptyNpmrc,
      npm_config_globalconfig: emptyNpmrc,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      npm_config_registry: "https://registry.npmjs.org/",
      COREPACK_NPM_REGISTRY: "https://registry.npmjs.org/",
      GIT_CONFIG_GLOBAL: emptyGitConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "0",
    };
    const sourceEnvironment = {
      ...packageManagerEnv,
      HOME: sourceHome,
      USERPROFILE: sourceHome,
      TMPDIR: tempRoot,
      TMP: tempRoot,
      TEMP: tempRoot,
      XDG_CONFIG_HOME: path.join(sourceHome, ".config"),
      XDG_CACHE_HOME: path.join(sourceHome, ".cache"),
      XDG_DATA_HOME: path.join(sourceHome, ".local", "share"),
      COREPACK_HOME: sourceCorepackHome,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      NPM_CONFIG_CACHE: sourceNpmCache,
      npm_config_cache: sourceNpmCache,
      PNPM_HOME: path.join(tempRoot, "pnpm-home"),
    };
    const isolatedOptions = {
      env: sourceEnvironment,
      restrictedEnvironment: true,
      sandboxProfile: sourceSandboxProfile,
    };
    const packOptions = { ...isolatedOptions, sandboxProfile: packSandboxProfile };
    verifySourceIsolation(
      protectedReadDirectories,
      tempRoot,
      sourceEnvironment,
      sourceSandboxProfile,
      protectedSourceFiles,
      protectedWriteSubpaths,
      renameProbePath,
    );
    await verifyTemporaryRoot(tempRoot, tempRootIdentity);

    stage(1, "获取 openapi-to 当前 main");
    await checkedSource(
      "git",
      ["clone", "--depth", "1", "--branch", "main", REPOSITORY_URL, sourceRoot],
      tempRoot,
      "Git clone/fetch failure",
      "Git clone",
      { ...isolatedOptions, maxBuffer: 4 * 1024 * 1024 },
      tempRoot,
      tempRootIdentity,
    );
    const sourceHead = (await checkedSource(
      "git",
      ["rev-parse", "HEAD"],
      sourceRoot,
      "Git clone/fetch failure",
      "读取 source HEAD",
      isolatedOptions,
      tempRoot,
      tempRootIdentity,
    )).stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(sourceHead)) {
      throw new TaskFailure("Git clone/fetch failure", `git rev-parse 返回无效 HEAD: ${sourceHead}`);
    }

    stage(2, "检查 source toolchain");
    let sourcePackage;
    try {
      sourcePackage = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
    } catch (error) {
      throw new TaskFailure("Unsupported package manager", `无法读取 source package.json: ${error.message}`);
    }
    let toolchain;
    try {
      toolchain = inspectSourceToolchain(sourcePackage, process.versions.node);
    } catch (error) {
      throw new TaskFailure(/Node/.test(error.message) ? "Unsupported Node" : "Unsupported package manager", error.message);
    }
    stage(3, `安装并构建临时 source（${toolchain.packageManager}）`);
    await checkedSource("corepack", corepackArgs(toolchain.packageManager, ["install", "--frozen-lockfile"]), sourceRoot, "Source install failure", "Source dependency install", isolatedOptions, tempRoot, tempRootIdentity);
    await checkedSource("corepack", corepackArgs(toolchain.packageManager, ["run", "build"]), sourceRoot, "Source build failure", "Source build", isolatedOptions, tempRoot, tempRootIdentity);

    stage(4, "调用 source canonical release helper 打包发布包");
    const packOutput = await checkedSource(
      process.execPath,
      [packRunner],
      sourceRoot,
      "Pack failure",
      "隔离环境中的 canonical pack helper",
      {
        ...packOptions,
        input: JSON.stringify({
          sourceRoot,
          sourceHead,
          temporaryTarballs,
          packageManager: toolchain.packageManager,
          npmrc: emptyNpmrc,
        }),
      },
      tempRoot,
      tempRootIdentity,
    );
    const resultMarker = "OPENAPI_TO_PACK_RESULT=";
    const markerIndex = packOutput.stdout.lastIndexOf(resultMarker);
    if (markerIndex < 0) {
      throw new TaskFailure("Pack failure", "隔离的 canonical pack helper 没有返回结果。");
    }
    let packResult;
    try {
      const resultLine = packOutput.stdout.slice(markerIndex + resultMarker.length).split(/\r?\n/, 1)[0];
      packResult = JSON.parse(resultLine);
    } catch (error) {
      throw new TaskFailure("Pack failure", `无法解析 isolated pack 结果：${error.message}`);
    }
    const { packed, workspace, releasePackageCount } = packResult;
    if (
      !Array.isArray(packed)
      || !Number.isSafeInteger(releasePackageCount)
      || releasePackageCount <= 0
      || !workspace
      || typeof workspace.yaml !== "string"
      || !workspace.expectedPaths
    ) {
      throw new TaskFailure("Pack failure", "隔离的 canonical pack helper 返回结构无效。");
    }
    const expectedPaths = {};
    for (const item of packed) {
      if (typeof item.name !== "string" || !item.name || typeof item.version !== "string" || !item.version || !isSafeTarballFilename(item.filename)) {
        throw new TaskFailure("Pack failure", `Canonical helper 返回了无效 package identity: ${item.name ?? "<unknown>"}`);
      }
      expectedPaths[item.name] = `.openapi-to-local/${sourceHead}/tarballs/${item.filename}`;
    }
    try {
      validateGeneratedWorkspaceYaml(workspace.yaml, packed.map(({ name, filename }) => ({ name, tarball: filename })));
    } catch (error) {
      throw new TaskFailure("Pack failure", `Canonical workspace YAML 无效：${error.message}`);
    }
    if (
      Object.keys(workspace.expectedPaths).length !== Object.keys(expectedPaths).length
      || Object.entries(expectedPaths).some(([name, pathValue]) => workspace.expectedPaths[name] !== pathValue)
    ) {
      throw new TaskFailure("Pack failure", "Canonical workspace paths 不匹配本轮 SHA tarballs。");
    }
    if (packed.length !== releasePackageCount) {
      throw new TaskFailure(
        "Pack failure",
        `Canonical helper 有 ${releasePackageCount} 个发布目录，但只打包了 ${packed.length} 个 package。`,
      );
    }
    if (new Set(packed.map(({ name }) => name)).size !== packed.length) {
      throw new TaskFailure("Pack failure", "Canonical helper 返回重复 package name。");
    }

    const artifactResult = await materializeArtifacts({
      packed,
      sourceHead,
      packageManager: toolchain.packageManager,
      nodeVersion: process.version,
      temporaryTarballs,
      tempRoot,
      priorConsumerOwnership,
    });

    stage(5, "为 Consumer 写入本地 tarball overrides");
    await writeWorkspaceYaml(workspace.yaml);

    let consumerInstallArgs = ["install", "--no-frozen-lockfile"];
    let priorConsumerPnpm;
    try {
      priorConsumerPnpm = readInstalledPackageManager(await readFile(path.join(ROOT, "node_modules", ".modules.yaml"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const needsModulesRefresh = Boolean(priorConsumerPnpm && priorConsumerPnpm !== toolchain.packageManager);
    if (needsModulesRefresh) consumerInstallArgs.push("--force");
    stage(6, needsModulesRefresh
      ? `安装 Consumer 依赖（刷新 ${priorConsumerPnpm} 创建的 node_modules）`
      : "安装 Consumer 依赖");
    checked(
      "corepack",
      corepackArgs(toolchain.packageManager, consumerInstallArgs),
      ROOT,
      "Consumer install failure",
      "Consumer pnpm install",
      { env: packageManagerEnv },
    );

    stage(7, "验证 current-main provenance 与安装结果");
    const lockText = await readFile(LOCK_FILE, "utf8");
    await verifyArtifactFiles({
      destinationRoot: artifactResult.destinationRoot,
      provenance: artifactResult.provenance,
      sourceHead,
      packed,
    });
    const expectedIntegrities = Object.fromEntries(artifactResult.provenance.packages.map(({ name, integrity }) => [name, integrity]));
    const lockVerified = verifyLockfileLocalArtifacts(lockText, workspace.expectedPaths, expectedIntegrities);
    const installedVerified = await verifyInstalledPackageVersions({ root: ROOT, packed, sourceHead });
    if (installedVerified !== releasePackageCount || lockVerified !== releasePackageCount) {
      throw new TaskFailure("Provenance verification failure", "安装包数与 canonical release package 数量不一致。");
    }
    for (const item of packed) {
      const recorded = artifactResult.provenance.packages.find(({ name }) => name === item.name);
      if (!recorded || recorded.version !== item.version || recorded.sourceHead !== sourceHead) {
        throw new TaskFailure("Provenance verification failure", `provenance 与 packed manifest 不一致: ${item.name}`);
      }
    }
    artifactResult.provenance.consumer = { sourceHead, lockfileSha256: await sha256File(LOCK_FILE) };
    await writeProvenanceFile(artifactResult.destinationRoot, artifactResult.provenance);
    summary = {
      sourceHead,
      version: packed.find(({ name }) => name === "openapi-to")?.version,
      packageManager: toolchain.packageManager,
      packageCount: packed.length,
      artifactRelative: path.relative(ROOT, artifactResult.destinationRoot).split(path.sep).join("/"),
      installedVerified,
      lockVerified,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (tempRoot) {
      let cleanupPath;
      try {
        const entry = await lstat(tempRoot);
        const resolvedTemp = await realpath(tempRoot);
        const expectedParent = await realpath(os.tmpdir());
        const isOwnedDirectory = entry.isDirectory()
          && !entry.isSymbolicLink()
          && entry.dev === tempRootIdentity?.dev
          && entry.ino === tempRootIdentity?.ino;
        if (
          !isOwnedDirectory
          || !isPathInside(expectedParent, resolvedTemp)
          || !path.basename(resolvedTemp).startsWith("openapi-to-main-")
        ) {
          throw new Error(`拒绝清理未验证的 temporary path: ${resolvedTemp}`);
        }
        cleanupPath = resolvedTemp;
      } catch (error) {
        const cleanupError = new Error(`无法证明 temporary path 仍由本脚本创建，保留现场：${error.message}`);
        failure ??= new TaskFailure("Cleanup warning", cleanupError.message);
      }
      if (cleanupPath) {
        try {
          await rm(cleanupPath, { recursive: true, force: true });
        } catch (error) {
          console.error(`[Cleanup warning] temporary source 未能删除：${cleanupPath}\n${error.message}`);
          if (failure) {
            failure.message += `\nCleanup warning: ${error.message}`;
          } else {
            failure = new TaskFailure("Cleanup warning", `临时 source 未能清理：${error.message}`);
          }
        }
      }
    }
  }

  if (failure) throw failure;
  console.log("\nopenapi-to current-main installed successfully\n");
  console.log("Source");
  console.log(`  Repository: ${REPOSITORY_LABEL}`);
  console.log(`  HEAD: ${summary.sourceHead}`);
  console.log(`  Version: ${summary.version}`);
  console.log(`  Package manager: ${summary.packageManager}`);
  console.log("\nConsumer");
  console.log("  Root: .");
  console.log(`  Local resolutions verified: ${summary.installedVerified}/${summary.packageCount}`);
  console.log(`  Lockfile resolutions verified: ${summary.lockVerified}/${summary.packageCount}`);
  console.log("\nArtifacts");
  console.log(`  ${summary.artifactRelative}/`);
  console.log("\nNext steps");
  console.log("  pnpm exec openapi skills install --host codex --dry-run");
  console.log("  pnpm exec openapi skills install --host codex");
  console.log("\n完成人工 Skill 安装测试后，在 openapi-to-test 中打开一个 Fresh Codex Session。");
}

prepare().catch((error) => {
  const category = error instanceof TaskFailure ? error.category : "Unexpected failure";
  console.error(`\nERROR [${category}]: ${error.message}`);
  process.exitCode = 1;
});
