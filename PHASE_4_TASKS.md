# Phase 4: Conversational AI Intelligence & Knowledge Graph — Task List

**Created:** 2026-10-28
**Status:** In Progress (Backend core modules, LLM provider routing, agent services, API routers, graph integration, and frontend components implemented; UI shell wiring and test suites pending)
**Objective:** Layer interactive conversational exploration, automated recruiter deliverables (executive briefs and gap-targeted interview questions), and graph-based entity navigation on top of the deterministic scoring and ranking pipeline delivered in Phase 3. All LLM-generated text must be strictly grounded in `CandidateContext` data; fabrication of unevidenced facts is disallowed.

Phase 3 Tasks 1.1–7.5 are complete. Phase 4 consumes the existing `CandidateContext` registry, `CandidateMatchResult`, `RequirementCoverage` observations, `EvidenceRecord` source URLs, `ResumeClaim` verification states, and all Phase 3 ranking APIs. See [PRD.md](PRD.md) §Phase 4 for functional requirements and [PHASE_3_TASKS.md](PHASE_3_TASKS.md) for the Phase 3 contracts.

> **Design constraints carried into Phase 4:**
> - Source-grounding: every LLM response must cite specific `CandidateContext` fields (claim IDs, evidence record IDs, or requirement IDs). Hallucinated facts that cannot be traced to the context are a hard failure.
> - Tool-call bound: the agent orchestration loop is capped at 5 tool-call iterations per turn to prevent runaway inference.
> - Fail-soft: if the LLM provider (Gemini) is unavailable, the Groq fallback is tried; if both are unavailable, a 503 is returned — the core context, scoring, and ranking APIs must remain unaffected.
> - No graph dependency on core path: `CandidateContext`, scoring, ranking, briefs, and interview questions all operate independently of Neo4j/Cognee. Graph features degrade gracefully when the graph is unavailable.
> - Determinism where applicable: brief and question generation use deterministic temperature=0 settings and fixed prompt templates so outputs are reproducible for the same inputs.
> - The agent must resolve candidate identity before answering candidate-specific questions; it must never assume a candidate from context or previous turns.

---

## Milestone 1: Backend — LLM Provider Abstraction

- [x] **Task 1.1: Define LLM provider interface** — `backend/services/llm/provider.py`
  - Define a `LLMProvider` abstract base class (or Protocol) with a single `async def generate(prompt: str, system: str, temperature: float, max_tokens: int) -> str` method.
  - Define a `LLMProviderError` exception carrying a provider name, status code, and message; raised when a provider returns a non-200 or times out.
  - Define `ProviderName` as a string enum: `gemini`, `groq`, `ollama`.
  - Export all from `backend/services/llm/__init__.py`.

- [x] **Task 1.2: Gemini provider implementation** — `backend/services/llm/gemini.py`
  - Implement `GeminiProvider(LLMProvider)` using the Gemini REST API (`generativelanguage.googleapis.com`).
  - Read `GEMINI_API_KEY` from `backend/config.py` (already uses `pydantic_settings`). Raise `ImproperlyConfigured` on startup if the key is absent.
  - Support `gemini-2.0-flash` as the default model, configurable via `settings.gemini_model`.
  - Map HTTP 429 (rate limit) to `LLMProviderError` with a `retry_after` hint parsed from the response header.
  - On any non-200 response or timeout, raise `LLMProviderError`; never return partial text.

- [x] **Task 1.3: Groq fallback provider** — `backend/services/llm/groq.py`
  - Implement `GroqProvider(LLMProvider)` using the Groq REST API (`api.groq.com`).
  - Read `GROQ_API_KEY` from settings. If absent, `GroqProvider` is disabled: instantiation succeeds but `generate()` immediately raises `LLMProviderError(provider="groq", status_code=503, message="Groq API key not configured")`.
  - Use `llama-3.3-70b-versatile` as the default model, configurable via `settings.groq_model`.

