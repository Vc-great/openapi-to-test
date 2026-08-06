# Generated code review — openapi-to@4.0.0-rc.3

## Plugin matrix

| Plugin | Generate | Strict compile | Main finding |
| --- | --- | --- | --- |
| pluginTSType | PASS | FAIL | Optional inline enum reference uses `UseroptionalInlineModeEnumValue`, while only `UserOptionalInlineModeEnumValue` is declared. |
| pluginTSRequest | PASS | FAIL | Inherits TS Type failure; additionally generated service omits header/cookie arguments even though their types exist. |
| pluginZod | PASS | FAIL as complete plugin output | Inherits TS Type failure. Zod schema files themselves compile and Zod 4 runtime positive/negative parsing passes. |
| pluginSWR | PASS | FAIL | Inherits enum failure and emits implicit-any `_url` fetcher parameters. |
| pluginVueQuery | PASS | FAIL | Inherits enum failure; independent hook consumer is otherwise type-resolved. |
| pluginMSW | PASS | FAIL | Inherits enum failure and passes a schema-less `unknown` response to `HttpResponse.json(JsonBodyType)`. |

Compiler options include `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`, `noEmit`,
`skipLibCheck: false`, and `allowImportingTsExtensions` (needed for the
generator's explicit `.ts` imports). No generated file was manually repaired.

## Semantic checks

- `User.address` is a non-required `$ref`: TS emits `address?: AddressModel`;
  Zod emits `addressSchema.optional()` — PASS.
- `User.optionalInline` is non-required and contains required `count` plus
  optional enum `mode`: outer optionality and Zod shape are correct, but TS
  enum identifier casing is broken — FAIL.
- `userId` path and `X-Tenant` header types are required; `verbose` query and
  `session` cookie types are optional — PASS in type output.
- `getUserService` accepts only path/query/requestConfig and has no typed
  header/cookie inputs — FAIL.
- required JSON request body maps to `CreateUserMutationRequest` — PASS.
- 201 plus 204 responses aggregate, with 204 mapped to `undefined` — PASS.
- Media Type without schema maps to `unknown` — PASS in TS/Zod, FAIL in MSW
  strict consumption.
- OpenAPI 3.1 boolean schemas map `true` to TS `unknown`/Zod `z.unknown()` and
  `false` to TS `never`/Zod `z.never()` — PASS.
- OpenAPI 3.1 `$ref` sibling description and referenced constraints are
  retained — PASS.
- Recursive Schema uses TS self-reference and `z.lazy` — PASS.
- `allOf`, `anyOf`, `oneOf`, nullable, arrays, objects and
  `additionalProperties` are represented — PASS for exercised fixtures.

## Determinism and lifecycle

Second generation reports all artifacts unchanged; ownership manifests are
byte-stable. Dry-run does not create output/manifest. Check detects artificial
drift with exit 6 and does not repair it. Clean removes only previously owned
artifacts; a hand-written file survives.
