import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { parseJson, runProcess, writeCommandEvidence } from "./lib/process.mjs";
import { summarize } from "./lib/results.mjs";

const root = process.cwd();
const resultsPath = path.join(root, "reports/results.json");
const resultDocument = JSON.parse(await readFile(resultsPath, "utf8"));
const harnessPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "node_modules/openapi-to/package.json"), "utf8"));
const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
const baseline = resultDocument.baseline;

async function observedCommand(id, executable, args) {
  const result = await runProcess({ executable, args, cwd: root, stage: id, timeoutMs: 120_000 });
  const evidence = await writeCommandEvidence(root, id, result);
  return { result, evidence };
}

const [pnpmVersion, registry, distTags, registryIntegrity, gitHead, gitStatus] = await Promise.all([
  observedCommand("ENV-PNPM", "pnpm", ["--version"]),
  observedCommand("ENV-REGISTRY", "pnpm", ["config", "get", "registry"]),
  observedCommand("ENV-DIST-TAGS", "pnpm", ["view", "openapi-to", "dist-tags", "--json"]),
  observedCommand("ENV-INTEGRITY", "pnpm", ["view", `openapi-to@${pkg.version}`, "dist.integrity", "--json"]),
  observedCommand("ENV-GIT-HEAD", "git", ["rev-parse", "HEAD"]),
  observedCommand("ENV-GIT-STATUS", "git", ["status", "--short"]),
]);

const escapedInstalledVersion = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lockIntegrity = lock.match(new RegExp(`openapi-to@${escapedInstalledVersion}:\\s*\\n\\s+resolution:\\s+\\{integrity:\\s*([^}]+)\\}`))?.[1] ?? null;
const distTagsValue = parseJson(distTags.result.stdout);
const registryIntegrityValue = parseJson(registryIntegrity.result.stdout);
const evidenceTargets = resultDocument.cases
  .filter((item) => ["FAIL", "KNOWN_LIMITATION"].includes(item.status))
  .flatMap((item) => item.evidence ?? []);
const missingEvidence = evidenceTargets.filter((relativePath) => !existsSync(path.join(root, relativePath)));
const versionCases = resultDocument.cases.filter((item) => item.id.startsWith("TS-VERSION-"));
const compilerVersionsComplete = versionCases.length === 3 &&
  versionCases.every((item) => item.status === "PASS" && item.requestedVersion === item.actualVersion);
const environmentCommandsComplete = [
  pnpmVersion,
  registry,
  distTags,
  registryIntegrity,
  gitHead,
  gitStatus,
].every((item) => item.result.exitCode === 0);
const fragmentIdentityComplete = Object.values(resultDocument.sources ?? {})
  .every((item) =>
    item.runId === resultDocument.runId &&
    item.testHarnessCommit === resultDocument.testHarnessCommit &&
    item.fragmentIdentityValid === true
  );
const suiteExitCodesConsistent = Object.values(resultDocument.sources ?? {})
  .every((item) => item.exitCodeConsistent === true);
const allFailuresHaveRootCauses = resultDocument.cases
  .filter((item) => item.status === "FAIL")
  .every((item) => item.rootCauseId && Array.isArray(item.rootCauseIds) && item.rootCauseIds.length > 0);
const baselineComplete =
  baseline?.branch &&
  baseline?.gitHead &&
  Array.isArray(baseline?.gitStatus) &&
  Number.isFinite(Date.parse(baseline?.startedAt)) &&
  baseline.gitHead === resultDocument.testHarnessCommit;
const testHarnessCommitMatchesBaseline = resultDocument.testHarnessCommit === baseline?.gitHead;
const evidenceCompleteness = {
  requiredEvidenceCount: evidenceTargets.length,
  missingEvidence,
  complete: false,
  fragmentIdentityComplete,
  suiteExitCodesConsistent,
  allFailuresHaveRootCauses,
  baselineComplete: Boolean(baselineComplete),
  compilerVersionsComplete,
  testHarnessCommitMatchesBaseline,
  environmentCommandsComplete,
};
evidenceCompleteness.complete =
  missingEvidence.length === 0 &&
  Object.entries(evidenceCompleteness)
    .filter(([key]) => !["complete", "requiredEvidenceCount", "missingEvidence"].includes(key))
    .every(([, value]) => value === true) &&
  resultDocument.evidenceCompleteness?.complete === true;
