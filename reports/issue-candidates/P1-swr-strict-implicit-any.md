# SWR hooks emit implicit-any fetcher parameters under strict TypeScript

- Severity: P1
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-swr
- Stable reproduction: yes

## Command

The structured matrix runs both the complete fixture and
`fixtures/isolation/swr-minimal.yaml` with TypeScript 5.6.2, 6.0.3, and 7.0.2.

## Expected

Generated hooks compile with `strict: true` and `skipLibCheck: false`.

## Actual

Both GET hooks emit `fetcher: async (_url) => ...`; `_url` is not contextually
typed and TS7006 is raised. This remains after isolating the consumer request
helper and installing real dependencies.

Evidence:

- `reports/evidence/generated-minimal/swr-implicit-any.query.ts`
- `reports/evidence/commands/TSC-SWR-MIN-TS56.json`
- `reports/evidence/commands/TSC-SWR-MIN-TS6.json`
- `reports/evidence/commands/TSC-SWR-MIN-TS7.json`
- corresponding stdout/stderr files under `reports/evidence/failures/`

## Suggested direction

Explicitly annotate the fetcher key parameter with the generated query-key
type, or structure the `useSWR` call so the callback is contextually typed.
