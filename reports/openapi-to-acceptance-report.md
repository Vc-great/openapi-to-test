# openapi-to@4.0.0-rc.3 独立消费者验收报告

## 总体结论

本次共执行 99 个结构化用例，7 个测试用例失败，对应 7 个独立根因；Known Limitation 为 1 个。仍建议保持 RC，不将当前版本提升为稳定推荐。

## 报告与环境证据

- Report schema version：2.0.0
- Run ID：5b9070a2-e906-4e11-8869-a102d7d7b876
- Test harness commit：c416a088d0c6dd91d59a6531a9fccc5b91998d4f
- Baseline branch：main
- Baseline Git HEAD：c416a088d0c6dd91d59a6531a9fccc5b91998d4f
- Baseline working tree status：192 条变更
- Verify startedAt：2026-09-18T15:24:11.667Z
- Results generatedAt：2026-09-18T15:26:28.768Z
- Report generatedAt：2026-09-18T15:27:39.249Z
- Current report-time Git HEAD：c416a088d0c6dd91d59a6531a9fccc5b91998d4f
- Current report-time working tree status：192 条变更
- Tested package：openapi-to@4.0.0-rc.3
- Tested package integrity：未能证明一致
- Node：v24.20.0
- pnpm：10.33.0
- npm Registry：https://registry.npmjs.org
- dist-tags：NO_EVIDENCE
- Evidence completeness：INCOMPLETE（missing=0）

## 测试统计

| Total | PASS | FAIL | KNOWN_LIMITATION | BLOCKED | SKIPPED | 独立缺陷 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 99 | 90 | 7 | 1 | 1 | 0 | 7 |

## TypeScript matrix

严格选项统一为 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`forceConsistentCasingInFileNames`、`skipLibCheck=false`、`noEmit`。本次没有静默删除版本选项。

实际 SWR 版本：2.5.0（未升级或降级）。

| Plugin / fixture | TS legacy | TS baseline | TS current |
| --- | --- | --- | --- |
| pluginTSType | PASS | PASS | PASS |
| pluginTSRequest | PASS | PASS | PASS |
| pluginZod | PASS | PASS | PASS |
| pluginSWR | PASS | PASS | PASS |
| pluginVueQuery | PASS | PASS | PASS |
| pluginMSW | PASS | PASS | PASS |
| OpenAPI 3.1 fixture | PASS | PASS | PASS |
| pluginTSRequest boundary | PASS | PASS | PASS |

实际 compiler 版本与命令详见 `reports/results.json` 中的 `TS-VERSION-*` 和每个 `TSC-*` 条目。

## 能力矩阵（由测试 ID 聚合）

| 能力 | 聚合状态 | 证据用例 |
| --- | --- | --- |
| npm package / bin / ESM / CJS / declarations | FAIL | PUB-001, CLI-003, CLI-004, CLI-005, PUB-002, PUB-003 |
| CLI validation / inspect / diff | PASS | INSPECT-001, VAL-001, VAL-002, VAL-003, VAL-003B, VAL-003C, VAL-004, VAL-005, VAL-006, VAL-007, DIFF-001 |
| six plugin generation | PASS | GEN-001, GEN-002, GEN-003, GEN-004, GEN-005, GEN-006, GEN-007 |
| TypeScript compatibility matrix | PASS | GEN-ISO-SWR, GEN-ISO-MSW, GEN-ISO-TS-REQUEST, TS-VERSION-TS56, TS-VERSION-TS6, TS-VERSION-TS7, TSC-TS-TYPE-TS56, TSC-TS-REQUEST-TS56, TSC-ZOD-TS56, TSC-SWR-TS56, TSC-VUE-QUERY-TS56, TSC-MSW-TS56, TSC-OAS31-TS56, TSC-TS-TYPE-TS6, TSC-TS-REQUEST-TS6, TSC-ZOD-TS6, TSC-SWR-TS6, TSC-VUE-QUERY-TS6, TSC-MSW-TS6, TSC-OAS31-TS6, TSC-TS-TYPE-TS7, TSC-TS-REQUEST-TS7, TSC-ZOD-TS7, TSC-SWR-TS7, TSC-VUE-QUERY-TS7, TSC-MSW-TS7, TSC-OAS31-TS7, TSC-SWR-MIN-TS56, TSC-MSW-MIN-TS56, TSC-TS-REQUEST-BOUNDARY-TS56, TSC-SWR-MIN-TS6, TSC-MSW-MIN-TS6, TSC-TS-REQUEST-BOUNDARY-TS6, TSC-SWR-MIN-TS7, TSC-MSW-MIN-TS7, TSC-TS-REQUEST-BOUNDARY-TS7 |
| lifecycle | PASS | LIFE-001, LIFE-003, LIFE-002, LIFE-004, LIFE-005, LIFE-006, LIFE-007, LIFE-008, LIFE-009 |
| MCP | PASS | MCP-SUITE |
| Skills | FAIL | SKILL-001, SKILL-002, SKILL-003, SKILL-004 |
| security boundaries | BLOCKED | SEC-CLI-001, SEC-CLI-002, SEC-CLI-003, SEC-CLI-004, SEC-CLI-005, SEC-CLI-006, SEC-REMOTE |
| cross-platform harness implementation | PASS | HARNESS-001 |

