# Agent Guide — Browser Cognitive Overlay

Read this before changing anything. This repository is built for spec-driven,
test-gated development; the rules below are what make autonomous changes safe.
When this document and the code disagree about a fact, the code wins — then
fix the document.

## What this is

A low-interruption reading companion in two trust domains:

- **MV3 browser extension**: watches reading signals (dwell, revisit,
  selection), scores intervention priority, and shows a small explanation
  overlay only when content + behavior/memory evidence justify it.
- **Local Node gateway** (`127.0.0.1:17321`): owns durable learning memory
  (SQLite, optionally layered Postgres/Redis), pre-recall relation discovery,
  and all LLM provider dispatch. The browser never talks to a model provider
  directly.

Plain ESM JavaScript end to end. No build step, no bundler, no test
framework — `node:test` only. Types are JSDoc checked by `tsc --checkJs`.

## Map

| Path | Role |
| --- | --- |
| `src/shared/` | The **only** cross-domain surface: `contracts.js` (enums/reasons), `config.js`, `privacy.js`, `concepts.js`, `async-control.js`, `redact-util.js`, `collection-util.js` |
| `src/extension/` | MV3 runtime: `content.js` (coordinator), `reading-context.js`, `behavior.js`, `inference.js` (scoring), `overlay.js`, `composer.js`, `agent-service.js` + `background*.js` (service worker), `provider-registry.js`, `diagnostics.js`, `options.*` |
| `src/gateway/` | Node runtime: `local-gateway.js` (thin HTTP), `local-agent-runtime.js` (orchestration), `provider-runtime.js` (dispatch), `memory-runtime.js` (store facade), `local-memory-store.js`, `runtime-explain-pipeline.js`, `provider-adapters.js`, `runtime-config.js`, `cognitive-memory.js`, layered repository modules |
| `test/` | Behavior tests; notably `module-boundaries.test.js` (layer rules), `local-gateway-characterization.test.js` (HTTP protocol pin), `layered-memory-integration.test.js` (env-gated, real Postgres/Redis) |
| `openspec/specs/` | Behavior contracts per capability — the source of truth for *what the system promises* |
| `openspec/changes/` | In-flight changes; `archive/` holds completed ones |
| `scripts/` | `local-gateway-dev.js` (runnable gateway), `check-openspec-archived.js` (CI guard) |

## Commands

| Command | When |
| --- | --- |
| `npm run check` | **The merge gate.** Typecheck + full suite. Green before every commit. |
| `npm test` | Full suite only |
| `node --test test/<file>` | Focused iteration |
| `npm run db:up && npm run test:integration` | Whenever you touch layered/Postgres/Redis paths |
| `npm run gateway:dev` / `gateway:stub` | Run the real gateway / with a stub explain provider |
| `npm run typecheck` | `tsc` over `src/` (tests are not typechecked — do not "fix" that casually; they lean on stubs) |

## Non-negotiable invariants

1. **Privacy red lines.** No provider tokens, pairing tokens, raw page text,
   raw URLs, or raw titles in logs, diagnostics, test fixtures, or specs.
   Learning events leave the content boundary with hashed URL/title metadata
   (`safeUrlMetadata`/`hashString`). The README privacy section and the
   privacy tests are a contract: changing them requires calling it out
   explicitly in the change description.
2. **Trust-domain boundaries.** `extension/` and `gateway/` may import only
   their own layer and `shared/`; `shared/` imports only itself.
   `test/module-boundaries.test.js` enforces this — if it fails, your design
   is wrong, not the test.
3. **`web_accessible_resources` stays `src/extension/*.js` + `src/shared/*.js`.**
   Gateway internals (prompt templates, schema) must never be web-readable.
4. **The HTTP gateway stays thin.** `local-gateway.js` owns auth, request
   guards, routing, status mapping, lifecycle, redacted logging — nothing
   else. Endpoint behavior belongs in `local-agent-runtime.js`; provider
   dispatch in `provider-runtime.js`; store access behind `memory-runtime.js`.
5. **Honest degradation.** Failures return structured
   `{ status: "unavailable", reason: <normalized> }` results — never thrown
   across the protocol boundary, never silently swallowed, never replaced by
   fabricated success. UI shows honest empty states, never invented telemetry.
