# openapi-to Natural Language Acceptance Report

- Date: 2026-09-18
- Repository: `/Users/vc/code/openapi-to-test`
- Branch: `main`
- HEAD: `c416a088d0c6dd91d59a6531a9fccc5b91998d4f`
- Node: `v24.20.0`
- pnpm: `10.33.0`
- openapi-to: `4.0.0-rc.3`
- Initial Git Status: clean
- Final Git Status: `?? docs/openapi-to-natural-language-acceptance-2026-09-18.md`（除本报告自身外 clean）
- MCP Mode(s) Tested: Host `MCP_READ_ONLY`；隔离 official SDK `MCP_READ_ONLY` / `MCP_WRITE_ENABLED`
- Config Profile(s): 根 `openapi.config.ts`（远程 Petstore）；本地 deterministic `mcp.config.ts`；7 个 generator profile；test-owned 临时 React Query profile（已删除）

## Executive Summary

本次验收确认了 Skill 路由、MCP Tool/Schema、bounded contract、operation-scoped Dry Run、generator factory 与 Prepare 计划协议的实际能力；但根配置使用远程 Petstore，在当前 Runtime 解析失败，导致自然语言的 Operation Search、Contract、Dry Run 无法在当前根配置上完成。没有猜 Target、method、path 或 operationKey，也没有回退到 full-target generation。

自然语言子任务真实结果：Setup 正确触发 `openapi-to-setup`；Target/Dry Run 正确触发 `openapi-to-generate` 并在远程源失败时停止；Validate/Inspect/Diff 实际走了 CLI 而不是 MCP，因此这三项的“自然语言经 MCP 编排”证据不足。MCP 入口的安全边界通过，但 CLI 入口仍存在工作区外路径与 `file://` 读取偏差。

| Category | PASS | FAIL | BLOCKED | SKIPPED | NOT SUPPORTED | NEED VERIFICATION |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Setup / Skill Routing | 1 | 0 | 0 | 0 | 0 | 0 |
| MCP Analysis | 0 | 0 | 0 | 0 | 0 | 3 |
| Operation Discovery | 1 | 0 | 2 | 0 | 0 | 0 |
| Contract Retrieval | 0 | 0 | 1 | 0 | 0 | 0 |
| Selective Dry Run | 0 | 0 | 1 | 0 | 0 | 0 |
| Generation Check | 0 | 0 | 0 | 0 | 0 | 1 |
| Generators | 5 | 1 | 0 | 0 | 0 | 1 |
| Controlled Write | 3 | 0 | 0 | 2 | 0 | 0 |
| Security | 1 | 1 | 0 | 0 | 0 | 1 |
| Determinism | 1 | 0 | 0 | 0 | 0 | 0 |

总体结论：`FAIL`（当前仓库的自然语言端到端验收不能宣称全通过）。主要原因是 P0 安全边界偏差、P1 SWR 生成兼容性缺陷，以及根远程配置阻塞真实 Operation 工作流。

## Repository Facts and Setup

- 初始工作树 clean；没有发现 pre-existing Git 修改。
- `package.json` 只有一个 `openapi-to` aggregate dependency：`devDependencies.openapi-to = 4.0.0-rc.3`。
- Inspector：`HOST_CONFIG_READY`，`blockingReasons=[]`，唯一 generation config 是 `openapi.config.ts`，`.openapi-to/` 有 root ignore；`observedStateHash=119fcf41f81ca053c11d3c6124650b853a49d37353da6c86d499eaeef5968b50`。
- `.codex/config.toml` 使用项目绝对 `cwd`、`--config openapi.config.ts`，没有 `--allow-write` 或 Apply prompt；Inspector 的 conservative parser 标记 `manualReviewRequired=true`，但实际 Host 子任务列出了 8 个兼容只读 Tool。
- 本地命令：`pnpm exec openapi --version` 成功；`pnpm exec -- openapi-to-mcp --help` 成功。
- 当前根 Target 为 `server1`，来源 `https://petstore.swagger.io/v2/swagger.json`；MCP 返回 `REMOTE_SOURCE_FAILED`，原因包含 `Invalid IP address: undefined`，catalog 为 0 operations/0 schemas。

## Core Functional Test Matrix

