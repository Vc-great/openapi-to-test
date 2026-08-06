# Default `openapi init` template cannot generate because SWR and Vue Query collide

- Severity: P1
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: CLI / packaged init template
- Stable reproduction: yes

## Minimal reproduction

Run `openapi init` in a new ESM project and use the generated configuration
against any document with a GET or POST operation.

## Expected

The documented default initializer produces a configuration that can complete
its first generation.

## Actual

The template enables both `pluginSWR()` and `pluginVueQuery()`. Both emit paths
such as `users/use-get-user.query.ts` and
`users/use-create-user.mutation.ts` with different content. Core correctly
rejects this with `ARTIFACT_PATH_CONFLICT` and exit 1.

Evidence: `init-template.config.ts`,
`reports/evidence/commands/INIT-004.json`, and
`reports/evidence/failures/INIT-004.stderr.txt`.

## Suggested direction

Choose one query framework in the default template, generate isolated output
subdirectories, or expose a documented mutually-exclusive initializer choice.
