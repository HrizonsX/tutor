## ADDED Requirements

### Requirement: Prompt Labels Related Memories
The provider adapter SHALL describe `relatedMemories` as historical user context only when constructing structured explain or rewrite prompts.

#### Scenario: Field guide warns about related memories
- **GIVEN** a provider request contains `memoryPacket.relatedMemories`
- **WHEN** the OpenAI-compatible chat request body is constructed
- **THEN** the user message field guide SHALL identify related memories as local user history context
- **AND** it SHALL state that related memories are not factual sources.

#### Scenario: System instruction preserves fact boundary
- **WHEN** the provider adapter builds explain or rewrite chat messages
- **THEN** the system or user instructions SHALL tell the model to use related memories only to adjust explanation angle, avoid repetition, or connect to prior user exposure
- **AND** the instructions SHALL forbid relying on related memories to establish current facts.

### Requirement: Fact-Sensitive Related Memory Caution
The provider adapter SHALL preserve fact-sensitive caution when related memories are present.

#### Scenario: Fact-sensitive request retains caution
- **GIVEN** the current target or related memories are marked fact-sensitive
- **WHEN** the adapter builds the provider request
- **THEN** the request SHALL preserve `related_memory_is_not_fact_source` cautions
- **AND** it SHALL not describe related memory summaries as source material or verified evidence.