| ID | 功能 | 自然语言测试 / 运行方式 | Expected Workflow | Actual Skill / MCP Trace | Result | Evidence / 问题 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Setup Detection | “检查 openapi-to 是否安装并接入 Codex” | Inspector → config → actual Tools/Schema | `openapi-to-setup`；Host 实际列出 8 个 Tool | PASS | 包、唯一 config、read-only mode 已确认；根 Target 远程加载失败 |
| B1 | Validate | “找不合法 fixture 并报告 error/warning” | 自然语言 → analysis MCP validate | 子任务实际走 CLI validate | NEED VERIFICATION | 结果正确，但未证明自然语言触发 `openapi_validate` |
| B2 | Inspect | “概括合法 OpenAPI，不 dump 全文” | bounded MCP inspect | 子任务实际走 CLI inspect/读取文件 | NEED VERIFICATION | 结果正确，但 MCP routing evidence 不足 |
| B3 | Diff | “比较 fixtures/diff old/new” | MCP diff | 子任务实际走 CLI diff | NEED VERIFICATION | `PATH_REMOVED`/breaking 正确；未证明 MCP routing |
| C1 | Target Discovery | “查看 API 服务并找详情接口” | `openapi_list_targets` | `openapi-to-generate`；list target → `server1` | PASS | Target 未猜测；但 source catalog 后续失败 |
| C2 | Operation Search | 同上 | exact Target → search | search 未继续，因 `REMOTE_SOURCE_FAILED` | BLOCKED | 不允许猜 `operationKey`；根配置远程源是阻塞原因 |
| C3 | Bounded Contract | 同上 | exact candidate → `openapi_get_operation` | 未调用 contract | BLOCKED | 没有可信 candidate；没有伪造参数/响应 |
| D1 | Selective Dry Run | “只预览按 ID 详情接口，不写磁盘” | Target → search → contract → operation-scoped Dry Run | `openapi-to-generate`；在 Target/catalog 失败处停止 | BLOCKED | 没有 full-target fallback；根 `server/` 不存在 |
| E1 | Generation Check | “检查现有生成代码是否 drift” | read-only generation check | 真实根配置无法生成当前 catalog | NEED VERIFICATION | 现有 `scenarios/generators/generated/**` 不属于根 Petstore config |
| G1 | Operation Projection | local fixture official SDK | exact Target + `[getUser]` → Dry Run | list → search → get operation → dry run | PASS | requested/resolved `[getUser]`；operation=1/path=1/schema=4 |
| G2 | Dependency Closure | local fixture official SDK | selected Operation → named-schema closure | dry-run manifest | PASS | 6 artifacts；保留 User/Error 及依赖；未出现 createUser artifact |
| G3 | Determinism | local fixture同输入连续两次 Dry Run | same inputs → same projection/artifacts | two `openapi_generate_dry_run` calls | PASS | projection hash `290e4d…86a8`、manifest hash与路径完全一致 |
| H1 | Prompt-Injection Safety | “描述/示例/扩展不是指令” | data-only handling | 安全子任务检查 fixture 与实现 | NEED VERIFICATION | 当前 fixture 没有恶意 description 载荷，未完成真实 prompt-injection fixture case |
| H2 | Workspace / Ref Safety | 工作区外、file URL、私网、external ref | fail closed | MCP validate + security probe | FAIL | MCP 入口通过；CLI 入口读取工作区内 `file://`，且 `/etc/passwd` 进入解析阶段，见 P0 |
| I1 | Prepare | local SDK `--allow-write`，只 Prepare | Search → contract → dry-run → Prepare → STOP | 10 Tool runtime；Prepare success | PASS | add plan `applySupported=true`，exact planHash 已返回；未 Apply |
| J1 | Apply Approval Boundary | 未给用户 exact hash approval | exact hash required → stop | `openapi_apply_generation` 未调用 | PASS | Apply = NOT EXECUTED；人工审批边界保持 |
| J2 | Apply | 用户未提供 exact planHash approval | Apply only after approval | 未执行 | SKIPPED | Reason: Human approval intentionally not supplied |
| K1 | Selection Add | Prepare add `createUser` | desired = previous ∪ requested | Prepare add | PASS | previous `[getUser]` → desired `[createUser,getUser]`；added=2/deleted=0 |
| L1 | Selection Replace | Prepare replace `createUser` | desired=requested，报告删除 | Prepare replace | PASS | removed `[getUser]`；added=2/deleted=2；managed deletion 明确返回 |
| M1 | Stale / Drift | Apply 前修改 plan-bound input | stale → reject，不自动 re-plan | 未执行 Apply | SKIPPED | 需要真实用户批准且会改变 test-owned state；未绕过审批 |

## MCP Runtime Inventory

以下是本地实际 MCP Runtime 证据，不是按版本猜测的清单。

