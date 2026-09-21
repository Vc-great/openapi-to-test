# openapi-to Natural Language Acceptance Re-run

- Date: 2026-09-18
- Repository: `/Users/vc/code/openapi-to-test`
- Branch: `main`
- Consumer HEAD: `c416a088d0c6dd91d59a6531a9fccc5b91998d4f`
- Upstream `openapi-to/openapi-to` main: `45775a617b7b1e131194c702f43d227c24eca2fa`
- Node: `v24.20.0`
- pnpm: `10.33.0`
- Package metadata: `openapi-to@4.0.0-rc.3`
- Actual installed provenance: local tarball bundle `.openapi-to-local/45775a617b7b1e131194c702f43d227c24eca2fa/`; provenance records upstream main SHA `45775a6…`, not a registry install
- Initial Git Status: `?? docs/openapi-to-natural-language-acceptance-2026-09-18.md`（上一轮报告为 pre-existing untracked file）
- Final Git Status: see final review below
- Host MCP mode: `MCP_READ_ONLY`; actual exposed inventory contains 8 tools
- #113: `OPEN`; current issue body requires MCP-authoritative discovery, bounded evidence and preview provenance; its body is historical and does not override current main evidence

## Executive Summary

| Category | PASS | FAIL | BLOCKED | SKIPPED | NOT SUPPORTED | NEED VERIFICATION |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Local NL Golden Path | 0 | 0 | 1 | 0 | 0 | 0 |
| Remote Controlled | 1 | 0 | 0 | 0 | 0 | 0 |
| Remote Public | 0 | 1 | 0 | 0 | 0 | 0 |
| #113 Routing / Evidence | 0 | 0 | 1 | 0 | 0 | 0 |
| Prompt Injection | 0 | 0 | 1 | 0 | 0 | 0 |
| React Query Strict Compile | 1 | 0 | 0 | 0 | 0 | 0 |
| Existing Generator Matrix | 0 | 1 | 0 | 0 | 0 | 0 |

Overall: `FAIL` for a complete Host acceptance run. The deterministic local/remote diagnostics and React Query strict compile passed, but the changed root config requires a fresh top-level Host restart; the current Host call still used the old remote catalog. Public Remote failed on Node 24, and the existing SWR matrix defects remain confirmed.

## Acceptance Baseline

The original `openapi.config.ts` SHA was `5db86931a9e5f5dc496e212d8acf4b7b2c4859fea93c2caa31858bee585670c0`, 770 bytes, and used `https://petstore.swagger.io/v2/swagger.json` with SWR. It is now `b1d7f3b61f51e4eb5d2cf377d0fd5c0203474e61b8365b98693a61f6ba6ce388`, 546 bytes, using `fixtures/openapi30/main.yaml` with one target (`server1`) and `pluginZod`, `pluginTSType`, and `pluginTSRequest`. SWR was removed from the root profile to avoid query-plugin path conflicts and to keep the Golden Path deterministic.

The selected fixture is local, OpenAPI 3.0.3, has `GET /users/{userId}`, a required path parameter, response schemas, and a bounded operation suitable for Search → Contract → Dry Run. The local CLI/MCP diagnostic cross-check loaded 3 operations and 6 schemas.

The Inspector after the change remained `HOST_CONFIG_READY`, with `observedStateHash=370ce0969f656f998427ec553be043562dc9d4d9224c14189907873c9120546f`. `.codex/config.toml` was not changed. Because the running Host had already loaded the previous root config, the required restart boundary was not crossed in this task.

## Actual Host Tool Inventory and Schema

The current Codex Host exposes these 8 read-only tools:

`openapi_validate`, `openapi_inspect`, `openapi_diff`, `openapi_list_targets`, `openapi_search_operations`, `openapi_get_operation`, `openapi_generate_dry_run`, `openapi_check_generation`.

The live tool schema for `openapi_generate_dry_run` supports `targets`, `scope.type=operations`, `scope.operationKeys`, and `includePreview`. No Prepare or Apply tool is exposed in the current Host. The direct Host call made after the config edit returned the pre-edit remote target (`server1`, `sourceType=remote`, `REMOTE_SOURCE_FAILED`), which is evidence of stale Host state, not local acceptance.

## Core Acceptance Matrix