6. **Ledger integrity.** Learning-memory events are append-only; never write
   `EXPLANATION_SHOWN`/`PARAGRAPH_PROMPTED` for an explanation the user
   dismissed before it arrived (the prompt-epoch guard in `content.js` exists
   for exactly this).
7. **Contracts live in `src/shared/contracts.js`.** Cross-boundary enums,
   reasons, message types, and capability names come from there — no ad-hoc
   string literals on either side of the protocol.
8. **Dependency discipline.** No new runtime dependencies. `better-sqlite3`,
   `pg`, `redis` are the whole runtime dependency set, each with a working
   fallback (`node:sqlite`; layered mode degrades). Dev tooling stays
   `typescript` + `@types/node`. Milvus/Neo4j/Kafka are deliberately
   deferred — do not add them "while you're at it".
9. **Do not redo rejected or completed work.** CJK recall already works
   (n-gram FTS expansion — see IMPROVEMENT-PLAN.md §4, verified twice).
   IMPROVEMENT-PLAN.md is a historical planning document: all 16 items
   landed in June 2026; treat it as context, not a to-do list.

## Spec-driven workflow (openspec)

Behavior changes and new capabilities go through an openspec change:

1. Create `openspec/changes/<change-name>/` with `.openspec.yaml`
   (`schema: spec-driven`, `created: <date>`), `proposal.md` (Why / What
   Changes / Capabilities / Impact), `tasks.md` (checkboxed, every behavior
   task paired with a test task), optional `design.md` for decisions worth
   defending, and `specs/<capability>/spec.md` deltas
   (`## ADDED Requirements` / requirement + scenario format).
2. Implement with tests in the same change. Tick tasks `- [x]` as they land.
3. When **all** tasks are complete: move the directory to
   `openspec/changes/archive/YYYY-MM-DD-<change-name>/` and append the delta
   requirements into the matching `openspec/specs/<capability>/spec.md`.
   CI (`check-openspec-archived.js --strict`) fails the branch while a fully
   completed change sits unarchived.

Pure refactors with zero behavior change (and bug fixes pinned by existing
specs) do not need a change directory — but they do need the characterization
and boundary tests to pass unchanged.

## Testing rules

- Behavior tests over source-regex tests. Deterministic by construction:
  inject `now()`, use the fake timers/DOM, never sleep on wall-clock. Shared
  fakes (the fake DOM) live in `test/helpers/`; discovery is the explicit glob
  `test/**/*.test.js`, so helper and fixture modules under `test/` are imported
  by tests, never run as empty test files.
- A change that breaks an existing test must update that test **in the same
  commit**, with the reasoning in the commit message. Never delete or weaken
  a test to get green.
- Characterization nets (`local-gateway-characterization.test.js`) must pass
  **unchanged** through refactors of what they pin. If you need to edit one,
  you are changing protocol — that needs an openspec change.
- Negative paths get the same weight as happy paths (auth rejects, guards,
  degradation, cancellation).
- Integration tests stay env-gated (`BCO_TEST_POSTGRES_URL`/`BCO_TEST_REDIS_URL`)
  so the default suite never needs infrastructure.

## Verification ritual

- `npm run check` green before every commit — no exceptions, no "it's just a
  doc change" (docs ship in the same gate).
- Touched layered/Postgres/Redis code → run the integration suite against
  `docker compose` locally; CI runs it on `main` pushes only.
- Touched `manifest.json` or the content-script load path → load the unpacked
  extension in Chrome once and say so in the commit message.

## Environment gotchas (the maintainer develops on Windows)

- **Never** round-trip files containing CJK text through PowerShell
  `Get-Content`/`Set-Content` — Windows PowerShell 5.1 reads UTF-8 as GBK and
  corrupts it. Use editor tools or one-off Node scripts (`node script.mjs`)
  for any file with non-ASCII content. This has caused real corruption twice.
- Line endings are normalized to LF by `.gitattributes`; don't fight it.
- PowerShell 5.1 cannot pass embedded double quotes to native commands
  reliably and has no `&&`. For anything non-trivial, write a temp `.mjs`
  script, run it with `node`, delete it.

## Git conventions

- Imperative subject line; body explains *why* and records any deviation from
  plan or spec discovered during implementation. Reference the openspec
  change name when one exists.
- Repository-level identity: `HrizonsX`.
- Do not push. The owner pushes; agents commit locally.
