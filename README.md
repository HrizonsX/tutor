# Browser Cognitive Overlay

Browser Cognitive Overlay is a browser extension prototype for proactive learning support while reading technical pages. It observes the current reading fragment, combines behavior signals with learning memory, and shows a short overlay only when intervention policy says the prompt is likely to help.

## Development

The extension is enabled by default when the unpacked extension is installed.

For a quick visible smoke test, open a technical article and select a short term such as
`KL divergence`, `KV cache`, or `Thucydides Trap`. The overlay is intentionally
suppressed for idle pages, long code selections, and generic text.

Run tests:

```bash
npm test
```

Run the local gateway development stub:

```bash
npm run gateway:dev
```

This starts the local gateway on `http://127.0.0.1:17321` with health and
memory endpoints.

### Pairing the extension with the gateway

The gateway requires a pairing token by default; requests without the right
token are rejected with `local_gateway_pairing_rejected`. On startup the dev
script resolves the token in this order:

1. `BCO_GATEWAY_TOKEN` environment variable, if set.
2. The `gateway-pairing-token` file inside the gateway memory directory
   (`.bco-memory/` by default, or `BCO_GATEWAY_MEMORY_DIR`).
3. Otherwise a fresh random token is generated and saved to that file
   (owner-only permissions). The log prints the file path — the token value
   itself is never logged.

To pair, copy the contents of the `gateway-pairing-token` file into the
`Pairing token` field on the extension options page. Until a token is
configured, the options page shows the connection as unpaired and the
extension does not send requests to the gateway. The gateway also rejects
cross-site browser requests (disallowed `Origin`), non-JSON POST bodies, and
request bodies larger than 1 MB.

To smoke-test overlay rendering without wiring a real Agent
provider yet, run:

```bash
npm run gateway:stub
```

The stub adds development-only explain/rewrite responses while reusing the
existing local gateway server, handler, and memory store.

The gateway now uses a persistent Local Memory Store by default. It writes a
raw JSONL event ledger and derived summary snapshots under `.bco-memory/` in
the working directory unless `BCO_GATEWAY_MEMORY_DIR` points somewhere else:

```powershell
$env:BCO_GATEWAY_MEMORY_DIR = "C:\Users\Administrator\.bco-memory"
npm run gateway:dev
```

For isolated tests or throwaway demos, run the gateway with in-memory storage:

```bash
npm run gateway:dev -- --memory-store=memory
```

### Layered memory MVP

The default development gateway still uses the SQLite-backed Local Memory Store
so existing local smoke tests and demos do not require infrastructure. The
first layered-memory MVP can be selected explicitly:

```bash
npm install
```

```powershell
$env:BCO_GATEWAY_MEMORY_REPOSITORY = "layered"
$env:BCO_GATEWAY_POSTGRES_URL = "postgres://bco:<password>@127.0.0.1:5432/bco"
$env:BCO_GATEWAY_REDIS_URL = "redis://127.0.0.1:6379/0"
$env:BCO_GATEWAY_VECTOR_RECALL_MODE = "disabled"
npm run gateway:dev
```

In this MVP, Postgres is the intended durable source of truth, Redis is a
short-lived session view, and vector recall is behind an adapter boundary. The
checked-in test path uses deterministic in-memory fakes so CI and local unit
tests do not need live Postgres or Redis. If layered mode is selected without
Postgres configuration, memory APIs return a structured unavailable result
instead of silently falling back.

Milvus/Zilliz, Neo4j, Kafka, and Debezium are intentionally deferred. The first
projection path is a Postgres outbox plus polling worker boundary; CDC and graph
projection can be added after the layered repository and recall contract settle.

#### Layered integration tests

Unit tests use deterministic in-memory fakes and never need live
infrastructure. To run the optional live integration tests against real
Postgres and Redis, start the bundled containers and export the `BCO_TEST_*`
variables (distinct from the runtime `BCO_GATEWAY_*` variables; see
`.env.example`):