- [x] **Task 1.4: Provider router with automatic fallback** — `backend/services/llm/router.py`
  - `async def generate_with_fallback(prompt: str, system: str, temperature: float = 0.0, max_tokens: int = 2000) -> tuple[str, ProviderName]`
  - Try Gemini first; on `LLMProviderError`, log the failure and retry with Groq.
  - If both fail, raise `LLMProviderError` indicating both providers unavailable.
  - Return the generated text and the provider name that succeeded, so callers can include provenance in responses.
  - Expose a module-level `get_provider_router()` factory that is called once and cached (avoids repeated key reads).

- [x] **Task 1.5: LLM provider unit tests** — `backend/tests/test_llm_provider.py`
  - Mock HTTPX transport for both Gemini and Groq.
  - Verify Gemini response parsing extracts `candidates[0].content.parts[0].text`.
  - Verify Groq response parsing extracts `choices[0].message.content`.
  - Verify fallback triggers on Gemini 500 and succeeds with the Groq mock.
  - Verify both-fail raises `LLMProviderError`.
  - Verify 429 from Gemini is forwarded as `LLMProviderError` with a `retry_after` field.
  - Verify disabled Groq (no API key) raises immediately without a network call.
  - All tests use `MockTransport`; no real network calls.

---

## Milestone 2: Backend — Agent Tools & Orchestrator

- [x] **Task 2.1: Define agent tool schemas** — `backend/services/agent/tools.py`
  - Define each tool as a Pydantic model (for JSON Schema generation) and a corresponding async handler function. Tools:
    - `lookup_candidate(name: str | None, email: str | None) -> list[CandidateSummary]` — calls the existing resolve endpoint logic; returns up to 5 matches.
    - `get_candidate_context(candidate_id: str) -> CandidateContext | BuildingStatus | FailedStatus` — reads from `ContextBuildRegistry`; returns the context or a status object; never blocks.
    - `get_jd_match(candidate_id: str, job_id: str) -> CandidateMatchResult | BuildingStatus` — reads from `MatchStore` or runs the single-candidate pipeline; returns stored or newly computed result.
    - `list_jobs() -> list[JobSummary]` — returns all known job IDs and titles from the seed loader.
    - `get_evidence_for_skill(candidate_id: str, skill: str) -> list[EvidenceRecord]` — returns all evidence records for the candidate where `resolve_skill(record.skill)` matches `resolve_skill(skill)`; empty list if none found or candidate not ready.
  - Each tool handler must never raise; return an error-payload dict on failures.
  - Export a `TOOL_DEFINITIONS: list[dict]` (OpenAI-style function schema list) for inclusion in LLM API calls.

- [x] **Task 2.2: Prompt templates** — `backend/services/agent/prompts.py`
  - `SYSTEM_AGENT`: System prompt for the conversational agent. Instruct the model to: (a) always resolve candidate identity before answering candidate questions, (b) cite source IDs (claim IDs, evidence record IDs) for every factual claim, (c) explicitly state "I don't have evidence for this" rather than inferring, (d) stop after 5 tool calls per turn.
  - `BRIEF_SYSTEM`: System prompt for executive brief generation. Instruction set: produce a structured brief with exactly four sections — Strengths, Evidence Summary, Application History Notes, and Identified Gaps. Each section must reference specific context field values; no invented content.
  - `QUESTIONS_SYSTEM`: System prompt for interview question generation. Instructions: produce 5–10 questions targeted at `not_assessed` and `insufficient_evidence` coverage states and unverified resume claims. Each question must cite the requirement ID or claim ID it targets.
  - All prompts are plain strings in this file. No LLM is called here; this is a data module only.