## Independent root causes

失败用例数与独立缺陷数分开统计；共享根因只出现一次。

| rootCauseId | Severity | 影响用例 |
| --- | --- | --- |
| BUG-INIT-PLUGIN-ARTIFACT-CONFLICT | P1 | INIT-004 |
| HARNESS-CFG-003 | HARNESS | CFG-003 |
| HARNESS-PUB-003 | HARNESS | PUB-003 |
| HARNESS-SKILL-001 | HARNESS | SKILL-001 |
| HARNESS-SKILL-002 | HARNESS | SKILL-002 |
| HARNESS-SKILL-003 | HARNESS | SKILL-003 |
| HARNESS-HARNESS-REPORT-GENERATION | HARNESS | HARNESS-REPORT-GENERATION |

## Known limitations

| ID | 边界 | 证据 |
| --- | --- | --- |
| SEM-001 | TS Request header/cookie configuration boundary | reports/evidence/generated-minimal/request-config-boundary.types.ts<br>reports/evidence/generated-minimal/request-config-boundary.service.ts<br>reports/evidence/generated-minimal/request-config-boundary.consumer.ts<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS56.json<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS6.json<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS7.json |

## 跨平台执行能力

执行器已改为 executable/args、shell=false，并实现 PATH/PATHEXT 解析、stdout/stderr 分离与超时终止；本次仅在当前 OS 实跑，Windows 仍需真实主机复核。

## 已自动化与仍需人工复核

已自动化：Registry 依赖解析、三版本 compiler 实际版本、插件完整/最小 fixture 严格编译、Known Limitation 代码边界、九项 lifecycle、root cause 去重及证据路径完整性。

仍需人工复核：真实 Windows runner 执行、Codex 重启后的 Skill 发现与执行、未覆盖的 OpenAPI/JSON Schema 组合，以及未建立本地 CA fixture 的 HTTPS→HTTP 降级重定向。

## 用例明细

