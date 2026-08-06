# `openapi init --json` does not produce one JSON document on stdout

- Severity: P3
- Affected version: `openapi-to@4.0.0-rc.3`
- Area: CLI
- Stable reproduction: yes

## Command

`openapi init --json` in a new project, and again after the config exists.

## Expected

stdout contains exactly one value accepted by `JSON.parse`; operational logs
are on stderr.

## Actual

Successful init prints human progress only, so stdout is not JSON. Repeated
init correctly emits a single JSON error document; the defect is limited to
the successful path.

Evidence: `reports/evidence/commands/INIT-003.json` and
`reports/evidence/failures/INIT-003.{stdout,stderr}.txt`.

## Suggested direction

Route progress to stderr and emit one success/error JSON envelope from every
init path when `--json` is active.