- [x] **Task 2.3: Agent orchestrator** — `backend/services/agent/orchestrator.py`
  - `async def run_agent_turn(history: list[ChatMessage], user_message: str, job_id: str | None) -> AgentResponse`
  - `ChatMessage` carries `role` (user/assistant/tool), `content`, and optional `tool_call_id`.
  - `AgentResponse` carries `assistant_message: str`, `tool_calls_made: int`, `provider_used: ProviderName`, and `grounding_ids: list[str]` (IDs of claims/evidence/requirements cited in the response).
  - Orchestration loop: (1) assemble context window from history + user message + tool definitions, (2) call `generate_with_fallback`, (3) if the response contains a tool call, execute the tool, append the tool result, (4) repeat up to 5 iterations, (5) return the final text response.
  - If the loop reaches 5 iterations without a text response, return a fixed message: "I've reached the maximum number of steps. Please rephrase your question or ask about a specific candidate."
  - Extract `grounding_ids` by scanning the final response text for patterns matching claim IDs (`CLM-...`), evidence IDs (`EVI-...`), and requirement IDs (`*-REQ-*`).

- [x] **Task 2.4: Brief generator** — `backend/services/agent/brief_generator.py`
  - `async def generate_brief(candidate_id: str, job_id: str | None, reference_date: date) -> CandidateBrief`
  - `CandidateBrief` carries: `candidate_id`, `job_id`, `generated_at` (UTC), `provider_used`, `strengths: str`, `evidence_summary: str`, `application_history_notes: str`, `identified_gaps: str`, and `grounding_ids: list[str]`.
  - Assemble a single structured prompt from: candidate name, headline, top evidence records (up to 10, sorted by computed_weight desc), resume claims with verification states, and — if `job_id` is provided — the `CandidateMatchResult` coverage list.
  - Call `generate_with_fallback` with `temperature=0.0` and `BRIEF_SYSTEM` prompt.
  - Parse the four sections from the response using fixed header markers (`## Strengths`, `## Evidence Summary`, `## Application History Notes`, `## Identified Gaps`).
  - If a section is missing from the response, set its value to `"[Not generated — model did not produce this section.]"` and log a warning.
  - Never call the LLM if the candidate context is not ready; raise `ValueError("Context not ready")`.

- [x] **Task 2.5: Interview question generator** — `backend/services/agent/question_generator.py`
  - `async def generate_interview_questions(candidate_id: str, job_id: str, reference_date: date) -> InterviewQuestionSet`
  - `InterviewQuestionSet` carries: `candidate_id`, `job_id`, `generated_at`, `provider_used`, `questions: list[InterviewQuestion]`, `grounding_ids: list[str]`.
  - `InterviewQuestion` carries: `question_text: str`, `target_type: Literal["unverified_claim", "coverage_gap", "history_probe"]`, `source_id: str` (the claim ID or requirement ID that motivated the question), `rationale: str` (1–2 sentences explaining why this question is asked).
  - Assemble the prompt from: unverified claims (verification_state == "unverified"), `not_assessed` and `insufficient_evidence` coverage items for the given job, and any negative interview_feedback entries from the candidate context.
  - Call `generate_with_fallback` with `temperature=0.0`.
  - Parse the JSON array from the LLM response. If parsing fails, return an empty question set with a warning in `grounding_ids`.
  - Require a `job_id` (unlike brief, questions are always job-specific). Raise `ValueError("job_id required")` if absent.
  - Require the candidate context to be ready. Raise `ValueError("Context not ready")` if not.

- [x] **Task 2.6: Agent service unit tests** — `backend/tests/test_agent_services.py`
  - Orchestrator: mock `generate_with_fallback`; verify a single-turn response with no tool calls returns immediately; verify `lookup_candidate` tool call is executed and the result is appended to history before the next LLM call; verify the 5-iteration cap returns the fixed message.
  - Brief generator: mock `generate_with_fallback` with a response containing all four section headers; verify all four fields are populated; verify missing section falls back to the placeholder string; verify `ValueError` when context not ready.
  - Question generator: mock a JSON-array response; verify `InterviewQuestion` fields are populated; verify empty list on JSON parse failure; verify `ValueError` when `job_id` absent; verify `ValueError` when context not ready.
  - Tool handlers: verify `lookup_candidate` returns matches for seeded data; verify `get_candidate_context` returns `BuildingStatus` when build is pending; verify `get_evidence_for_skill` returns only matching-skill records.
  - All tests use controlled fixture contexts and mock LLM transports; no live calls.