| ID | 功能 | 状态 | 退出码 | 证据 |
| --- | --- | --- | ---: | --- |
| PUB-001 | Actual installed version | PASS | 0 | reports/evidence/commands/PUB-001.json |
| CLI-001 | openapi help | PASS | 0 | reports/evidence/commands/CLI-001.json |
| CLI-002 | openapi-to alias entry | PASS | 0 | reports/evidence/commands/CLI-002.json |
| CLI-003 | ESM import | PASS | 0 | reports/evidence/commands/CLI-003.json |
| CLI-004 | CommonJS require | PASS | 0 | reports/evidence/commands/CLI-004.json |
| CLI-005 | Published type declarations | PASS | 0 | reports/evidence/commands/CLI-005.json |
| INIT-003 | fresh init JSON stdout contract | PASS | 0 | reports/evidence/commands/INIT-003.json |
| INIT-002 | CommonJS init extension | PASS | 0 | reports/evidence/commands/INIT-002.json |
| INIT-003B | repeat init JSON error contract | PASS | 1 | reports/evidence/commands/INIT-003B.json |
| INIT-004 | Default init template can generate | FAIL | 1 | reports/evidence/commands/INIT-004.json<br>reports/evidence/failures/INIT-004.stdout.txt<br>reports/evidence/failures/INIT-004.stderr.txt |
| CFG-002 | Ambiguous config fail-before-execute | PASS | 2 | reports/evidence/commands/CFG-002.json |
| CFG-003 | Nested config discovery | FAIL | 2 | reports/evidence/commands/CFG-003.json<br>reports/evidence/failures/CFG-003.stdout.txt<br>reports/evidence/failures/CFG-003.stderr.txt |
| INSPECT-001 | Inspect byte stability | PASS | 0 | reports/evidence/commands/INSPECT-001.json |
| VAL-001 | Swagger 2 validation | PASS | 0 | reports/evidence/commands/VAL-001.json |
| VAL-002 | OpenAPI 3.0 validation | PASS | 0 | reports/evidence/commands/VAL-002.json |
| VAL-003 | OpenAPI 3.1 validation | PASS | 0 | reports/evidence/commands/VAL-003.json |
| VAL-003B | YML extension | PASS | 0 | reports/evidence/commands/VAL-003B.json |
| VAL-003C | Content/extension mismatch | PASS | 0 | reports/evidence/commands/VAL-003C.json |
| VAL-004 | OpenAPI 3.2 compatible read | PASS | 0 | reports/evidence/commands/VAL-004.json |
| VAL-005 | External/cyclic refs | PASS | 0 | reports/evidence/commands/VAL-005.json |
| VAL-006 | Missing ref classification | PASS | 4 | reports/evidence/commands/VAL-006.json |
| VAL-007 | Invalid document classification | PASS | 3 | reports/evidence/commands/VAL-007.json |
| DIFF-001 | Breaking diff exit | PASS | 7 | reports/evidence/commands/DIFF-001.json |
| CFG-001 | Unknown target | PASS | 2 | reports/evidence/commands/CFG-001.json |
| SEC-CLI-001 | Private remote denied | PASS | 4 | reports/evidence/commands/SEC-CLI-001.json |
| SEC-CLI-002 | Non-HTTP protocol denied | PASS | 4 | reports/evidence/commands/SEC-CLI-002.json |
| SEC-CLI-003 | Output escape denied | PASS | 2 | reports/evidence/commands/SEC-CLI-003.json |
| SEC-CLI-004 | Overlapping output denied | PASS | 2 | reports/evidence/commands/SEC-CLI-004.json |
| SEC-CLI-005 | Symlink output denied | PASS | 2 | reports/evidence/commands/SEC-CLI-005.json |
| SEC-CLI-006 | Windows device path denied | PASS | 2 | reports/evidence/commands/SEC-CLI-006.json |
| GEN-001 | TS Type generation | PASS | 0 | reports/evidence/commands/GEN-001.json |
| GEN-002 | TS Request generation | PASS | 0 | reports/evidence/commands/GEN-002.json |
| GEN-003 | Zod generation | PASS | 0 | reports/evidence/commands/GEN-003.json |
| GEN-004 | SWR generation | PASS | 0 | reports/evidence/commands/GEN-004.json |
| GEN-005 | Vue Query generation | PASS | 0 | reports/evidence/commands/GEN-005.json |
| GEN-006 | MSW generation | PASS | 0 | reports/evidence/commands/GEN-006.json |
| GEN-007 | OpenAPI 3.1 booleans/ref sibling | PASS | 0 | reports/evidence/commands/GEN-007.json |
| ZOD-001 | Zod positive/negative runtime | PASS | 0 | reports/evidence/commands/ZOD-001.json |
| MULTI-001 | Default all targets | PASS | 0 | reports/evidence/commands/MULTI-001.json |
| MULTI-002 | Repeated target dedupe/order | PASS | 0 | reports/evidence/commands/MULTI-002.json |
| MCP-SUITE | Official SDK stdio suite | PASS | 0 | reports/evidence/commands/MCP-SUITE.json |
| SEC-REMOTE | Cross-origin header stripping | BLOCKED | 77 | reports/evidence/commands/SEC-REMOTE.json<br>reports/evidence/failures/SEC-REMOTE.stdout.txt<br>reports/evidence/failures/SEC-REMOTE.stderr.txt |
| PUB-002 | Three package bins | PASS | 0 | package.json<br>pnpm-lock.yaml |
| PUB-003 | Lockfile registry-only resolution | FAIL | 0 | pnpm-lock.yaml |
| INIT-001 | ESM init extension | PASS | 0 | reports/evidence/commands/INIT-003.json |
| REG-001 | Optional inline object enum identifier | PASS | 0 | reports/evidence/generated-minimal/inline-enum-user.model.ts |
| REG-002 | Optional non-required ref | PASS | 0 | reports/evidence/generated-minimal/inline-enum-user.model.ts |
| SEM-001 | TS Request header/cookie configuration boundary | KNOWN_LIMITATION | 0 | reports/evidence/generated-minimal/request-config-boundary.types.ts<br>reports/evidence/generated-minimal/request-config-boundary.service.ts<br>reports/evidence/generated-minimal/request-config-boundary.consumer.ts<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS56.json<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS6.json<br>reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS7.json |
| HARNESS-001 | Cross-platform structured process runner | PASS | 0 | scripts/lib/process.mjs |
| SKILL-001 | Skills dry-run | FAIL | 1 | reports/evidence/commands/SKILL-001.json<br>reports/evidence/failures/SKILL-001.stdout.txt<br>reports/evidence/failures/SKILL-001.stderr.txt |
| SKILL-002 | Skills install | FAIL | 1 | reports/evidence/commands/SKILL-002.json<br>reports/evidence/failures/SKILL-002.stdout.txt<br>reports/evidence/failures/SKILL-002.stderr.txt |
| SKILL-003 | No overwrite | FAIL | 1 | reports/evidence/commands/SKILL-003.json<br>reports/evidence/failures/SKILL-003.stdout.txt<br>reports/evidence/failures/SKILL-003.stderr.txt |
| SKILL-004 | Unsupported host | PASS | 1 | reports/evidence/commands/SKILL-004.json |
| GEN-ISO-SWR | Generate minimal SWR isolation fixture | PASS | 0 | reports/evidence/commands/GEN-ISO-SWR.json |
| GEN-ISO-MSW | Generate minimal MSW schema-less isolation fixture | PASS | 0 | reports/evidence/commands/GEN-ISO-MSW.json |
| GEN-ISO-TS-REQUEST | Generate TS Request header/cookie boundary fixture | PASS | 0 | reports/evidence/commands/GEN-ISO-TS-REQUEST.json |
| TS-VERSION-TS56 | TypeScript legacy actual version | PASS | 0 | reports/evidence/commands/TS-VERSION-TS56.json |
| TS-VERSION-TS6 | TypeScript baseline actual version | PASS | 0 | reports/evidence/commands/TS-VERSION-TS6.json |
| TS-VERSION-TS7 | TypeScript current actual version | PASS | 0 | reports/evidence/commands/TS-VERSION-TS7.json |
| TSC-TS-TYPE-TS56 | pluginTSType full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-TYPE-TS56.json |
| TSC-TS-REQUEST-TS56 | pluginTSRequest full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-TS56.json |
| TSC-ZOD-TS56 | pluginZod full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-ZOD-TS56.json |
| TSC-SWR-TS56 | pluginSWR full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-TS56.json |
| TSC-VUE-QUERY-TS56 | pluginVueQuery full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-VUE-QUERY-TS56.json |
| TSC-MSW-TS56 | pluginMSW full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-TS56.json |
| TSC-OAS31-TS56 | OpenAPI 3.1 fixture full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-OAS31-TS56.json |
| TSC-TS-TYPE-TS6 | pluginTSType full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-TYPE-TS6.json |
| TSC-TS-REQUEST-TS6 | pluginTSRequest full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-TS6.json |
| TSC-ZOD-TS6 | pluginZod full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-ZOD-TS6.json |
| TSC-SWR-TS6 | pluginSWR full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-TS6.json |
| TSC-VUE-QUERY-TS6 | pluginVueQuery full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-VUE-QUERY-TS6.json |
| TSC-MSW-TS6 | pluginMSW full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-TS6.json |
| TSC-OAS31-TS6 | OpenAPI 3.1 fixture full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-OAS31-TS6.json |
| TSC-TS-TYPE-TS7 | pluginTSType full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-TYPE-TS7.json |
| TSC-TS-REQUEST-TS7 | pluginTSRequest full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-TS7.json |
| TSC-ZOD-TS7 | pluginZod full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-ZOD-TS7.json |
| TSC-SWR-TS7 | pluginSWR full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-TS7.json |
| TSC-VUE-QUERY-TS7 | pluginVueQuery full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-VUE-QUERY-TS7.json |
| TSC-MSW-TS7 | pluginMSW full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-TS7.json |
| TSC-OAS31-TS7 | OpenAPI 3.1 fixture full fixture strict compilation | PASS | 0 | reports/evidence/commands/TSC-OAS31-TS7.json |
| TSC-SWR-MIN-TS56 | pluginSWR minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-MIN-TS56.json |
| TSC-MSW-MIN-TS56 | pluginMSW minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-MIN-TS56.json |
| TSC-TS-REQUEST-BOUNDARY-TS56 | pluginTSRequest requestConfig boundary strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS56.json |
| TSC-SWR-MIN-TS6 | pluginSWR minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-MIN-TS6.json |
| TSC-MSW-MIN-TS6 | pluginMSW minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-MIN-TS6.json |
| TSC-TS-REQUEST-BOUNDARY-TS6 | pluginTSRequest requestConfig boundary strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS6.json |
| TSC-SWR-MIN-TS7 | pluginSWR minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-SWR-MIN-TS7.json |
| TSC-MSW-MIN-TS7 | pluginMSW minimal isolation strict compilation | PASS | 0 | reports/evidence/commands/TSC-MSW-MIN-TS7.json |
| TSC-TS-REQUEST-BOUNDARY-TS7 | pluginTSRequest requestConfig boundary strict compilation | PASS | 0 | reports/evidence/commands/TSC-TS-REQUEST-BOUNDARY-TS7.json |
| LIFE-001 | dry-run does not write formal output | PASS | 0 | reports/evidence/commands/LIFE-001.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-003 | managed output and ownership manifest are correct | PASS | 0 | reports/evidence/commands/LIFE-003.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-002 | check succeeds for current output | PASS | 0 | reports/evidence/commands/LIFE-002.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-004 | second generation is byte-stable | PASS | 0 | reports/evidence/commands/LIFE-004.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-005 | artificial drift makes check return exit 6 | PASS | 6 | reports/evidence/commands/LIFE-005.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-006 | check does not automatically repair drift | PASS | 6 | reports/evidence/commands/LIFE-006.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-007 | clean removes stale managed files | PASS | 0 | reports/evidence/commands/LIFE-007.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-008 | clean preserves handwritten files | PASS | 0 | reports/evidence/commands/LIFE-008.json<br>reports/evidence/hashes/lifecycle.json |
| LIFE-009 | ownership manifest is byte-stable | PASS | 0 | reports/evidence/commands/LIFE-009.json<br>reports/evidence/hashes/lifecycle.json |
| HARNESS-REPORT-GENERATION | result-driven report generation | FAIL | 1 | reports/evidence/commands/HARNESS-REPORT-GENERATION.json |