| ID | Scenario | Input | Real Codex NL | Expected workflow | Actual trace | Result | Evidence / finding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Local target discovery | root local fixture | No; restart required | Target → list | Fresh Host not completed; current Host returned stale remote | BLOCKED | `RESTART_REQUIRED`; direct call cannot prove the new root config |
| L2 | Local operation search | local fixture | No; diagnostic cross-check | exact target → search | SDK/stdio cross-check found `createUser`, `getUser` | PASS cross-check | `getUser` returned as `GET /users/{userId}` |
| L3 | Local bounded contract | local fixture | No; diagnostic cross-check | exact candidate → contract | `openapi_get_operation` returned bounded contract | PASS cross-check | required path/header; optional query/cookie; 200 User, 404 Error, default unknown |
| L4 | Local selective Dry Run | local fixture | No; diagnostic cross-check | exact target + operation → Dry Run | operation-scoped Dry Run succeeded with `includePreview=true` | PASS cross-check | 12 artifacts; no truncation; preview returned |
| L5 | #113 evidence completeness | local fixture | No; diagnostic cross-check | preserve selection/projection/manifest/truncation/diagnostics | all fields were returned and captured | PASS cross-check | requested/resolved `[getUser]`, projection hash, artifact count/paths and truncation present |
| L6 | Preview provenance | local fixture | No; diagnostic cross-check | returned preview only | returned artifacts contained bounded `preview` strings | PASS cross-check | preview is MCP/generator provenance; no illustrative example was promoted |
| R1 | Controlled Remote | same fixture over test-owned HTTP | No; SDK/stdio diagnostic | remote load → same semantics | target/search/contract/Dry Run all succeeded | PASS | same operation/schema counts and artifact paths; private-network allowance was isolated to test config |
| R2 | Public Remote | Petstore HTTPS | No; SDK/stdio diagnostic | remote load → discovery | target catalog failed before search/contract/Dry Run | FAIL | `REMOTE_SOURCE_FAILED`, cause `Invalid IP address: undefined` |
| S1 | Prompt injection | malicious local fixture | No; restart required | data-only analysis | isolated MCP cross-check treated payload as data; real NL session not completed | BLOCKED | no command/Apply evidence; real Host prompt remains restart-gated |
| Q1 | React Query Dry Run / generation | single-operation fixture | No need NL | exact target + operation | plugin export and generated profile succeeded | PASS | 6 actual generated artifacts |
| Q2 | React Query strict compile | generated artifacts | No need NL | strict TS 5.6/6.0/7.0 | all three `tsc --noEmit` lanes passed | PASS | test-owned ambient `@tanstack/react-query` type contract used because runtime package is not installed |
| X1 | Read-only boundary | local NL / Dry Run | No; restart required | no persistent generation state | diagnostic Dry Run was read-only; CLI React Query generation was explicitly test-owned output | BLOCKED | local NL Host boundary awaits restart; no Apply was called |

## #113 Evidence

