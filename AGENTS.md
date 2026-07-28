# Repository instructions

- This repository verifies the published `openapi-to` npm package from a real
  consumer's perspective.
- `src/api/generated/**` is owned by the generator. Never edit generated files
  manually, except for a controlled drift test that restores them immediately.
- Put hand-written code outside the generated directory, such as
  `src/api/custom` or `src/consumer-usage.ts`.
- The current phase has exactly one OpenAPI target: `manual-full`.
- Run `pnpm verify` after changing the fixture, generator configuration, or
  dependencies.
- Always consume the npm package. Do not substitute an upstream source path,
  workspace dependency, local link, or local tarball.
- Do not weaken strict TypeScript settings to make verification pass.
- Do not commit, push, tag, or publish unless the user explicitly requests it.
- This phase does not include MCP, AI generation, CI workflows, or additional
  OpenAPI targets.
