## ADDED Requirements

### Requirement: Runtime Owns Association Graph
Gateway / Local Agent Runtime SHALL own memory association edge creation, persistence, retrieval, and summarization.

#### Scenario: Browser does not create association edges
- **WHEN** the browser extension sends explain, rewrite, memory event, or feedback requests
- **THEN** it SHALL NOT create, cache, query, or persist memory association edges
- **AND** Gateway / Local Agent Runtime SHALL be the only component that mutates or retrieves the association graph.

#### Scenario: Gateway derives edges after provider success
- **GIVEN** a provider explanation succeeds through Gateway / Local Agent Runtime
- **WHEN** the explanation version and memory candidates are persisted
- **THEN** the runtime SHALL be able to run the Memory Association Linker from persisted runtime evidence.

### Requirement: Gateway Injects Related Memories
Gateway / Local Agent Runtime SHALL inject bounded related memories into provider requests when local memory retrieval returns them.

#### Scenario: Provider request includes related memories
- **GIVEN** memory retrieval returns related memories for an explain request
- **WHEN** Gateway / Local Agent Runtime dispatches the provider request
- **THEN** the internal provider request SHALL include `memoryPacket.relatedMemories`
- **AND** each related memory SHALL carry the non-fact-source caution.

#### Scenario: Browser-provided related memories are ignored
- **GIVEN** a browser request includes `relatedMemories`, `memoryEdges`, or another browser-computed memory graph field
- **WHEN** Gateway / Local Agent Runtime normalizes the request
- **THEN** those browser-provided memory fields SHALL be ignored
- **AND** only runtime-owned memory retrieval SHALL populate provider memory context.
