import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";

const OUTPUT_LIMIT = 24_000;
const SECRET_PATTERN = /(authorization|cookie|token|secret|password)\s*[:=]\s*([^\s,;]+)/gi;

function redact(value) {
  return value
    .replace(SECRET_PATTERN, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function truncate(value, limit = OUTPUT_LIMIT) {
  const clean = redact(value);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n...[truncated ${clean.length - limit} characters]`;
}

async function isExecutable(candidate) {
  try {
    await access(candidate, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveExecutable(executable, { cwd = process.cwd(), env = process.env } = {}) {
  const hasSeparator = executable.includes("/") || executable.includes("\\");
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  const names = process.platform === "win32" && path.extname(executable) === ""
    ? extensions.map((extension) => `${executable}${extension.toLowerCase()}`)
    : [executable];
  const directories = hasSeparator
    ? [path.isAbsolute(executable) ? "" : cwd]
    : (env.PATH ?? "").split(path.delimiter);

  for (const directory of directories) {
    for (const name of names) {
      const candidate = directory ? path.resolve(directory, name) : name;
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return executable;
}

function displayArg(argument) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(argument)) return argument;
  return JSON.stringify(argument);
}

export function displayCommand(executable, args = []) {
  return [executable, ...args].map(displayArg).join(" ");
}

function quoteWindowsCommandArgument(value) {
  const escaped = value
    .replace(/%/g, "%%")
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

export function portableValue(root, value) {
  if (typeof value === "string") return value.split(root).join("<workspace>");
  if (Array.isArray(value)) return value.map((item) => portableValue(root, item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portableValue(root, item)]));
  }
  return value;
}

export async function runProcess({
  executable,
  args = [],
  cwd = process.cwd(),
  env = {},
  timeoutMs = 120_000,
  stage = "command",
}) {
  const childEnv = { ...process.env, NO_UPDATE_NOTIFIER: "1", ...env };
  const resolvedExecutable = await resolveExecutable(executable, { cwd, env: childEnv });
  const isWindowsCommandScript = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolvedExecutable);
  const launchExecutable = isWindowsCommandScript
    ? (childEnv.ComSpec ?? path.join(childEnv.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"))
    : resolvedExecutable;
  const launchArgs = isWindowsCommandScript
    ? ["/d", "/s", "/c", [resolvedExecutable, ...args].map(quoteWindowsCommandArgument).join(" ")]
    : args;
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    const child = spawn(launchExecutable, launchArgs, {
      cwd,
      env: childEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2_000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      stderr += `${error.name}: ${error.message}\n`;
    });
    child.on("close", (exitCode, signal) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        stage,
        executable,
        args,
        command: displayCommand(executable, args),
        resolvedExecutable,
        cwd,
        exitCode: exitCode ?? 1,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        diagnostic: {
          stage,
          command: displayCommand(executable, args),
          exitCode: exitCode ?? 1,
          timedOut,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
        },
      });
    });
  });
}

export async function writeCommandEvidence(root, id, result, extra = {}) {
  const commandRoot = path.join(root, "reports/evidence/commands");
  await mkdir(commandRoot, { recursive: true });
  const document = {
    id,
    stage: result.stage,
    executable: portableValue(root, result.executable),
    args: portableValue(root, result.args),
    cwd: path.relative(root, result.cwd) || ".",
    command: portableValue(root, result.command),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    ...portableValue(root, extra),
  };
  const relativePath = `reports/evidence/commands/${id}.json`;
  await writeFile(path.join(root, relativePath), `${JSON.stringify(document, null, 2)}\n`);
  return relativePath;
}

export async function writeFailureEvidence(root, id, result) {
  const failureRoot = path.join(root, "reports/evidence/failures");
  await mkdir(failureRoot, { recursive: true });
  const stdoutPath = `reports/evidence/failures/${id}.stdout.txt`;
  const stderrPath = `reports/evidence/failures/${id}.stderr.txt`;
  await writeFile(path.join(root, stdoutPath), portableValue(root, truncate(result.stdout)));
  await writeFile(path.join(root, stderrPath), portableValue(root, truncate(result.stderr)));
  return [stdoutPath, stderrPath];
}

export function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