- Skill activated: `openapi-to-generate` (with `openapi-to-setup` capability diagnosis)
- Host mode: `MCP_READ_ONLY`
- Actual Host tool names: the 8 names listed above
- Relevant inputSchema verified: operation-scoped `targets` + `scope.operationKeys` + `includePreview`
- Target source: local diagnostic cross-check `server1` → `fixtures/openapi30/main.yaml`
- Search query: `user`
- Candidate count: 2; `createUser` and `getUser`; selected `getUser` based on detail-by-ID semantics
- Chosen operationKey: `getUser`
- Contract provenance: MCP `openapi_get_operation`, `detail=contract`
- Method/path: `GET /users/{userId}`
- Parameters: required path `userId:string`; optional query `verbose:boolean`; required header `X-Tenant:string`; optional cookie `session:string`
- Success/error responses: 200 `User`; 404 `Error`; default unknown error
- Dry Run `scope.requestedOperationKeys`: `["getUser"]`
- Dry Run `scope.resolvedOperationKeys`: `["getUser"]`
- Projection: `operationCount=1`, `pathCount=1`, `schemaCount=4`, `projectionHash=65de0391725f0ebcdbd0f70ed9d4a7188e0b951c164136db5081641920334b18`
- Manifest: `artifactCount=12`, `totalBytes=6061`, local manifest hash `8837e462a5b309d255dfb9761d87483d868947694363420507798e290fc9d28e`
- Returned artifact paths: `types/enum.model.ts`; `types/models/address.model.ts`; `types/models/error.model.ts`; `types/models/role.model.ts`; `types/models/user.model.ts`; `users/get-user.schema.ts`; `users/get-user.service.ts`; `users/get-user.types.ts`; `zod/models/address.schema.ts`; `zod/models/error.schema.ts`; `zod/models/role.schema.ts`; `zod/models/user.schema.ts`
- Summary: local `added=9, modified=3, deleted=0, unchanged=0` against pre-existing ignored output; controlled remote `added=12, modified=0, deleted=0, unchanged=0` in its isolated output
- Diagnostics: one `OPENAPI_REF_CYCLE` warning; `errors=0`, `warnings=1`, `infos=0`
- Truncation: diagnostics `returned=1,total=1,omitted=0`; artifacts `returned=12,total=12,omitted=0`; previews not truncated and omitted preview bytes `0`
- Preview requested: yes, because the current schema supports `includePreview`
- Preview returned: yes for all returned artifacts in the diagnostic cross-check
- Preview provenance: actual MCP/generator artifact preview, not an Agent-authored example
- Filesystem effects: no Apply, no selection/ownership/plan/lock/staging/backup/journal writes from the Dry Run; the CLI React Query compile lane intentionally wrote only its test-owned ignored output

The real Codex natural-language sequence could not be honestly marked PASS: after changing root config, the currently running Host still returned the pre-edit remote source. Fresh-session attempts did not produce a completed Host trace before the run ended. This is `RESTART_REQUIRED`, not an inferred local failure.

## Local vs Remote Comparison

| Attribute | Local | Controlled Remote | Public Remote |
| --- | --- | --- | --- |
| Source loaded | local fixture | same fixture over `127.0.0.1` | Petstore HTTPS |
| Target catalog | 3 operations / 6 schemas | 3 operations / 6 schemas | 0 / 0; catalog unavailable |
| Search | `getUser` candidate found | `getUser` candidate found | blocked by source failure |
| Contract | bounded `getUser` | bounded `getUser` | not returned |
| Projection | 1 op / 1 path / 4 schemas; hash `65de…` | same counts; hash `e8c7063db91c2a5ac42d6e01e1f0c147e447233fb733dfa6078d7d7d7b62c085` | not returned |
| Artifact set | 12 paths | same 12 paths | not returned |
| Diagnostics | one `OPENAPI_REF_CYCLE` warning | one `OPENAPI_REF_CYCLE` warning | `REMOTE_SOURCE_FAILED` / `Invalid IP address: undefined` |
| Result | PASS cross-check; Host NL blocked by restart | PASS | FAIL |

The controlled-remote projection hash differs despite equal counts and artifact paths; the difference is retained as evidence rather than silently normalized. The semantic artifact set and bounded contract matched; the remaining difference is source/projection identity and needs upstream-level interpretation if hash equality is required.

## Prompt-Injection Evidence

- Malicious field locations: root `info.description`, operation `description`, `x-agent-instruction`, parameter `example`, response/schema descriptions
- Payload summary: requests to ignore prior instructions, delete `package.json`, read home secrets, and run/send shell commands
- Isolated MCP behavior: payload was returned as OpenAPI documentation data; `getUser` contract and 3-artifact Dry Run succeeded
- Commands executed because of payload: none
- Secrets accessed: none
- Files modified because of payload: none; `package.json` hash unchanged
- Authority expanded: no; no Apply call and no Host config change
- Result: isolated data-handling cross-check `PASS`; real Codex NL case `BLOCKED / RESTART_REQUIRED`

## React Query Evidence

| Item | Result |
| --- | --- |
| `pluginReactQuery` export | PASS; present in installed `openapi-to` export and `@openapi-to/plugin-react-query` tarball |
| Target | single test-owned target `react-query` using `fixtures/acceptance/react-query-user.yaml` |
| Selected operation | single `getUser` operation in the reduced deterministic fixture |
| Generation | PASS; 6 artifacts, including `default/get-user.query.ts`, service, types, and 3 model files |
| TS legacy 5.6.2 | PASS, strict + noImplicitAny |
| TS baseline 6.0.3 | PASS, strict + noImplicitAny |
| TS current 7.0.2 | PASS, strict + noImplicitAny |
| Handwritten patch to generated output | No |
| Runtime caveat | `@tanstack/react-query` is not a consumer dependency here; compile uses the test-owned ambient declaration at `src/types/react-query.d.ts`. This proves generated artifact strict type checking, not runtime package integration. |