```powershell
npm run db:up
$env:BCO_TEST_POSTGRES_URL = "postgres://bco:bco@127.0.0.1:5432/bco"
$env:BCO_TEST_REDIS_URL = "redis://127.0.0.1:6379/0"
npm run test:integration
npm run db:down
```

The round-trip test writes an event through one repository instance and
asserts a brand-new instance over the same Postgres hydrates and recalls it.
CI runs this job on pushes to `main` only, so pull requests are not blocked
by infrastructure.

Layered troubleshooting:

- `layered_postgres_unconfigured`: set `BCO_GATEWAY_POSTGRES_URL`, or switch
  `BCO_GATEWAY_MEMORY_REPOSITORY` back to `sqlite`/`memory` for fallback mode.
- `redis_session_write_failed`: durable writes remain in Postgres, but immediate
  session continuity and short-lived suppression are degraded until Redis is
  reachable again.
- `vector_recall_disabled`: exact memory, session context, and active relations
  still work; semantic recall waits for a future Milvus/Zilliz adapter.
- Outbox lag in diagnostics means derived projections may be stale; raw events
  remain the evidence source and queries should report degraded freshness rather
  than inventing summaries.

The persistent store keeps raw learning events separate from derived summaries.
Memory summaries include evidence event ids, timestamps, uncertainty, and
summarizer metadata.

What leaves the browser, precisely:

- Learning event path: events are hashed at the content boundary before they
  reach the gateway — contexts carry `pageOrigin`, `pagePathHash`, and
  `titleHash` instead of the raw URL or page title, and never full page text.
- Explanation request path: provider requests intentionally include the
  trimmed current reading fragment (`minimalContext.text`, bounded by
  `privacy.maxContextChars`) and the user's selected text, because the
  provider needs them to explain the concept in context. They do not include
  the raw page URL or title (only origin + hashes), full page text, memory
  event payloads, or pairing/provider tokens.
- Page-derived fields are declared untrusted content in every provider system
  prompt, and provider-proposed relation text is stripped of control
  characters and instruction markers before persistence.

Concept-naming diagnostics (`bcoLastDecision`, `bcoLastAgentResult`) and the
page-dispatchable debug/enable channels (`bco:debug-show`, `bco:enable`,
`data-bco-enabled`) are dev-mode only: with `devMode` off (the default), any
web page sees at most the coarse `bcoState` marker, never the concepts the
user is reading.

To route through a real OpenAI-compatible provider from the local gateway, keep
the extension pointed at the gateway and configure provider settings in the
gateway process environment or from the extension options page:

```powershell
$env:BCO_GATEWAY_EXPLAIN_ENABLED = "true"
$env:BCO_GATEWAY_EXPLAIN_PROVIDER = "custom"
$env:BCO_GATEWAY_EXPLAIN_ADAPTER = "openai-compatible"
$env:BCO_GATEWAY_EXPLAIN_ENDPOINT = "https://api.deepseek.com"
$env:BCO_GATEWAY_EXPLAIN_TOKEN = "<provider-api-token>"
$env:BCO_GATEWAY_EXPLAIN_MODEL = "deepseek-v4-flash"
npm run gateway:dev
```

The options page can edit two classes of configuration:

- Browser-local settings: overlay enablement, inference thresholds, composer
  limits, privacy bounds, and the local gateway endpoint/pairing token. These
  are stored in `chrome.storage.local` and pushed to the active background
  service without restarting the extension.
- Gateway-owned runtime settings: explain provider, embedding provider,
  relation proposer provider, and cognitive memory recall/report policy. These
  are sent to the paired gateway through `/config`, redacted on reads, and
  applied to the next relevant request when the field is hot-updatable.

Gateway host/port, memory store mode/path, schema version, and destructive
maintenance fields are reported as restart-required. They are not claimed as
hot-applied by `/config`.

