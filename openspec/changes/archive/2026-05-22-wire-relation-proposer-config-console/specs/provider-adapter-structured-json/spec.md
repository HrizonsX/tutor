## ADDED Requirements

### Requirement: Structured Relation Proposal Adapter Calls
The provider adapter SHALL support OpenAI-compatible structured JSON calls for relation proposal requests.

#### Scenario: Relation proposal body is built
- **WHEN** the runtime constructs a relation proposal provider request
- **THEN** the adapter SHALL build messages containing target concept, current context hash, selected daily memory blocks, allowed relation types, allowed basis values, and proposal policy
- **AND** the request SHALL use the relation proposal schema when structured output mode is `json_schema`.

#### Scenario: Relation proposal output is parsed
- **WHEN** a relation proposal provider returns JSON content
- **THEN** the adapter SHALL parse and validate `relationCandidates`, `rejectedCandidates`, and optional `versionMetadata`
- **AND** invalid JSON or invalid schema SHALL produce structured provider parse or schema failure results.

### Requirement: Relation Proposal Prompt Preserves Proposal Boundary
Relation proposal adapter prompts SHALL describe model output as proposals for runtime gating rather than active memory writes.

#### Scenario: Prompt is constructed
- **WHEN** the adapter builds a relation proposal request
- **THEN** the system or user instructions SHALL state that relation output is only a proposal for runtime gating
- **AND** the prompt SHALL forbid unsupported relation types and require source date ownership to be preserved.

#### Scenario: No supported relation exists
- **WHEN** prior daily memory blocks contain no useful supported relation for the target
- **THEN** the provider response contract SHALL allow rejected candidates
- **AND** the runtime SHALL not require any relation candidate to be returned.