---

## Milestone 3: Backend — New API Endpoints

- [x] **Task 3.1: Agent chat router** — `backend/routers/agent.py` (new file)
  - Register under `/api/v1/agent` in `backend/main.py`. Add an unprefixed alias `/agent`.
  - Verify no route conflicts with existing candidate, JD, or admin routers.

- [x] **Task 3.2: Chat endpoint** — `POST /api/v1/agent/chat`
  - Accept JSON body: `{ "message": str, "history": list[ChatMessage], "job_id": str | None }`.
  - `message` is required and must be at least 1 character.
  - `history` is optional; defaults to empty list. Maximum 20 history entries; truncate older entries if exceeded (keep the most recent 20).
  - Call `run_agent_turn(history, message, job_id)` and return `AgentResponse`.
  - Return 422 if `message` is missing or blank.
  - Return 503 if both LLM providers fail, with a body: `{ "detail": "AI providers unavailable", "provider_errors": [...] }`.
  - Add unprefixed alias.

- [x] **Task 3.3: Executive brief endpoint** — `POST /api/v1/candidates/{candidate_id}/brief`
  - Accept JSON body: `{ "job_id": str | None, "reference_date": str | None }`.
  - `reference_date` defaults to today's UTC date if omitted.
  - Return a `CandidateBrief` object on success (200).
  - Return 404 if `candidate_id` is not found.
  - Return 202 with `{ "status": "building" }` if context is still building.
  - Return 503 if context build failed.
  - Return 503 if both LLM providers fail.
  - Add unprefixed alias.

- [x] **Task 3.4: Interview questions endpoint** — `POST /api/v1/candidates/{candidate_id}/interview-questions`
  - Accept JSON body: `{ "job_id": str (required), "reference_date": str | None }`.
  - Return `InterviewQuestionSet` on success (200).
  - Return 404 for unknown candidate or job.
  - Return 202 while context is building.
  - Return 503 on context failure or both LLM providers failing.
  - Return 422 if `job_id` is missing.
  - Add unprefixed alias.

- [ ] **Task 3.5: API tests** — `backend/tests/test_agent_api.py`
  - Chat endpoint: verify 200 with a simple question; verify history is appended correctly in the response; verify 422 on blank message; verify 503 body format when both providers mock-fail.
  - Brief endpoint: verify 200 with all four sections for CAND-001; verify 202 while building; verify 404 for unknown candidate; verify 503 when both providers fail.
  - Interview questions endpoint: verify 200 returns a list of questions with `source_id` and `rationale`; verify 422 when `job_id` omitted; verify 404 for unknown candidate.
  - All tests mock `generate_with_fallback`; no live LLM calls.
  - Extend the test suite; total backend target is **300 or more passing tests**.

---

## Milestone 4: Backend — Knowledge Graph Integration

- [x] **Task 4.1: Neo4j client** — `backend/services/graph/neo4j_client.py`
  - Read `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` from settings. If any are absent, the client is disabled: all methods return empty results without raising.
  - Implement `async def get_candidate_subgraph(candidate_id: str) -> CandidateSubgraph` — return a `CandidateSubgraph` with `nodes: list[GraphNode]` and `edges: list[GraphEdge]`.
  - `GraphNode` carries: `id`, `label` (Candidate | Skill | Repository | Job | Requirement), `properties: dict`.
  - `GraphEdge` carries: `source_id`, `target_id`, `relationship` (e.g., `HAS_SKILL`, `CONTRIBUTED_TO`, `APPLIED_FOR`, `COVERS`).
  - Implement `async def graph_evidence_for_skill(candidate_id: str, skill: str) -> list[GraphNode]` — return repository and job nodes linked to the candidate via the given skill.
  - All queries use parameterized Cypher; no string interpolation of user input.
  - On any Neo4j connection error, log and return empty results (fail-soft).