Provider routing fields submitted through `/config` are validated before they
apply: endpoints must be `http(s)` URLs, chat/embedding paths must be relative
paths starting with `/`, and adapter/provider values must belong to the known
set. To further restrict which hosts provider traffic may be routed to, set a
comma-separated allowlist before starting the gateway:

```powershell
$env:BCO_GATEWAY_ALLOWED_PROVIDER_HOSTS = "api.deepseek.com,api.openai.com"
npm run gateway:dev
```

Endpoints outside the allowlist are rejected with
`runtime_config_endpoint_host_not_allowed`. Successful provider route changes
are logged as `config_provider_route_changed` with only the role, endpoint
host, and token presence — never the token value or full URL.

Mutable gateway config is persisted under `.bco-memory/gateway-runtime-config.json`
by default. Set `BCO_GATEWAY_CONFIG_PATH` to keep it elsewhere.

Relation proposal discovery reuses the explain provider by default once the
explain provider is enabled. To force it on or off explicitly, use options or
set:

```powershell
$env:BCO_GATEWAY_RELATION_PROPOSER_ENABLED = "true"
$env:BCO_GATEWAY_RELATION_PROPOSER_REUSE_EXPLAIN = "true"
npm run gateway:dev
```

When enabled, a successful provider-backed `/explain` or `/rewrite` persists the
explanation first, returns the user-visible response, and then schedules
relation discovery. The relation proposer returns structured proposals only;
the memory store gates every candidate before any active relation can later be
recalled as `memoryBridges`.

Before the provider call, the runtime also performs a bounded pre-recall pass:
it builds a Top-K candidate set from recent concepts, concept projections, and
SQLite FTS indexed memory text, asks the relation proposer whether any prior
learned concept is relevant to the current target, and injects accepted
temporary bridges into the same explanation request. If the provider succeeds,
those pre-recall relations are committed as active relations for future
queries. This lets a first explanation for a new target such as `常太` carry a
previously learned `枇杷` memory when the proposer finds the relation useful.

For a browser-visible persistent smoke test of this path:

```powershell
$env:BCO_PRE_RECALL_SMOKE_MEMORY_DIR = ".bco-memory"
$env:BCO_PRE_RECALL_SMOKE_TARGET = "GraphQL"
$env:BCO_PRE_RECALL_SMOKE_MEMORY = "Relay"
npm run smoke:pre-recall
```

Open `http://127.0.0.1:17931/`; the page should show an explanation that uses
the prior memory, and `.bco-memory/local-memory.sqlite` should contain the new
active relation in `relation_proposals`.

### Dual-lane streaming explanations

When the paired gateway advertises `streaming_explanation`, content requests use
`/explain/stream-session` instead of waiting for the old single `/explain`
response. The session has two lanes:

- `direct`: streams a plain-text explanation of the current concept immediately
  and does not receive recalled memory.
- `association`: runs gateway-owned memory recall in parallel. If reliable
  bridges are found, it streams a relationship-focused explanation using at
  most three recalled concepts labelled as local learning context. If recall has
  no reliable bridge, the overlay keeps the second lane and shows `暂无关联`.

The extension still falls back to the non-stream `/explain` path when the
gateway or provider does not support streaming. Gateway logs include stream
session start, lane final/error, and cancellation milestones, but omit provider
tokens, pairing tokens, raw page text, raw streamed text, and raw memory
evidence ids. Diagnostics expose only lane status, normalized failure reasons,
and recall counts for the latest streaming session.

## Architecture

- `src/reading-context.js`: visible fragment discovery and current context scoring
- `src/behavior.js`: dwell, revisit, selection, pause, and inactivity signals
- `src/concepts.js`: concept extraction, alias normalization, and explanation text
- `src/inference.js`: multi-signal intervention priority with cooldown suppression
- `src/overlay.js`: low-interruption overlay UI
- `src/content.js`: content-script coordinator

The browser extension forwards immediate page context and interaction events to
the local gateway. Durable memory, profile derivation, summarization, and
provider request memory injection are owned by Gateway / Local Agent Runtime.