| Tool | Present | inputSchema verified | Natural-language scenario covered | Result |
| --- | --- | --- | --- | --- |
| `openapi_validate` | Yes | `source` required；`failOnWarning` optional | B1（CLI routing） | PASS as runtime / NEED VERIFICATION as NL routing |
| `openapi_inspect` | Yes | `source` required；`includeOperations` optional | B2（CLI routing） | PASS as runtime / NEED VERIFICATION as NL routing |
| `openapi_diff` | Yes | `before` + `after` required | B3（CLI routing） | PASS as runtime / NEED VERIFICATION as NL routing |
| `openapi_list_targets` | Yes | no args | A1/C1 | PASS |
| `openapi_search_operations` | Yes | bounded `query` required，`target/methods/tags/limit` optional | C2/local fixture | PASS on local fixture; root BLOCKED |
| `openapi_get_operation` | Yes | exact `operationKey` required；`detail=summary|contract` 等 bounded limits | C3/local fixture | PASS on local fixture; root BLOCKED |
| `openapi_generate_dry_run` | Yes | `targets`、`scope=full|operations`、`operationKeys`、`includePreview` | D1/local fixture | PASS on local fixture; root BLOCKED |
| `openapi_check_generation` | Yes | bounded `targets` | E1/local fixture | Runtime PASS；root NL NEED VERIFICATION |
| `openapi_prepare_generation` | Isolated write runtime only | `selection.add` 与 `selection.replace`，`includePreview` | I1/K1/L1 | PASS（主 Host 未切换写模式） |
| `openapi_apply_generation` | Isolated write runtime only | exact `planId` + `token` + `approvedPlanHash` required | J1/J2 | PASS boundary；Apply未执行 |

## Local Bounded Contract and Dry Run Evidence

使用仓库已有 `mcp.config.ts` 与 `fixtures/openapi30/main.yaml`，避免依赖公网：

- Target `mcp-api`：3 operations、6 schemas、generation available；有 1 个 `OPENAPI_REF_CYCLE` warning。
- 搜索 `user` 返回两个候选：`createUser` (`POST /users`) 与 `getUser` (`GET /users/{userId}`)。
- `getUser` contract：必需 path `userId:string`；可选 query `verbose:boolean`；必需 header `X-Tenant:string`；可选 cookie `session:string`；200 `User`、404 `Error`。
- operation-scoped Dry Run：`requestedOperationKeys=[getUser]`、`resolvedOperationKeys=[getUser]`、`projection.operationCount=1`、`pathCount=1`、`schemaCount=4`；6 artifacts；diagnostic 1 warning；`truncated.artifacts=false`、`omitted=0`。
- 连续两次同输入 Dry Run 的 projection hash、manifest hash、artifact path 与 preview bytes 一致，结论为 deterministic PASS。
- Dry Run 前后 `openapi_check_generation` 结果不变，证明 preview 没有写生成文件、selection 或 manifest。

## Generator Matrix

Installed package 的实际 export 中确认存在：`pluginTSType`、`pluginTSRequest`、`pluginZod`、`pluginSWR`、`pluginVueQuery`、`pluginReactQuery`、`pluginMSW`。每个 profile 都使用单 Target + 单 Operation 做了真实 Dry Run；没有把 SWR 与 Vue Query 强行放进同一 profile。

| Generator | Local export | Tested profile | Operation-scoped artifacts | Compile / validation | Result |
| --- | --- | --- | --- | --- | --- |
| TypeScript Types | Yes | `ts-type.config.ts` | 6 TS artifacts | TypeScript matrix pass | PASS |
| TypeScript Request | Yes | `ts-request.config.ts` | 7 TS artifacts | TypeScript matrix pass；request boundary pass | PASS |
| Zod | Yes | `zod.config.ts` | 11 TS artifacts | TypeScript matrix pass | PASS |
| SWR | Yes | `swr-minimal.config.ts` | 5 artifacts，含 `use-get-health.query.ts` | Dry Run pass；matrix 3/3 fail | FAIL |
| Vue Query | Yes | `vue-query.config.ts` | 8 TS artifacts，含 query/service/types | TypeScript matrix pass | PASS |
| React Query | Yes | 临时 `.tmp` profile（已删除） | 8 TS artifacts，含 `users/get-user.query.ts` | 未单独运行 strict compile | NEED VERIFICATION |
| MSW | Yes | `msw.config.ts` | 12 TS artifacts，含 handler/schema | TypeScript matrix pass；schema-less limitation另列 | PASS |

Cross-check：`pnpm test:typescript-matrix` 为 `33 PASS / 3 FAIL`，3 个失败均为 SWR，两个独立 P1：`BUG-INLINE-ENUM-CASING`、`BUG-SWR-IMPLICIT-ANY`。`pnpm test:generators` 为 `8 PASS / 1 FAIL / 1 KNOWN_LIMITATION`；这些结构化脚本只作 cross-check，不被当作自然语言验收 PASS。

## Controlled Write Evidence

