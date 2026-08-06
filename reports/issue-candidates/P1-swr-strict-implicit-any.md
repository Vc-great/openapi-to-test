# SWR hooks emit implicit-any fetcher parameters under strict TypeScript

- Severity: P1
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-swr
- Stable reproduction: yes

## Command

`pnpm exec tsc -p scenarios/generators/tsconfig.swr.json`

## Expected

Generated hooks compile with `strict: true` and `skipLibCheck: false`.

## Actual

Both GET hooks emit `fetcher: async (_url) => ...`; `_url` is not contextually
typed and TS7006 is raised. This remains after isolating the consumer request
helper and installing real dependencies.

Evidence: `reports/logs/TSC-004.stderr.log`.

## Suggested direction

Explicitly annotate the fetcher key parameter with the generated query-key
type, or structure the `useSWR` call so the callback is contextually typed.
