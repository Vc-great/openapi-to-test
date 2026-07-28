# openapi-to npm consumer verification

这是一个独立的真实 npm 消费者项目，用于验证发布到 npm 的
`openapi-to@4.0.0-rc.0`。它覆盖本地 OpenAPI 文档校验和检查、TypeScript
代码预览与生成、严格编译、字节稳定性、漂移发现以及自动恢复。

## 环境要求

- Node.js 20 或更高
- pnpm 10.14.0（由 `packageManager` 固定）

安装依赖：

```bash
pnpm install --frozen-lockfile=false
```

项目只使用 npm 发布包；不使用上游源码路径、workspace dependency、本地
link 或本地 tarball。项目级 `.npmrc` 使用 silent reporter，使 JSON 脚本的
stdout 保持为一个完整 JSON 文档；CLI 告警仍写入 stderr。

## 目录结构

```text
.OpenAPI/openapi.config.ts              # 单一 manual-full Target
fixtures/basic/openapi.yaml             # 本地 OpenAPI 3.0.3 fixture
scripts/verify-generated-output.mjs     # 稳定性、漂移和恢复验证
src/api/request.ts                      # common request client 编译占位
src/api/custom/                         # 手写 API 扩展
src/api/generated/manual-full/          # 生成器管理的输出
src/consumer-usage.ts                   # 真实 TypeScript 消费示例
```

## 手动验证命令

确认本地 CLI 版本：

```bash
pnpm openapi:version
```

校验并检查 fixture：

```bash
pnpm spec:validate
pnpm spec:inspect
```

`spec:inspect` 的 stdout 是一个可直接解析的 JSON 文档。

预览生成，不写入正式生成目录：

```bash
pnpm generate:preview
```

正式生成并检查当前输出：

```bash
pnpm generate
pnpm generate:check
```

严格编译生成代码和真实消费代码：

```bash
pnpm typecheck
```

单独执行生成输出的字节稳定性、漂移检测和自动恢复：

```bash
pnpm verify:generated
```

执行完整验证：

```bash
pnpm verify
```

## 生成文件所有权

`src/api/generated/manual-full` 由 `openapi-to` 管理，并保留在 Git 中用于版本
升级 diff 与回归比较。不要手改其中的文件：修改会让 `generate:check` 以
outdated output 失败。手写扩展应放在 `src/api/custom` 或其他生成目录之外。

## 当前阶段边界

当前阶段只有 `manual-full`，只验证手动 CLI 消费流程。明确不包含 MCP、AI
生成、多个 Target、GitHub Actions，也不执行 commit、push、tag 或 publish。