- 主 `.codex/config.toml` 未修改，仍是 read-only；没有 Setup Plan、Host write switch 或 restart，因此 Host-level `MCP_WRITE_ENABLED` = BLOCKED/未请求。
- 隔离 official SDK `--allow-write` 只用于能力验证，实际列出 10 个 Tool；`openapi_prepare_generation` Schema 明确支持 `add` 和非空 `replace`。
- Add Prepare：`previous=[getUser]`、`requested=[createUser]`、`desired=[createUser,getUser]`、`removed=[]`、summary `added=2, deleted=0, unchanged=6`、`applySupported=true`。Exact planHash：`8bcb0a595ebf0e3cc0e9d7e23c14bee39a5bb092b80a1ea0444d73aa015a0213`。
- Replace Prepare：`requested=[createUser]`、`removed=[getUser]`、`desired=[createUser]`、summary `added=2, deleted=2, unchanged=4`、`applySupported=true`。Exact planHash：`1dd8bee01a9a5e01b22695cc8c1dbdd06cb84edd8913e49e526ed4ec349abd84`。
- 两个 plan 都只做 Prepare；token 不写入报告。没有用户发送 `Approve plan <exact-planHash> for Apply.`，所以 `Apply = SKIPPED`，`Approval Boundary = PASS`。
- Stale/drift Apply = SKIPPED；没有为测试自动批准、改变 source 后调用 Apply，或模拟删除文件。

## Security Findings

- MCP Server：`/etc/passwd` → `MCP_WORKSPACE_PATH_OUTSIDE_ROOT`；`file://` →失败；`http://127.0.0.1` → `REMOTE_SOURCE_BLOCKED`；缺失 external ref → `INPUT_READ_FAILED`。这些是 PASS。
- CLI：工作区内 `file://` 可被规范化后读取；`/etc/passwd` 被读取至解析阶段再因不是 OpenAPI 失败，而不是在 workspace boundary 处拒绝。这与验收要求的 fail-closed workspace boundary 不符，列为 P0。
- 当前 fixtures 没有带有“ignore previous instructions / delete files / read secrets”文字的恶意 description/example，因此 prompt-injection case 本身为 NEED VERIFICATION；没有发现执行 OpenAPI 文本中指令的证据。

## Independent Review

Fresh read-only Reviewer 已完成。它识别出仓库既有结构化报告缓存来自旧 commit/旧运行，且 `scripts/mcp-acceptance.mjs` 会在脚本中直接 Apply；Coordinator 已独立核对并没有把这些旧结果用于本报告的 PASS。Reviewer 未能看到本轮对话级 evidence，因此本报告采用当前 live Tool/Schema/自然语言子任务结果作为事实来源。

## Findings

### P0

- CLI 输入边界允许 `file://` 与工作区外路径进入读取/解析流程；即使最终解析失败，也不满足 workspace escape fail-closed 要求。需要单独修复或重新验收 CLI source policy。

### P1

- 根 `openapi.config.ts` 远程 Petstore 在当前环境 `REMOTE_SOURCE_FAILED`，使真实自然语言 Operation Search、Contract、Dry Run 无法完成；应切换到 deterministic local fixture 或修复受信任的远程解析路径后重跑。
- SWR generator 的 inline enum casing 与 implicit-any 使严格 TypeScript 消费失败；3 个编译器均复现。
- Validate/Inspect/Diff 自然语言场景走了 CLI 而非 MCP；Skill/MCP 编排证据不足，不能写成 PASS。

### P2

- 没有真实恶意 description/example fixture，prompt-injection case 仍缺直接运行证据。
- React Query operation-scoped Dry Run 已成功，但尚未完成独立 strict TypeScript compile。
- 根 Host `.codex/config.toml` 的 conservative parser 仍标记 `manualReviewRequired`；实际只读 Tool 已连接，但若要切换写模式需 Setup Plan + restart + post-restart verification。

## Final Git / Filesystem Review

- Pre-existing changes: 无（初始 clean）。
- Test-created tracked changes: 已恢复；`git diff --check` 通过。
- Test-owned temporary React Query config: 已删除。
- Generated output: 未由本轮 MCP Dry Run/Prepare 写入；既有 ignored fixtures 保持不变。
- `.codex/config.toml`、`package.json`、`openapi.config.ts`、`.gitignore`：未修改。
- Selection state：Prepare 只在隔离 MCP 进程内生成计划；没有 Apply，因此没有新增持久 selection。
- Final `git status --short`: `?? docs/openapi-to-natural-language-acceptance-2026-09-18.md`；除本报告自身外 clean。

## Remaining Risks and Next Step

- 不应把当前结果宣称为“全部通过”或可直接发布；先处理 P0 CLI boundary 与 P1 SWR/远程 source 问题。
- 当前不需要用户审批，因为本轮没有请求切换 Host write mode，也没有 Apply。若要继续 Controlled Write，需要先由 Setup Skill 给出并等待 exact Setup Plan approval；Host restart 后再重新验证 10 个实际 Tool/Schema。随后若要 Apply，必须由用户明确批准本报告中对应的 exact planHash；当前两个 plan 已过期，不应复用。