- [x] **Task 4.2: Graph seeder** — `backend/services/graph/seeder.py`
  - `async def seed_candidate_graph(candidate_id: str, context: CandidateContext) -> bool`
  - Create or merge nodes for the candidate, all unique skills from claims and evidence records, and all evidence source URLs as Repository nodes.
  - Create edges: `(Candidate)-[:HAS_SKILL]->(Skill)`, `(Candidate)-[:CONTRIBUTED_TO]->(Repository)`.
  - If a `job_id` is provided alongside the context, also create `(Candidate)-[:APPLIED_FOR]->(Job)` and `(Skill)-[:COVERS]->(Requirement)` edges for matched requirements.
  - Returns `True` on success, `False` on any graph error (fail-soft; caller logs but does not abort).
  - Graph seeding is always non-blocking: called as a background task, never awaited inline.

- [x] **Task 4.3: Graph seeding hook in context builder** — `backend/services/context_builder.py`
  - After a context build reaches "ready" state, schedule `seed_candidate_graph` as a background task.
  - Graph seeding failure must not change the context state from "ready" to "failed."
  - Add a settings flag `GRAPH_SEEDING_ENABLED` (default `False`) to gate seeding without modifying the context builder logic.

- [x] **Task 4.4: Graph router** — `backend/routers/graph.py` (new file)
  - Register under `/api/v1` in `backend/main.py`.

- [x] **Task 4.5: Candidate graph endpoint** — `GET /api/v1/candidates/{candidate_id}/graph`
  - Return `CandidateSubgraph` (nodes + edges) on 200.
  - Return 404 for unknown candidate.
  - Return 503 with `{ "detail": "Graph unavailable" }` when Neo4j is disabled or unreachable.
  - Add unprefixed alias.

- [x] **Task 4.6: Graph evidence endpoint** — `POST /api/v1/candidates/{candidate_id}/graph-evidence`
  - Accept JSON body: `{ "skill": str }`.
  - Return `list[GraphNode]` for nodes linked to the candidate via the given skill.
  - Return 404 for unknown candidate.
  - Return 503 when graph is unavailable.
  - Add unprefixed alias.

- [ ] **Task 4.7: Graph unit tests** — `backend/tests/test_graph.py`
  - Mock the Neo4j driver; verify `get_candidate_subgraph` returns the expected node/edge structure for a controlled fixture.
  - Verify `graph_evidence_for_skill` returns only nodes related to the given skill.
  - Verify that a Neo4j connection error returns empty results without raising.
  - Verify graph endpoint returns 503 when client is disabled (missing env vars).
  - Verify context builder does not fail when graph seeding raises an exception.
  - All tests use mock drivers; no live Neo4j instance required.

---

## Milestone 5: Frontend — Types, API Client & Agent UI

- [x] **Task 5.1: TypeScript types** — `frontend/src/types/agent.ts`
  - Define `ChatMessage` with `role: "user" | "assistant" | "tool"`, `content: string`, `tool_call_id?: string`.
  - Define `AgentResponse` with `assistant_message: string`, `tool_calls_made: number`, `provider_used: string`, `grounding_ids: string[]`.
  - Define `CandidateBrief` with `candidate_id`, `job_id`, `generated_at`, `provider_used`, `strengths`, `evidence_summary`, `application_history_notes`, `identified_gaps`, `grounding_ids: string[]`.
  - Define `InterviewQuestion` with `question_text`, `target_type: "unverified_claim" | "coverage_gap" | "history_probe"`, `source_id`, `rationale`.
  - Define `InterviewQuestionSet` with `candidate_id`, `job_id`, `generated_at`, `provider_used`, `questions: InterviewQuestion[]`, `grounding_ids: string[]`.
  - Define `GraphNode` with `id`, `label`, `properties: Record<string, unknown>`.
  - Define `GraphEdge` with `source_id`, `target_id`, `relationship`.
  - Define `CandidateSubgraph` with `nodes: GraphNode[]`, `edges: GraphEdge[]`.
  - Export all from `frontend/src/types/index.ts`.