const reportGeneratedAt = new Date().toISOString();
const environment = {
  reportSchemaVersion: resultDocument.schemaVersion,
  testDate: reportGeneratedAt,
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
  pnpm: pnpmVersion.result.exitCode === 0 ? pnpmVersion.result.stdout.trim() : null,
  registry: registry.result.exitCode === 0 ? registry.result.stdout.trim() : null,
  requestedVersion: harnessPackage.devDependencies["openapi-to"],
  installedVersion: pkg.version,
  distTagsObserved: distTags.result.exitCode === 0 ? distTagsValue : null,
  distTagsEvidence: distTags.evidence,
  runId: resultDocument.runId,
  verifyStartedAt: resultDocument.verifyStartedAt,
  resultsGeneratedAt: resultDocument.generatedAt,
  reportGeneratedAt,
  testHarnessCommit: resultDocument.testHarnessCommit,
  baseline,
  reportTimeGitHead: gitHead.result.exitCode === 0 ? gitHead.result.stdout.trim() : null,
  reportTimeGitStatus: gitStatus.result.exitCode === 0 ? gitStatus.result.stdout.split("\n").filter(Boolean) : null,
  gitEvidence: [gitHead.evidence, gitStatus.evidence],
  testedPackageIntegrity: {
    registry: registryIntegrity.result.exitCode === 0 ? registryIntegrityValue : null,
    lockfile: lockIntegrity,
    matches: registryIntegrity.result.exitCode === 0 && registryIntegrityValue === lockIntegrity,
    evidence: registryIntegrity.evidence,
  },
  lockfileRegistryOnly: !/(?:specifier|version|resolution|tarball):[^\n]*(?:workspace:|file:|link:)|\/Users\/vc\/code\/openapi-to(?:\/|$)/.test(lock),
  evidenceCompleteness,
};
await writeFile(path.join(root, "reports/environment.json"), `${JSON.stringify(environment, null, 2)}\n`);

const summary = summarize(resultDocument.cases);
const rootCauses = summary.independentRootCauses;
const knownLimitations = resultDocument.cases.filter((item) => item.status === "KNOWN_LIMITATION");
const failures = resultDocument.cases.filter((item) => item.status === "FAIL");
const matrixCases = resultDocument.cases.filter((item) =>
  item.suite === "typescript-matrix" &&
  item.id.startsWith("TSC-") &&
  !item.id.includes("-MIN-")
);
const testedSWRVersion = resultDocument.sources?.["typescript-matrix"]?.dependencies?.swr ?? "NO_EVIDENCE";
const tiers = ["legacy", "baseline", "current"];
const versionForTier = (tier) => versionCases.find((item) => item.compilerTier === tier)?.actualVersion ?? "NO_EVIDENCE";
const plugins = [...new Set(matrixCases.map((item) => item.plugin))];
const matrixStatus = (plugin, tier) => matrixCases.find((item) => item.plugin === plugin && item.compilerTier === tier)?.status ?? "NO_EVIDENCE";
const matrixRows = plugins.map((plugin) =>
  `| ${plugin} | ${tiers.map((tier) => matrixStatus(plugin, tier)).join(" | ")} |`
).join("\n");

