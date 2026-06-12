## What

<!-- One paragraph: the behavior change, not the file list. -->

## Why

<!-- The problem or spec requirement this serves. Link the openspec change if one exists. -->

## Verification

- [ ] `npm run check` is green locally (typecheck + full test suite)
- [ ] Touched layered/Postgres/Redis paths → `npm run db:up && npm run test:integration` passed
- [ ] Touched `manifest.json` or the content-script load path → loaded the unpacked extension in Chrome once

## Discipline

- [ ] Behavior changes carry an openspec change; fully completed changes are archived under `openspec/changes/archive/` with delta specs merged into `openspec/specs/`
- [ ] Tests this change breaks are updated **in this PR** with rationale — none deleted or weakened to pass
- [ ] No privacy red-line violations: no provider/pairing tokens, raw page text, or raw URLs in logs, diagnostics, or fixtures
- [ ] Trust-domain boundaries respected (`test/module-boundaries.test.js` untouched and green)
