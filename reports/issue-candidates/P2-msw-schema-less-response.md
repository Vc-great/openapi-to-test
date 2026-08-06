# MSW handler for Media Type without schema does not strictly compile

- Severity: P2
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-msw
- Stable reproduction: yes

## Fixture

`GET /media-without-schema` has `application/json: {}` and therefore the
documented response type is `unknown`.

## Command

The structured matrix compiles the complete fixture and
`fixtures/isolation/msw-schema-less.yaml` with TypeScript 5.6.2, 6.0.3, and
7.0.2.

## Expected

The handler safely represents an unknown JSON body and strictly compiles.

## Actual

TypeScript and Zod mapping a Media Type with no schema to `unknown` is within
the current capability boundary. The plugin-specific defect is that
pluginMSW passes that `unknown` directly to `HttpResponse.json`, whose body
parameter is `JsonBodyType`. TypeScript raises TS2345.

Evidence:

- `reports/evidence/generated-minimal/msw-schema-less.handler.ts`
- `reports/evidence/commands/TSC-MSW-MIN-TS56.json`
- `reports/evidence/commands/TSC-MSW-MIN-TS6.json`
- `reports/evidence/commands/TSC-MSW-MIN-TS7.json`
- corresponding stdout/stderr files under `reports/evidence/failures/`

This is limited to pluginMSW and this schema combination. It does not affect
Core, CLI, MCP, or the other generation plugins.

## Suggested direction

Generate an MSW-compatible JSON body type or select a response construction
path that accepts an unknown/opaque body without an unsafe consumer edit.
