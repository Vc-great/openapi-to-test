# TS Request service drops declared header and cookie parameters

- Severity: P2
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: plugin-ts-request
- Stable reproduction: yes

## Fixture

`GET /users/{userId}` contains required header `X-Tenant` and optional cookie
`session`, in addition to path/query parameters.

## Expected

The generated request function exposes and transmits required/optional
header/cookie values according to OpenAPI.

## Actual

The types file correctly declares `GetUserHeaderParams` and
`GetUserCookieParams`, but `getUserService` imports/accepts only path and query
types and never maps header/cookie values into the request.

Evidence:
`scenarios/generators/generated/ts-request/users/get-user.types.ts` and
`scenarios/generators/generated/ts-request/users/get-user.service.ts`.

## Suggested direction

Include generated header/cookie argument types in service signatures and map
them into Axios `headers`/cookie handling with explicit documented semantics.
