import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
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
  inspectSourceToolchain,
  isGeneratedWorkspaceYaml,
  isSafeTarballFilename,
  priorArtifactOwnsContent,
  readInstalledPackageManager,
  validatePriorArtifactProvenance,
  verifyInstalledPackageVersions,
  verifyLockfileLocalArtifacts,
  canBootstrapGeneratedWorkspace,
  isFreshCloneGeneratedWorkspaceCandidate,
  validateGeneratedWorkspaceYaml,
  validateLocalSourceState,
  workspaceSourceHead,
} from "./lib/openapi-to-main.mjs";

const REPOSITORY_LABEL = "openapi-to/openapi-to";
const DEFAULT_SOURCE_ROOT = "/Users/vc/code/openapi-to";
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
} = {}) {
  let executable = command;
  let launchArgs = args;
  if (process.platform === "win32" && command === "corepack") {
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

function localGitEnvironment() {
  return {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
  };
}

async function inspectLocalSource() {
  const configuredRoot = process.env.OPENAPI_TO_SOURCE_ROOT ?? DEFAULT_SOURCE_ROOT;
  if (!path.isAbsolute(configuredRoot)) {
    throw new TaskFailure("Local source failure", `OPENAPI_TO_SOURCE_ROOT must be an absolute path: ${configuredRoot}`);
  }
  let entry;
  try {
    entry = await lstat(configuredRoot);
  } catch (error) {
    throw new TaskFailure("Local source failure", `无法读取本地 source: ${configuredRoot}\n${error.message}`);
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new TaskFailure("Local source failure", `本地 source 必须是非 symlink 目录: ${configuredRoot}`);
  }
  const sourceRoot = await realpath(configuredRoot);
  const gitOptions = { env: localGitEnvironment() };
  const gitRoot = checked("git", ["rev-parse", "--show-toplevel"], sourceRoot, "Local source failure", "检查本地 Git 根目录", gitOptions).stdout.trim();
  if (await realpath(gitRoot) !== sourceRoot) {
    throw new TaskFailure("Local source failure", `本地 source 不是独立 Git 根目录: ${sourceRoot}`);
  }
  const branch = checked("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], sourceRoot, "Local source failure", "检查本地 source 分支", gitOptions).stdout.trim();
  const status = checked("git", ["status", "--porcelain", "--untracked-files=all"], sourceRoot, "Local source failure", "检查本地 source 工作树", gitOptions).stdout;
  const head = checked("git", ["rev-parse", "HEAD"], sourceRoot, "Local source failure", "读取本地 source HEAD", gitOptions).stdout.trim();
  const originResult = run("git", ["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"], sourceRoot, gitOptions);
  const originMain = originResult.status === 0 ? originResult.stdout.trim() : undefined;
  let ahead;
  let behind;
  if (originMain) {
    const counts = run("git", ["rev-list", "--left-right", "--count", "HEAD...refs/remotes/origin/main"], sourceRoot, gitOptions);
    const match = counts.status === 0 ? counts.stdout.trim().match(/^(\d+)\s+(\d+)$/) : undefined;
    ahead = match ? Number(match[1]) : undefined;
    behind = match ? Number(match[2]) : undefined;
  }
  let state;
  try {
    state = validateLocalSourceState({ branch, status, head, originMain, ahead, behind });
  } catch (error) {
    throw new TaskFailure("Local source failure", `${error.message}\nSource: ${sourceRoot}`);
  }
  return { sourceRoot, ...state };
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
    throw new TaskFailure("Temporary workspace failure", `temporary root identity or real path changed; refusing further path access: ${tempRoot}`);
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

async function assertWorkspaceUnchanged(expectedContents, { requireTrackedClean = false } = {}) {
  if (expectedContents === undefined) return;
  let workspaceStat;
  let currentContents;
  try {
    workspaceStat = await lstat(WORKSPACE_FILE);
    currentContents = await readFile(WORKSPACE_FILE, "utf8");
  } catch (error) {
    throw new TaskFailure(
      "Consumer workspace conflict",
      `pnpm-workspace.yaml 在安装期间不可读，未覆盖：${error.message}`,
    );
  }
  const status = gitStatus(WORKSPACE_FILE);
  const trackedClean = requireTrackedClean && isTrackedClean(WORKSPACE_FILE, status);
  if (
    !workspaceStat.isFile()
    || workspaceStat.isSymbolicLink()
    || currentContents !== expectedContents
    || (requireTrackedClean && !trackedClean)
  ) {
    throw new TaskFailure(
      "Consumer workspace conflict",
      "pnpm-workspace.yaml 在安装期间发生变化或不再是 clean tracked file，未覆盖。",
    );
  }
}

async function writeWorkspaceYaml(contents, expectedExistingContents) {
  await assertWorkspaceUnchanged(expectedExistingContents);
  const temporaryPath = `${WORKSPACE_FILE}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { flag: "wx" });
  await assertWorkspaceUnchanged(expectedExistingContents);
  await rename(temporaryPath, WORKSPACE_FILE);
}

function gitStatus(pathspec) {
  return checked("git", ["status", "--porcelain", "--", pathspec], ROOT, "Consumer workspace conflict", `检查 ${pathspec} 工作树状态`).stdout.trim();
}

function isTrackedClean(pathspec, status = gitStatus(pathspec)) {
  if (status) return false;
  const relativePath = path.relative(ROOT, pathspec).split(path.sep).join("/");
  const result = run("git", ["ls-files", "--error-unmatch", "--", relativePath], ROOT, { env: localGitEnvironment() });
  return result.status === 0 && result.stdout.trim() === relativePath;
}

async function preflightConsumerFiles() {
  let workspaceHead;
  let workspaceProvenance;
  let bootstrapWorkspace;
  let priorWorkspaceContents;
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
    priorWorkspaceContents = existingWorkspace;
    if (!isGeneratedWorkspaceYaml(existingWorkspace)) {
      throw new TaskFailure(
        "Consumer workspace conflict",
        `检测到非本脚本生成的 pnpm-workspace.yaml，未做覆盖：${WORKSPACE_FILE}`,
      );
    }
    const existingHead = workspaceSourceHead(existingWorkspace);
    const previousProvenance = await readPriorProvenance(path.join(ARTIFACT_ROOT, existingHead), existingHead);
    if (!previousProvenance) {
      if (!isFreshCloneGeneratedWorkspaceCandidate({
        contents: existingWorkspace,
        provenance: previousProvenance,
        tracked: isTrackedClean(WORKSPACE_FILE),
        status: gitStatus(WORKSPACE_FILE),
      })) {
        throw new TaskFailure(
          "Consumer workspace conflict",
          "pnpm-workspace.yaml 带有生成标记，但对应 provenance 缺失且不是 fresh-clone committed workspace；为保护 workspace settings，未覆盖。",
        );
      }
      bootstrapWorkspace = existingWorkspace;
    }
    workspaceHead = existingHead;
    workspaceProvenance = previousProvenance;
    if (previousProvenance) {
      try {
        validateGeneratedWorkspaceYaml(existingWorkspace, previousProvenance.packages);
      } catch (error) {
        throw new TaskFailure(
          "Consumer workspace conflict",
          `pnpm-workspace.yaml 已偏离此前生成的 local overrides 或含未知 settings，未覆盖：${error.message}`,
        );
      }
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
  if (!status) return {
    priorConsumerOwnership: workspaceProvenance?.consumer,
    bootstrapWorkspace,
    priorWorkspaceContents,
  };
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
  return {
    priorConsumerOwnership: previousProvenance.consumer,
    bootstrapWorkspace,
    priorWorkspaceContents,
  };
}

async function prepare() {
  const { priorConsumerOwnership, bootstrapWorkspace, priorWorkspaceContents } = await preflightConsumerFiles();
  const localSource = await inspectLocalSource();
  let tempRoot;
  let tempRootIdentity;
  let failure;
  let summary;
  try {
    tempRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "openapi-to-main-")));
    const tempStat = await lstat(tempRoot);
    tempRootIdentity = { dev: tempStat.dev, ino: tempStat.ino };
    const sourceRoot = localSource.sourceRoot;
    const emptyNpmrc = path.join(tempRoot, "empty.npmrc");
    const temporaryTarballs = path.join(tempRoot, "tarballs");
    const packRunner = path.join(tempRoot, "pack-current-main.mjs");
    const packUtility = path.join(tempRoot, "openapi-to-main.mjs");
    await mkdir(temporaryTarballs);
    await writeFile(packRunner, await readFile(path.join(ROOT, "scripts", "lib", "pack-current-main.mjs")), { flag: "wx" });
    await writeFile(packUtility, await readFile(path.join(ROOT, "scripts", "lib", "openapi-to-main.mjs")), { flag: "wx" });
    await writeFile(emptyNpmrc, "", { flag: "wx" });
    const packageManagerEnv = {
      NPM_CONFIG_USERCONFIG: emptyNpmrc,
      npm_config_userconfig: emptyNpmrc,
      NPM_CONFIG_GLOBALCONFIG: emptyNpmrc,
      npm_config_globalconfig: emptyNpmrc,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      npm_config_registry: "https://registry.npmjs.org/",
      COREPACK_NPM_REGISTRY: "https://registry.npmjs.org/",
    };
    await verifyTemporaryRoot(tempRoot, tempRootIdentity);

    stage(1, "校验本地 openapi-to main");
    console.log(`  Source: ${sourceRoot}`);
    console.log(`  HEAD: ${localSource.head}`);
    console.log(`  origin/main: ${localSource.originMain} (ahead ${localSource.ahead}, behind ${localSource.behind})`);
    const sourceHead = localSource.head;

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
    stage(3, `安装并构建本地 source（${toolchain.packageManager}）`);
    await checkedSource("corepack", corepackArgs(toolchain.packageManager, ["install", "--frozen-lockfile"]), sourceRoot, "Source install failure", "Source dependency install", undefined, tempRoot, tempRootIdentity);
    await checkedSource("corepack", corepackArgs(toolchain.packageManager, ["run", "build"]), sourceRoot, "Source build failure", "Source build", undefined, tempRoot, tempRootIdentity);
    const postBuildStatus = (await checkedSource(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      sourceRoot,
      "Local source failure",
      "检查 source 构建后的工作树",
      undefined,
      tempRoot,
      tempRootIdentity,
    )).stdout.trim();
    if (postBuildStatus) {
      throw new TaskFailure("Local source failure", `source build 修改了 tracked 或未忽略文件，拒绝继续打包：\n${postBuildStatus}`);
    }

    stage(4, "调用 source canonical release helper 打包发布包");
    const packOutput = await checkedSource(
      process.execPath,
      [packRunner],
      sourceRoot,
      "Pack failure",
      "Canonical pack helper",
      {
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
      throw new TaskFailure("Pack failure", `无法解析 pack 结果：${error.message}`);
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
    if (bootstrapWorkspace !== undefined && !canBootstrapGeneratedWorkspace({
      contents: bootstrapWorkspace,
      provenance: undefined,
      tracked: true,
      status: "",
      canonicalContents: workspace.yaml,
    })) {
      throw new TaskFailure(
        "Consumer workspace conflict",
        "committed generated pnpm-workspace.yaml does not match the canonical workspace for the current source; provenance is missing, so it was not overwritten.",
      );
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
    if (bootstrapWorkspace !== undefined) {
      await assertWorkspaceUnchanged(bootstrapWorkspace, { requireTrackedClean: true });
    } else {
      await writeWorkspaceYaml(workspace.yaml, priorWorkspaceContents);
    }

    // The local tarballs are regenerated for each source build. pnpm otherwise
    // keeps the old integrity for the same file specifier and rejects the
    // newly materialized tarball during the install/verification step.
    let consumerInstallArgs = ["install", "--no-frozen-lockfile", "--update-checksums"];
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
      sourceRoot,
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
  console.log(`  Path: ${summary.sourceRoot}`);
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
  console.log("  pnpm exec openapi setup --host codex --scope project --dry-run");
  console.log("  pnpm exec openapi setup --host codex --scope project");
  console.log("\n完成人工 Skill 安装测试后，在 openapi-to-test 中打开一个 Fresh Codex Session。");
}

prepare().catch((error) => {
  const category = error instanceof TaskFailure ? error.category : "Unexpected failure";
  console.error(`\nERROR [${category}]: ${error.message}`);
  process.exitCode = 1;
});
