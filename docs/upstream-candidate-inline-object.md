# Upstream candidate: optional inline object generation

Observed with `openapi-to@4.0.0-rc.0` and `typescript@5.6.2`.

Adding this optional inline object to `WidgetDetails.properties` in
`fixtures/basic/openapi.yaml` produces generated code that does not compile:

```yaml
dimensions:
  type: object
  required:
    - width
    - height
  properties:
    width:
      type: integer
      minimum: 1
    height:
      type: integer
      minimum: 1
    unit:
      type: string
      enum:
        - cm
        - in
```

The generated Zod model uses the undefined identifier `zz.object(...)`, and the
generated TypeScript model refers to
`WidgetDetailsdimensionsUnitEnumValue` while importing
`WidgetDetailsDimensionsUnitEnumValue`. `pnpm typecheck` therefore reports
TS2304 and TS2552.

The active verification fixture does not use this unsupported combination. It
still covers an optional nested object through the optional `Widget.details`
and `CreateWidgetRequest.details` references, and covers string enums in
`Widget.status` and `WidgetDetails.category`.

No generated file or installed package was patched to hide this behavior.

## Related optional `$ref` behavior

The active fixture leaves `Widget.details`, `CreateWidgetRequest.metadata`, and
`CreateWidgetRequest.details` out of their schemas' `required` arrays. The Zod
output correctly appends `.optional()`, but the generated TypeScript interfaces
emit these referenced properties without `?`. This does not break strict
compilation, but it makes the TypeScript request and response types stricter
than the OpenAPI contract. The consumer example supplies those properties so
the rest of the published-package verification can run without editing
generated output.
