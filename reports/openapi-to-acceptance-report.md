# openapi-to@4.0.0-rc.3 独立消费者验收报告

## 总体结论

包已完整发布到 npm，精确版本可安装，三项 bin、ESM、CommonJS、类型声明、Core、六插件、MCP 与 Skills 资产均存在。CLI/Core 生命周期与 MCP 安全写入边界整体扎实，但默认 init 模板不可直接生成，且复杂 fixture 暴露出 TypeScript enum 命名、SWR strict any、MSW unknown body 和请求 header/cookie 丢失等问题。因此不建议把该 RC 推荐给真实项目试用，建议继续保持 RC。

## 环境与发布

- 测试日期：2026-08-06T05:38:36.609Z
- OS：darwin 24.6.0 arm64
- Node：v24.8.0
- pnpm：10.33.0
- npm Registry：https://registry.npmjs.org
- 请求版本：4.0.0-rc.3
- 实装版本：4.0.0-rc.3
- dist-tags：latest=3.2.2，rc=4.0.0-rc.3
- lockfile：仅 Registry 解析；无 workspace/file/link/上游绝对路径
- Git 起始状态：clean

## 统计

| Total | Pass | Fail | Blocked | Skipped |
| ---: | ---: | ---: | ---: | ---: |
| 62 | 52 | 10 | 0 | 0 |

## 关键矩阵

| 能力 | 结论 |
| --- | --- |
| npm 发布/安装/三 bin/ESM/CJS/types | PASS |
| Swagger 2 / OAS 3.0 / 3.1 / 3.2 compatible-read | PASS |
| validate/inspect/diff 与退出码 2/3/4/6/7 | PASS |
| 六插件生成 | PASS |
| 六插件复杂 fixture 严格编译 | FAIL（共享 enum 命名；SWR/MSW 另有独立错误） |
| OAS 3.1 boolean Schema / ref sibling | PASS |
| dry-run/check/ownership/clean/idempotency | PASS |
| 三 Target/选择/去重/顺序/隔离 | PASS |
| MCP 3/8/10 Tool + schemas | PASS |
| Prepare/Apply/replay/restart/drift/add/replace | PASS |
| Skills dry-run/install/hash/no overwrite | PASS；重启加载需人工新会话 |
| 路径逃逸/重叠/symlink/Windows 设备名 | PASS |
| 私网/协议/跨 Origin header/日志 secret | PASS |

## 生成代码审查

- required/optional：path 与 required header 的类型必填，query/cookie 可选；optional $ref 在 TS/Zod 均正确。
- body/response：required requestBody 正确；201 与 204 聚合，204 为 undefined；Media Type 无 schema 为 unknown。
- Schema：enum、nullable、array、object、additionalProperties、allOf/anyOf/oneOf、递归、3.1 boolean Schema 和 ref sibling 均有覆盖。
- Zod 4：实际使用 Zod 4.4.3，正例成功、反例失败。
- 缺陷：可选内联对象 enum 的引用大小写错误；TS Request 未将 header/cookie 暴露为请求函数参数；SWR fetcher 参数 implicit any；MSW schema-less unknown 无法传入 JsonBodyType。

详见 `reports/generated-code-review.md`。

## MCP 3/8/10 Tool

- 无配置：3 tools，PASS。
- 可信只读配置：8 tools，无写工具，PASS。
- 配置 + allow-write：10 tools，Prepare/Apply 精确凭据、单次 token、重启失效、输出漂移失效、selection add/replace 和事务清理均 PASS。
- 完整工具 schema：`reports/snapshots/mcp-tools.json`。

## Skills

dry-run 不写盘；正式安装两个版本匹配资产；安装时校验 manifest/size/SHA-256；二次安装拒绝覆盖；未知 Host 拒绝；未发现 pnpm install 或 init 隐式安装。Codex 重启后真实加载/执行必须在新会话人工验收，未伪造结论。

## 安全边界说明

MCP 的 `file:` 输入与 Workspace 外本地输入均被拒绝，符合公开的 MCP Workspace 边界。CLI `validate` 没有 MCP 的 Host Workspace 边界：它接受 Workspace 内 `file:` URL，也会读取 Workspace 外绝对路径后再尝试解析。发布包文档把该约束明确描述在 MCP 下，因此本报告未将 CLI 行为提升为安全缺陷；如果产品意图是让阶段八约束同时适用于 CLI，需要补充文档或实现范围。

## 缺陷摘要

