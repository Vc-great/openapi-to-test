# MSW handler for Media Type without schema does not strictly compile

- Severity: P1
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-msw
- Stable reproduction: yes

## Fixture

`GET /media-without-schema` has `application/json: {}` and therefore the
documented response type is `unknown`.

## Command

`pnpm exec tsc -p scenarios/generators/tsconfig.msw.json`

## Expected

The handler safely represents an unknown JSON body and strictly compiles.

## Actual

The handler passes `unknown` directly to `HttpResponse.json`, whose body
parameter is `JsonBodyType`. TypeScript raises TS2345.

Evidence:
`scenarios/generators/generated/msw/misc/get-schema-less-media.handler.ts`.

## Suggested direction

Generate an MSW-compatible JSON body type or select a response construction
path that accepts an unknown/opaque body without an unsafe consumer edit.