- [x] **Task 5.2: API service functions** — `frontend/src/services/api.ts`
  - `sendChatMessage(payload: { message: string; history: ChatMessage[]; job_id?: string }): Promise<AgentResponse>`
  - `generateBrief(candidate_id: string, params: { job_id?: string; reference_date?: string }): Promise<CandidateBrief | { status: "building" } | { status: "failed" }>` — handle 202 and 503 distinctly.
  - `generateInterviewQuestions(candidate_id: string, params: { job_id: string; reference_date?: string }): Promise<InterviewQuestionSet | { status: "building" } | { status: "failed" }>` — handle 202 and 503.
  - `getCandidateGraph(candidate_id: string): Promise<CandidateSubgraph | { status: "unavailable" }>` — handle 503 as "unavailable" without throwing.
  - `getGraphEvidence(candidate_id: string, skill: string): Promise<GraphNode[] | { status: "unavailable" }>`.

- [ ] **Task 5.3: Chat drawer component** — `frontend/src/components/agent/ChatDrawer.tsx`
  - A slide-over drawer (right side, 420px wide on desktop; full-width on mobile) containing a conversation thread and a message input.
  - Message input is a textarea that submits on Enter (Shift+Enter for newline). A "Send" button is also present.
  - While a response is in flight, disable the input and show an animated typing indicator (three pulsing dots) in the assistant turn slot.
  - Each assistant message shows: the response text with `grounding_ids` highlighted as small monospace chips, and a small badge indicating which provider was used (Gemini / Groq).
  - Show an error state with a retry button when the 503 response is received.
  - Maintain conversation history in local component state; pass the full history array to each `sendChatMessage` call.
  - Inject the currently active job ID (from `JobContext`) into every request; users do not see or set this.
  - Wire the existing "Chat" action button (currently a placeholder) in `CandidateProfileShell.tsx` to open this drawer, pre-seeding the first user message with "Tell me about {candidate.full_name}."
  - The drawer can also be opened from the sidebar/header chat button (currently a placeholder) without a pre-seeded message.

- [ ] **Task 5.4: Brief & Questions tab** — `frontend/src/components/profile/BriefQuestionsTab.tsx`
  - Add a fifth profile tab "Brief & Questions," always visible on any candidate profile (no job-active requirement).
  - The tab has two sub-sections, toggled by a segmented control: **Executive Brief** and **Interview Questions**.

  **Executive Brief sub-section:**
  - A "Generate Brief" button triggers `generateBrief(candidate_id, { job_id })`.
  - While generating: show a skeleton with "Generating executive brief…"
  - On 202 (context building): show "Candidate context is still building. Brief will be available once context is ready." with a retry button; do not auto-poll.
  - On 503 (context failed or provider unavailable): show the error message with a retry button.
  - On success: render four labeled sections (Strengths, Evidence Summary, Application History Notes, Identified Gaps), each in a styled card. Show the provider badge and a "Regenerate" button. `grounding_ids` are shown as a collapsible "Sources cited" list below the last section.
  - A "Copy to Clipboard" button copies the formatted plain-text brief.
  - A "Download as TXT" button downloads the brief as a `.txt` file using `Blob` and a temporary anchor link.

  **Interview Questions sub-section:**
  - Requires an active job (show "Select a job to generate targeted questions." when no job is active).
  - A "Generate Questions" button triggers `generateInterviewQuestions(candidate_id, { job_id })`.
  - On success: render a numbered list of `InterviewQuestion` items. Each item shows: the question text, a category chip (`unverified_claim` = amber, `coverage_gap` = orange, `history_probe` = blue), and an expandable rationale section referencing the `source_id`.
  - Same 202/503/error states as the brief sub-section.
  - A "Copy All Questions" button copies the full question list as plain text.