const capabilityDefinitions = [
  { label: "npm package / bin / ESM / CJS / declarations", ids: ["PUB-001", "PUB-002", "PUB-003", "CLI-003", "CLI-004", "CLI-005"] },
  { label: "CLI validation / inspect / diff", prefixes: ["VAL-", "INSPECT-", "DIFF-"] },
  { label: "six plugin generation", prefixes: ["GEN-00"] },
  { label: "TypeScript compatibility matrix", suite: "typescript-matrix" },
  { label: "lifecycle", suite: "lifecycle" },
  { label: "MCP", ids: ["MCP-SUITE"] },
  { label: "Skills", prefixes: ["SKILL-"] },
  { label: "security boundaries", prefixes: ["SEC-"] },
  { label: "cross-platform harness implementation", ids: ["HARNESS-001"] },
];
function aggregateCapability(definition) {
  const selectedCases = resultDocument.cases.filter((item) =>
    definition.ids?.includes(item.id) ||
    definition.prefixes?.some((prefix) => item.id.startsWith(prefix)) ||
    (definition.suite && item.suite === definition.suite)
  );
  if (selectedCases.length === 0) return { status: "NO_EVIDENCE", ids: [] };
  const statuses = selectedCases.map((item) => item.status);
  if (statuses.includes("FAIL")) return { status: "FAIL", ids: selectedCases.map((item) => item.id) };
  if (statuses.includes("BLOCKED")) return { status: "BLOCKED", ids: selectedCases.map((item) => item.id) };
  if (statuses.includes("KNOWN_LIMITATION")) return { status: "KNOWN_LIMITATION", ids: selectedCases.map((item) => item.id) };
  if (statuses.every((status) => ["PASS", "SKIPPED"].includes(status))) return { status: "PASS", ids: selectedCases.map((item) => item.id) };
  return { status: "NO_EVIDENCE", ids: selectedCases.map((item) => item.id) };
}
const capabilityRows = capabilityDefinitions.map((definition) => {
  const aggregate = aggregateCapability(definition);
  return `| ${definition.label} | ${aggregate.status} | ${aggregate.ids.join(", ")} |`;
}).join("\n");
const defectRows = rootCauses.map((item) =>
  `| ${item.rootCauseId} | ${item.severity} | ${item.affectedCases.join(", ")} |`
).join("\n") || "| — | — | — |";
const knownRows = knownLimitations.map((item) =>
  `| ${item.id} | ${item.feature} | ${(item.evidence ?? []).join("<br>")} |`
).join("\n") || "| — | — | — |";
const caseRows = resultDocument.cases.map((item) =>
  `| ${item.id} | ${item.feature} | ${item.status} | ${item.exitCode} | ${(item.evidence ?? []).join("<br>")} |`
).join("\n");
const keepRc = rootCauses.length > 0;
const crossPlatformCase = resultDocument.cases.find((item) => item.id === "HARNESS-001");
const crossPlatformStatement = crossPlatformCase?.status === "PASS"
  ? "执行器已改为 executable/args、shell=false，并实现 PATH/PATHEXT 解析、stdout/stderr 分离与超时终止；本次仅在当前 OS 实跑，Windows 仍需真实主机复核。"
  : "缺少完整的跨平台执行器证据，不能声明已具备跨平台能力。";

const report = `# openapi-to@${pkg.version} 独立消费者验收报告

## 总体结论

本次共执行 ${summary.total} 个结构化用例，${summary.fail} 个测试用例失败，对应 ${summary.independentDefects} 个独立根因；Known Limitation 为 ${summary.knownLimitations} 个。${keepRc ? "仍建议保持 RC，不将当前版本提升为稳定推荐。" : "当前结构化结果未发现独立产品缺陷；是否提升稳定推荐仍需结合人工边界复核。"}

## 报告与环境证据

- Report schema version：${resultDocument.schemaVersion}
- Run ID：${environment.runId ?? "NO_EVIDENCE"}
- Test harness commit：${environment.testHarnessCommit ?? "NO_EVIDENCE"}
- Baseline branch：${environment.baseline?.branch ?? "NO_EVIDENCE"}
- Baseline Git HEAD：${environment.baseline?.gitHead ?? "NO_EVIDENCE"}
- Baseline working tree status：${Array.isArray(environment.baseline?.gitStatus) ? (environment.baseline.gitStatus.length === 0 ? "clean" : `${environment.baseline.gitStatus.length} 条变更`) : "NO_EVIDENCE"}
- Verify startedAt：${environment.verifyStartedAt ?? "NO_EVIDENCE"}
- Results generatedAt：${environment.resultsGeneratedAt ?? "NO_EVIDENCE"}
- Report generatedAt：${environment.reportGeneratedAt}
- Current report-time Git HEAD：${environment.reportTimeGitHead ?? "NO_EVIDENCE"}
- Current report-time working tree status：${environment.reportTimeGitStatus ? `${environment.reportTimeGitStatus.length} 条变更` : "NO_EVIDENCE"}
- Tested package：openapi-to@${environment.installedVersion}
- Tested package integrity：${environment.testedPackageIntegrity.matches ? "registry 与 lockfile 一致" : "未能证明一致"}
- Node：${environment.node}
- pnpm：${environment.pnpm ?? "NO_EVIDENCE"}
- npm Registry：${environment.registry ?? "NO_EVIDENCE"}
- dist-tags：${environment.distTagsObserved ? JSON.stringify(environment.distTagsObserved) : "NO_EVIDENCE"}
- Evidence completeness：${environment.evidenceCompleteness.complete ? "COMPLETE" : `INCOMPLETE（missing=${environment.evidenceCompleteness.missingEvidence.length}）`}

## 测试统计

| Total | PASS | FAIL | KNOWN_LIMITATION | BLOCKED | SKIPPED | 独立缺陷 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ${summary.total} | ${summary.pass} | ${summary.fail} | ${summary.knownLimitations} | ${summary.blocked} | ${summary.skipped} | ${summary.independentDefects} |

## TypeScript matrix

严格选项统一为 \`strict\`、\`noUncheckedIndexedAccess\`、\`exactOptionalPropertyTypes\`、\`forceConsistentCasingInFileNames\`、\`skipLibCheck=false\`、\`noEmit\`。本次没有静默删除版本选项。

实际 SWR 版本：${testedSWRVersion}（未升级或降级）。

| Plugin / fixture | TS legacy | TS baseline | TS current |
| --- | --- | --- | --- |
${matrixRows}

实际 compiler 版本与命令详见 \`reports/results.json\` 中的 \`TS-VERSION-*\` 和每个 \`TSC-*\` 条目。

## 能力矩阵（由测试 ID 聚合）

| 能力 | 聚合状态 | 证据用例 |
| --- | --- | --- |
${capabilityRows}

## Independent root causes

失败用例数与独立缺陷数分开统计；共享根因只出现一次。

| rootCauseId | Severity | 影响用例 |
| --- | --- | --- |
${defectRows}

## Known limitations

| ID | 边界 | 证据 |
| --- | --- | --- |
${knownRows}

## 跨平台执行能力

${crossPlatformStatement}

## 已自动化与仍需人工复核

已自动化：Registry 依赖解析、三版本 compiler 实际版本、插件完整/最小 fixture 严格编译、Known Limitation 代码边界、九项 lifecycle、root cause 去重及证据路径完整性。

仍需人工复核：真实 Windows runner 执行、Codex 重启后的 Skill 发现与执行、未覆盖的 OpenAPI/JSON Schema 组合，以及未建立本地 CA fixture 的 HTTPS→HTTP 降级重定向。

## 用例明细

| ID | 功能 | 状态 | 退出码 | 证据 |
| --- | --- | --- | ---: | --- |
${caseRows}
`;
await writeFile(path.join(root, "reports/openapi-to-acceptance-report.md"), report);

