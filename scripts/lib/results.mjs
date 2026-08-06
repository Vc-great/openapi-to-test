import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const STATUSES = ["PASS", "FAIL", "KNOWN_LIMITATION", "BLOCKED", "SKIPPED"];

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function resultIdentity({
  argv = process.argv,
  env = process.env,
  now = () => new Date(),
} = {}) {
  return {
    runId: valueAfter(argv, "--run-id") ?? env.VERIFY_RUN_ID ?? randomUUID(),
    testHarnessCommit: valueAfter(argv, "--test-harness-commit") ?? env.VERIFY_GIT_HEAD ?? null,
    verifyStartedAt: valueAfter(argv, "--verify-started-at") ?? env.VERIFY_STARTED_AT ?? null,
    startedAt: now().toISOString(),
  };
}

export function normalizeCase(caseItem) {
  const normalized = { ...caseItem };
  if (normalized.status !== "FAIL") return normalized;

  const fallbackRootCauseId = `HARNESS-${normalized.id}`;
  const rootCauseIds = Array.isArray(normalized.rootCauseIds)
    ? normalized.rootCauseIds.filter(Boolean)
    : [];
  if (rootCauseIds.length === 0 && normalized.rootCauseId) {
    rootCauseIds.push(normalized.rootCauseId);
  }
  if (rootCauseIds.length === 0) {
    rootCauseIds.push(fallbackRootCauseId);
  }
  normalized.rootCauseId ??= rootCauseIds[0];
  normalized.rootCauseIds = rootCauseIds;
  normalized.severity ??= "HARNESS";
  return normalized;
}

export function normalizeCases(cases) {
  return cases.map(normalizeCase);
}

export function summarize(cases) {
  const normalizedCases = normalizeCases(cases);
  const counts = Object.fromEntries(STATUSES.map((status) => [
    status,
    normalizedCases.filter((item) => item.status === status).length,
  ]));
  const rootCauses = new Map();
  for (const item of normalizedCases) {
    if (item.status !== "FAIL") continue;
    const ids = item.rootCauseIds;
    for (const id of ids) {
      const existing = rootCauses.get(id) ?? {
        rootCauseId: id,
        severity: item.rootCauseSeverities?.[id] ?? item.severity ?? "UNCLASSIFIED",
        affectedCases: [],
      };
      existing.affectedCases.push(item.id);
      rootCauses.set(id, existing);
    }
  }
  return {
    total: cases.length,
    pass: counts.PASS,
    fail: counts.FAIL,
    knownLimitations: counts.KNOWN_LIMITATION,
    blocked: counts.BLOCKED,
    skipped: counts.SKIPPED,
    failedTestCases: counts.FAIL,
    independentDefects: rootCauses.size,
    independentRootCauses: [...rootCauses.values()],
  };
}

export function createDocument(cases, metadata = {}) {
  const normalizedCases = normalizeCases(cases);
  return {
    schemaVersion: "2.0.0",
    generatedAt: new Date().toISOString(),
    ...metadata,
    summary: summarize(normalizedCases),
    cases: normalizedCases,
  };
}

export async function writeResultDocument(root, output, cases, metadata = {}) {
  const target = path.resolve(root, output);
  const document = createDocument(cases, metadata);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
  return { target, document };
}

function validationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function validateFragment({
  fragment,
  expectedRunId,
  expectedCommit,
  expectedSource,
  verifyStartedAt,
}) {
  if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) {
    throw validationError("FRAGMENT_INVALID", "fragment must be an object");
  }
  if (fragment.runId !== expectedRunId) {
    throw validationError("FRAGMENT_RUN_ID_MISMATCH", `runId ${fragment.runId ?? "missing"} does not match ${expectedRunId}`);
  }
  if (fragment.testHarnessCommit !== expectedCommit) {
    throw validationError(
      "FRAGMENT_COMMIT_MISMATCH",
      `testHarnessCommit ${fragment.testHarnessCommit ?? "missing"} does not match ${expectedCommit}`,
    );
  }
  if (fragment.source !== expectedSource) {
    throw validationError("FRAGMENT_SOURCE_MISMATCH", `source ${fragment.source ?? "missing"} does not match ${expectedSource}`);
  }
  if (!Array.isArray(fragment.cases)) {
    throw validationError("FRAGMENT_CASES_INVALID", "cases must be an array");
  }
  const generatedAt = Date.parse(fragment.generatedAt);
  const verifyStart = Date.parse(verifyStartedAt);
  if (!Number.isFinite(generatedAt)) {
    throw validationError("FRAGMENT_GENERATED_AT_INVALID", "generatedAt must be a valid ISO timestamp");
  }
  if (!Number.isFinite(verifyStart) || generatedAt < verifyStart) {
    throw validationError("FRAGMENT_STALE", `generatedAt ${fragment.generatedAt} is earlier than verify ${verifyStartedAt}`);
  }
  const expectedSummary = summarize(fragment.cases);
  if (JSON.stringify(fragment.summary) !== JSON.stringify(expectedSummary)) {
    throw validationError("FRAGMENT_SUMMARY_MISMATCH", "summary does not match cases");
  }
  return fragment;
}

export async function loadAndValidateFragment({ file, ...expectations }) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw validationError("FRAGMENT_MISSING", `current-run fragment does not exist: ${file}`);
    }
    throw validationError("FRAGMENT_READ_FAILED", `${error.name}: ${error.message}`);
  }
  let fragment;
  try {
    fragment = JSON.parse(text);
  } catch (error) {
    throw validationError("FRAGMENT_JSON_INVALID", `${error.name}: ${error.message}`);
  }
  return validateFragment({ fragment, ...expectations });
}

export function validateSuiteExitCode({ summary, exitCode }) {
  const expectedExitCode = summary.fail > 0 ? 1 : 0;
  if (exitCode !== expectedExitCode) {
    throw validationError(
      "SUITE_EXIT_MISMATCH",
      `suite exitCode ${exitCode} does not match summary.fail ${summary.fail}; expected ${expectedExitCode}`,
    );
  }
  return true;
}
