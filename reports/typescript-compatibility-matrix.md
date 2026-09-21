# TypeScript compatibility matrix

## Compilers

| Tier | Requested | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| legacy | 5.6.2 | 5.6.2 | PASS | reports/evidence/commands/TS-VERSION-TS56.json |
| baseline | 6.0.3 | 6.0.3 | PASS | reports/evidence/commands/TS-VERSION-TS6.json |
| current | 7.0.2 | 7.0.2 | PASS | reports/evidence/commands/TS-VERSION-TS7.json |

实际 SWR 版本：2.5.0。

## Full fixture compilation

| Plugin / fixture | TS 5.6.2 | TS 6.0.3 | TS 7.0.2 |
| --- | --- | --- | --- |
| pluginTSType | PASS | PASS | PASS |
| pluginTSRequest | PASS | PASS | PASS |
| pluginZod | PASS | PASS | PASS |
| pluginSWR | PASS | PASS | PASS |
| pluginVueQuery | PASS | PASS | PASS |
| pluginMSW | PASS | PASS | PASS |
| OpenAPI 3.1 fixture | PASS | PASS | PASS |
| pluginTSRequest boundary | PASS | PASS | PASS |

## Isolated findings

- TSC-SWR-MIN-TS56: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-SWR-MIN-TS56.json
- TSC-MSW-MIN-TS56: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-MSW-MIN-TS56.json
- TSC-SWR-MIN-TS6: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-SWR-MIN-TS6.json
- TSC-MSW-MIN-TS6: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-MSW-MIN-TS6.json
- TSC-SWR-MIN-TS7: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-SWR-MIN-TS7.json
- TSC-MSW-MIN-TS7: PASS; rootCauseId=none; evidence=reports/evidence/commands/TSC-MSW-MIN-TS7.json

共享 inline enum 根因通过 `rootCauseId=BUG-INLINE-ENUM-CASING` 去重；SWR 与 MSW 的最小 fixture 不包含该 enum。