- P0：0
- P1：默认 init 模板 SWR/Vue Query 产物冲突；可选内联 enum 生成未定义标识符；SWR 严格编译失败；MSW schema-less response 严格编译失败。
- P2：TS Request 丢失 header/cookie 消费接口。
- P3：成功路径的 init --json stdout 不是单一 JSON 文档（重复 init 的错误路径正常）。

## 用例明细

| ID | 功能 | 状态 | 退出码 | 证据 |
| --- | --- | --- | ---: | --- |
| PUB-001 | Actual installed version | PASS | 0 | reports/logs/PUB-001.{stdout,stderr}.log |
| CLI-001 | openapi help | PASS | 0 | reports/logs/CLI-001.{stdout,stderr}.log |
| CLI-002 | openapi-to help | PASS | 0 | reports/logs/CLI-002.{stdout,stderr}.log |
| CLI-003 | ESM import | PASS | 0 | reports/logs/CLI-003.{stdout,stderr}.log |
| CLI-004 | CommonJS require | PASS | 0 | reports/logs/CLI-004.{stdout,stderr}.log |
| CLI-005 | Published type declarations | PASS | 0 | reports/logs/CLI-005.{stdout,stderr}.log |
| INIT-003 | fresh init JSON stdout contract | FAIL | 0 | reports/logs/INIT-003.{stdout,stderr}.log |
| INIT-002 | CommonJS init extension | PASS | 0 | reports/logs/INIT-002.{stdout,stderr}.log |
| INIT-003B | repeat init JSON error contract | PASS | 1 | reports/logs/INIT-003B.{stdout,stderr}.log |
| INIT-004 | Default init template can generate | FAIL | 1 | reports/logs/INIT-004.{stdout,stderr}.log |
| CFG-002 | Ambiguous config fail-before-execute | PASS | 2 | reports/logs/CFG-002.{stdout,stderr}.log |
| CFG-003 | Nested config discovery | PASS | 0 | reports/logs/CFG-003.{stdout,stderr}.log |
| INSPECT-001 | Inspect byte stability | PASS | 0 | reports/logs/INSPECT-001.{stdout,stderr}.log |
| VAL-001 | Swagger 2 validation | PASS | 0 | reports/logs/VAL-001.{stdout,stderr}.log |
| VAL-002 | OpenAPI 3.0 validation | PASS | 0 | reports/logs/VAL-002.{stdout,stderr}.log |
| VAL-003 | OpenAPI 3.1 validation | PASS | 0 | reports/logs/VAL-003.{stdout,stderr}.log |
| VAL-003B | YML extension | PASS | 0 | reports/logs/VAL-003B.{stdout,stderr}.log |
| VAL-003C | Content/extension mismatch | PASS | 0 | reports/logs/VAL-003C.{stdout,stderr}.log |
| VAL-004 | OpenAPI 3.2 compatible read | PASS | 0 | reports/logs/VAL-004.{stdout,stderr}.log |
| VAL-005 | External/cyclic refs | PASS | 0 | reports/logs/VAL-005.{stdout,stderr}.log |
| VAL-006 | Missing ref classification | PASS | 4 | reports/logs/VAL-006.{stdout,stderr}.log |
| VAL-007 | Invalid document classification | PASS | 3 | reports/logs/VAL-007.{stdout,stderr}.log |
| DIFF-001 | Breaking diff exit | PASS | 7 | reports/logs/DIFF-001.{stdout,stderr}.log |
| CFG-001 | Unknown target | PASS | 2 | reports/logs/CFG-001.{stdout,stderr}.log |
| SEC-CLI-001 | Private remote denied | PASS | 4 | reports/logs/SEC-CLI-001.{stdout,stderr}.log |
| SEC-CLI-002 | Non-HTTP protocol denied | PASS | 4 | reports/logs/SEC-CLI-002.{stdout,stderr}.log |
| SEC-CLI-003 | Output escape denied | PASS | 2 | reports/logs/SEC-CLI-003.{stdout,stderr}.log |
| SEC-CLI-004 | Overlapping output denied | PASS | 2 | reports/logs/SEC-CLI-004.{stdout,stderr}.log |
| SEC-CLI-005 | Symlink output denied | PASS | 2 | reports/logs/SEC-CLI-005.{stdout,stderr}.log |
| SEC-CLI-006 | Windows device path denied | PASS | 2 | reports/logs/SEC-CLI-006.{stdout,stderr}.log |
| GEN-001 | TS Type generation | PASS | 0 | reports/logs/GEN-001.{stdout,stderr}.log |
| GEN-002 | TS Request generation | PASS | 0 | reports/logs/GEN-002.{stdout,stderr}.log |
| GEN-003 | Zod generation | PASS | 0 | reports/logs/GEN-003.{stdout,stderr}.log |
| GEN-004 | SWR generation | PASS | 0 | reports/logs/GEN-004.{stdout,stderr}.log |
| GEN-005 | Vue Query generation | PASS | 0 | reports/logs/GEN-005.{stdout,stderr}.log |
| GEN-006 | MSW generation | PASS | 0 | reports/logs/GEN-006.{stdout,stderr}.log |
| TSC-001 | ts-type strict compilation | FAIL | 1 | reports/logs/TSC-001.{stdout,stderr}.log |
| TSC-002 | ts-request strict compilation | FAIL | 1 | reports/logs/TSC-002.{stdout,stderr}.log |
| TSC-003 | zod strict compilation | FAIL | 1 | reports/logs/TSC-003.{stdout,stderr}.log |
| TSC-004 | swr strict compilation | FAIL | 1 | reports/logs/TSC-004.{stdout,stderr}.log |
| TSC-005 | vue-query strict compilation | FAIL | 1 | reports/logs/TSC-005.{stdout,stderr}.log |
| TSC-006 | msw strict compilation | FAIL | 1 | reports/logs/TSC-006.{stdout,stderr}.log |
| GEN-007 | OpenAPI 3.1 booleans/ref sibling | PASS | 0 | reports/logs/GEN-007.{stdout,stderr}.log |
| TSC-007 | OpenAPI 3.1 strict compilation | PASS | 0 | reports/logs/TSC-007.{stdout,stderr}.log |
| ZOD-001 | Zod positive/negative runtime | PASS | 0 | reports/logs/ZOD-001.{stdout,stderr}.log |
| LIFE-001 | Dry-run no write | PASS | 0 | reports/logs/LIFE-001.{stdout,stderr}.log |
| LIFE-002 | Check current output | PASS | 0 | reports/logs/LIFE-002.{stdout,stderr}.log |
| LIFE-003 | Managed output base | PASS | 0 | reports/logs/LIFE-003.{stdout,stderr}.log |
| MULTI-001 | Default all targets | PASS | 0 | reports/logs/MULTI-001.{stdout,stderr}.log |
| MULTI-002 | Repeated target dedupe/order | PASS | 0 | reports/logs/MULTI-002.{stdout,stderr}.log |
| MCP-SUITE | Official SDK stdio suite | PASS | 0 | reports/logs/MCP-SUITE.{stdout,stderr}.log |
| SEC-REMOTE | Cross-origin header stripping | PASS | 0 | reports/logs/SEC-REMOTE.{stdout,stderr}.log |
| PUB-002 | Three package bins | PASS | 0 | node_modules/openapi-to/package.json |
| PUB-003 | Lockfile registry-only resolution | PASS | 0 | pnpm-lock.yaml |
| INIT-001 | ESM init extension | PASS | 0 | reports/logs/INIT-003.stdout.log |
| REG-001 | Optional inline object enum identifier | FAIL | 0 | scenarios/generators/generated/ts-type/types/models/user.model.ts |
| REG-002 | Optional non-required ref | PASS | 0 | scenarios/generators/generated/zod/zod/models/user.schema.ts |
| SEM-001 | Parameter required semantics | FAIL | 0 | scenarios/generators/generated/ts-request/users/get-user.service.ts |
| SKILL-001 | Skills dry-run | PASS | 0 | reports/logs/SKILL-001.{stdout,stderr}.log |
| SKILL-002 | Skills install | PASS | 0 | reports/logs/SKILL-002.{stdout,stderr}.log |
| SKILL-003 | No overwrite | PASS | 1 | reports/logs/SKILL-003.{stdout,stderr}.log |
| SKILL-004 | Unsupported host | PASS | 1 | reports/logs/SKILL-004.{stdout,stderr}.log |

## 未完成与覆盖边界

- Codex 重启后 Skill 发现与真实执行：MANUAL。
- HTTPS→HTTP 降级重定向因未引入本地 CA/TLS fixture 未自动化；Core/MCP 相关策略代码路径和非 HTTP(S) 拒绝已覆盖。
- 未穷举所有 OpenAPI/JSON Schema 组合；覆盖的是报告列出的最小 fixture。
- 失败用例数：10。所有失败均保留证据，未修改生成代码掩盖。
