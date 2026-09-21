# Generated code review — openapi-to@4.0.0-rc.3

## Result-driven plugin matrix

| Plugin | TS legacy | TS baseline | TS current |
| --- | --- | --- | --- |
| pluginTSType | PASS | PASS | PASS |
| pluginTSRequest | PASS | PASS | PASS |
| pluginZod | PASS | PASS | PASS |
| pluginSWR | PASS | PASS | PASS |
| pluginVueQuery | PASS | PASS | PASS |
| pluginMSW | PASS | PASS | PASS |
| OpenAPI 3.1 fixture | PASS | PASS | PASS |
| pluginTSRequest boundary | PASS | PASS | PASS |

## Semantic boundary

- `SEM-001` 的结构化状态为 KNOWN_LIMITATION。
- header/cookie 类型、requestConfig 签名与 Axios 配置消费者均有最小证据。
- 请求函数不提供独立 header/cookie 参数；不伪造自动 Cookie 序列化或完整 header merge precedence。
- schema-less JSON 在 TypeScript/Zod 中映射为 unknown 属于当前能力；pluginMSW 将该 unknown 直接交给 `HttpResponse.json` 的失败单独归为 P2。

## Determinism and lifecycle

九项 lifecycle 结论直接来自 `LIFE-001` 至 `LIFE-009`；关键哈希见 `reports/evidence/hashes/lifecycle.json`。