- [ ] **Task 5.5: Graph visualization component** — `frontend/src/components/graph/GraphVisualization.tsx`
  - Activate the "Knowledge Graph" sidebar link, which is currently a placeholder/disabled.
  - Render a 2D force-directed graph using a lightweight canvas or SVG library (e.g., `d3-force` or a zero-dependency alternative).
  - Nodes are color-coded by label: Candidate (purple), Skill (blue), Repository (green), Job (amber), Requirement (gray).
  - Clicking a Candidate node navigates to that candidate's profile.
  - Clicking a Skill node triggers `getGraphEvidence(candidate_id, skill)` and shows matching graph nodes in a side panel.
  - On graph unavailable (503): show "Knowledge graph is not available in this environment. Enable Neo4j to use graph exploration." — no error icon, just an informative empty state.
  - On load: call `getCandidateGraph(candidate_id)` if a candidate is selected, else show "Select a candidate to explore their knowledge graph."
  - The graph is read-only; no drag-to-edit or node creation.

- [ ] **Task 5.6: Wire brief/questions download to existing export button**
  - The "Export" / "Download" placeholder buttons visible in the header action bar in `CandidateProfileShell.tsx` must now route to the TXT download feature from the Brief sub-section.
  - If no brief has been generated yet, clicking Export opens the Brief & Questions tab and triggers generation automatically.
  - Do not add a new button; repurpose the existing one.

- [ ] **Task 5.7: Frontend interaction tests** — `frontend/src/test/`
  - `ChatDrawer`: mock `sendChatMessage`; verify typing indicator appears while in flight; verify assistant message renders with grounding_ids chips; verify error state on 503; verify history is accumulated across turns; verify job_id from context is injected.
  - `BriefQuestionsTab — Brief`: mock `generateBrief`; verify four sections render; verify 202 shows the building message (no auto-poll); verify "Copy to Clipboard" copies correct text; verify "Download as TXT" creates a blob link.
  - `BriefQuestionsTab — Questions`: mock `generateInterviewQuestions`; verify category chips render with correct colors; verify expandable rationale shows source_id; verify empty state when no job active.
  - `GraphVisualization`: mock `getCandidateGraph`; verify nodes render with correct color coding; verify "unavailable" state renders informative message without an error icon.
  - Extend the Vitest suite; total frontend target is **52 or more passing tests**.

---

## Milestone 6: Verification & Sign-off

- [ ] **Task 6.1: End-to-end acceptance**
  - [ ] `POST /api/v1/agent/chat` with "What is CAND-001's strongest skill?" returns a response citing at least one evidence record ID.
  - [ ] `POST /api/v1/agent/chat` with no candidate context specified triggers a `lookup_candidate` tool call before answering.
  - [ ] `POST /api/v1/candidates/CAND-001/brief` returns all four sections; "Identified Gaps" references at least one unverified claim or `not_assessed` coverage item.
  - [ ] `POST /api/v1/candidates/CAND-001/interview-questions` with JOB-001 returns at least 3 questions each with `source_id` and `rationale`.
  - [ ] Chat drawer opens, sends a message, and renders the assistant response with grounding chips.
  - [ ] Brief & Questions tab generates and displays all four brief sections; "Copy to Clipboard" copies the text.
  - [ ] "Download as TXT" downloads a `.txt` file with the brief content.
  - [ ] Interview question chips show correct category colors; expanding a question shows its rationale.
  - [ ] Graph endpoint returns 503 when `NEO4J_URI` is not set; the frontend shows the informative unavailable state.
  - [ ] Disabling both LLM providers (clearing both API keys) causes the chat endpoint to return 503 with `provider_errors`; the chat drawer shows the error state with a retry button.
  - [ ] Core context, scoring, and ranking APIs remain functional with both LLM providers disabled.

