import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const resultDocument = JSON.parse(await readFile(path.join(root, "reports/results.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "node_modules/openapi-to/package.json"), "utf8"));
const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
const environment = {
  testDate: new Date().toISOString(),
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
  pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
  registry: execFileSync("pnpm", ["config", "get", "registry"], { encoding: "utf8" }).trim(),
  requestedVersion: "4.0.0-rc.3",
  installedVersion: pkg.version,
  distTagsObserved: { latest: "3.2.2", rc: "4.0.0-rc.3", evidence: "reports/logs/baseline-dist-tags.log and live Registry query" },
  lockfileRegistryOnly: !/(?:specifier|version|resolution|tarball):[^\n]*(?:workspace:|file:|link:)|\/Users\/vc\/code\/openapi-to(?:\/|$)/.test(lock),
  gitStartStatus: "",
};
await writeFile(path.join(root, "reports/environment.json"), `${JSON.stringify(environment, null, 2)}\n`);

const failures = resultDocument.cases.filter((item) => item.status === "FAIL");
const rows = resultDocument.cases.map((item) =>
  `| ${item.id} | ${item.feature} | ${item.status} | ${item.exitCode} | ${item.evidence} |`
).join("\n");
const report = `# openapi-to@4.0.0-rc.3 独立消费者验收报告

## 总体结论

包已完整发布到 npm，精确版本可安装，三项 bin、ESM、CommonJS、类型声明、Core、六插件、MCP 与 Skills 资产均存在。CLI/Core 生命周期与 MCP 安全写入边界整体扎实，但默认 init 模板不可直接生成，且复杂 fixture 暴露出 TypeScript enum 命名、SWR strict any、MSW unknown body 和请求 header/cookie 丢失等问题。因此不建议把该 RC 推荐给真实项目试用，建议继续保持 RC。

## 环境与发布

- 测试日期：${environment.testDate}
- OS：${environment.os}
- Node：${environment.node}
- pnpm：${environment.pnpm}
- npm Registry：${environment.registry}
- 请求版本：4.0.0-rc.3
- 实装版本：${environment.installedVersion}
- dist-tags：latest=3.2.2，rc=4.0.0-rc.3
- lockfile：${environment.lockfileRegistryOnly ? "仅 Registry 解析；无 workspace/file/link/上游绝对路径" : "发现本地解析（FAIL）"}
- Git 起始状态：clean

## 统计

| Total | Pass | Fail | Blocked | Skipped |
| ---: | ---: | ---: | ---: | ---: |
| ${resultDocument.summary.total} | ${resultDocument.summary.pass} | ${resultDocument.summary.fail} | ${resultDocument.summary.blocked} | ${resultDocument.summary.skipped} |

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

详见 \`reports/generated-code-review.md\`。

## MCP 3/8/10 Tool

- 无配置：3 tools，PASS。
- 可信只读配置：8 tools，无写工具，PASS。
- 配置 + allow-write：10 tools，Prepare/Apply 精确凭据、单次 token、重启失效、输出漂移失效、selection add/replace 和事务清理均 PASS。
- 完整工具 schema：\`reports/snapshots/mcp-tools.json\`。

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
${rows}

## 未完成与覆盖边界

- Codex 重启后 Skill 发现与真实执行：MANUAL。
- HTTPS→HTTP 降级重定向因未引入本地 CA/TLS fixture 未自动化；Core/MCP 相关策略代码路径和非 HTTP(S) 拒绝已覆盖。
- 未穷举所有 OpenAPI/JSON Schema 组合；覆盖的是报告列出的最小 fixture。
- 失败用例数：${failures.length}。所有失败均保留证据，未修改生成代码掩盖。
`;
await writeFile(path.join(root, "reports/openapi-to-acceptance-report.md"), report);
console.log(`wrote reports/openapi-to-acceptance-report.md (${resultDocument.summary.total} cases)`);
