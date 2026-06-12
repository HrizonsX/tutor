# Contributing

This project is developed spec-first and test-gated, by humans and coding
agents alike. The binding rules live in [AGENTS.md](AGENTS.md) — they apply
to human contributors too. This file is the quickstart.

## Setup

```bash
# Node >= 22.5 (node:sqlite fallback requires it)
npm ci
npm run check        # typecheck + full test suite — the merge gate
```

Optional, for the layered-memory integration path:

```bash
npm run db:up        # postgres:16 + redis:7 via docker compose
cp .env.example .env # BCO_TEST_POSTGRES_URL / BCO_TEST_REDIS_URL
npm run test:integration
```

## Running the system

```bash
npm run gateway:dev   # real gateway on 127.0.0.1:17321 (pairing token printed/persisted)
npm run gateway:stub  # gateway with a stub explain provider, no LLM needed
```

Load the extension: Chrome → `chrome://extensions` → Developer mode →
"Load unpacked" → repository root. Pair it by pasting the gateway token into
the options page.

## Making a change

1. Behavior change or new capability → create an openspec change first
   (see "Spec-driven workflow" in AGENTS.md). Pure refactors skip this but
   must keep the characterization and boundary tests green unchanged.
2. Implement with tests in the same PR. Tests you break get updated in the
   same PR — never deleted to pass.
3. `npm run check` green, PR checklist filled (the template asks for exactly
   what CI and the repo invariants require).

## CI overview

| Job | Gate |
| --- | --- |
| `test` (ubuntu, Node 22/24) + `test-windows` | Full `node --test` suite |
| `typecheck` | `tsc --checkJs` over `src/` |
| `guards` | Completed openspec changes must be archived |
| `audit` | `npm audit` (runtime deps, high+) + registry signatures |
| `integration` | Layered memory against real Postgres/Redis (main pushes + manual dispatch) |
