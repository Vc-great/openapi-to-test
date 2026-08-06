import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const STATUSES = ["PASS", "FAIL", "KNOWN_LIMITATION", "BLOCKED", "SKIPPED"];

export function summarize(cases) {
  const counts = Object.fromEntries(STATUSES.map((status) => [
    status,
    cases.filter((item) => item.status === status).length,
  ]));
  const rootCauses = new Map();
  for (const item of cases) {
    if (item.status !== "FAIL") continue;
    const ids = item.rootCauseIds ?? (item.rootCauseId ? [item.rootCauseId] : []);
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
  return {
    schemaVersion: "2.0.0",
    generatedAt: new Date().toISOString(),
    ...metadata,
    summary: summarize(cases),
    cases,
  };
}

export async function writeResultDocument(root, output, cases, metadata = {}) {
  const target = path.resolve(root, output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(createDocument(cases, metadata), null, 2)}\n`);
  return target;
}