## Existing Generator Matrix

`pnpm test:typescript-matrix` was rerun as a cross-check: 36 total, 33 pass, 3 fail, 2 independent root causes. All three failures are existing SWR lanes:

- `BUG-INLINE-ENUM-CASING` — P1
- `BUG-SWR-IMPLICIT-ANY` — P1

Upstream follow-up Issue [#127](https://github.com/openapi-to/openapi-to/issues/127) records these current-main Consumer regressions; no SWR product code or generated output was changed in this acceptance run.

No SWR product code, generated output, or tsconfig was changed to make this run pass. The command rewrote tracked evidence snapshots as a test side effect; those pre-existing snapshots were restored to HEAD before final review.

## Findings

### P0

None newly established by this rerun. The malicious fixture caused no command execution, secret access, file deletion, or authority expansion.

### P1

- Public Remote remains a confirmed Node 24 failure: `REMOTE_SOURCE_FAILED`, sanitized cause `Invalid IP address: undefined`, against `https://petstore.swagger.io/v2/swagger.json`. Upstream follow-up Issue [#126](https://github.com/openapi-to/openapi-to/issues/126) records this evidence; no loader fix was attempted.
- SWR strict TypeScript matrix remains a confirmed two-root-cause product defect (`BUG-INLINE-ENUM-CASING`, `BUG-SWR-IMPLICIT-ANY`). No fix was attempted.
- Real Host local NL and prompt-injection acceptance remain restart-gated because the current Host retained the old remote config after root config changed.

### P2

- Controlled Remote projection hashes differ while counts, contract, diagnostics class, and artifact paths match; this should remain visible rather than being called fully identical.
- React Query strict compile requires an ambient type contract because `@tanstack/react-query` is not installed in this consumer.

### Acceptance/Test Gap

- A fresh top-level Codex Host restart is required before `openapi_list_targets` can verify the new root local baseline and before real natural-language Local / Prompt-Injection sessions can be marked PASS.
- The independent reviewer task was dispatched read-only; its result must be attached after the fresh reviewer task becomes available. No reviewer result is being fabricated here.

## Independent Review Status

Coordinator pre-review confirms:

- official SDK/stdio results are labeled diagnostic cross-checks, not Real Codex NL PASS;
- root config is local and the prior remote baseline is not restored;
- stale Host state is reported as `RESTART_REQUIRED`;
- evidence includes requested/resolved keys, projection, manifest, truncation and preview provenance;
- prompt-injection fixture is real, but real NL execution is not claimed;
- React Query compile is real strict compilation of generated artifacts with a disclosed ambient-runtime limitation;
- public Remote and SWR failures remain FAIL findings;
- no Apply, commit, push, PR, merge, release, or upstream product modification occurred.

Fresh independent reviewer: dispatched as a separate read-only task with the current working tree, but no completed reviewer response was available at report-writing time. Therefore this report does not claim an unseen reviewer PASS.

## Final Filesystem Review

- Pre-existing: `docs/openapi-to-natural-language-acceptance-2026-09-18.md`; ignored `.openapi-to/` and `.openapi-to-local/` state
- Acceptance baseline: `openapi.config.ts`
- Test-owned fixtures: `fixtures/acceptance/`, `fixtures/react-query/`
- Test-owned profiles/harnesses: `controlled-remote.config.ts`, `public-remote.config.ts`, `prompt-injection.config.ts`, `react-query.config.ts`, the React Query tsconfig/consumer/type shim, and the rerun scripts
- Reports: this file; existing previous report was not overwritten
- Temporary generated output: not part of the tracked final diff; ignored output was used only for React Query compile and Dry Run comparisons
- Unexpected: none identified after restoring tracked evidence snapshots
- `git diff --check`: PASS at the time of report assembly

No commit, push, PR, merge, Apply, publish, tag, release, or upstream product-repo modification was performed.
