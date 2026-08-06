import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadAndValidateFragment,
  normalizeCase,
  summarize,
  validateFragment,
  validateSuiteExitCode,
} from "../lib/results.mjs";

const runId = "current-run";
const commit = "0123456789abcdef";
const verifyStartedAt = "2026-08-06T00:00:00.000Z";

function fragment(overrides = {}) {
  const cases = overrides.cases ?? [{
    id: "PASS-001",
    status: "PASS",
    evidence: [],
  }];
  return {
    schemaVersion: "2.0.0",
    runId,
    testHarnessCommit: commit,
    startedAt: "2026-08-06T00:00:01.000Z",
    generatedAt: "2026-08-06T00:00:02.000Z",
    source: "acceptance",
    summary: summarize(cases),
    cases,
    ...overrides,
  };
}

const expectations = {
  expectedRunId: runId,
  expectedCommit: commit,
  expectedSource: "acceptance",
  verifyStartedAt,
};

test("an old fragment cannot satisfy a missing current-run fragment", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "verify-integrity-"));
  try {
    const oldPath = path.join(temporary, "verify-old-run", "acceptance.json");
    const currentPath = path.join(temporary, "verify-current-run", "acceptance.json");
    await mkdir(path.dirname(oldPath), { recursive: true });
    await writeFile(oldPath, `${JSON.stringify(fragment({ runId: "old-run" }))}\n`);
    await assert.rejects(
      loadAndValidateFragment({ file: currentPath, ...expectations }),
      (error) => error.code === "FRAGMENT_MISSING",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("runId mismatch is rejected", () => {
  assert.throws(
    () => validateFragment({ fragment: fragment({ runId: "other-run" }), ...expectations }),
    (error) => error.code === "FRAGMENT_RUN_ID_MISMATCH",
  );
});

test("testHarnessCommit mismatch is rejected", () => {
  assert.throws(
    () => validateFragment({ fragment: fragment({ testHarnessCommit: "other-commit" }), ...expectations }),
    (error) => error.code === "FRAGMENT_COMMIT_MISMATCH",
  );
});

test("a fragment generated before verify startedAt is rejected", () => {
  assert.throws(
    () => validateFragment({
      fragment: fragment({ generatedAt: "2026-08-05T23:59:59.999Z" }),
      ...expectations,
    }),
    (error) => error.code === "FRAGMENT_STALE",
  );
});

test("suite exit 0 with failures is rejected", () => {
  assert.throws(
    () => validateSuiteExitCode({ summary: { fail: 1 }, exitCode: 0 }),
    (error) => error.code === "SUITE_EXIT_MISMATCH",
  );
});

test("suite nonzero exit without failures is rejected", () => {
  assert.throws(
    () => validateSuiteExitCode({ summary: { fail: 0 }, exitCode: 1 }),
    (error) => error.code === "SUITE_EXIT_MISMATCH",
  );
});

test("FAIL without a root cause receives a harness fallback", () => {
  const normalized = normalizeCase({ id: "BROKEN-001", status: "FAIL" });
  assert.equal(normalized.rootCauseId, "HARNESS-BROKEN-001");
  assert.deepEqual(normalized.rootCauseIds, ["HARNESS-BROKEN-001"]);
  assert.equal(normalized.severity, "HARNESS");
});

test("KNOWN_LIMITATION does not require a failing suite exit", () => {
  const summary = summarize([
    { id: "PASS-001", status: "PASS" },
    { id: "SEM-001", status: "KNOWN_LIMITATION" },
  ]);
  assert.equal(summary.fail, 0);
  assert.doesNotThrow(() => validateSuiteExitCode({ summary, exitCode: 0 }));
});
