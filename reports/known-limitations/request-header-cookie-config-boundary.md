# TS Request header/cookie client-configuration boundary

- Classification: `KNOWN_LIMITATION`
- Affected version: `openapi-to@4.0.0-rc.3`
- Structured case: `SEM-001`

## Current public capability

The generated types include OpenAPI header and cookie parameter types. The
current TS Request function signature does not promise separate header or
cookie arguments. It does expose:

```ts
requestConfig?: Partial<AxiosRequestConfig>
```

Evidence:

- `reports/evidence/generated-minimal/request-config-boundary.types.ts`
- `reports/evidence/generated-minimal/request-config-boundary.service.ts`
- `reports/evidence/generated-minimal/request-config-boundary.consumer.ts`

## What callers can do through requestConfig

Callers can pass Axios client configuration such as `headers`,
`withCredentials`, `withXSRFToken`, and other supported request options. The
strict consumer fixture compiles an example using these properties in every
TypeScript matrix tier.

## What is not automatic

This version does not promise automatic OpenAPI Cookie parameter
serialization, browser/Node Cookie transport, or complete header merge
precedence. The acceptance harness does not fabricate those behaviors.

## Possible future enhancement

A future plugin contract could add explicit, documented header/cookie
arguments and define serialization and merge semantics. That would be a new
capability, not a correction for a currently promised parameter surface.