- [ ] **Task 6.2: Grounding regression test** — `backend/tests/test_grounding.py`
  - Mock `generate_with_fallback` to return a response containing invented claim IDs not present in the context.
  - Verify `grounding_ids` in the `AgentResponse` are validated against the context before being included in the response.
  - Verify the brief generator does not include a grounding_id that is not found in the candidate's claims or evidence records.
  - Verify the question generator includes only `source_id` values that map to real claim or requirement IDs.

- [ ] **Task 6.3: Tool-call cap test**
  - Mock `generate_with_fallback` to always return a tool call (never a text response).
  - Verify `run_agent_turn` exits after exactly 5 iterations and returns the fixed cap message.
  - Verify exactly 5 LLM calls (not 6) were made.

- [ ] **Task 6.4: Fail-soft regression tests**
  - Disable Neo4j (clear env vars): verify the context builder, scoring, ranking, brief, and question endpoints all return 200 normally.
  - Disable Groq only: verify Gemini handles the request and `provider_used = "gemini"` is returned.
  - Disable Gemini only: verify Groq fallback handles the request and `provider_used = "groq"` is returned.
  - Disable both: verify 503 with `provider_errors` list.

- [ ] **Task 6.5: Accessibility & responsive review**
  - Chat drawer: axe WCAG A/AA scan; keyboard focus remains in the drawer while open; Escape closes the drawer.
  - Brief & Questions tab: axe scan on rendered sections; "Copy" and "Download" buttons are keyboard reachable.
  - Graph visualization: informative unavailable state has no axe violations; graph nodes have aria-labels.
  - Playwright smoke test: open Chat drawer, send a message, assert assistant response appears; open Brief tab, click "Generate Brief," assert all four section headers are visible.

- [ ] **Task 6.6: Update documentation**
  - Update `README.md`: document `GEMINI_API_KEY`, `GROQ_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, and `GRAPH_SEEDING_ENABLED` environment variables.
  - Update `.env.example` with the new variables and a comment explaining each.
  - Add a note in `README.md` that graph features degrade gracefully when Neo4j is not configured.
  - Mark this file Status: Complete and record final test counts.

---

## Follow-on Phase 5 Dependencies Exposed by Phase 4

| Phase 5 Task | What Phase 4 Provides |
|:---|:---|
| Persistent user sessions | `ChatMessage` history schema as the in-memory prototype for DB-backed conversation storage |
| RBAC on brief/question generation | `CandidateBrief` and `InterviewQuestionSet` as the resources to protect behind hiring-manager and recruiter roles |
| PII audit trail | `grounding_ids` as the audit-ready record of which candidate data fields were accessed per session |
| Graph persistence | `CandidateSubgraph` node/edge schema as the migration target for Neo4j Aura production instance |

---

## LLM Integration Reference (PRD §Phase 4)

**Providers and fallback order:**

| Priority | Provider | Model | Use |
|:---:|:---|:---|:---|
| 1 | Google Gemini | `gemini-2.0-flash` | Default for all LLM calls |
| 2 | Groq | `llama-3.3-70b-versatile` | Automatic fallback on Gemini failure |

**Agent constraints:**
- Maximum tool calls per turn: **5**
- Temperature for brief/question generation: **0.0** (deterministic)
- Maximum history window: **20 messages** (truncate oldest)
- Required citations: every factual claim must reference at least one context ID

**Brief structure (fixed sections):**
```
## Strengths
## Evidence Summary
## Application History Notes
## Identified Gaps
```

**Interview question `target_type` mapping:**

| `target_type` | Source | Chip Color |
|:---|:---|:---|
| `unverified_claim` | `ResumeClaim.verification_state == "unverified"` | Amber |
| `coverage_gap` | `CoverageState` in `not_assessed` or `insufficient_evidence` | Orange |
| `history_probe` | Negative `interview_feedback` entries | Blue |