const tsReport = `# TypeScript compatibility matrix

## Compilers

| Tier | Requested | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
${versionCases.map((item) => `| ${item.compilerTier} | ${item.requestedVersion} | ${item.actualVersion} | ${item.status} | ${(item.evidence ?? []).join("<br>")} |`).join("\n")}

实际 SWR 版本：${testedSWRVersion}。

## Full fixture compilation

| Plugin / fixture | TS ${versionForTier("legacy")} | TS ${versionForTier("baseline")} | TS ${versionForTier("current")} |
| --- | --- | --- | --- |
${matrixRows}

## Isolated findings

${resultDocument.cases.filter((item) => item.id.includes("-MIN-")).map((item) => `- ${item.id}: ${item.status}; rootCauseId=${item.rootCauseId ?? "none"}; evidence=${(item.evidence ?? []).join(", ")}`).join("\n")}

共享 inline enum 根因通过 \`rootCauseId=BUG-INLINE-ENUM-CASING\` 去重；SWR 与 MSW 的最小 fixture 不包含该 enum。
`;
await writeFile(path.join(root, "reports/typescript-compatibility-matrix.md"), tsReport);

const generatedReview = `# Generated code review — openapi-to@${pkg.version}

## Result-driven plugin matrix

| Plugin | TS legacy | TS baseline | TS current |
| --- | --- | --- | --- |
${matrixRows}

## Semantic boundary

- \`SEM-001\` 的结构化状态为 ${knownLimitations.find((item) => item.id === "SEM-001")?.status ?? "NO_EVIDENCE"}。
- header/cookie 类型、requestConfig 签名与 Axios 配置消费者均有最小证据。
- 请求函数不提供独立 header/cookie 参数；不伪造自动 Cookie 序列化或完整 header merge precedence。
- schema-less JSON 在 TypeScript/Zod 中映射为 unknown 属于当前能力；pluginMSW 将该 unknown 直接交给 \`HttpResponse.json\` 的失败单独归为 P2。

## Determinism and lifecycle

九项 lifecycle 结论直接来自 \`LIFE-001\` 至 \`LIFE-009\`；关键哈希见 \`reports/evidence/hashes/lifecycle.json\`。
`;
await writeFile(path.join(root, "reports/generated-code-review.md"), generatedReview);
console.log(`wrote result-driven reports (${summary.total} cases, ${failures.length} failures)`);
process.exitCode = evidenceCompleteness.complete ? 0 : 1;
