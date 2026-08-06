# Optional inline object enum emits an undefined TypeScript identifier

- Severity: P1
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-ts-type (propagates to dependent plugins)
- Stable reproduction: yes

## Fixture

`fixtures/openapi30/main.yaml`: optional `User.optionalInline`, required numeric
`count`, optional string enum `mode`.

## Command

`pnpm exec openapi generate --config ts-type.config.ts --json`

`pnpm exec tsc -p scenarios/generators/tsconfig.ts-type.json`

## Expected

The imported `UserOptionalInlineModeEnumValue` is referenced with identical
casing; the outer object is optional.

## Actual

The import is `UserOptionalInlineModeEnumValue`, but the property uses
`UseroptionalInlineModeEnumValue`. TypeScript reports TS2552. The outer property
and Zod `.optional()` behavior are otherwise correct.

Evidence:
`scenarios/generators/generated/ts-type/types/models/user.model.ts` and
`reports/logs/TSC-001.stderr.log`.

## Suggested direction

Route both declaration and reference through one canonical identifier builder
and add this exact regression fixture to plugin-ts-type compile tests.
