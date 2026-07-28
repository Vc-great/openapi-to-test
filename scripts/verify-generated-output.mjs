import { createHash } from "node:crypto";
import {
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputRoot = path.join(
  workspaceRoot,
  "src/api/generated/manual-full",
);
const manifestName = ".openapi-to-manifest.json";
const driftMarker = "// controlled-drift-test: verify-generated-output\n";
const maxOutputLength = 4_000;

function limited(value) {
  if (value.length <= maxOutputLength) {
    return value;
  }

  return `${value.slice(0, maxOutputLength)}\n... output truncated ...`;
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function run(stage, command, args, expectedExitCode = 0) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  if (result.error || result.status !== expectedExitCode) {
    const details = [
      `Stage: ${stage}`,
      `Command: ${commandLabel(command, args)}`,
      `Exit code: ${String(result.status)}`,
      `stdout:\n${limited(result.stdout ?? "")}`,
      `stderr:\n${limited(result.stderr ?? "")}`,
    ].join("\n");
    throw new Error(details, result.error ? { cause: result.error } : undefined);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

function parseJsonDocument(stage, stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new Error(`${stage}: stdout was empty; expected one JSON document`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `${stage}: stdout was not one complete JSON document\n${limited(stdout)}`,
      { cause: error },
    );
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSuccessfulGeneration(stage, document, expectedMode) {
  assert(
    document !== null && typeof document === "object",
    `${stage}: JSON result must be an object`,
  );
  assert(document.success === true, `${stage}: JSON result did not report success`);
  assert(
    document.command === "generate",
    `${stage}: JSON result was not for the generate command`,
  );
  assert(
    document.mode === expectedMode,
    `${stage}: expected mode ${expectedMode}, received ${String(document.mode)}`,
  );
  assert(
    Array.isArray(document.servers) && document.servers.length === 1,
    `${stage}: expected exactly one generated target`,
  );
  assert(
    document.servers[0]?.name === "manual-full" &&
      document.servers[0]?.success === true,
    `${stage}: manual-full did not report success`,
  );

  if (expectedMode === "check") {
    assert(
      document.servers[0]?.manifest?.outdated === false,
      `${stage}: generated output was unexpectedly outdated`,
    );
  }
}

function listRegularFiles(directory, relativeDirectory = "") {
  const absoluteDirectory = path.join(directory, relativeDirectory);
  const files = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRegularFiles(directory, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function hashDirectory(directory) {
  const hashes = new Map();
  for (const relativePath of listRegularFiles(directory)) {
    const bytes = readFileSync(path.join(directory, relativePath));
    hashes.set(relativePath, createHash("sha256").update(bytes).digest("hex"));
  }
  return hashes;
}

function directoryDigest(hashes) {
  const digest = createHash("sha256");
  for (const [relativePath, hash] of [...hashes.entries()].sort()) {
    digest.update(relativePath);
    digest.update("\0");
    digest.update(hash);
    digest.update("\n");
  }
  return digest.digest("hex");
}

function compareHashes(expected, actual) {
  const added = [...actual.keys()].filter((file) => !expected.has(file));
  const deleted = [...expected.keys()].filter((file) => !actual.has(file));
  const changed = [...expected.keys()].filter(
    (file) => actual.has(file) && expected.get(file) !== actual.get(file),
  );

  if (added.length > 0 || deleted.length > 0 || changed.length > 0) {
    throw new Error(
      [
        "Generated output is not byte-stable.",
        `Added: ${added.join(", ") || "(none)"}`,
        `Deleted: ${deleted.join(", ") || "(none)"}`,
        `Changed: ${changed.join(", ") || "(none)"}`,
      ].join("\n"),
    );
  }
}

function verifyGeneratedFiles() {
  assert(
    statSync(outputRoot).isDirectory(),
    `Generated output directory does not exist: ${outputRoot}`,
  );

  const files = listRegularFiles(outputRoot);
  const typeScriptFiles = files.filter((file) => file.endsWith(".ts"));
  assert(files.length > 0, "Generated output directory is empty");
  assert(typeScriptFiles.length > 0, "No generated TypeScript files were found");
  assert(files.includes(manifestName), `${manifestName} was not generated`);

  const siblingUpstreamPath = path
    .resolve(workspaceRoot, "..", "openapi-to")
    .replaceAll(path.sep, "/");
  const internalSourcePattern =
    /(?:^|[/\\])packages[/\\][^/\\\s"'`]+[/\\]src(?:[/\\]|$)/u;

  for (const relativePath of files) {
    const absolutePath = path.join(outputRoot, relativePath);
    const bytes = readFileSync(absolutePath);
    if (bytes.includes(0)) {
      continue;
    }

    const contents = bytes.toString("utf8");
    assert(
      !internalSourcePattern.test(contents),
      `${relativePath} references an upstream packages/*/src path`,
    );
    assert(
      !contents.replaceAll(path.sep, "/").includes(`${siblingUpstreamPath}/`),
      `${relativePath} leaks the absolute path of the sibling upstream repository`,
    );
  }

  return { files, typeScriptFiles };
}

function generate(stage) {
  const result = run(stage, "pnpm", [
    "exec",
    "openapi",
    "generate",
    "--target",
    "manual-full",
    "--json",
  ]);
  const document = parseJsonDocument(stage, result.stdout);
  assertSuccessfulGeneration(stage, document, "write");
  return document;
}

function check(stage, expectedExitCode = 0) {
  const result = run(
    stage,
    "pnpm",
    [
      "exec",
      "openapi",
      "generate",
      "--target",
      "manual-full",
      "--check",
      "--json",
    ],
    expectedExitCode,
  );
  const document = parseJsonDocument(stage, result.stdout);
  if (expectedExitCode === 0) {
    assertSuccessfulGeneration(stage, document, "check");
  }
  return document;
}

let baselineHashes;
let driftFile;
let primaryError;

try {
  generate("normal generation");
  check("current output check");

  const generated = verifyGeneratedFiles();
  baselineHashes = hashDirectory(outputRoot);
  const baselineDigest = directoryDigest(baselineHashes);
  console.log(
    `Generated output: PASS (${generated.files.length} files, ${generated.typeScriptFiles.length} TypeScript files, manifest present)`,
  );

  generate("repeat generation");
  const repeatedHashes = hashDirectory(outputRoot);
  compareHashes(baselineHashes, repeatedHashes);
  console.log(`Byte stability: PASS (${baselineDigest})`);

  driftFile = generated.typeScriptFiles.find((file) =>
    file.endsWith(".service.ts"),
  ) ?? generated.typeScriptFiles[0];
  appendFileSync(path.join(outputRoot, driftFile), driftMarker, "utf8");

  const driftDocument = check("controlled drift check", 6);
  const outdated = driftDocument?.servers?.some(
    (server) => server?.name === "manual-full" &&
      server?.manifest?.outdated === true,
  );
  assert(
    driftDocument?.success === false && outdated === true,
    "controlled drift check failed for a reason other than outdated generated output",
  );
  console.log(
    `Drift detection: PASS (${driftFile}, exit 6, outdated output reported)`,
  );
} catch (error) {
  primaryError = error;
} finally {
  try {
    generate("recovery generation");
    check("recovery output check");
    run("recovery TypeScript compilation", "pnpm", ["exec", "tsc"]);

    if (baselineHashes !== undefined) {
      const recoveredHashes = hashDirectory(outputRoot);
      compareHashes(baselineHashes, recoveredHashes);
      const recoveredDigest = directoryDigest(recoveredHashes);
      console.log(
        `Recovery: PASS (${recoveredDigest}, check exit 0, typecheck exit 0)`,
      );
    }
  } catch (recoveryError) {
    if (primaryError !== undefined) {
      throw new AggregateError(
        [primaryError, recoveryError],
        "Verification failed and recovery also failed",
      );
    }
    throw recoveryError;
  }
}

if (primaryError !== undefined) {
  throw primaryError;
}

console.log("Generated output verification: PASS");
